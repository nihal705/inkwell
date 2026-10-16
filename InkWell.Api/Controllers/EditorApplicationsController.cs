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
    [HttpPost] public async Task<IActionResult> Apply(EditorApplicationDto request)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState); var user = await db.Users.FindAsync(User.UserId()); if (user is null) return Unauthorized(); if (user.Role is "Editor" or "Admin") return BadRequest(new { message = "You already have publishing access." });
        if (await db.EditorApplications.AnyAsync(x => x.UserId == user.Id && x.Status == "Pending")) return BadRequest(new { message = "Your application is already being reviewed." });
        db.EditorApplications.Add(new EditorApplication { UserId = user.Id, Motivation = request.Motivation.Trim() }); await db.SaveChangesAsync(); return Ok(new { message = "Application sent. The editorial desk will review it shortly." });
    }
    [HttpGet("mine")] public async Task<IActionResult> Mine()
    {
        var data = await db.EditorApplications.Include(x => x.User).Where(x => x.UserId == User.UserId()).OrderByDescending(x => x.AppliedAt).ToListAsync(); return Ok(data.Select(Map));
    }
    internal static object Map(EditorApplication a) => new { a.Id, a.UserId, applicant = ApiMapper.User(a.User), a.Motivation, status = a.Status, a.ReviewNotes, a.AppliedAt, a.ReviewedAt };
}
