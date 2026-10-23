using System.ComponentModel.DataAnnotations;
namespace InkWell.Api.DTOs;

public class RegisterDto
{
    [Required(ErrorMessage = "Username is required.")]
    [RegularExpression(@"^[A-Za-z0-9._\- ]{3,40}$",
        ErrorMessage = "Username can only contain letters, numbers, dots, hyphens, underscores and spaces (3–40 characters).")]
    public string Username { get; set; } = "";

    [Required(ErrorMessage = "Email is required.")]
    [EmailAddress(ErrorMessage = "Please enter a valid email address.")]
    public string Email { get; set; } = "";

    [Required(ErrorMessage = "Password is required.")]
    [RegularExpression(@"^(?=.*[A-Za-z])(?=.*\d).{8,}$",
        ErrorMessage = "Password must be at least 8 characters and include a letter and a number.")]
    public string Password { get; set; } = "";
}
public class LoginDto { [Required, EmailAddress] public string Email { get; set; } = ""; [Required] public string Password { get; set; } = ""; }
public class ProfileDto
{
  public string? DisplayName { get; set; }
  public string? Bio { get; set; }
  public string? ProfilePictureUrl { get; set; }
  public string? Profession { get; set; }
  public string? Studies { get; set; }
  public string? Location { get; set; }
  public string? Website { get; set; }
  public string? TwitterHandle { get; set; }
  public string? LinkedInUrl { get; set; }
}
public class EditorApplicationDto { [Required, MinLength(30)] public string Motivation { get; set; } = ""; }

public class PostImageDto 
{ 
    public string Url { get; set; } = ""; 
    public string? Caption { get; set; } 
}

public class PostCreateDto 
{ 
    [Required, MaxLength(255)] public string Title { get; set; } = ""; 
    [Required] public string Content { get; set; } = ""; 
    public string? MainImageUrl { get; set; } 
    public List<PostImageDto> Images { get; set; } = []; 
    public List<string> Categories { get; set; } = []; 
    public List<string> Tags { get; set; } = []; 
    public bool SaveAsDraft { get; set; } 
    public int? SeriesId { get; set; }
    public int? SeriesOrder { get; set; }
}

public class SeriesCreateDto
{
    [Required, MaxLength(255)] public string Title { get; set; } = "";
    public string? Description { get; set; }
    public string? CoverImageUrl { get; set; }
}

public class FeaturedItemDto
{
    [Required] public string ItemType { get; set; } = "Post"; // "Post" or "Series"
    [Required] public int ItemId { get; set; }
}

public class UpdateFeaturedDto
{
    public List<FeaturedItemDto> Items { get; set; } = [];
}

public class ReviewDto { [Required] public string Action { get; set; } = ""; public string? Comments { get; set; } }

public class ForgotPasswordRequestDto
{
    [Required, EmailAddress]
    public string Email { get; set; } = "";
}

public class ForgotPasswordResetDto
{
    [Required, EmailAddress]
    public string Email { get; set; } = "";

    [Required, StringLength(6, MinimumLength = 6)]
    public string OtpCode { get; set; } = "";

    [Required, MinLength(8)]
    public string NewPassword { get; set; } = "";
}