using System.ComponentModel.DataAnnotations;

namespace InkWell.Api.Models;

public class User
{
    public int Id { get; set; }
    [Required, MaxLength(50)] public string Username { get; set; } = string.Empty;
    [Required, EmailAddress, MaxLength(255)] public string Email { get; set; } = string.Empty;
    [Required] public string PasswordHash { get; set; } = string.Empty;
    [Required, MaxLength(20)] public string Role { get; set; } = "Reader";
    public string? Bio { get; set; }
    public string? ProfilePictureUrl { get; set; }

    public string? DisplayName { get; set; }
    public string? Profession { get; set; }
    public string? Studies { get; set; }
    public string? Location { get; set; }
    public string? Website { get; set; }
    public string? TwitterHandle { get; set; }
    public string? LinkedInUrl { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public ICollection<Post> Posts { get; set; } = new List<Post>();
    public ICollection<EditorApplication> EditorApplications { get; set; } = new List<EditorApplication>();
}
