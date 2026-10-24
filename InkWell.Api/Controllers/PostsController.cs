using InkWell.Api.Data;
using InkWell.Api.DTOs;
using InkWell.Api.Models;
using InkWell.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace InkWell.Api.Controllers;

[ApiController, Route("api/posts")]
public class PostsController(AppDbContext db, AppCache appCache) : ControllerBase
{
    IQueryable<Post> WithDetails() => db.Posts
        .Include(x => x.Author)
        .Include(x => x.Images)
        .Include(x => x.PostCategories).ThenInclude(x => x.Category)
        .Include(x => x.PostTags).ThenInclude(x => x.Tag)
        .Include(x => x.Series!).ThenInclude(s => s.Posts);

    [AllowAnonymous, HttpGet]
    public async Task<IActionResult> List(string? search, string? category, string? tag, int page = 1)
    {
        var isAnonymous = User.Identity?.IsAuthenticated != true;
        var cacheKey = appCache.GetPostsListKey(search, category, tag, page);

        if (isAnonymous && appCache.Raw.TryGetValue(cacheKey, out object? cached) && cached != null)
        {
            return Ok(cached);
        }

        var baseQ = db.Posts.Where(x => x.Status == "Published");
        
        if (!string.IsNullOrWhiteSpace(search))
            baseQ = baseQ.Where(x => EF.Functions.ILike(x.Title, $"%{search}%") || EF.Functions.ILike(x.Content, $"%{search}%"));
            
        if (!string.IsNullOrWhiteSpace(category))
            baseQ = baseQ.Where(x => x.PostCategories.Any(c => c.Category.Name == category || c.Category.Slug == category));
            
        if (!string.IsNullOrWhiteSpace(tag))
            baseQ = baseQ.Where(x => x.PostTags.Any(t => t.Tag.Name == tag || t.Tag.Slug == tag));
            
        var total = await baseQ.CountAsync();

        var q = WithDetails().Where(x => x.Status == "Published");
        if (!string.IsNullOrWhiteSpace(search))
            q = q.Where(x => EF.Functions.ILike(x.Title, $"%{search}%") || EF.Functions.ILike(x.Content, $"%{search}%"));
        if (!string.IsNullOrWhiteSpace(category))
            q = q.Where(x => x.PostCategories.Any(c => c.Category.Name == category || c.Category.Slug == category));
        if (!string.IsNullOrWhiteSpace(tag))
            q = q.Where(x => x.PostTags.Any(t => t.Tag.Name == tag || t.Tag.Slug == tag));

        var posts = await q.OrderByDescending(x => x.PublishedAt).Skip((Math.Max(1, page) - 1) * 9).Take(9).ToListAsync();
        var result = new { items = posts.Select(x => ApiMapper.Post(x)), total, page, pageSize = 9 };

        if (isAnonymous)
        {
            appCache.Raw.Set(cacheKey, result, TimeSpan.FromMinutes(10));
        }

        return Ok(result);
    }

    [AllowAnonymous, HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        var cacheKey = $"post_detail_{id}";
        var isAnonymous = User.Identity?.IsAuthenticated != true;

        if (isAnonymous && appCache.Raw.TryGetValue(cacheKey, out object? cached) && cached != null)
        {
            return Ok(cached);
        }

        var p = await WithDetails().FirstOrDefaultAsync(x => x.Id == id);
        if (p is null) return NotFound();
        var mine = User.Identity?.IsAuthenticated == true && (User.UserId() == p.AuthorId || User.IsInRole("Admin"));
        if (p.Status != "Published" && !mine)
            return NotFound(new { message = "That article is not available." });

        var mapped = ApiMapper.Post(p, true);
        if (p.Status == "Published")
        {
            appCache.Raw.Set(cacheKey, mapped, TimeSpan.FromMinutes(10));
        }
        return Ok(mapped);
    }

    [Authorize(Roles = "Admin,Featured Columnist,Contributing Writer,Senior Editor,Staff Editor,Editor"), HttpGet("mine")]
    public async Task<IActionResult> Mine()
    {
        var id = User.UserId();
        var posts = await WithDetails()
            .Where(x => x.AuthorId == id || User.IsInRole("Admin"))
            .OrderByDescending(x => x.UpdatedAt).ToListAsync();
        return Ok(posts.Select(x => ApiMapper.Post(x, true)));
    }

    // ============================================
    // AI SUMMARY (GROQ)
    // ============================================
    [AllowAnonymous, HttpPost("{id:int}/summarize")]
    public async Task<IActionResult> Summarize(int id, [FromServices] IHttpClientFactory httpClientFactory)
    {
        var post = await db.Posts.FindAsync(id);
        if (post == null) return NotFound(new { message = "Post not found." });

        // 1. Strip Markdown so we don't send #, *, or links to the AI
        var cleanText = Regex.Replace(post.Content, @"!\[.*?\]\(.*?\)|\[([^\]]+)\]\([^)]+\)|^#+\s+.*$|^\s*[-*+]\s+|[#*_>`]", "", RegexOptions.Multiline);
        cleanText = Regex.Replace(cleanText, @"\s+", " ").Trim();

        // Limit text length to avoid exceeding token limits (approx 4000 words)
        if (cleanText.Length > 16000) cleanText = cleanText.Substring(0, 16000);

        var apiKey = Environment.GetEnvironmentVariable("GROQ_API_KEY");
        if (string.IsNullOrWhiteSpace(apiKey))
            return StatusCode(500, new { message = "Groq API key is missing." });

        var client = httpClientFactory.CreateClient();

        // 2. Build the request for Groq (OpenAI-compatible format)
        var requestBody = new
        {
            model = "openai/gpt-oss-20b",
            messages = new[]
            {
                new { role = "system", content = "You are an expert editor. Summarize the following article in 2 to 3 sentences. Make it engaging, smooth, and professional. Do not use introductory phrases like 'This article is about'. Just give the summary." },
                new { role = "user", content = cleanText }
            },
            temperature = 0.5,
            max_tokens = 150
        };

        var request = new HttpRequestMessage(HttpMethod.Post, "https://api.groq.com/openai/v1/chat/completions");
        request.Headers.Add("Authorization", $"Bearer {apiKey}");
        request.Content = new StringContent(JsonSerializer.Serialize(requestBody), Encoding.UTF8, "application/json");

        try
        {
            var response = await client.SendAsync(request);
            var responseString = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
            {
                Console.WriteLine($"Groq Error: {responseString}");
                return StatusCode(500, new { message = "Failed to generate summary from Groq." });
            }

            // 3. Parse the response
            using var jsonDoc = JsonDocument.Parse(responseString);
            var summary = jsonDoc.RootElement
                .GetProperty("choices")[0]
                .GetProperty("message")
                .GetProperty("content")
                .GetString();

            return Ok(new { summary = summary?.Trim() });
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Summary Exception: {ex.Message}");
            return StatusCode(500, new { message = "An error occurred while generating the summary." });
        }
    }

    [Authorize(Roles = "Admin,Featured Columnist,Contributing Writer,Senior Editor,Staff Editor,Editor"), HttpGet("mine/{id:int}")]
    public async Task<IActionResult> MineOne(int id) =>
        await Own(id) is { } p ? Ok(ApiMapper.Post(p, true)) : Forbid();

    [Authorize(Roles = "Admin,Featured Columnist,Contributing Writer,Senior Editor,Staff Editor,Editor"), HttpPost]
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
            SeriesId = request.SeriesId,
            SeriesOrder = request.SeriesOrder,
            Status = admin ? "Published" : request.SaveAsDraft ? "Draft" : "PendingReview",
            PublishedAt = admin ? DateTime.UtcNow : null
        };
        await SetTaxonomy(post, request);
        SetImages(post, request);

        db.Posts.Add(post);
        await db.SaveChangesAsync();
        appCache.InvalidatePostDetail(post.Id);

        var detail = await WithDetails().SingleAsync(x => x.Id == post.Id);
        return Ok(new { message = admin ? "Article published." : "Article saved.", post = ApiMapper.Post(detail, true) });
    }

    [Authorize(Roles = "Admin,Featured Columnist,Contributing Writer,Senior Editor,Staff Editor,Editor"), HttpPut("{id:int}")]
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
        p.SeriesId = request.SeriesId;
        p.SeriesOrder = request.SeriesOrder;
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
        appCache.InvalidatePostDetail(id);
        return Ok(new { message = User.IsInRole("Admin") ? "Article updated." : "Changes submitted for review." });
    }

    [Authorize(Roles = "Admin,Featured Columnist,Contributing Writer,Senior Editor,Staff Editor,Editor"), HttpPost("{id:int}/submit")]
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
        appCache.InvalidatePostDetail(id);
        return Ok(new { message = "Submitted for review." });
    }

    [Authorize(Roles = "Admin,Featured Columnist,Contributing Writer,Senior Editor,Staff Editor,Editor"), HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var p = await Own(id);
        if (p is null) return Forbid();
        db.Posts.Remove(p);
        await db.SaveChangesAsync();
        appCache.InvalidatePostDetail(id);
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
        
        foreach (var name in dto.Categories.Where(x => !string.IsNullOrWhiteSpace(x)).Distinct(StringComparer.OrdinalIgnoreCase))
        {
            var trimmed = name.Trim();
            var c = await db.Categories.FirstOrDefaultAsync(x => x.Name == trimmed);
            
            // Auto-create category if it doesn't exist
            if (c is null) 
            {
                c = new Category { Name = trimmed, Slug = SeedData.Slug(trimmed) };
            }
            p.PostCategories.Add(new PostCategory { Category = c });
        }
        
        foreach (var name in dto.Tags.Where(x => !string.IsNullOrWhiteSpace(x)).Distinct(StringComparer.OrdinalIgnoreCase))
        {
            var trimmed = name.Trim();
            var slug = SeedData.Slug(trimmed);
            var tag = await db.Tags.FirstOrDefaultAsync(x => x.Slug == slug)
                ?? new Tag { Name = trimmed, Slug = slug };
            p.PostTags.Add(new PostTag { Tag = tag });
        }
    }

        // GET: /api/posts/random
    [AllowAnonymous, HttpGet("random")]
    public async Task<IActionResult> GetRandom()
    {
        var count = await db.Posts.CountAsync(x => x.Status == "Published");
        if (count == 0) return NotFound();
        var skip = new Random().Next(0, count);
        var post = await WithDetails().Where(x => x.Status == "Published").Skip(skip).FirstOrDefaultAsync();
        return Ok(new { id = post?.Id });
    }

    // GET: /api/posts/daily-quote
    [AllowAnonymous, HttpGet("daily-quote")]
    public async Task<IActionResult> GetDailyQuote()
    {
        var posts = await WithDetails().Where(x => x.Status == "Published").ToListAsync();
        if (!posts.Any()) return Ok(new { quote = "Start writing your first story today.", author = "InkWell", postTitle = "", postId = 0 });

        // Use the current day of the year as a seed to ensure it changes daily
        var dayOfYear = DateTime.UtcNow.DayOfYear;
        var post = posts[dayOfYear % posts.Count];

        // Extract a good sentence from the post content
        var sentences = post.Content.Split(new[] { ". ", "? ", "! " }, StringSplitOptions.RemoveEmptyEntries)
            .Select(s => s.Trim())
            .Where(s => s.Length > 50 && s.Length < 200)
            .ToList();

        var quote = sentences.Any() ? sentences[0] : post.Title;
        if (!quote.EndsWith(".") && !quote.EndsWith("?") && !quote.EndsWith("!")) quote += ".";

        return Ok(new
        {
            quote = quote,
            author = post.Author.DisplayName ?? post.Author.Username,
            postTitle = post.Title,
            postId = post.Id
        });
    }

    void SetImages(Post p, PostCreateDto dto)
    {
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