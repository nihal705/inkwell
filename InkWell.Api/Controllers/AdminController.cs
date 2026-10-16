using InkWell.Api.Data;
using InkWell.Api.DTOs;
using InkWell.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace InkWell.Api.Controllers;

[ApiController, Route("api/admin"), Authorize(Roles = "Admin")]
public class AdminController(AppDbContext db) : ControllerBase
{
    IQueryable<Post> Details() => db.Posts.Include(x => x.Author).Include(x => x.PostCategories).ThenInclude(x => x.Category).Include(x => x.PostTags).ThenInclude(x => x.Tag);
    [HttpGet("stats")] public async Task<IActionResult> Stats() => Ok(new { published = await db.Posts.CountAsync(x => x.Status == "Published"), pendingPosts = await db.Posts.CountAsync(x => x.Status == "PendingReview"), pendingApplications = await db.EditorApplications.CountAsync(x => x.Status == "Pending"), readers = await db.Users.CountAsync(x => x.Role == "Reader"), editors = await db.Users.CountAsync(x => x.Role == "Editor") });
    [HttpGet("pending-posts")] public async Task<IActionResult> PendingPosts() => Ok((await Details().Where(x => x.Status == "PendingReview").ToListAsync()).Select(x => ApiMapper.Post(x, true)));
    [HttpGet("applications")] public async Task<IActionResult> Applications() => Ok((await db.EditorApplications.Include(x => x.User).OrderByDescending(x => x.AppliedAt).ToListAsync()).Select(EditorApplicationsController.Map));
    [HttpGet("users")] public async Task<IActionResult> Users() => Ok((await db.Users.OrderBy(x => x.Username).ToListAsync()).Select(ApiMapper.User));
    [HttpPost("posts/{id:int}/review")]
    public async Task<IActionResult> ReviewPost(int id, ReviewDto request)
    {
        if (request.Action is not ("Approve" or "Reject")) return BadRequest(new { message = "Choose Approve or Reject." }); if (request.Action == "Reject" && string.IsNullOrWhiteSpace(request.Comments)) return BadRequest(new { message = "A reason is required." });
        var post = await db.Posts.FindAsync(id); if (post is null) return NotFound(); post.Status = request.Action == "Approve" ? "Published" : "Rejected"; if (post.Status == "Published") post.PublishedAt ??= DateTime.UtcNow; post.RejectionReason = post.Status == "Rejected" ? request.Comments!.Trim() : null; db.PostReviewHistory.Add(new PostReviewHistory { PostId = id, AdminId = User.UserId(), Action = request.Action, Comments = request.Comments }); await db.SaveChangesAsync(); return Ok(new { message = request.Action == "Approve" ? "Post approved." : "Post returned to the editor." });
    }
    [HttpPost("applications/{id:int}/review")]
    public async Task<IActionResult> ReviewApplication(int id, ReviewDto request)
    {
        if (request.Action is not ("Approve" or "Reject")) return BadRequest(new { message = "Choose Approve or Reject." }); var a = await db.EditorApplications.Include(x => x.User).FirstOrDefaultAsync(x => x.Id == id); if (a is null) return NotFound(); a.Status = request.Action == "Approve" ? "Approved" : "Rejected"; a.ReviewNotes = request.Comments; a.ReviewedAt = DateTime.UtcNow; if (a.Status == "Approved") a.User.Role = "Editor"; await db.SaveChangesAsync(); return Ok(new { message = a.Status == "Approved" ? "Editor approved." : "Application rejected." });
    }

    [HttpDelete("posts/{id:int}")]
    public async Task<IActionResult> DeletePost(int id)
    {
        var post = await db.Posts.FindAsync(id);
        if (post is null) return NotFound(new { message = "Post not found." });
        db.Posts.Remove(post);
        await db.SaveChangesAsync();
        return Ok(new { message = "Post deleted." });
    }
}
