const $ = (s, e = document) => e.querySelector(s);
const $$ = (s, e = document) => [...e.querySelectorAll(s)];
const app = $("#app");

addEventListener("scroll", () => {
  const bt = $("#back-top");
  if (bt) bt.classList.toggle("show", window.scrollY > 400);
});

const state = {
  user: JSON.parse(localStorage.getItem("inkwell_user") || "null"),
  token: localStorage.getItem("inkwell_token"),
  posts: [],
  categories: [],
  cloudinary: null,
  theme:
    localStorage.getItem("inkwell_theme") ||
    (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
};
document.documentElement.dataset.theme = state.theme;

// ==================== CLOUDINARY UPLOAD ====================
async function ensureCloudinaryConfig() {
  if (state.cloudinary) return;
  try {
    const res = await fetch("/api/config");
    if (res.ok) {
      const cfg = await res.json();
      if (cfg.cloudinary?.cloudName && cfg.cloudinary?.uploadPreset) {
        state.cloudinary = cfg.cloudinary;
        return;
      }
    }
  } catch {}
  // Fallback to values baked into the app (works even if /api/config is unreachable)
  state.cloudinary = { cloudName: "xx4lxfgt", uploadPreset: "inkwell_unsigned" };
}

async function uploadImage(file) {
  if (!file) throw new Error("No file selected.");
  if (!file.type.startsWith("image/")) throw new Error("Only image files are allowed.");
  if (file.size > 8 * 1024 * 1024) throw new Error("Image must be under 8 MB.");

  await ensureCloudinaryConfig();
  const { cloudName, uploadPreset } = state.cloudinary;

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", uploadPreset);

  const url = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
  const res = await fetch(url, { method: "POST", body: formData });
  const data = await res.json();
  if (!res.ok) {
    console.error("Cloudinary error:", data);
    throw new Error(data.error?.message || "Upload failed.");
  }
  return data.secure_url;
}

// ==================== HELPERS ====================
const esc = (s) =>
  String(s || "").replace(
    /[&<>'"]/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        c
      ],
  );
const date = (d) =>
  new Date(d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const initials = (u) =>
  esc(
    (u?.displayName || u?.username || "I")
      .split(/[_ ]/)
      .map((x) => x[0])
      .join("")
      .slice(0, 2)
      .toUpperCase(),
  );

const avatarImg = (u) =>
  u?.profilePictureUrl
    ? `<img src="${esc(u.profilePictureUrl)}" alt="">`
    : initials(u);

function toast(message, type = "") {
  const t = $("#toast");
  t.textContent = message;
  t.className = `show ${type}`;
  setTimeout(() => (t.className = ""), 3600);
}

async function api(url, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(url, { ...options, headers });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) {
    const error =
      data?.message ||
      Object.values(data?.errors || {})[0]?.[0] ||
      (res.status === 401
        ? "Please sign in to continue."
        : "Something went wrong.");
    throw new Error(error);
  }
  return data;
}

function setSession(d) {
  state.token = d.token;
  state.user = d.user;
  localStorage.setItem("inkwell_token", d.token);
  localStorage.setItem("inkwell_user", JSON.stringify(d.user));
}

function logout() {
  state.user = null;
  state.token = null;
  localStorage.removeItem("inkwell_token");
  localStorage.removeItem("inkwell_user");
  location.hash = "#/";
  toast("You are signed out.");
}

function markdown(text) {
  return esc(text)
    // Images first — safe URL schemes only
    .replace(/!\[([^\]]*)\]\(((?:https?:\/\/|\/)[^)]+)\)/g, (_, alt, url) =>
      `<figure class="article-image"><img src="${url}" alt="${alt}" loading="lazy" />${
        alt ? `<figcaption>${alt}</figcaption>` : ""
      }</figure>`
    )
    .replace(/^### (.*)$/gm, "<h3>$1</h3>")
    .replace(/^## (.*)$/gm, "<h2>$1</h2>")
    .replace(/^# (.*)$/gm, "<h1>$1</h1>")
    .replace(/^&gt; (.*)$/gm, "<blockquote>$1</blockquote>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`(.*?)`/g, "<code>$1</code>")
    .split(/\n{2,}/)
    .map((x) => /^<h|^<blockquote|^<figure/.test(x) ? x : `<p>${x.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

// ==================== SHELL (Navbar + Footer) ====================
function shell(content) {
  const u = state.user;
  app.innerHTML = `
    <header>
      <nav class="nav wrap">
        <a class="brand" href="#/" aria-label="InkWell home"><span class="nib">✦</span>Ink<span>Well</span></a>
        <button class="mobile-menu" aria-label="Open menu">☰</button>
        <div class="nav-links">
          <a href="#/">Home</a>
          <a href="#/categories">Categories</a>
          <a href="#/about">About</a>
        </div>
        <div class="nav-actions">
          <button class="icon" id="search-button" aria-label="Search">⌕</button>
          <button class="icon" id="theme" aria-label="Change theme">${state.theme === "dark" ? "☀" : "☾"}</button>
          ${
            u
              ? `
            <a class="avatar" href="#/profile" title="Profile">${u.profilePictureUrl ? `<img src="${esc(u.profilePictureUrl)}" alt="">` : initials(u)}</a>
            <button class="link-button" id="logout">Log out</button>
          `
              : `
            <a href="#/login">Log in</a>
            <a class="button small" href="#/register">Start writing</a>
          `
          }
        </div>
      </nav>
    </header>
    <main id="main">${content}</main>
    <footer>
      <div class="wrap footer-grid">
        <div>
          <a class="brand" href="#/">Ink<span>Well</span></a>
          <p>Where readers become writers.</p>
        </div>
        <div>
          <b>Explore</b>
          <a href="#/">Latest stories</a>
          <a href="#/categories">Categories</a>
        </div>
        <div>
          <b>Write</b>
          ${u ? `<a href="#/editor/new">New article</a>
                <a href="#/editor">Dashboard</a>` : `<a href="#/register">Start writing</a>`}
        </div>
        <div>
          <b>Legal</b>
          <a href="#/about">About InkWell</a>
          <a href="mailto:hello@inkwell.local">Contact</a>
        </div>
      </div>
      <div class="wrap fineprint">© ${new Date().getFullYear()} InkWell. Made for considered writing.</div>
    </footer>
    <button class="back-top" id="back-top" aria-label="Back to top">↑</button>`;
  const bt = $("#back-top");
  if (bt) {
    bt.classList.toggle("show", window.scrollY > 400);
    bt.onclick = () => window.scrollTo({ top: 0, behavior: "smooth" });
  }
  bindShell();
}

function bindShell() {
  $("#theme")?.addEventListener("click", () => {
    state.theme = state.theme === "dark" ? "light" : "dark";
    localStorage.setItem("inkwell_theme", state.theme);
    document.documentElement.dataset.theme = state.theme;
    render();
  });
  $("#logout")?.addEventListener("click", logout);
  $(".mobile-menu")?.addEventListener("click", () =>
    $(".nav-links").classList.toggle("open"),
  );
  $("#search-button")?.addEventListener("click", searchModal);
}

// ==================== POST CARD ====================
function card(p) {
  const authorName = p.author.displayName || p.author.username;
  return `<article class="post-card">
    <a class="cover ${p.mainImageUrl ? "" : "gradient"}" href="#/post/${p.id}">
      ${p.mainImageUrl ? `<img loading="lazy" src="${esc(p.mainImageUrl)}" alt="">` : "<span>✦</span>"}
    </a>
    <div class="card-body">
      <div class="eyebrow">${p.categories.map(esc).join(" · ") || "InkWell"}</div>
      <h3><a href="#/post/${p.id}">${esc(p.title)}</a></h3>
      <p class="card-excerpt">${esc(p.excerpt)}</p>
      <div class="byline">
        <span class="mini-avatar">${avatarImg(p.author)}</span>
        <span><a href="#/author/${p.author.id}">${esc(authorName)}</a> · ${date(p.publishedAt || p.createdAt)}</span>
        <span>${p.readingTimeMinutes} min</span>
      </div>
      <a class="card-read-more" href="#/post/${p.id}">Read article <span>→</span></a>
    </div>
  </article>`;
}

// ==================== HOME ====================
async function home() {
  shell(`
    <section class="hero wrap">
      <div class="hero-copy">
        <div class="eyebrow">A home for thoughtful writing</div>
        <h1>Where readers<br>become <i>writers.</i></h1>
        <p>Ideas worth sitting with, stories worth sharing, and a welcoming room for your next piece of work.</p>
        <div class="actions">
          <a class="button" href="#articles">Start reading <span>→</span></a>
          <a class="button secondary" href="${state.user ? "#/editor/new" : "#/register"}">
            ${state.user ? "Continue writing" : "Start writing"}
          </a>
        </div>
      </div>
      <div class="hero-art">
        <div class="orb"></div>
        <div class="paper-note">MAKE ROOM<br>FOR IDEAS <b>↗</b></div>
        <span class="spark one">✦</span>
        <span class="spark two">✦</span>
      </div>
    </section>
    <section class="wrap category-bar" id="category-bar"></section>
    <section class="wrap" id="articles">
      <div class="section-heading">
        <div>
          <div class="eyebrow">Fresh from the inkwell</div>
          <h2>Latest articles</h2>
        </div>
        <button class="link-button" id="open-search">Search stories ↗</button>
      </div>
      <div class="post-grid" id="posts">
        <div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>
      </div>
    </section>
    <section class="cta wrap">
      <div>
        <div class="eyebrow">Your perspective matters</div>
        <h2>Have something to say?</h2>
        <p>Write your next article and share it with a community of curious readers.</p>
      </div>
      <a class="button pale" href="${state.user ? "#/editor/new" : "#/register"}">
        ${state.user ? "Write an article" : "Start writing"} →
      </a>
    </section>
  `);

  try {
    const [cats, data] = await Promise.all([
      api("/api/categories"),
      api("/api/posts"),
    ]);
    state.categories = cats;
    state.posts = data.items;
    $("#category-bar").innerHTML =
      `<a class="chip active" href="#/">All stories</a>${cats.map((c) => `<a class="chip" href="#/category/${encodeURIComponent(c.name)}">${esc(c.name)}</a>`).join("")}`;
    $("#posts").innerHTML = data.items.length
      ? data.items.map(card).join("")
      : empty("No articles match that search.", "Clear filters", "#/");
  } catch (e) {
    $("#posts").innerHTML = empty(
      "The library is waking up.",
      "Try again",
      "#/",
    );
    toast(e.message, "error");
  }
  $("#open-search")?.addEventListener("click", searchModal);
}

// ==================== AUTH ====================
function authPage(mode) {
  const login = mode === "login";
  shell(`<section class="auth-layout">
    <aside>
      <a class="brand" href="#/">Ink<span>Well</span></a>
      <blockquote>"Words are, of course, the most powerful drug used by mankind."<small>— Rudyard Kipling</small></blockquote>
    </aside>
    <section class="auth-form">
      <div>
        <div class="eyebrow">${login ? "Welcome back" : "Join the conversation"}</div>
        <h1>${login ? "Sign in to InkWell" : "Create your writer account"}</h1>
        <p>${login ? "Pick up exactly where you left off." : "Read freely. Create an account when you are ready to write."}</p>
        <form id="auth">
          ${
            login
              ? ""
              : `<label>Username
  <input name="username" autocomplete="username" placeholder="G Nihal" required minlength="3" maxlength="40" pattern="[A-Za-z0-9._\- ]{3,40}">
  <small>Letters, numbers, spaces, dots, hyphens, underscores. 3–40 characters.</small>
</label>`
          }
          <label>Email<input type="email" name="email" autocomplete="email" placeholder="you@example.com" required></label>
          <label>Password<input type="password" name="password" autocomplete="${login ? "current-password" : "new-password"}" placeholder="••••••••" required></label>
          <button class="button" type="submit">${login ? "Sign in →" : "Create account →"}</button>
        </form>
        <p class="form-foot">${login ? 'New here? <a href="#/register">Create an account</a>' : 'Already a member? <a href="#/login">Sign in</a>'}</p>
      </div>
    </section>
  </section>`);

  $("#auth").addEventListener("submit", async (e) => {
    e.preventDefault();
    const b = $("button", e.target);
    b.disabled = true;
    b.textContent = "Just a moment…";
    const f = Object.fromEntries(new FormData(e.target));
    try {
      setSession(
        await api(`/api/auth/${login ? "login" : "register"}`, {
          method: "POST",
          body: JSON.stringify(f),
        }),
      );
      toast(login ? 'Welcome back.' : 'Welcome to InkWell. Start writing.');
location.hash = '#/editor';
    } catch (err) {
      toast(err.message, "error");
      b.disabled = false;
      b.textContent = login ? "Sign in →" : "Create account →";
    }
  });
}

// ==================== APPLY ====================
async function apply() {
  if (!state.user) { location.hash = '#/register'; return; }
  location.hash = '#/editor';
}

// ==================== EDITOR DASHBOARD ====================
async function editor() {
  if (!guard(["Editor", "Admin"])) return;
  shell(`<section class="wrap dashboard">
    <div class="dashboard-head">
      <div>
        <div class="eyebrow">Your writing desk</div>
        <h1>Hello, ${esc(state.user.displayName || state.user.username)}.</h1>
        <p>Every draft starts as a small act of attention.</p>
      </div>
      <a class="button" href="#/editor/new">New article <span>+</span></a>
    </div>
    <div class="stats" id="editor-stats"></div>
    <div class="table-wrap">
      <div class="section-heading"><h2>Your stories</h2></div>
      <div id="my-posts"></div>
    </div>
  </section>`);
  const posts = await api("/api/posts/mine");
  const counts = ["Draft", "PendingReview", "Published", "Rejected"].map(
    (k) => [k, posts.filter((x) => x.status === k).length],
  );
  $("#editor-stats").innerHTML = counts
    .map(
      ([k, v]) =>
        `<div><b>${v}</b><span>${k === "PendingReview" ? "In review" : k + "s"}</span></div>`,
    )
    .join("");
  $("#my-posts").innerHTML = posts.length
    ? `<table><thead><tr><th>Story</th><th>Status</th><th>Updated</th><th></th></tr></thead><tbody>${posts.map((p) => `<tr><td><b>${esc(p.title)}</b>${p.rejectionReason ? `<small class="reject">Returned: ${esc(p.rejectionReason)}</small>` : ""}</td><td><span class="status ${p.status.toLowerCase()}">● ${p.status.replace("Review", " review")}</span></td><td>${date(p.updatedAt)}</td><td><a href="#/editor/edit/${p.id}">Edit →</a> <button class="link-button delete-own-post" data-id="${p.id}" style="color:var(--danger);margin-left:8px">Delete</button></td></tr>`).join("")}</tbody></table>`
    : empty(
        "Your desk is clear. Start a first draft.",
        "Write an article",
        "#/editor/new",
      );
  $$(".delete-own-post").forEach(
    (b) =>
      (b.onclick = async () => {
        if (!confirm("Delete this post permanently?")) return;
        try {
          await api(`/api/posts/${b.dataset.id}`, { method: "DELETE" });
          toast("Post deleted.");
          editor();
        } catch (e) {
          toast(e.message, "error");
        }
      }),
  );
}

// ==================== COMPOSER ====================
async function composer(id) {
  if (!guard(["Editor", "Admin"])) return;
  let post = id
    ? await api(`/api/posts/mine/${id}`)
    : { title: "", content: "", mainImageUrl: "", categories: [], tags: [], images: [] };
  const curImg = post.mainImageUrl || "";

  shell(`<section class="editor-page wrap">
    <div class="editor-top">
      <a href="#/editor">← Dashboard</a>
      <span id="save-state">Draft editor</span>
      <div>
        <button class="button secondary" id="save">Save draft</button>
        <button class="button" id="submit">${state.user.role === "Admin" ? "Publish" : "Submit for review"} →</button>
      </div>
    </div>
    <div class="editor-grid">
      <section>
        <input class="title-input" name="title" value="${esc(post.title)}" placeholder="An unforgettable title">
        <div class="composer-toolbar">
          <button type="button" data-md="bold" title="Bold"><b>B</b></button>
          <button type="button" data-md="italic" title="Italic"><i>I</i></button>
          <button type="button" data-md="link" title="Insert link">🔗</button>
          <button type="button" data-md="quote" title="Blockquote">"</button>
          <button type="button" data-md="image" title="Insert image">📷 Image</button>
        </div>
        <input type="file" accept="image/*" id="inline-file" style="display:none">
        <textarea class="writing-area" name="content" placeholder="Start writing…\n\nMarkdown is welcome. Use the 📷 button to insert images anywhere.">${esc(post.content)}</textarea>
      </section>
      <aside class="meta">
        <h2>Story details</h2>
        <label>Cover image <span style="color:var(--danger)">*</span>
          <input type="file" accept="image/*" id="cover-file">
          <input type="hidden" name="image" value="${esc(curImg)}">
        </label>
        <div class="image-preview" id="cover-preview">${curImg ? `<img src="${esc(curImg)}" alt="">` : "<span>No cover selected</span>"}</div>
        <small style="color:var(--muted);font-size:11px;display:block;margin-top:4px">Required to submit.</small>
        <label>Categories <input name="categories" value="${esc(post.categories.join(", "))}" placeholder="Culture, Design"></label>
        <label>Tags <input name="tags" value="${esc(post.tags.join(", "))}" placeholder="writing, ideas"></label>
        <div class="preview-mini" id="preview">Live preview<br><b>${esc(post.title || "Your title")}</b></div>
      </aside>
    </div>
  </section>`);

  const fields = {
    title: $("[name=title]"),
    content: $("[name=content]"),
    image: $("[name=image]"),
    categories: $("[name=categories]"),
    tags: $("[name=tags]"),
  };
  const inlineFile = $("#inline-file");

  function wrapSelection(before, after = before) {
    const ta = fields.content;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = ta.value.slice(start, end);
    const text = ta.value;
    ta.value = text.slice(0, start) + before + selected + after + text.slice(end);
    if (selected) ta.setSelectionRange(start + before.length, start + before.length + selected.length);
    else ta.setSelectionRange(start + before.length, start + before.length);
    ta.focus();
  }

  function insertAtCursor(text) {
    const ta = fields.content;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const text0 = ta.value;
    ta.value = text0.slice(0, start) + text + text0.slice(end);
    const pos = start + text.length;
    ta.setSelectionRange(pos, pos);
    ta.focus();
  }

  $("#cover-file")?.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      toast("Uploading cover…");
      const url = await uploadImage(file);
      fields.image.value = url;
      $("#cover-preview").innerHTML = `<img src="${esc(url)}" alt="">`;
      toast("Cover uploaded.");
    } catch (err) {
      toast(err.message, "error");
    }
  });

  $$("[data-md]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const a = btn.dataset.md;
      if (a === "bold") wrapSelection("**");
      else if (a === "italic") wrapSelection("*");
      else if (a === "quote") wrapSelection("\n> ", "");
      else if (a === "link") {
        const url = prompt("Link URL:", "https://");
        if (url) wrapSelection("[", `](${url})`);
      } else if (a === "image") inlineFile.click();
    });
  });

  inlineFile?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      toast("Uploading image…");
      const url = await uploadImage(file);
      const alt = file.name.replace(/\.[^.]+$/, "") || "image";
      insertAtCursor(`\n\n![${alt}](${url})\n\n`);
      toast("Image inserted.");
    } catch (err) {
      toast(err.message, "error");
    }
    e.target.value = "";
  });

  const payload = (draft) => {
    const content = fields.content.value;
    const inlineImages = [...content.matchAll(/!\[([^\]]*)\]\(((?:https?:\/\/|\/)[^)]+)\)/g)]
      .map(([, alt, url]) => ({ url: url.trim(), caption: alt.trim() || null }));

    return {
      title: fields.title.value,
      content,
      mainImageUrl: fields.image.value,
      images: inlineImages,
      categories: fields.categories.value.split(",").map((x) => x.trim()).filter(Boolean),
      tags: fields.tags.value.split(",").map((x) => x.trim()).filter(Boolean),
      saveAsDraft: draft,
    };
  };

  const save = async (draft) => {
    if (!draft && !fields.image.value) {
      toast("Please upload a cover image before submitting.", "error");
      return;
    }
    const url = id ? `/api/posts/${id}` : "/api/posts";
    const method = id ? "PUT" : "POST";
    const d = await api(url, { method, body: JSON.stringify(payload(draft)) });
    id ||= d.post?.id;
    $("#save-state").textContent = draft ? "Draft saved" : "Sent to the editorial desk";
    toast(d.message);
    if (!draft) location.hash = "#/editor";
  };

  $("#save").addEventListener("click", () => save(true).catch((e) => toast(e.message, "error")));
  $("#submit").addEventListener("click", () => save(false).catch((e) => toast(e.message, "error")));

  Object.values(fields).forEach((f) =>
    f.addEventListener("input", () => {
      $("#preview").innerHTML = `Live preview<br><b>${esc(fields.title.value || "Your title")}</b>`;
    }),
  );
}

// ==================== ADMIN ====================
async function admin() {
  if (!guard(["Admin"])) return;
  shell(`<section class="wrap dashboard">
    <div class="dashboard-head">
      <div>
        <div class="eyebrow">Editorial control room</div>
        <h1>Good morning, editor.</h1>
        <p>Review the work waiting for your attention.</p>
      </div>
    </div>
    <div class="stats" id="admin-stats"></div>
    <div class="admin-tabs">
      <button class="active" data-tab="posts">Pending posts</button>
      <button data-tab="applications">Editor applications</button>
      <button data-tab="users">Community</button>
    </div>
    <div id="admin-content" class="table-wrap"></div>
  </section>`);

  const [stats, posts, applications, users] = await Promise.all([
    api("/api/admin/stats"),
    api("/api/admin/pending-posts"),
    api("/api/admin/applications"),
    api("/api/admin/users"),
  ]);

  $("#admin-stats").innerHTML = [
    [stats.pendingPosts, "Stories to review"],
    [stats.pendingApplications, "Applications"],
    [stats.published, "Published"],
    [stats.editors, "Editors"],
  ]
    .map((x) => `<div><b>${x[0]}</b><span>${x[1]}</span></div>`)
    .join("");

  const renderTab = (t) => {
    const out = $("#admin-content");
    if (t === "posts")
      out.innerHTML = posts.length
        ? posts
            .map(
              (p) =>
                `<article class="review">
  <div>
    <div class="eyebrow">${esc(p.author.username)} · ${date(p.createdAt)}</div>
    <h2>${esc(p.title)}</h2>
    <p>${esc(p.excerpt)}</p>
    <button class="link-button read-review" data-id="${p.id}">Read full article ↓</button>
    <button class="link-button danger-link delete-post" data-id="${p.id}" style="margin-left:14px;color:var(--danger)">Delete</button>
  </div>
  <div class="review-actions">
    <button class="button approve" data-id="${p.id}">Approve</button>
    <button class="button danger reject-post" data-id="${p.id}">Return</button>
  </div>
</article>`,
            )
            .join("")
        : empty(
            "Nothing is waiting for review.",
            "Explore published work",
            "#/",
          );
    else if (t === "applications")
      out.innerHTML = applications.filter((a) => a.status === "Pending").length
        ? applications
            .filter((a) => a.status === "Pending")
            .map(
              (a) =>
                `<article class="review"><div><div class="eyebrow">New writer application</div><h2>${esc(a.applicant.username)}</h2><p>${esc(a.motivation)}</p></div><div class="review-actions"><button class="button approve-app" data-id="${a.id}">Approve editor</button><button class="button danger reject-app" data-id="${a.id}">Decline</button></div></article>`,
            )
            .join("")
        : empty("No editor applications are waiting.", "View posts", "#/");
    else
      out.innerHTML = `<table><thead><tr><th>Member</th><th>Role</th><th>Joined</th></tr></thead><tbody>${users.map((u) => `<tr><td><b>${esc(u.username)}</b><small>${esc(u.email)}</small></td><td><span class="status">● ${esc(u.role)}</span></td><td>${date(u.createdAt)}</td></tr>`).join("")}</tbody></table>`;
    bindAdmin();
  };

  renderTab("posts");

  $$(".admin-tabs button").forEach((b) =>
    b.addEventListener("click", () => {
      $$(".admin-tabs button").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      renderTab(b.dataset.tab);
    }),
  );

  function bindAdmin() {
    $$(".approve").forEach(
      (b) =>
        (b.onclick = () =>
          review(`/api/admin/posts/${b.dataset.id}/review`, "Approve")),
    );
    $$(".reject-post").forEach(
      (b) =>
        (b.onclick = () =>
          review(`/api/admin/posts/${b.dataset.id}/review`, "Reject")),
    );
    $$(".approve-app").forEach(
      (b) =>
        (b.onclick = () =>
          review(`/api/admin/applications/${b.dataset.id}/review`, "Approve")),
    );
    $$(".reject-app").forEach(
      (b) =>
        (b.onclick = () =>
          review(`/api/admin/applications/${b.dataset.id}/review`, "Reject")),
    );
    $$(".read-review").forEach(
      (b) => (b.onclick = () => (location.hash = `#/post/${b.dataset.id}`)),
    );
    $$(".delete-post").forEach(
      (b) =>
        (b.onclick = async () => {
          if (!confirm("Delete this post permanently?")) return;
          try {
            await api(`/api/admin/posts/${b.dataset.id}`, { method: "DELETE" });
            toast("Post deleted.");
            admin();
          } catch (e) {
            toast(e.message, "error");
          }
        }),
    );
  }

  async function review(url, action) {
    const comments =
      action === "Reject" ? prompt("Add a clear note for the writer:") : "";
    if (action === "Reject" && !comments) return;
    try {
      await api(url, {
        method: "POST",
        body: JSON.stringify({ action, comments }),
      });
      toast(action === "Approve" ? "Approved." : "Returned with feedback.");
      admin();
    } catch (e) {
      toast(e.message, "error");
    }
  }
}

// ==================== PROFILE ====================
function profile() {
  if (!guard()) return;
  const u = state.user;
  const cur = u.profilePictureUrl || "";
  const dn = u.displayName || u.username || "";

  shell(`<section class="wrap profile-page">
    <div class="page-head" style="padding-bottom:20px">
      <div class="eyebrow">Your identity</div>
      <h1>Profile</h1>
      <p>Update how you appear across InkWell.</p>
    </div>

    <form id="profile" class="profile-form">
      <div class="profile-grid">
        <aside class="profile-avatar-col">
          <div class="profile-avatar" id="avatar-preview">
            ${cur ? `<img src="${esc(cur)}" alt="">` : `<span>${(dn[0] || "U").toUpperCase()}</span>`}
          </div>
          <input type="file" accept=".jpg,.jpeg,.png,.webp,.gif,image/*" id="profile-file" style="display:none">
          <input type="hidden" name="image" value="${esc(cur)}">
          <div class="avatar-actions">
            <button type="button" class="button small secondary" id="pick-image">Upload</button>
            ${cur ? `<button type="button" class="button small danger" id="remove-image">Remove</button>` : ""}
          </div>
        </aside>

        <div class="profile-fields">
          <label>Display name
            <input name="displayName" value="${esc(dn)}" maxlength="80" placeholder="G Nihal">
            <small>Shown on your articles instead of your login username.</small>
          </label>
          <label>Profession
            <input name="profession" value="${esc(u.profession || "")}" maxlength="120" placeholder="Software Engineer">
          </label>
          <label>Studies
            <input name="studies" value="${esc(u.studies || "")}" maxlength="120" placeholder="B.Tech in Computer Science">
          </label>
          <label>Location
            <input name="location" value="${esc(u.location || "")}" maxlength="100" placeholder="Mumbai, India">
          </label>
          <label>Website
            <input name="website" value="${esc(u.website || "")}" maxlength="200" placeholder="https://your-site.com">
          </label>
          <label>Twitter / X
            <input name="twitterHandle" value="${esc(u.twitterHandle || "")}" maxlength="50" placeholder="@handle">
          </label>
          <label>LinkedIn
            <input name="linkedinUrl" value="${esc(u.linkedInUrl || "")}" maxlength="200" placeholder="https://linkedin.com/in/you">
          </label>
          <label>About you
            <textarea name="bio" placeholder="Tell readers a little about yourself">${esc(u.bio || "")}</textarea>
          </label>

          <div class="form-actions">
            <button class="button" type="submit">Save profile →</button>
            <a class="button secondary" href="#/author/${u.id}">View public profile</a>
          </div>
        </div>
      </div>
    </form>
  </section>`);

  const fileInput = $("#profile-file");

  $("#pick-image")?.addEventListener("click", () => fileInput.click());

  $("#remove-image")?.addEventListener("click", () => {
    $("[name=image]").value = "";
    $("#avatar-preview").innerHTML =
      `<span>${(dn[0] || "U").toUpperCase()}</span>`;
    toast("Image removed. Click Save to apply.");
  });

  fileInput?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      toast("Uploading…");
      const url = await uploadImage(file);
      $("[name=image]").value = url;
      $("#avatar-preview").innerHTML = `<img src="${esc(url)}" alt="">`;
      toast("Image uploaded. Click Save to apply.");
    } catch (err) {
      console.error("Upload failed:", err);
      toast(err.message || "Upload failed.", "error");
    }
  });

  $("#profile").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      const d = await api("/api/auth/profile", {
        method: "PUT",
        body: JSON.stringify({
          displayName: f.get("displayName"),
          bio: f.get("bio"),
          profilePictureUrl: f.get("image"),
          profession: f.get("profession"),
          studies: f.get("studies"),
          location: f.get("location"),
          website: f.get("website"),
          twitterHandle: f.get("twitterHandle"),
          linkedinUrl: f.get("linkedinUrl"),
        }),
      });
      state.user = d.user;
      localStorage.setItem("inkwell_user", JSON.stringify(d.user));
      toast("Profile updated.");
      render();
    } catch (x) {
      toast(x.message || "Save failed.", "error");
    }
  });
}

// ==================== AUTHOR ====================
async function author(id) {
  shell(
    `<section class="wrap page-head" id="author"></section><section class="wrap post-grid" id="posts"></section>`,
  );
  const d = await api(`/api/authors/${id}`);
  const u = d.author;
  const name = u.displayName || u.username;
  const meta = [u.profession, u.studies, u.location]
    .filter(Boolean)
    .join(" · ");

  $("#author").innerHTML = `
    <span class="mini-avatar large">${avatarImg(u)}</span>
    <div class="eyebrow">InkWell contributor</div>
    <h1>${esc(name)}</h1>
    ${meta ? `<p class="author-meta">${esc(meta)}</p>` : ""}
    <p>${esc(u.bio || "A writer in the InkWell community.")}</p>
    <div class="author-links">
      ${u.website ? `<a href="${esc(u.website)}" target="_blank" rel="noopener">Website</a>` : ""}
      ${u.twitterHandle ? `<a href="https://twitter.com/${esc(u.twitterHandle.replace("@", ""))}" target="_blank" rel="noopener">${esc(u.twitterHandle)}</a>` : ""}
      ${u.linkedInUrl ? `<a href="${esc(u.linkedInUrl)}" target="_blank" rel="noopener">LinkedIn</a>` : ""}
    </div>`;
  $("#posts").innerHTML =
    d.posts.map(card).join("") ||
    empty("No published articles yet.", "Back home", "#/");
}

// ==================== ABOUT ====================
function about() {
  shell(`<section class="wrap page-head about">
    <div class="eyebrow">The idea behind InkWell</div>
    <h1>A better room for the written word.</h1>
    <p>InkWell is a digital magazine for readers with curiosity and writers with something worth saying. Every story passes through an editorial review before it becomes part of the public library.</p>
    <a class="button" href="#/apply">Write for InkWell →</a>
  </section>`);
}

// ==================== HELPERS ====================
function empty(text, label, href) {
  return `<div class="empty"><span>✦</span><h2>${esc(text)}</h2><a class="button secondary" href="${href}">${esc(label)}</a></div>`;
}

function guard(roles) {
  if (!state.user) {
    location.hash = "#/login";
    return false;
  }
  if (roles && !roles.includes(state.user.role)) { location.hash = '#/'; return false; }
  return true;
}

function searchModal() {
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `<div class="search-modal"><button class="close">×</button><label>Search InkWell<input autofocus placeholder="Search titles and ideas…"></label><div class="search-results">Start typing to explore the library.</div></div>`;
  document.body.append(modal);
  const input = $("input", modal);
  input.focus();
  $(".close", modal).onclick = () => modal.remove();
  modal.onclick = (e) => {
    if (e.target === modal) modal.remove();
  };

  let timer;
  input.oninput = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (!input.value.trim()) return;
      const d = await api(
        `/api/posts?search=${encodeURIComponent(input.value)}`,
      );
      $(".search-results", modal).innerHTML = d.items.length
        ? d.items
            .map(
              (p) =>
                `<a href="#/post/${p.id}" class="search-item">${esc(p.title)}<small>${esc(p.author.username)} · ${p.readingTimeMinutes} min</small></a>`,
            )
            .join("")
        : "No stories found.";
    }, 240);
  };
}

// ==================== ROUTER ====================
async function render() {
  const route = location.hash.slice(1) || "/";
  window.scrollTo({ top: 0, behavior: "instant" });
  try {
    if (route === "/") await home();
    else if (route === "/login") authPage("login");
    else if (route === "/register") authPage("register");
    else if (route === "/apply") await apply();
    else if (route === "/editor") await editor();
    else if (route === "/editor/new") await composer();
    else if (route.startsWith("/editor/edit/"))
      await composer(route.split("/").pop());
    else if (route === "/admin") await admin();
    else if (route === "/profile") profile();
    else if (route === "/about") about();
    else if (route === "/categories") await categoriesPage();
    else if (route.startsWith("/post/")) await postPage(route.split("/").pop());
    else if (route.startsWith("/category/"))
      await category(decodeURIComponent(route.split("/").pop()));
    else if (route.startsWith("/author/")) await author(route.split("/").pop());
    else await home();
  } catch (e) {
    shell(
      `<section class="wrap page-head">${empty(e.message, "Back home", "#/")}</section>`,
    );
  }
}

addEventListener("hashchange", render);
addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    searchModal();
  }
});
ensureCloudinaryConfig().then(render);