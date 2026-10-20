using InkWell.Api.Data;
using InkWell.Api.DTOs;
using InkWell.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace InkWell.Api.Controllers;

[ApiController, Route("api/posts")]
public class PostsController(AppDbContext db) : ControllerBase
{
    IQueryable<Post> WithDetails() => db.Posts
        .Include(x => x.Author)
        .Include(x => x.Images)
        .Include(x => x.PostCategories).ThenInclude(x => x.Category)
        .Include(x => x.PostTags).ThenInclude(x => x.Tag);

    [AllowAnonymous, HttpGet]
    public async Task<IActionResult> List(string? search, string? category, int page = 1)
    {
        var q = WithDetails().Where(x => x.Status == "Published");
        if (!string.IsNullOrWhiteSpace(search))
            q = q.Where(x => EF.Functions.ILike(x.Title, $"%{search}%") || EF.Functions.ILike(x.Content, $"%{search}%"));
        if (!string.IsNullOrWhiteSpace(category))
            q = q.Where(x => x.PostCategories.Any(c => c.Category.Name == category || c.Category.Slug == category));
        var total = await q.CountAsync();
        var posts = await q.OrderByDescending(x => x.PublishedAt).Skip((Math.Max(1, page) - 1) * 9).Take(9).ToListAsync();
        return Ok(new { items = posts.Select(x => ApiMapper.Post(x)), total, page, pageSize = 9 });
    }

    [AllowAnonymous, HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        var p = await WithDetails().FirstOrDefaultAsync(x => x.Id == id);
        if (p is null) return NotFound();
        var mine = User.Identity?.IsAuthenticated == true && (User.UserId() == p.AuthorId || User.IsInRole("Admin"));
        return p.Status != "Published" && !mine ? NotFound(new { message = "That article is not available." }) : Ok(ApiMapper.Post(p, true));
    }

    [Authorize(Roles = "Editor,Admin"), HttpGet("mine")]
    public async Task<IActionResult> Mine()
    {
        var id = User.UserId();
        var posts = await WithDetails()
            .Where(x => x.AuthorId == id || User.IsInRole("Admin"))
            .OrderByDescending(x => x.UpdatedAt).ToListAsync();
        return Ok(posts.Select(x => ApiMapper.Post(x, true)));
    }

    [Authorize(Roles = "Editor,Admin"), HttpGet("mine/{id:int}")]
    public async Task<IActionResult> MineOne(int id) =>
        await Own(id) is { } p ? Ok(ApiMapper.Post(p, true)) : Forbid();

    [Authorize(Roles = "Editor,Admin"), HttpPost]
    public async Task<IActionResult> Create(PostCreateDto request)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);

        if (!request.SaveAsDraft && string.IsNullOrWhiteSpace(request.MainImageUrl))
            return BadRequest(new { message = "A cover image is required to submit your article." });

        var roleClaim = User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value ?? "(none)";
        Console.WriteLine($"[Create] Detected role: '{roleClaim}'");
        var admin = roleClaim.Equals("Admin", StringComparison.OrdinalIgnoreCase);

        var post = new Post
        {
            Title = request.Title.Trim(),
            Content = request.Content.Trim(),
            MainImageUrl = request.MainImageUrl?.Trim(),
            AuthorId = User.UserId(),
            Status = admin ? "Published" : request.SaveAsDraft ? "Draft" : "PendingReview",
            PublishedAt = admin ? DateTime.UtcNow : null
        };
        await SetTaxonomy(post, request);
        SetImages(post, request);

        db.Posts.Add(post);
        await db.SaveChangesAsync();

        var detail = await WithDetails().SingleAsync(x => x.Id == post.Id);
        return Ok(new { message = admin ? "Article published." : "Article saved.", post = ApiMapper.Post(detail, true) });
    }

    [Authorize(Roles = "Editor,Admin"), HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, PostCreateDto request)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        var p = await Own(id);
        if (p is null) return Forbid();

        if (!request.SaveAsDraft && string.IsNullOrWhiteSpace(request.MainImageUrl))
            return BadRequest(new { message = "A cover image is required to submit your article." });

        p.Title = request.Title.Trim();
        p.Content = request.Content.Trim();
        p.MainImageUrl = request.MainImageUrl?.Trim();
        p.UpdatedAt = DateTime.UtcNow;

        if (User.IsInRole("Admin"))
        {
            if (!request.SaveAsDraft) { p.Status = "Published"; p.PublishedAt ??= DateTime.UtcNow; p.RejectionReason = null; }
            else if (p.Status != "Published") p.Status = "Draft";
        }
        else
        {
            p.Status = request.SaveAsDraft ? "Draft" : "PendingReview";
            p.RejectionReason = null;
        }

        await SetTaxonomy(p, request);
        SetImages(p, request);
        await db.SaveChangesAsync();
        return Ok(new { message = User.IsInRole("Admin") ? "Article updated." : "Changes submitted for review." });
    }

    [Authorize(Roles = "Editor,Admin"), HttpPost("{id:int}/submit")]
    public async Task<IActionResult> Submit(int id)
    {
        var p = await Own(id);
        if (p is null) return Forbid();
        if (p.Status is not ("Draft" or "Rejected"))
            return BadRequest(new { message = "Only drafts or returned articles can be submitted." });
        if (string.IsNullOrWhiteSpace(p.MainImageUrl))
            return BadRequest(new { message = "A cover image is required to submit." });
        p.Status = "PendingReview"; p.RejectionReason = null; p.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(new { message = "Submitted for review." });
    }

    [Authorize(Roles = "Editor,Admin"), HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var p = await Own(id);
        if (p is null) return Forbid();
        db.Posts.Remove(p);
        await db.SaveChangesAsync();
        return Ok(new { message = "Article deleted." });
    }

    async Task<Post?> Own(int id)
    {
        var p = await WithDetails().FirstOrDefaultAsync(x => x.Id == id);
        return p is not null && (p.AuthorId == User.UserId() || User.IsInRole("Admin")) ? p : null;
    }

    async Task SetTaxonomy(Post p, PostCreateDto dto)
    {
        p.PostCategories.Clear();
        p.PostTags.Clear();
        foreach (var name in dto.Categories.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            var c = await db.Categories.FirstOrDefaultAsync(x => x.Name == name.Trim());
            if (c is not null) p.PostCategories.Add(new PostCategory { Category = c });
        }
        foreach (var name in dto.Tags.Where(x => !string.IsNullOrWhiteSpace(x)).Distinct(StringComparer.OrdinalIgnoreCase))
        {
            var slug = SeedData.Slug(name);
            var tag = await db.Tags.FirstOrDefaultAsync(x => x.Slug == slug)
                ?? new Tag { Name = name.Trim(), Slug = slug };
            p.PostTags.Add(new PostTag { Tag = tag });
        }
    }

    void SetImages(Post p, PostCreateDto dto)
    {
        // Clear the existing collection; EF will delete old rows and insert new ones
        foreach (var old in p.Images.ToList())
            db.PostImages.Remove(old);
        p.Images.Clear();

        var order = 0;
        foreach (var img in (dto.Images ?? []).Where(x => !string.IsNullOrWhiteSpace(x.Url)))
        {
            p.Images.Add(new PostImage
            {
                ImageUrl = img.Url.Trim(),
                Caption = string.IsNullOrWhiteSpace(img.Caption) ? null : img.Caption.Trim(),
                DisplayOrder = order++
            });
        }
    }
}