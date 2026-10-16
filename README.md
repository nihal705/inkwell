# InkWell

An article publishing platform where anyone can write and post. New writers register, submit articles, and admins review them before they go live.

Built with .NET 10, EF Core, Neon PostgreSQL, Cloudinary, and a vanilla JavaScript SPA.

**Live:** [https://inkwell-3m7y.onrender.com](https://inkwell-3m7y.onrender.com)

---

## Features

- **Public magazine**: read articles without an account. Category pages, search, and author profiles.
- **Open registration**: anyone can sign up and start writing right away.
- **Editorial workflow**: submissions from writers go through admin review before publishing. Admin posts publish instantly.
- **Rejection feedback**: admins can return posts with notes, and writers can revise and resubmit.
- **Admin dashboard**: pending posts queue, community overview, and stats.
- **Writer dashboard**: drafts, in-review, published, and rejected stories in one place.
- **Profile system**: display name, bio, profession, studies, location, website, Twitter, LinkedIn, and avatar.
- **Image uploads**: Cloudinary-powered cover images and profile pictures.
- **Share bar**: WhatsApp, X, Facebook, LinkedIn, and copy link.
- **Light/dark theme**, keyboard search (`Ctrl+K`), back-to-top button, and a fully responsive layout.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | .NET 10 Web API, C# |
| Database | PostgreSQL (Neon), EF Core |
| Auth | JWT Bearer + BCrypt password hashing |
| Uploads | Cloudinary (unsigned uploads) |
| Frontend | Vanilla JavaScript SPA + CSS |
| Hosting | Render (Docker) |

---

## Run Locally

### 1. Clone and restore

```powershell
git clone https://github.com/YOUR-USERNAME/inkwell.git
cd inkwell
dotnet restore
```

### 2. Configure environment

Create `InkWell.Api/.env`:

```text
NEON_CONNECTION_STRING=Host=<host>;Port=5432;Database=<db>;Username=<user>;Password=<pass>;SSL Mode=Require;Pooling=true
JWT_KEY=<64-character-random-string>
JWT_ISSUER=inkwell-api
JWT_AUDIENCE=inkwell-client
JWT_EXPIRY_MINUTES=1440
ADMIN_EMAIL=admin@inkwell.local
ADMIN_PASSWORD=<choose-a-strong-password>
CLOUDINARY_CLOUD_NAME=<your-cloud-name>
CLOUDINARY_UPLOAD_PRESET=<your-unsigned-preset>
```

See `.env.example` for the full template.

### 3. Run

```powershell
dotnet run --project .\InkWell.Api
```

Open `http://localhost:5000`.

On first launch, the app creates the schema and seeds:

- An admin account (using `ADMIN_EMAIL` / `ADMIN_PASSWORD`)
- Six default categories
- Two sample articles

### Admin login

Sign in with the `ADMIN_EMAIL` and `ADMIN_PASSWORD` you set in `.env`. Always use a strong, unique password, especially before deploying publicly.

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `NEON_CONNECTION_STRING` | Neon PostgreSQL connection (Npgsql keyword format) |
| `JWT_KEY` | Secret used to sign JWT tokens (minimum 32 characters) |
| `JWT_ISSUER` | Token issuer claim |
| `JWT_AUDIENCE` | Token audience claim |
| `JWT_EXPIRY_MINUTES` | Token lifetime (default 1440 = 24 hours) |
| `ADMIN_EMAIL` | Email for the seeded admin on first run |
| `ADMIN_PASSWORD` | Password for the seeded admin |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name |
| `CLOUDINARY_UPLOAD_PRESET` | Cloudinary unsigned preset |

---

## API Overview

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | None | Create an account (assigned the Editor role) |
| POST | `/api/auth/login` | None | Get a JWT token |
| POST | `/api/auth/refresh` | JWT | Refresh token and role |
| PUT | `/api/auth/profile` | JWT | Update profile |
| GET | `/api/posts` | None | List published posts (search, category, pagination) |
| GET | `/api/posts/{id}` | None | Single post |
| GET | `/api/posts/mine` | Editor/Admin | Own posts |
| POST | `/api/posts` | Editor/Admin | Create a post (Editors go to PendingReview, Admins publish directly) |
| PUT | `/api/posts/{id}` | Editor/Admin | Update a post |
| DELETE | `/api/posts/{id}` | Editor/Admin | Delete own post |
| GET | `/api/categories` | None | List categories |
| GET | `/api/authors/{id}` | None | Author profile and posts |
| GET | `/api/admin/stats` | Admin | Dashboard stats |
| GET | `/api/admin/pending-posts` | Admin | Posts awaiting review |
| POST | `/api/admin/posts/{id}/review` | Admin | Approve or reject a post |
| DELETE | `/api/admin/posts/{id}` | Admin | Delete any post |
| GET | `/api/config` | None | Public app config (Cloudinary cloud name and preset) |
| GET | `/api/health` | None | Health check |

---

## Deployment

### Render

1. Push the repo to GitHub.
2. Create a new **Web Service** on [render.com](https://render.com).
3. Set **Root Directory** to `InkWell.Api` and **Runtime** to `Docker`.
4. Add all environment variables from the table above.
5. Deploy. The included `Dockerfile` handles the build.

### Keep-alive (free tier)

Render free instances sleep after 15 minutes of inactivity. To keep InkWell awake, use [UptimeRobot](https://uptimerobot.com) to ping `https://your-app.onrender.com/api/health` every 5 minutes.

---

## Project Structure

```text
InkWell/
├── InkWell.Api/
│   ├── Controllers/       # API endpoints
│   ├── Data/              # AppDbContext, SeedData
│   ├── DTOs/              # Request/response contracts
│   ├── Models/            # EF Core entities
│   ├── Services/          # JWT, password hashing
│   ├── wwwroot/           # Frontend SPA
│   │   ├── index.html
│   │   ├── app.js
│   │   ├── styles.css
│   │   ├── favicon.svg
│   │   └── manifest.webmanifest
│   ├── Dockerfile
│   └── Program.cs
├── .env.example
├── .gitignore
├── LICENSE
└── README.md
```

---

## Security Notes

- `.env` is gitignored. Never commit real credentials.
- Passwords are hashed with BCrypt.
- JWT tokens are validated on every protected request.
- Cloudinary uploads use unsigned presets (the cloud name and preset are public by design).
- File type and size are validated before upload.

---

## License

The source code is released under the [MIT License](LICENSE).

Articles, images, and other content posted by users on a deployed InkWell site remain the property of their authors. The MIT License covers the software only, not user-submitted content.