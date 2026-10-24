using InkWell.Api.Data;
using InkWell.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace InkWell.Api.Controllers;

[ApiController, Route("api/categories")]
public class CategoriesController(AppDbContext db, AppCache appCache) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get()
    {
        const string key = "categories_list";
        if (appCache.Raw.TryGetValue(key, out object? cached) && cached != null)
        {
            return Ok(cached);
        }

        var result = await db.Categories
            .OrderBy(x => x.Name)
            .Select(x => new
            {
                x.Id,
                x.Name,
                x.Slug,
                postCount = x.PostCategories.Count(pc => pc.Post.Status == "Published")
            })
            .ToListAsync();

        appCache.Raw.Set(key, result, TimeSpan.FromMinutes(10));
        return Ok(result);
    }
}
