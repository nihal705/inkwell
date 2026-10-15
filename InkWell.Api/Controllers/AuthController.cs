using InkWell.Api.Data;
using InkWell.Api.DTOs;
using InkWell.Api.Models;
using InkWell.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace InkWell.Api.Controllers;

[ApiController, Route("api/auth")]
public class AuthController(AppDbContext db, IJwtService jwt, IPasswordHasher hasher) : ControllerBase
{
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

        var email = request.Email.Trim().ToLowerInvariant();
        var username = request.Username.Trim();

        if (await db.Users.AnyAsync(x => x.Email == email))
            return Conflict(new { message = "That email is already registered." });

        if (await db.Users.AnyAsync(x => x.Username == username))
            return Conflict(new { message = "That username is already taken." });

        var user = new User
        {
            Username = username,
            Email = email,
            PasswordHash = hasher.Hash(request.Password),
            Role = "Editor"
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();

        return Ok(new { token = jwt.GenerateToken(user), user = ApiMapper.User(user) });
    }
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

        var email = request.Email.Trim().ToLowerInvariant();
        var user = await db.Users.FirstOrDefaultAsync(x => x.Email == email);

        if (user is null || !hasher.Verify(request.Password, user.PasswordHash))
            return Unauthorized(new { message = "Invalid email or password." });

        return Ok(new { token = jwt.GenerateToken(user), user = ApiMapper.User(user) });
    }
    [Authorize, HttpPost("refresh")]
    public async Task<IActionResult> Refresh() { var user = await db.Users.FindAsync(User.UserId()); return user is null ? Unauthorized() : Ok(new { token = jwt.GenerateToken(user), user = ApiMapper.User(user) }); }
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
}
