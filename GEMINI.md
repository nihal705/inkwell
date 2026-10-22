# InkWell Automated Article Publishing Workflow

When the user asks to "post an article on [topic]" or "automate a post on [topic]":

## 1. Article Content Standard
Write a thoughtful, high-quality 1000–1400 word article formatted for InkWell's magazine reader:
- **Title**: Strong, engaging editorial title (stored separately).
- **Introduction**: Starts immediately with a short, punchy opening hook paragraph (2–3 sentences max). **DO NOT** repeat the title or include a top-level `# Title` in the content. This short opening powers InkWell's drop-cap styling and home card excerpt. Long, deep paragraphs follow in subsequent sections.
- **Section Headings**: Use `## ` for main sections (these automatically populate InkWell's Table of Contents and TTS audio player).
- **Subsections**: Use `### ` for deeper exploration.
- **Quotes**: Include 1–2 pull quotes using `> Quote`.
- **Styling**: Use `**bold**` for emphasis, clean paragraphs, and no raw image syntax in the opening paragraphs.
- **Taxonomy**:
  - `categories`: Select 1 or 2 matching categories (`Technology`, `Design`, `Culture`, `Business`, `Lifestyle`, `Opinion`) or create a relevant new category (InkWell auto-registers new categories).
  - `tags`: 3–5 relevant lowercase keyword tags (e.g., `["ai", "deep-work", "philosophy"]`).

## 2. Editorial Cover & Inline Image Standards
InkWell uses a minimalist, flat-vector editorial art style with warm earth and paper tones (cream `#faf7f2`, sage green `#a8b5a0`, terracotta `#c2410c`, ink black `#1b1a17`).

- **High-Definition Generation**: Use Antigravity's native `image-generator` subagent (or DALL-E) to produce crisp, high-resolution conceptual artwork without faces or photographic artifacts.
- **Multi-Image Support**:
  - **Cover Image**: Stored in `image_url` / `mainImageUrl`.
  - **Inline Article Images**: Placed within the Markdown text using `![Caption / Alt description](IMAGE_URL)`. InkWell automatically formats these into responsive `<figure class="article-image">` elements with `<figcaption>`.
  - **Image Gallery / Metadata**: Secondary images can also be registered under the `"images": [{"url": "...", "caption": "..."}]` array.
- **Permanent Cloudinary Hosting**: `post_article.py` automatically uploads all local image files or external URLs to your Cloudinary storage under preset `inkwell_unsigned` and stores the permanent `res.cloudinary.com` URLs.

## 3. Save Payload
Save the title, image URL, categories, tags, inline images, and markdown content into `article.json`:
```json
{
  "post_id": null,
  "title": "Article Title",
  "image_url": "path/to/cover.jpg",
  "categories": ["Technology", "Culture"],
  "tags": ["topic-1", "topic-2"],
  "images": [
    {
      "url": "path/to/inline_diagram.jpg",
      "caption": "Diagram caption"
    }
  ],
  "content": "First paragraph hook...\n\n## Section One\n\n![Diagram caption](path/to/inline_diagram.jpg)\n\n..."
}
```

## 4. Execute Publishing Script
Run the automated script:
```powershell
# To publish a new article:
python post_article.py

# Or to update an existing article:
python post_article.py --update <id>
```
This script:
1. Connects to `INKWELL_URL` (or falls back to live production `https://inkwell-3m7y.onrender.com`).
2. Uploads the cover image to Cloudinary.
3. Authenticates using `ADMIN_EMAIL` and `ADMIN_PASSWORD` from `.env`.
4. Publishes directly with `Status: Published` (admin bypasses review queue).
5. Returns the post ID and live link.

## 5. Report to User
Provide the user with:
- Live article URL: `https://inkwell-3m7y.onrender.com/post/{id}`
- Title, category, and tags
- 2-sentence editorial excerpt
- Confirmation of Cloudinary image hosting
