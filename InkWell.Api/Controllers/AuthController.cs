using System.Collections.Concurrent;
using InkWell.Api.Data;
using InkWell.Api.DTOs;
using InkWell.Api.Models;
using InkWell.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace InkWell.Api.Controllers;

[ApiController, Route("api/auth")]
public class AuthController(AppDbContext db, IJwtService jwt, IPasswordHasher hasher, IEmailService email) : ControllerBase
{
    // ---------- OTP rate limiting ----------
    // In-memory limiter — per email, max 5 OTP requests / hour
    private static readonly ConcurrentDictionary<string, List<DateTime>> OtpRequestLog = new();
    private static readonly TimeSpan OtpWindow = TimeSpan.FromHours(1);
    private const int MaxOtpRequestsPerWindow = 5;

    private static bool AllowOtpRequest(string email)
    {
        var now = DateTime.UtcNow;
        var log = OtpRequestLog.GetOrAdd(email, _ => new List<DateTime>());
        lock (log)
        {
            log.RemoveAll(t => now - t > OtpWindow);
            if (log.Count >= MaxOtpRequestsPerWindow) return false;
            log.Add(now);
            return true;
        }
    }

    // ============================================
    // REGISTER WITH EMAIL OTP VERIFICATION
    // ============================================
    [HttpPost("register/request-otp")]
    public async Task<IActionResult> RequestRegisterOtp(RegisterOtpRequestDto request)
    {
        if (!ModelState.IsValid)
        {
            var firstError = ModelState.Values
                .SelectMany(v => v.Errors)
                .Select(e => e.ErrorMessage)
                .FirstOrDefault();
            return BadRequest(new { message = firstError ?? "Please check your inputs." });
        }

        var emailAddr = request.Email.Trim().ToLowerInvariant();
        var username = request.Username.Trim();

        if (await db.Users.AnyAsync(x => x.Email == emailAddr))
            return Conflict(new { message = "That email is already registered." });

        if (await db.Users.AnyAsync(x => x.Username == username))
            return Conflict(new { message = "That username is already taken." });

        if (!AllowOtpRequest(emailAddr))
            return StatusCode(429, new { message = "Too many verification requests. Please wait a bit before requesting another code." });

        // Invalidate any previous unused registration OTPs for this email
        var oldOtps = await db.EmailVerificationOtps
            .Where(o => o.Email == emailAddr && !o.IsUsed && o.ExpiresAt > DateTime.UtcNow)
            .ToListAsync();
        foreach (var o in oldOtps) o.IsUsed = true;

        var otpCode = Random.Shared.Next(100000, 1000000).ToString("D6");
        var otpHash = hasher.Hash(otpCode);

        db.EmailVerificationOtps.Add(new EmailVerificationOtp
        {
            Email = emailAddr,
            OtpHash = otpHash,
            ExpiresAt = DateTime.UtcNow.AddMinutes(10),
        });
        await db.SaveChangesAsync();

        try
        {
            await email.SendOtpEmailAsync(emailAddr, otpCode, "register");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[EmailJS] Failed to send register OTP to {emailAddr}: {ex.Message}");
            return StatusCode(500, new { message = "Could not send the verification email. Please check the address or try again." });
        }

        return Ok(new { message = $"Verification code sent to {emailAddr}." });
    }

    [HttpPost("register")]
    public async Task<IActionResult> Register(RegisterDto request)
    {
        if (!ModelState.IsValid)
        {
            var firstError = ModelState.Values
                .SelectMany(v => v.Errors)
                .Select(e => e.ErrorMessage)
                .FirstOrDefault();
            return BadRequest(new { message = firstError ?? "Please check your inputs." });
        }

        var emailAddr = request.Email.Trim().ToLowerInvariant();
        var username = request.Username.Trim();

        if (await db.Users.AnyAsync(x => x.Email == emailAddr))
            return Conflict(new { message = "That email is already registered." });

        if (await db.Users.AnyAsync(x => x.Username == username))
            return Conflict(new { message = "That username is already taken." });

        // Find the latest unused, unexpired registration OTP
        var otpRecord = await db.EmailVerificationOtps
            .Where(o => o.Email == emailAddr && !o.IsUsed && o.ExpiresAt > DateTime.UtcNow)
            .OrderByDescending(o => o.CreatedAt)
            .FirstOrDefaultAsync();

        if (otpRecord is null)
            return BadRequest(new { message = "Verification code expired or not found. Please click 'Send verification code' again." });

        if (otpRecord.Attempts >= 5)
        {
            otpRecord.IsUsed = true;
            await db.SaveChangesAsync();
            return BadRequest(new { message = "Too many incorrect code attempts. Please request a new verification code." });
        }

        if (!hasher.Verify(request.OtpCode.Trim(), otpRecord.OtpHash))
        {
            otpRecord.Attempts++;
            await db.SaveChangesAsync();
            return BadRequest(new { message = "Incorrect verification code. Please check your inbox or spam folder." });
        }

        // Consume OTP
        otpRecord.IsUsed = true;

        var user = new User
        {
            Username = username,
            Email = emailAddr,
            PasswordHash = hasher.Hash(request.Password),
            Role = "Reader"
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();

        return Ok(new { token = jwt.GenerateToken(user), user = ApiMapper.User(user) });
    }

    // ============================================
    // LOGIN (unchanged)
    // ============================================
    [HttpPost("login")]
    public async Task<IActionResult> Login(LoginDto request)
    {
        if (!ModelState.IsValid)
        {
            var firstError = ModelState.Values
                .SelectMany(v => v.Errors)
                .Select(e => e.ErrorMessage)
                .FirstOrDefault();
            return BadRequest(new { message = firstError ?? "Please check your inputs." });
        }

        var emailAddr = request.Email.Trim().ToLowerInvariant();
        var user = await db.Users.FirstOrDefaultAsync(x => x.Email == emailAddr);

        if (user is null || !hasher.Verify(request.Password, user.PasswordHash))
            return Unauthorized(new { message = "Invalid email or password." });

        return Ok(new { token = jwt.GenerateToken(user), user = ApiMapper.User(user) });
    }

    // ============================================
    // REFRESH (unchanged)
    // ============================================
    [Authorize, HttpPost("refresh")]
    public async Task<IActionResult> Refresh()
    {
        var user = await db.Users.FindAsync(User.UserId());
        return user is null
            ? Unauthorized()
            : Ok(new { token = jwt.GenerateToken(user), user = ApiMapper.User(user) });
    }

    // ============================================
    // UPDATE PROFILE (unchanged)
    // ============================================
    [Authorize, HttpPut("profile")]
    public async Task<IActionResult> Profile(ProfileDto request)
    {
        var user = await db.Users.FindAsync(User.UserId());
        if (user is null) return Unauthorized();

        user.DisplayName = string.IsNullOrWhiteSpace(request.DisplayName) ? null : request.DisplayName.Trim();
        user.Bio = string.IsNullOrWhiteSpace(request.Bio) ? null : request.Bio.Trim();
        user.ProfilePictureUrl = string.IsNullOrWhiteSpace(request.ProfilePictureUrl) ? null : request.ProfilePictureUrl.Trim();
        user.Profession = string.IsNullOrWhiteSpace(request.Profession) ? null : request.Profession.Trim();
        user.Studies = string.IsNullOrWhiteSpace(request.Studies) ? null : request.Studies.Trim();
        user.Location = string.IsNullOrWhiteSpace(request.Location) ? null : request.Location.Trim();
        user.Website = string.IsNullOrWhiteSpace(request.Website) ? null : request.Website.Trim();
        user.TwitterHandle = string.IsNullOrWhiteSpace(request.TwitterHandle) ? null : request.TwitterHandle.Trim();
        user.LinkedInUrl = string.IsNullOrWhiteSpace(request.LinkedInUrl) ? null : request.LinkedInUrl.Trim();

        await db.SaveChangesAsync();
        return Ok(new { user = ApiMapper.User(user) });
    }

    // ============================================
    // FORGOT PASSWORD — STEP 1: REQUEST OTP
    // ============================================
    [HttpPost("forgot-password/request-otp")]
    public async Task<IActionResult> RequestPasswordResetOtp(ForgotPasswordRequestDto request)
    {
        if (!ModelState.IsValid)
            return BadRequest(new { message = "Please enter a valid email." });

        var emailAddr = request.Email.Trim().ToLowerInvariant();

        // Rate-limit regardless of whether email exists (prevents enumeration + abuse)
        if (!AllowOtpRequest(emailAddr))
            return StatusCode(429, new { message = "Too many reset requests (maximum 5 attempts reached). Please try again in an hour." });

        var user = await db.Users.FirstOrDefaultAsync(x => x.Email == emailAddr);

        // Always return the same response — prevents email enumeration
        if (user is null)
            return Ok(new { message = "If that email is registered, a code has been sent." });

        // Invalidate any unused OTPs for this user (only latest is valid)
        var oldOtps = await db.PasswordResetOtps
            .Where(o => o.UserId == user.Id && !o.IsUsed && o.ExpiresAt > DateTime.UtcNow)
            .ToListAsync();
        foreach (var o in oldOtps) o.IsUsed = true;

        // Generate a 6-digit code
        var otpCode = Random.Shared.Next(100000, 999999).ToString();
        var otpHash = hasher.Hash(otpCode);

        db.PasswordResetOtps.Add(new PasswordResetOtp
        {
            UserId = user.Id,
            OtpHash = otpHash,
            ExpiresAt = DateTime.UtcNow.AddMinutes(10),
        });
        await db.SaveChangesAsync();

        try
        {
            await email.SendOtpEmailAsync(user.Email, otpCode);
        }
        catch (Exception ex)
        {
            // Log to console for debugging; do not reveal to client
            Console.WriteLine($"[EmailJS] Failed to send OTP to {user.Email}: {ex.Message}");
            return StatusCode(500, new { message = "Could not send the email. Please try again later." });
        }

        return Ok(new { message = "If that email is registered, a code has been sent." });
    }

    // ============================================
    // FORGOT PASSWORD — STEP 2: VERIFY OTP & RESET
    // ============================================
    [HttpPost("forgot-password/reset")]
    public async Task<IActionResult> ResetPasswordWithOtp(ForgotPasswordResetDto request)
    {
        if (!ModelState.IsValid)
            return BadRequest(new { message = "Please fill in all fields." });

        var emailAddr = request.Email.Trim().ToLowerInvariant();
        var user = await db.Users.FirstOrDefaultAsync(x => x.Email == emailAddr);
        if (user is null)
            return BadRequest(new { message = "Invalid email or code." });

        // Find the most recent unused, unexpired OTP
        var otpRecord = await db.PasswordResetOtps
            .Where(o => o.UserId == user.Id && !o.IsUsed && o.ExpiresAt > DateTime.UtcNow)
            .OrderByDescending(o => o.CreatedAt)
            .FirstOrDefaultAsync();

        if (otpRecord is null)
            return BadRequest(new { message = "Code expired or not found. Please request a new one." });

        // Cap verification attempts to prevent brute-forcing 6-digit codes
        if (otpRecord.Attempts >= 5)
        {
            otpRecord.IsUsed = true;
            await db.SaveChangesAsync();
            return BadRequest(new { message = "Too many incorrect attempts. Please request a new code." });
        }

        if (!hasher.Verify(request.OtpCode.Trim(), otpRecord.OtpHash))
        {
            otpRecord.Attempts++;
            await db.SaveChangesAsync();
            return BadRequest(new { message = "Incorrect code." });
        }

        // Success — rotate password and mark OTP consumed
        user.PasswordHash = hasher.Hash(request.NewPassword);
        otpRecord.IsUsed = true;
        await db.SaveChangesAsync();

        return Ok(new { message = "Password reset. You can now log in." });
    }
}