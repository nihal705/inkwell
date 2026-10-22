using System.Text;
using DotNetEnv;
using InkWell.Api.Data;
using InkWell.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

var envPath = Path.Combine(builder.Environment.ContentRootPath, ".env");
if (File.Exists(envPath)) Env.Load(envPath);

// Neon PostgreSQL: an environment variable takes precedence over local configuration.
var connectionString = Environment.GetEnvironmentVariable("NEON_CONNECTION_STRING")
    ?? builder.Configuration.GetConnectionString("NeonConnection");
if (string.IsNullOrWhiteSpace(connectionString))
    throw new InvalidOperationException("Neon connection string is missing. Check your .env file.");
builder.Services.AddDbContext<AppDbContext>(options => options.UseNpgsql(connectionString));

var jwtKey = Environment.GetEnvironmentVariable("JWT_KEY")
    ?? builder.Configuration["JwtSettings:Key"]
    ?? throw new InvalidOperationException("JWT key is missing.");
if (jwtKey.Length < 32) throw new InvalidOperationException("JWT key must contain at least 32 characters.");
var jwtIssuer = Environment.GetEnvironmentVariable("JWT_ISSUER") ?? "inkwell-api";
var jwtAudience = Environment.GetEnvironmentVariable("JWT_AUDIENCE") ?? "inkwell-client";
var key = Encoding.UTF8.GetBytes(jwtKey);

builder.Services.AddScoped<IJwtService, JwtService>();
builder.Services.AddScoped<IPasswordHasher, PasswordHasher>();
builder.Services.AddHttpClient<IEmailService, EmailJsService>();
builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
}).AddJwtBearer(options => options.TokenValidationParameters = new TokenValidationParameters
{
    ValidateIssuer = true, ValidateAudience = true, ValidateLifetime = true,
    ValidateIssuerSigningKey = true, ValidIssuer = jwtIssuer, ValidAudience = jwtAudience,
    IssuerSigningKey = new SymmetricSecurityKey(key), ClockSkew = TimeSpan.FromMinutes(1),
    RoleClaimType = System.Security.Claims.ClaimTypes.Role,
    NameClaimType = System.Security.Claims.ClaimTypes.Name
});
builder.Services.AddAuthorization();
builder.Services.AddCors(options => options.AddPolicy("AllowFrontend", policy => policy
    .SetIsOriginAllowed(origin => origin == "http://localhost:5000" || origin == "http://localhost:5173" || new Uri(origin).Host.EndsWith(".vercel.app", StringComparison.OrdinalIgnoreCase))
    .AllowAnyHeader().AllowAnyMethod()));
builder.Services.AddHttpClient();
builder.Services.AddControllers();
builder.Services.AddOpenApi();

var port = Environment.GetEnvironmentVariable("PORT");
if (!string.IsNullOrWhiteSpace(port)) builder.WebHost.UseUrls($"http://0.0.0.0:{port}");
var app = builder.Build();
app.UseDefaultFiles();
app.UseStaticFiles();
app.UseCors("AllowFrontend");
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapGet("/api/health", () => Results.Ok(new { status = "ok", product = "InkWell" })).AllowAnonymous();
app.MapFallbackToFile("index.html");

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await db.Database.EnsureCreatedAsync();
    await SeedData.InitializeAsync(db);
}

app.Run();
