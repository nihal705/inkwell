using System.Security.Claims;
using System.Text.RegularExpressions;
using InkWell.Api.Models;

namespace InkWell.Api.Controllers;

public static class ApiMapper
{
    public static int UserId(this ClaimsPrincipal user) => int.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier)!);
    public static object User(User u) => new
    {
        u.Id,
        u.Username,
        displayName = string.IsNullOrWhiteSpace(u.DisplayName) ? u.Username : u.DisplayName,
        u.Email,
        role = u.Role,
        u.Bio,
        u.ProfilePictureUrl,
        u.Profession,
        u.Studies,
        u.Location,
        u.Website,
        u.TwitterHandle,
        u.LinkedInUrl,
        u.CreatedAt
    };
    public static object Post(Post p, bool full = false)
    {
        var raw = p.Content ?? "";

        // Strip markdown headings from the top
        raw = Regex.Replace(raw, @"^\s*#+\s+.*$", "", RegexOptions.Multiline);

        // Strip leading title if it appears at the start
        if (!string.IsNullOrWhiteSpace(p.Title))
        {
            var t = Regex.Escape(p.Title.Trim());
            raw = Regex.Replace(raw, @"^\s*" + t + @"\s*", "", RegexOptions.IgnoreCase);
        }

        // Remove markdown syntax
        var plain = Regex.Replace(raw, @"[#*_>`\[\]()!]", " ")
            .Replace("\r", " ")
            .Replace("  ", " ")
            .Trim();

        // Use the first full paragraph as the excerpt — no truncation, no ellipsis
        var paragraphs = plain.Split(new[] { "\n\n", "\n" }, StringSplitOptions.RemoveEmptyEntries)
            .Select(x => x.Trim())
            .Where(x => x.Length > 0)
            .ToArray();

        string excerpt = paragraphs.Length > 0 ? paragraphs[0] : plain;

        return new
        {
            p.Id,
            p.Title,
            content = full ? p.Content : null,
            p.MainImageUrl,
            categories = p.PostCategories.Select(x => x.Category.Name),
            tags = p.PostTags.Select(x => x.Tag.Name),
            status = p.Status,
            p.RejectionReason,
            p.CreatedAt,
            p.UpdatedAt,
            p.PublishedAt,
            excerpt,
            readingTimeMinutes = Math.Max(1, (int)Math.Ceiling(plain.Split(' ', StringSplitOptions.RemoveEmptyEntries).Length / 200d)),
            author = User(p.Author)
        };
    }
}
