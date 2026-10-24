using Microsoft.Extensions.Caching.Memory;

namespace InkWell.Api.Services;

public class AppCache(IMemoryCache cache)
{
    private long _postsVersion = 1;

    public string GetPostsListKey(string? search, string? category, string? tag, int page)
        => $"posts_v{Interlocked.Read(ref _postsVersion)}_{search?.Trim().ToLowerInvariant() ?? ""}_{category?.Trim().ToLowerInvariant() ?? ""}_{tag?.Trim().ToLowerInvariant() ?? ""}_{page}";

    public void InvalidatePosts()
    {
        Interlocked.Increment(ref _postsVersion);
        cache.Remove("featured_items_public");
        cache.Remove("categories_list");
        cache.Remove("series_list_public");
    }

    public void InvalidatePostDetail(int id)
    {
        cache.Remove($"post_detail_{id}");
        InvalidatePosts();
    }

    public void InvalidateSeries(string? slug = null)
    {
        cache.Remove("series_list_public");
        if (!string.IsNullOrWhiteSpace(slug))
        {
            cache.Remove($"series_slug_{slug.Trim().ToLowerInvariant()}");
        }
        cache.Remove("featured_items_public");
    }

    public void InvalidateFeatured()
    {
        cache.Remove("featured_items_public");
    }

    public IMemoryCache Raw => cache;
}
