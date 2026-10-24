using InkWell.Api.Data;
using InkWell.Api.DTOs;
using InkWell.Api.Models;
using InkWell.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using System.Text.RegularExpressions;

namespace InkWell.Api.Controllers;

[ApiController, Route("api/series")]
public class SeriesController(AppDbContext db, AppCache appCache) : ControllerBase
{
    IQueryable<Series> WithDetails() => db.Series
        .Include(x => x.Author)
        .Include(x => x.Posts).ThenInclude(p => p.Author)
        .Include(x => x.Posts).ThenInclude(p => p.Images)
        .Include(x => x.Posts).ThenInclude(p => p.PostCategories).ThenInclude(pc => pc.Category)
        .Include(x => x.Posts).ThenInclude(p => p.PostTags).ThenInclude(pt => pt.Tag);

    [AllowAnonymous, HttpGet]
    public async Task<IActionResult> List()
    {
        const string key = "series_list_public";
        if (appCache.Raw.TryGetValue(key, out object? cached) && cached != null)
        {
            return Ok(cached);
        }

        var seriesList = await WithDetails()
            .OrderByDescending(x => x.UpdatedAt)
            .ToListAsync();

        var result = seriesList.Select(s => ApiMapper.Series(s, true)).ToList();
        appCache.Raw.Set(key, result, TimeSpan.FromMinutes(10));
        return Ok(result);
    }

    [AllowAnonymous, HttpGet("{slug}")]
    public async Task<IActionResult> GetBySlug(string slug)
    {
        var lowerSlug = slug.ToLowerInvariant().Trim();
        var key = $"series_slug_{lowerSlug}";
        if (appCache.Raw.TryGetValue(key, out object? cached) && cached != null)
        {
            return Ok(cached);
        }

        var series = await WithDetails()
            .FirstOrDefaultAsync(x => x.Slug == lowerSlug);

        if (series == null && int.TryParse(slug, out var id))
        {
            series = await WithDetails().FirstOrDefaultAsync(x => x.Id == id);
        }

        if (series == null) return NotFound(new { message = "Series not found." });

        var result = ApiMapper.Series(series, true);
        appCache.Raw.Set(key, result, TimeSpan.FromMinutes(10));
        return Ok(result);
    }

    [Authorize(Roles = "Admin,Featured Columnist,Contributing Writer,Senior Editor,Staff Editor,Editor"), HttpPost]
    public async Task<IActionResult> Create(SeriesCreateDto dto)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);

        var baseSlug = Regex.Replace(dto.Title.Trim().ToLowerInvariant(), @"[^a-z0-9]+", "-").Trim('-');
        if (string.IsNullOrEmpty(baseSlug)) baseSlug = "series-" + Guid.NewGuid().ToString("N")[..6];

        var slug = baseSlug;
        var count = 1;
        while (await db.Series.AnyAsync(s => s.Slug == slug))
        {
            slug = $"{baseSlug}-{++count}";
        }

        var series = new Series
        {
            Title = dto.Title.Trim(),
            Slug = slug,
            Description = dto.Description?.Trim(),
            CoverImageUrl = dto.CoverImageUrl?.Trim(),
            AuthorId = User.UserId(),
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        db.Series.Add(series);
        await db.SaveChangesAsync();

        appCache.InvalidateSeries(series.Slug);

        var created = await WithDetails().SingleAsync(x => x.Id == series.Id);
        return Ok(new { message = "Series created successfully.", series = ApiMapper.Series(created, false) });
    }

    [Authorize(Roles = "Admin,Featured Columnist,Contributing Writer,Senior Editor,Staff Editor,Editor"), HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, SeriesCreateDto dto)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        var series = await db.Series.FindAsync(id);
        if (series == null) return NotFound(new { message = "Series not found." });

        if (series.AuthorId != User.UserId() && !User.IsInRole("Admin"))
            return Forbid();

        var oldSlug = series.Slug;
        series.Title = dto.Title.Trim();
        series.Description = dto.Description?.Trim();
        series.CoverImageUrl = dto.CoverImageUrl?.Trim();
        series.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync();

        appCache.InvalidateSeries(oldSlug);
        appCache.InvalidateSeries(series.Slug);

        var updated = await WithDetails().SingleAsync(x => x.Id == series.Id);
        return Ok(new { message = "Series updated successfully.", series = ApiMapper.Series(updated, true) });
    }

    [Authorize(Roles = "Admin,Featured Columnist,Contributing Writer,Senior Editor,Staff Editor,Editor"), HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var series = await db.Series.Include(s => s.Posts).FirstOrDefaultAsync(x => x.Id == id);
        if (series == null) return NotFound(new { message = "Series not found." });

        if (series.AuthorId != User.UserId() && !User.IsInRole("Admin"))
            return Forbid();

        var slug = series.Slug;
        foreach (var post in series.Posts)
        {
            post.SeriesId = null;
            post.SeriesOrder = null;
        }

        db.Series.Remove(series);
        await db.SaveChangesAsync();

        appCache.InvalidateSeries(slug);

        return Ok(new { message = "Series deleted successfully." });
    }
}
