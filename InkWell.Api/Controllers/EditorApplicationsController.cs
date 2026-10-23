using InkWell.Api.Data;
using InkWell.Api.DTOs;
using InkWell.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace InkWell.Api.Controllers;
[ApiController, Route("api/editor-applications"), Authorize]
public class EditorApplicationsController(AppDbContext db) : ControllerBase
{
    [HttpPost]
    public async Task<IActionResult> Apply(EditorApplicationDto request)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        var user = await db.Users.FindAsync(User.UserId());
        if (user is null) return Unauthorized();
        if (user.Role.Equals("Admin", StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { message = "You are already the Administrator." });

        if (await db.EditorApplications.AnyAsync(x => x.UserId == user.Id && x.Status == "Pending"))
            return BadRequest(new { message = "Your promotion application is already being reviewed." });

        var app = new EditorApplication
        {
            UserId = user.Id,
            Motivation = request.Motivation.Trim(),
            RequestedRole = string.IsNullOrWhiteSpace(request.RequestedRole) ? "Contributing Writer" : request.RequestedRole.Trim(),
            Status = "Pending",
            AppliedAt = DateTime.UtcNow
        };

        db.EditorApplications.Add(app);
        await db.SaveChangesAsync();
        return Ok(new { message = "Application submitted to the editorial desk." });
    }

    [HttpGet("mine")]
    public async Task<IActionResult> Mine()
    {
        var data = await db.EditorApplications.Include(x => x.User).Where(x => x.UserId == User.UserId()).OrderByDescending(x => x.AppliedAt).ToListAsync();
        return Ok(data.Select(Map));
    }

    internal static object Map(EditorApplication a) => new
    {
        a.Id,
        a.UserId,
        applicant = ApiMapper.User(a.User),
        a.Motivation,
        requestedRole = a.RequestedRole ?? "Contributing Writer",
        currentRole = a.User != null ? a.User.Role : "Reader",
        status = a.Status,
        a.ReviewNotes,
        a.AppliedAt,
        a.ReviewedAt
    };
}
