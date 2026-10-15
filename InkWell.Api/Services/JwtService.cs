using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using InkWell.Api.Models;
using Microsoft.IdentityModel.Tokens;

namespace InkWell.Api.Services;
public interface IJwtService { string GenerateToken(User user); }
public class JwtService : IJwtService
{
    public string GenerateToken(User user)
    {
        var jwtKey = Environment.GetEnvironmentVariable("JWT_KEY") ?? throw new InvalidOperationException("JWT_KEY missing");
        var issuer = Environment.GetEnvironmentVariable("JWT_ISSUER") ?? "inkwell-api";
        var audience = Environment.GetEnvironmentVariable("JWT_AUDIENCE") ?? "inkwell-client";
        var expiry = Convert.ToDouble(Environment.GetEnvironmentVariable("JWT_EXPIRY_MINUTES") ?? "1440");
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey));
        var claims = new List<Claim> { new(ClaimTypes.NameIdentifier, user.Id.ToString()), new(ClaimTypes.Email, user.Email), new(ClaimTypes.Name, user.Username), new(ClaimTypes.Role, user.Role) };
        var token = new JwtSecurityToken(issuer: issuer, audience: audience, claims: claims, expires: DateTime.UtcNow.AddMinutes(expiry), signingCredentials: new SigningCredentials(key, SecurityAlgorithms.HmacSha256));
        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
