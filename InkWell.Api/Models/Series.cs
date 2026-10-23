using System.ComponentModel.DataAnnotations;

namespace InkWell.Api.Models;

public class Series
{
    public int Id { get; set; }
    [Required, MaxLength(255)] public string Title { get; set; } = string.Empty;
    [Required, MaxLength(255)] public string Slug { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? CoverImageUrl { get; set; }
    public int AuthorId { get; set; }
    public User Author { get; set; } = null!;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<Post> Posts { get; set; } = new List<Post>();
}
