using InkWell.Api.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text;

namespace InkWell.Api.Controllers;

[ApiController]
public class SitemapController(AppDbContext db) : ControllerBase
{
    [HttpGet("/sitemap.xml")]
    public async Task<IActionResult> GetSitemap()
    {
        var baseUrl = "https://inkwell-3m7y.onrender.com";
        var posts = await db.Posts.Where(x => x.Status == "Published").ToListAsync();

        var xml = new StringBuilder();
        xml.AppendLine("<?xml version=\"1.0\" encoding=\"UTF-8\"?>");
        xml.AppendLine("<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">");

        // Static pages
        string[] staticPages = { "/", "/about", "/privacy", "/contact" };
        foreach (var page in staticPages)
        {
            xml.AppendLine($"  <url><loc>{baseUrl}{page}</loc><changefreq>daily</changefreq><priority>0.8</priority></url>");
        }

        // Dynamic posts
        foreach (var post in posts)
        {
            xml.AppendLine($"  <url><loc>{baseUrl}/post/{post.Id}</loc><lastmod>{post.UpdatedAt:yyyy-MM-dd}</lastmod><changefreq>weekly</changefreq><priority>0.9</priority></url>");
        }

        xml.AppendLine("</urlset>");
        return Content(xml.ToString(), "application/xml", Encoding.UTF8);
    }
}