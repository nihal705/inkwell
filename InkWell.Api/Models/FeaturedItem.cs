using System.ComponentModel.DataAnnotations;

namespace InkWell.Api.Models;

public class FeaturedItem
{
    public int Id { get; set; }
    [Required, MaxLength(50)] public string ItemType { get; set; } = "Post"; // "Post" or "Series"
    public int ItemId { get; set; }
    public int DisplayOrder { get; set; } = 0;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
