using System.Security.Claims;
using System.Text.RegularExpressions;
using InkWell.Api.Models;

namespace InkWell.Api.Controllers;

public static class ApiMapper
{
    public static int UserId(this ClaimsPrincipal user) => int.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier)!);

    public static object User(User u) => new
    {
        u.Id, u.Username,
        displayName = string.IsNullOrWhiteSpace(u.DisplayName) ? u.Username : u.DisplayName,
        u.Email, role = u.Role, u.Bio, u.ProfilePictureUrl, u.Profession, u.Studies,
        u.Location, u.Website, u.TwitterHandle, u.LinkedInUrl, u.CreatedAt
    };

    public static object Post(Post p, bool full = false)
    {
        var raw = p.Content ?? "";

        // Strip image markdown before building the excerpt so raw URLs don't leak
        raw = Regex.Replace(raw, @"!\[[^\]]*\]\([^)]+\)", "");
        // Strip headings from top and body
        raw = Regex.Replace(raw, @"^\s*#+\s+.*$", "", RegexOptions.Multiline);
        // Strip leading title if present
        if (!string.IsNullOrWhiteSpace(p.Title))
        {
            var t = Regex.Escape(p.Title.Trim());
            raw = Regex.Replace(raw, @"^\s*" + t + @"\s*", "", RegexOptions.IgnoreCase);
        }

        var plain = Regex.Replace(raw, @"[#*_>`\[\]()!]", " ")
            .Replace("\r", " ").Replace("  ", " ").Trim();

        var paragraphs = plain.Split(new[] { "\n\n", "\n" }, StringSplitOptions.RemoveEmptyEntries)
            .Select(x => x.Trim()).Where(x => x.Length > 0).ToArray();
        string excerpt = paragraphs.Length > 0 ? paragraphs[0] : plain;

        return new
        {
            p.Id,
            p.Title,
            content = full ? p.Content : null,
            p.MainImageUrl,
            images = (p.Images ?? new List<PostImage>())
                .OrderBy(x => x.DisplayOrder)
                .Select(x => new { x.Id, x.ImageUrl, x.Caption, x.DisplayOrder }),
            categories = p.PostCategories.Select(x => x.Category.Name),
            tags = p.PostTags.Select(x => x.Tag.Name),
            status = p.Status,
            p.RejectionReason,
            p.CreatedAt, p.UpdatedAt, p.PublishedAt,
            excerpt,
            readingTimeMinutes = Math.Max(1, (int)Math.Ceiling(plain.Split(' ', StringSplitOptions.RemoveEmptyEntries).Length / 200d)),
            author = User(p.Author),
            seriesId = p.SeriesId,
            seriesOrder = p.SeriesOrder,
            series = p.Series == null ? null : new
            {
                p.Series.Id,
                p.Series.Title,
                p.Series.Slug,
                p.Series.Description,
                p.Series.CoverImageUrl,
                parts = p.Series.Posts == null ? null : p.Series.Posts
                    .Where(x => x.Status == "Published")
                    .OrderBy(x => x.SeriesOrder ?? int.MaxValue)
                    .ThenBy(x => x.PublishedAt)
                    .Select(x => new
                    {
                        x.Id,
                        x.Title,
                        seriesOrder = x.SeriesOrder ?? 1,
                        x.PublishedAt,
                        isCurrent = x.Id == p.Id
                    })
                    .ToList()
            }
        };
    }

    public static object Series(Series s, bool includePosts = true)
    {
        var publishedPosts = (s.Posts ?? new List<Post>())
            .Where(x => x.Status == "Published")
            .OrderBy(x => x.SeriesOrder ?? int.MaxValue)
            .ThenBy(x => x.PublishedAt)
            .ToList();

        var totalWords = publishedPosts.Sum(p =>
        {
            var raw = Regex.Replace(p.Content ?? "", @"[#*_>`\[\]()!]", " ");
            return raw.Split(' ', StringSplitOptions.RemoveEmptyEntries).Length;
        });

        return new
        {
            s.Id,
            s.Title,
            s.Slug,
            s.Description,
            s.CoverImageUrl,
            s.CreatedAt,
            s.UpdatedAt,
            author = s.Author != null ? User(s.Author) : null,
            partsCount = publishedPosts.Count,
            totalReadingTimeMinutes = Math.Max(1, (int)Math.Ceiling(totalWords / 200d)),
            posts = includePosts ? publishedPosts.Select(p => Post(p, false)).ToList() : null
        };
    }
}