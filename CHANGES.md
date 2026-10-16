# InkWell build notes

## Delivered

- Created a runnable C# application under `InkWell.Api` and kept the product name **InkWell**.
- Added article discovery, category and author pages, full article rendering, copy-link sharing, searchable library, light/dark mode, responsive navigation, footer, skeletons, and empty states.
- Added account registration/login, profile editing, reader-to-editor applications, a writing desk, drafts/submissions, rejection feedback, resubmission, and an admin control room for applications and posts.
- Seeded default categories and two example articles. The first start also creates a configurable primary administrator.
- Added Docker setup, ignore rules, solution registration, and local development documentation.

## Intentional environment choice

The available machine has the .NET 10 SDK only and cannot reach NuGet/npm, so this is a dependency-free **.NET 10** implementation rather than the requested .NET 8 + React/EF/Npgsql stack. It compiles successfully with the installed SDK. The UI is served as a static SPA by ASP.NET instead of Vite so it remains runnable offline.

## Before real deployment

1. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` before the first launch. Never use the documented development password publicly.
2. Replace the JSON `InkWellStore` with EF Core/Npgsql on Neon, use migrations, and store `NEON_CONNECTION_STRING` in the host configuration.
3. Replace in-memory bearer sessions and SHA-256 password hashing with ASP.NET JWT bearer authentication and BCrypt/Argon2 hashes. Add rate limiting, a reset-password email provider, and HTTPS.
4. Build a React/Vite layer once npm access is available if that exact deployment architecture is required. The current REST API routes can be consumed directly.
