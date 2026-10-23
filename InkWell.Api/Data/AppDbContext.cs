using InkWell.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace InkWell.Api.Data;
public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>(); public DbSet<Post> Posts => Set<Post>(); public DbSet<PostImage> PostImages => Set<PostImage>(); public DbSet<Category> Categories => Set<Category>(); public DbSet<Tag> Tags => Set<Tag>(); public DbSet<PostCategory> PostCategories => Set<PostCategory>(); public DbSet<PostTag> PostTags => Set<PostTag>(); public DbSet<EditorApplication> EditorApplications => Set<EditorApplication>(); public DbSet<PostReviewHistory> PostReviewHistory => Set<PostReviewHistory>();
    public DbSet<Series> Series => Set<Series>();
    public DbSet<FeaturedItem> FeaturedItems => Set<FeaturedItem>();

    public DbSet<PasswordResetOtp> PasswordResetOtps => Set<PasswordResetOtp>();
    
    protected override void OnModelCreating(ModelBuilder m)
    {
        m.Entity<User>().HasIndex(x => x.Email).IsUnique(); m.Entity<User>().HasIndex(x => x.Username).IsUnique(); m.Entity<Category>().HasIndex(x => x.Slug).IsUnique(); m.Entity<Tag>().HasIndex(x => x.Slug).IsUnique();
        m.Entity<PostCategory>().HasKey(x => new { x.PostId, x.CategoryId }); m.Entity<PostTag>().HasKey(x => new { x.PostId, x.TagId });
        m.Entity<Post>().HasOne(x => x.Author).WithMany(x => x.Posts).HasForeignKey(x => x.AuthorId).OnDelete(DeleteBehavior.Cascade);
        m.Entity<Series>().HasIndex(x => x.Slug).IsUnique();
        m.Entity<Series>().HasOne(x => x.Author).WithMany().HasForeignKey(x => x.AuthorId).OnDelete(DeleteBehavior.Cascade);
        m.Entity<Post>().HasOne(x => x.Series).WithMany(x => x.Posts).HasForeignKey(x => x.SeriesId).OnDelete(DeleteBehavior.SetNull);
        m.Entity<FeaturedItem>().HasIndex(x => x.DisplayOrder);
        base.OnModelCreating(m);
    }
}
