using InkWell.Api.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
namespace InkWell.Api.Controllers;
[ApiController, Route("api/categories")]
public class CategoriesController(AppDbContext db) : ControllerBase
{
    [HttpGet] public async Task<IActionResult> Get() => Ok(await db.Categories.OrderBy(x => x.Name).Select(x => new { x.Id, x.Name, x.Slug, postCount = x.PostCategories.Count(pc => pc.Post.Status == "Published") }).ToListAsync());
}
