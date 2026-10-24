using InkWell.Api.Data;
using InkWell.Api.DTOs;
using InkWell.Api.Models;
using InkWell.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace InkWell.Api.Controllers;

[ApiController, Route("api/featured")]
public class FeaturedController(AppDbContext db, AppCache appCache) : ControllerBase
{
    [AllowAnonymous, HttpGet]
    public async Task<IActionResult> GetFeatured()
    {
        const string key = "featured_items_public";
        if (appCache.Raw.TryGetValue(key, out object? cached) && cached != null)
        {
            return Ok(cached);
        }

        var items = await db.FeaturedItems
            .OrderBy(x => x.DisplayOrder)
            .ToListAsync();

        var postIds = items
            .Where(x => x.ItemType.Equals("Post", StringComparison.OrdinalIgnoreCase))
            .Select(x => x.ItemId)
            .Distinct()
            .ToList();

        var seriesIds = items
            .Where(x => x.ItemType.Equals("Series", StringComparison.OrdinalIgnoreCase))
            .Select(x => x.ItemId)
            .Distinct()
            .ToList();

        var postsDict = postIds.Count > 0
            ? await db.Posts
                .Include(x => x.Author)
                .Include(x => x.Images)
                .Include(x => x.PostCategories).ThenInclude(x => x.Category)
                .Include(x => x.PostTags).ThenInclude(x => x.Tag)
                .Include(x => x.Series!).ThenInclude(s => s.Posts)
                .Where(x => postIds.Contains(x.Id) && x.Status == "Published")
                .ToDictionaryAsync(x => x.Id)
            : new Dictionary<int, Post>();

        var seriesDict = seriesIds.Count > 0
            ? await db.Series
                .Include(x => x.Author)
                .Include(x => x.Posts).ThenInclude(p => p.Author)
                .Include(x => x.Posts).ThenInclude(p => p.Images)
                .Include(x => x.Posts).ThenInclude(p => p.PostCategories).ThenInclude(pc => pc.Category)
                .Include(x => x.Posts).ThenInclude(p => p.PostTags).ThenInclude(pt => pt.Tag)
                .Where(x => seriesIds.Contains(x.Id))
                .ToDictionaryAsync(x => x.Id)
            : new Dictionary<int, Series>();

        var result = new List<object>();

        foreach (var item in items)
        {
            if (item.ItemType.Equals("Post", StringComparison.OrdinalIgnoreCase))
            {
                if (postsDict.TryGetValue(item.ItemId, out var post))
                {
                    result.Add(new
                    {
                        item.Id,
                        item.ItemType,
                        item.ItemId,
                        item.DisplayOrder,
                        post = ApiMapper.Post(post, false)
                    });
                }
            }
            else if (item.ItemType.Equals("Series", StringComparison.OrdinalIgnoreCase))
            {
                if (seriesDict.TryGetValue(item.ItemId, out var series))
                {
                    result.Add(new
                    {
                        item.Id,
                        item.ItemType,
                        item.ItemId,
                        item.DisplayOrder,
                        series = ApiMapper.Series(series, true)
                    });
                }
            }
        }

        appCache.Raw.Set(key, result, TimeSpan.FromMinutes(10));
        return Ok(result);
    }

    [Authorize(Roles = "Admin"), HttpGet("~/api/admin/featured")]
    public async Task<IActionResult> GetAdminFeatured()
    {
        var items = await db.FeaturedItems
            .OrderBy(x => x.DisplayOrder)
            .ToListAsync();

        var currentItems = new List<object>();
        foreach (var item in items)
        {
            if (item.ItemType.Equals("Post", StringComparison.OrdinalIgnoreCase))
            {
                var p = await db.Posts.Include(x => x.Author).FirstOrDefaultAsync(x => x.Id == item.ItemId);
                if (p != null)
                {
                    currentItems.Add(new
                    {
                        item.Id,
                        item.ItemType,
                        item.ItemId,
                        item.DisplayOrder,
                        title = p.Title,
                        author = p.Author.DisplayName ?? p.Author.Username,
                        imageUrl = p.MainImageUrl,
                        status = p.Status
                    });
                }
            }
            else if (item.ItemType.Equals("Series", StringComparison.OrdinalIgnoreCase))
            {
                var s = await db.Series.Include(x => x.Author).Include(x => x.Posts).FirstOrDefaultAsync(x => x.Id == item.ItemId);
                if (s != null)
                {
                    currentItems.Add(new
                    {
                        item.Id,
                        item.ItemType,
                        item.ItemId,
                        item.DisplayOrder,
                        title = s.Title,
                        author = s.Author.DisplayName ?? s.Author.Username,
                        imageUrl = s.CoverImageUrl,
                        partsCount = s.Posts.Count(p => p.Status == "Published")
                    });
                }
            }
        }

        var availablePosts = await db.Posts
            .Include(x => x.Author)
            .Where(x => x.Status == "Published")
            .OrderByDescending(x => x.PublishedAt)
            .Select(x => new
            {
                x.Id,
                x.Title,
                author = x.Author.DisplayName ?? x.Author.Username,
                imageUrl = x.MainImageUrl,
                x.PublishedAt
            })
            .ToListAsync();

        var availableSeries = await db.Series
            .Include(x => x.Author)
            .Include(x => x.Posts)
            .OrderByDescending(x => x.UpdatedAt)
            .Select(x => new
            {
                x.Id,
                x.Title,
                x.Slug,
                author = x.Author.DisplayName ?? x.Author.Username,
                imageUrl = x.CoverImageUrl,
                partsCount = x.Posts.Count(p => p.Status == "Published")
            })
            .ToListAsync();

        return Ok(new
        {
            items = currentItems,
            availablePosts,
            availableSeries
        });
    }

    [Authorize(Roles = "Admin"), HttpPut("~/api/admin/featured")]
    public async Task<IActionResult> UpdateFeatured(UpdateFeaturedDto dto)
    {
        if (dto.Items == null) return BadRequest(new { message = "Items list cannot be null." });

        db.FeaturedItems.RemoveRange(await db.FeaturedItems.ToListAsync());

        int order = 0;
        foreach (var item in dto.Items)
        {
            if (string.IsNullOrWhiteSpace(item.ItemType) || item.ItemId <= 0) continue;

            db.FeaturedItems.Add(new FeaturedItem
            {
                ItemType = item.ItemType.Trim(),
                ItemId = item.ItemId,
                DisplayOrder = order++,
                CreatedAt = DateTime.UtcNow
            });
        }

        await db.SaveChangesAsync();
        appCache.InvalidateFeatured();
        return Ok(new { message = "Homepage Spotlight order saved successfully." });
    }
}
