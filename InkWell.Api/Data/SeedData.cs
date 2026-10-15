using InkWell.Api.Models;
using InkWell.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace InkWell.Api.Data;
public static class SeedData
{
    public static async Task InitializeAsync(AppDbContext db)
    {
        if (await db.Users.AnyAsync()) return;
        var admin = new User { Username = Environment.GetEnvironmentVariable("ADMIN_USERNAME") ?? "editorial_admin", Email = (Environment.GetEnvironmentVariable("ADMIN_EMAIL") ?? "admin@inkwell.local").ToLowerInvariant(), PasswordHash = new PasswordHasher().Hash(Environment.GetEnvironmentVariable("ADMIN_PASSWORD") ?? "Admin123"), Role = "Admin", Bio = "The InkWell editorial desk." };
        db.Users.Add(admin);
        var categories = new[] { "Technology", "Design", "Culture", "Business", "Lifestyle", "Opinion" }.Select(name => new Category { Name = name, Slug = Slug(name) }).ToArray();
        db.Categories.AddRange(categories); await db.SaveChangesAsync();
        var posts = new[] { new Post { Title = "The quiet craft of paying attention", Content = "# Attention is a practice\n\nThe best ideas rarely arrive on command. They show up while you are walking, listening, and leaving room for an unfinished thought.\n\n> A good question can change the shape of an ordinary day.", AuthorId = admin.Id, Status = "Published", PublishedAt = DateTime.UtcNow.AddDays(-2) }, new Post { Title = "Designing for a slower internet", Content = "# Make space for readers\n\nA calm interface is not empty. It gives a reader a place to think. Every detail can make an article feel like an invitation rather than an interruption.", AuthorId = admin.Id, Status = "Published", PublishedAt = DateTime.UtcNow.AddDays(-5) } };
        db.Posts.AddRange(posts); await db.SaveChangesAsync();
        db.PostCategories.AddRange(new PostCategory { PostId = posts[0].Id, CategoryId = categories.First(x => x.Name == "Culture").Id }, new PostCategory { PostId = posts[1].Id, CategoryId = categories.First(x => x.Name == "Design").Id }); await db.SaveChangesAsync();
    }
    public static string Slug(string text) => text.Trim().ToLowerInvariant().Replace(" ", "-");
}
