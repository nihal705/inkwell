using System.ComponentModel.DataAnnotations;

namespace InkWell.Api.Models;

public class Post
{
    public int Id { get; set; }
    [Required, MaxLength(255)] public string Title { get; set; } = string.Empty;
    [Required] public string Content { get; set; } = string.Empty;
    public int AuthorId { get; set; }
    public User Author { get; set; } = null!;
    [Required, MaxLength(20)] public string Status { get; set; } = "Draft";
    public string? MainImageUrl { get; set; }
    public string? RejectionReason { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? PublishedAt { get; set; }
    public int? SeriesId { get; set; }
    public Series? Series { get; set; }
    public int? SeriesOrder { get; set; }
    public ICollection<PostImage> Images { get; set; } = new List<PostImage>();
    public ICollection<PostCategory> PostCategories { get; set; } = new List<PostCategory>();
    public ICollection<PostTag> PostTags { get; set; } = new List<PostTag>();
}

public class PostImage { public int Id { get; set; } public int PostId { get; set; } public Post Post { get; set; } = null!; public string ImageUrl { get; set; } = string.Empty; public string? Caption { get; set; } public int DisplayOrder { get; set; } }
