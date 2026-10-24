# InkWell

An article publishing platform where anyone can write and post. New writers register, submit articles, and admins review them before they go live.

Built with .NET 10, EF Core, Neon PostgreSQL, Cloudinary, and a vanilla JavaScript SPA.

**Live:** [https://inkwell-magazine.vercel.app](https://inkwell-magazine.vercel.app)

---

## Features

- **Public magazine**: read articles without an account. Category pages, search, and author profiles.
- **Premium Reading Experience**:
  - **Focus Mode (Zen)**: hides sidebars and centers the article with light, sepia, or dark themes.
  - **Text-to-Speech (Listen)**: reads articles aloud paragraph-by-paragraph with active highlighting.
  - **Private Highlights**: select text to highlight, copy quotes, or undo highlights (stored locally).
  - **Saved Library**: bookmark posts to a local reading list accessible from the navbar.
- **Dynamic Content**: Filter by categories or tags. Admins can create new categories on the fly while writing.
- **Open registration**: anyone can sign up and start writing right away.
- **Editorial workflow**: submissions from writers go through admin review before publishing. Admin posts publish instantly.
- **Rejection feedback**: admins can return posts with notes, and writers can revise and resubmit.
- **Admin dashboard**: pending posts queue, community overview, and stats.
- **Writer dashboard**: drafts, in-review, published, and rejected stories in one place.
- **Profile system**: display name, bio, profession, studies, location, website, Twitter, LinkedIn, and avatar.
- **Image uploads**: Cloudinary-powered cover images, inline images, and profile pictures.
- **Share bar**: WhatsApp, X, Facebook, LinkedIn, and copy link.
- **UI/UX**: Light/dark theme, keyboard search (`Ctrl+K`), back-to-top button, reading progress bar, and subtle fade/ink-burst animations.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | .NET 10 Web API, C# |
| Database | PostgreSQL (Neon), EF Core |
| Caching | In-Memory Caching (`IMemoryCache`) |
| Auth | JWT Bearer + BCrypt password hashing |
| Uploads | Cloudinary (unsigned uploads) |
| Frontend | Vanilla JavaScript SPA + CSS (Vercel Edge CDN) |
| Backend Hosting | Railway (Docker container) |

---

## Run Locally

### 1. Clone and restore

```powershell
git clone https://github.com/nihal705/inkwell.git
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

### Railway (Backend API)

1. Push the repository to GitHub.
2. In [railway.app](https://railway.app), click **New Project** → **Deploy from GitHub repo**.
3. In Service **Settings**, set **Root Directory** to `/InkWell.Api`.
4. Under **Networking**, generate a domain and set the target port to `8080`.
5. In the **Variables** tab, add all environment variables from the table above.
6. (Optional) Under **Settings** → **Serverless**, toggle on dormancy to scale down when idle.

### Vercel (Frontend Edge CDN)

1. Import the repository on [vercel.com](https://vercel.com).
2. `vercel.json` automatically directs Vercel to serve `InkWell.Api/wwwroot` and proxies `/api/*` to Railway.
3. Deploy. The static frontend is delivered instantly from Vercel's global CDN.

---

## Project Structure

```text
InkWell/
├── InkWell.Api/
│   ├── Controllers/       # API endpoints
│   ├── Data/              # AppDbContext, SeedData
│   ├── DTOs/              # Request/response contracts
│   ├── Models/            # EF Core entities
│   ├── Services/          # JWT, caching, password hashing
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
├── vercel.json
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