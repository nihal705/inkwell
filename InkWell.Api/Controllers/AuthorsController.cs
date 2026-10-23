using InkWell.Api.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace InkWell.Api.Controllers;

[ApiController, Route("api/authors")]
public class AuthorsController(AppDbContext db) : ControllerBase
{
    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        var user = await db.Users.FindAsync(id);
        if (user is null) return NotFound();
        var posts = await db.Posts
            .Include(x => x.Author)
            .Include(x => x.Images)
            .Include(x => x.PostCategories).ThenInclude(x => x.Category)
            .Include(x => x.PostTags).ThenInclude(x => x.Tag)
            .Where(x => x.AuthorId == id && x.Status == "Published")
            .OrderByDescending(x => x.PublishedAt)
            .ToListAsync();

        var series = await db.Series
            .Include(x => x.Author)
            .Include(x => x.Posts)
            .Where(x => x.AuthorId == id)
            .OrderByDescending(x => x.UpdatedAt)
            .ToListAsync();

        return Ok(new
        {
            author = ApiMapper.User(user),
            posts = posts.Select(x => ApiMapper.Post(x)),
            series = series.Select(s => ApiMapper.Series(s, false))
        });
    }
}