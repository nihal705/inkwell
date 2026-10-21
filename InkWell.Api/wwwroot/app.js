const $ = (s, e = document) => e.querySelector(s);
const $$ = (s, e = document) => [...e.querySelectorAll(s)];
const app = $("#app");

// ==================== LOCAL STORAGE (BOOKMARKS) ====================
const store = {
  get(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(`inkwell.v2.${key}`)) || fallback;
    } catch {
      return fallback;
    }
  },
  set(key, val) {
    try {
      localStorage.setItem(`inkwell.v2.${key}`, JSON.stringify(val));
    } catch {}
  },
};

function toggleTBR(id, title, image, e) {
  let list = store.get("library", []);
  const idx = list.findIndex((x) => x.id === id);
  let saved = false;
  if (idx > -1) {
    list.splice(idx, 1);
    toast("Removed from Reading List");
  } else {
    list.unshift({ id, title, image, state: "Saved", savedAt: Date.now() });
    toast("Saved to Reading List");
    saved = true;
    triggerInkBurst(e);
  }
  store.set("library", list);
  $$(`.save-article-btn[data-id="${id}"]`).forEach((btn) => {
    btn.textContent = saved ? "🔖 Saved" : "🔖 Save for Later";
    btn.classList.toggle("saved", saved);
  });
  return saved;
}

// ==================== ANIMATIONS ====================
function triggerInkBurst(e) {
  if (
    !e ||
    !e.currentTarget ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
    return;
  const btn = e.currentTarget;
  if (!btn) return;
  const rect = btn.getBoundingClientRect();
  for (let i = 0; i < 5; i++) {
    const p = document.createElement("div");
    p.className = "ink-burst";
    p.style.left = `${rect.left + rect.width / 2}px`;
    p.style.top = `${rect.top + rect.height / 2}px`;
    p.style.setProperty("--tx", `${(Math.random() - 0.5) * 60}px`);
    p.style.setProperty("--ty", `${-Math.random() * 60 - 20}px`);
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 600);
  }
}

// ==================== CLOUDINARY ====================
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
  state.cloudinary = {
    cloudName: "xx4lxfgt",
    uploadPreset: "inkwell_unsigned",
  };
}

async function uploadImage(file) {
  if (!file) throw new Error("No file selected.");
  if (!file.type.startsWith("image/"))
    throw new Error("Only image files are allowed.");
  if (file.size > 8 * 1024 * 1024) throw new Error("Image must be under 8 MB.");
  await ensureCloudinaryConfig();
  const { cloudName, uploadPreset } = state.cloudinary;
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", uploadPreset);
  const url = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
  const res = await fetch(url, { method: "POST", body: formData });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Upload failed.");
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
const slugify = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

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

// FIXED: Automatically injects IDs into headings so TOC works perfectly
function markdown(text) {
  return esc(text)
    .replace(
      /!\[([^\]]*)\]\(((?:https?:\/\/|\/)[^)]+)\)/g,
      (_, alt, url) =>
        `<figure class="article-image"><img src="${url}" alt="${alt}" loading="lazy" />${alt ? `<figcaption>${alt}</figcaption>` : ""}</figure>`,
    )
    .replace(/^### (.*)$/gm, (_, t) => `<h3 id="${slugify(t)}">${t}</h3>`)
    .replace(/^## (.*)$/gm, (_, t) => `<h2 id="${slugify(t)}">${t}</h2>`)
    .replace(/^# (.*)$/gm, (_, t) => `<h1 id="${slugify(t)}">${t}</h1>`)
    .replace(/^&gt; (.*)$/gm, "<blockquote>$1</blockquote>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`(.*?)`/g, "<code>$1</code>")
    .split(/\n{2,}/)
    .map((x) =>
      /^<h|^<blockquote|^<figure/.test(x)
        ? x
        : `<p>${x.replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
}

// ==================== HOUSE ADS ====================
function renderAd() {
  const ads = {
    mycodendotes: `
      <div class="promo-card">
        <div class="promo-img" style="background-image: url('/assets/mycodenotes.png');"></div>
        <div class="promo-content">
          <span class="promo-tag">Creator's Pick</span>
          <h3>MyCodeNotes</h3>
          <p>A structured learning hub for DSA, web dev, and quick notes. Features NextraAI, LeetCode solutions, and more.</p>
          <a href="https://mycodenotes.dev" target="_blank" class="promo-btn">Visit Site →</a>
        </div>
      </div>
    `,
    kwikcric: `
      <div class="promo-card">
        <div class="promo-img" style="background-image: url('/assets/kwikcric.png');"></div>
        <div class="promo-content">
          <span class="promo-tag">Creator's Pick</span>
          <h3>KwikCric</h3>
          <p>A comprehensive cricket platform combining extensive stats, interactive games, tournament history, and player rankings.</p>
          <a href="https://kwikcric.vercel.app" target="_blank" class="promo-btn">Explore KwikCric→</a>
        </div>
      </div>
    `,
  };
  const adKeys = Object.keys(ads);
  return ads[adKeys[Math.floor(Math.random() * adKeys.length)]];
}

// ==================== SHELL ====================
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
          <a href="#/library">Saved</a>
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
        <div><a class="brand" href="#/">Ink<span>Well</span></a><p>Where readers become writers.</p></div>
        <div><b>Explore</b><a href="#/">Latest stories</a><a href="#/categories">Categories</a><a href="#/library">Saved</a></div>
        <div><b>Write</b>${u ? `<a href="#/editor/new">New article</a><a href="#/editor">Dashboard</a>` : `<a href="#/register">Start writing</a>`}</div>
        <div><b>Legal</b><a href="#/about">About InkWell</a><a href="mailto:hello@inkwell.local">Contact</a></div>
      </div>
      <div class="wrap fineprint">© ${new Date().getFullYear()} InkWell. Made for considered writing.</div>
    </footer>
    <button class="back-top" id="back-top" aria-label="Back to top">↑</button>
  `;
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
  $("#back-top")?.addEventListener("click", () =>
    window.scrollTo({ top: 0, behavior: "smooth" }),
  );
}

// ==================== POST CARD (Cleaned) ====================
function card(p) {
  const authorName = p.author.displayName || p.author.username;
  return `<article class="post-card fade-in-up">
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

// ==================== LIBRARY (Saved Posts) ====================
function libraryPage() {
  const saved = store.get("library", []);
  shell(`
    <section class="page-head wrap">
      <div class="eyebrow">Your reading list</div>
      <h1>Saved Stories</h1>
      <p>Stories you've saved to read later. Stored locally on this device.</p>
    </section>
    <section class="wrap post-grid" id="lib-posts">
      ${
        saved.length
          ? saved
              .map(
                (item) => `
        <article class="post-card fade-in-up">
          <a class="cover ${item.image ? "" : "gradient"}" href="#/post/${item.id}">
            ${item.image ? `<img loading="lazy" src="${esc(item.image)}" alt="">` : "<span>✦</span>"}
          </a>
          <div class="card-body">
            <div class="eyebrow">${item.state}</div>
            <h3><a href="#/post/${item.id}">${esc(item.title)}</a></h3>
            <div class="byline" style="margin-top:20px">
              <span>Saved ${date(item.savedAt)}</span>
              <button class="link-button remove-lib" data-id="${item.id}" style="margin-left:auto;color:var(--danger)">Remove</button>
            </div>
          </div>
        </article>
      `,
              )
              .join("")
          : empty("Your reading list is empty.", "Explore stories", "#/")
      }
    </section>
  `);

  $$(".remove-lib").forEach((btn) => {
    btn.onclick = (e) => {
      e.preventDefault();
      toggleTBR(btn.dataset.id, "", "", e);
      libraryPage();
    };
  });
}

// ==================== HOME & CATEGORIES ====================
async function home() {
  shell(`
    <section class="hero wrap">
      <div class="hero-copy">
        <div class="eyebrow">A home for thoughtful writing</div>
        <h1>Where readers<br>become <i>writers.</i></h1>
        <p>Ideas worth sitting with, stories worth sharing, and a welcoming room for your next piece of work.</p>
        <div class="actions">
          <a class="button" href="#articles">Start reading <span>→</span></a>
          <a class="button secondary" href="${state.user ? "#/editor/new" : "#/register"}">${state.user ? "Continue writing" : "Start writing"}</a>
        </div>
      </div>
      <div class="hero-art">
        <div class="orb"></div>
        <div class="paper-note">MAKE ROOM<br>FOR IDEAS <b>↗</b></div>
        <span class="spark one">✦</span><span class="spark two">✦</span>
      </div>
    </section>
    <section class="wrap category-bar" id="category-bar"></section>
    <section class="wrap" id="articles">
      <div class="section-heading">
        <div><div class="eyebrow">Fresh from the inkwell</div><h2>Latest articles</h2></div>
        <button class="link-button" id="open-search">Search stories ↗</button>
      </div>
      <div class="post-grid" id="posts"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>
    </section>
    <section class="cta wrap">
      <div><div class="eyebrow">Your perspective matters</div><h2>Have something to say?</h2><p>Write your next article and share it with a community of curious readers.</p></div>
      <a class="button pale" href="${state.user ? "#/editor/new" : "#/register"}">${state.user ? "Write an article" : "Start writing"} →</a>
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
  }
  $("#open-search")?.addEventListener("click", searchModal);
}

async function categoriesPage() {
  shell(
    `<section class="page-head wrap"><div class="eyebrow">Explore InkWell</div><h1>All categories</h1><p>Find stories by the questions they explore.</p></section><section class="wrap category-grid" id="cat-grid"><div class="skeleton"></div></section>`,
  );
  try {
    const cats = await api("/api/categories");
    $("#cat-grid").innerHTML = cats.length
      ? cats
          .map(
            (c) =>
              `<a class="category-card" href="#/category/${encodeURIComponent(c.name)}"><b>${esc(c.name)}</b><span>${c.postCount || 0} stories</span></a>`,
          )
          .join("")
      : empty("No categories yet.", "Back home", "#/");
  } catch (e) {
    $("#cat-grid").innerHTML = empty(
      "Could not load categories.",
      "Try again",
      "#/categories",
    );
  }
}

async function category(name) {
  shell(
    `<section class="page-head wrap"><div class="eyebrow">InkWell category</div><h1>${esc(name)}</h1><p>Stories gathered around one good question.</p></section><section class="wrap post-grid" id="posts"></section>`,
  );
  const d = await api(`/api/posts?category=${encodeURIComponent(name)}`);
  $("#posts").innerHTML = d.items.length
    ? d.items.map(card).join("")
    : empty(
        "No published articles in this category yet.",
        "Explore all stories",
        "#/",
      );
}

async function tagPage(name) {
  shell(
    `<section class="page-head wrap"><div class="eyebrow">Keyword</div><h1>#${esc(name)}</h1><p>All stories tagged with ${esc(name)}.</p></section><section class="wrap post-grid" id="posts"><div class="skeleton"></div></section>`,
  );
  const d = await api(`/api/posts?tag=${encodeURIComponent(name)}`);
  $("#posts").innerHTML = d.items.length
    ? d.items.map(card).join("")
    : empty(
        "No published articles with this tag yet.",
        "Explore all stories",
        "#/",
      );
}

// ==================== POST PAGE ====================
async function postPage(id) {
  shell(`<div class="article-skeleton wrap"></div>`);
  try {
    const p = await api(`/api/posts/${id}`);
    document.title = `${p.title} — InkWell`;

    const isSaved = store.get("library", []).some((x) => x.id === p.id);

    // Extract TOC
    const toc = [];
    p.content.replace(/^(##|###) (.+)$/gm, (m, hashes, text) => {
      toc.push({ level: hashes.length, text, slug: slugify(text) });
    });

    const contentHtml = markdown(p.content);
    const shareUrl = location.href;
    const shareText = encodeURIComponent(p.title + " — InkWell");
    const encUrl = encodeURIComponent(shareUrl);

    shell(`
      <div class="wrap article-layout">
        <aside class="sidebar sidebar-left">
          <div class="side-block author-card">
            <a class="mini-avatar large" href="#/author/${p.author.id}">${avatarImg(p.author)}</a>
            <div>
              <a href="#/author/${p.author.id}">${esc(p.author.displayName || p.author.username)}</a>
              <small>${date(p.publishedAt || p.createdAt)} · ${p.readingTimeMinutes} min read</small>
            </div>
          </div>
          ${p.categories.length ? `<div class="side-block"><b>Filed under</b>${p.categories.map((c) => `<a href="#/category/${encodeURIComponent(c)}">${esc(c)}</a>`).join("")}</div>` : ""}
          
          <!-- NEW TOOLS BLOCK -->
          <div class="side-block">
            <b>Tools</b>
            <button class="focus-btn" id="focus-toggle">🎯 Focus Mode</button>
            <button class="focus-btn" id="tts-toggle">🎧 Listen to Article</button>
            <button class="focus-btn save-article-btn ${isSaved ? "saved" : ""}" id="save-article" data-id="${p.id}" data-title="${esc(p.title)}" data-img="${esc(p.mainImageUrl || "")}">${isSaved ? "🔖 Saved" : "🔖 Save for Later"}</button>
          </div>

          <!-- NEW SHARE BLOCK -->
          <div class="side-block">
            <b>Share</b>
            <div class="share-mini">
              <a href="https://wa.me/?text=${shareText}%20${encUrl}" target="_blank" rel="noopener" title="WhatsApp">W</a>
              <a href="https://twitter.com/intent/tweet?text=${shareText}&url=${encUrl}" target="_blank" rel="noopener" title="X">X</a>
              <a href="https://www.facebook.com/sharer/sharer.php?u=${encUrl}" target="_blank" rel="noopener" title="Facebook">f</a>
              <a href="https://www.linkedin.com/sharing/share-offsite/?url=${encUrl}" target="_blank" rel="noopener" title="LinkedIn">in</a>
              <button id="share-copy" title="Copy link">⧉</button>
            </div>
          </div>
          
          ${renderAd()}
        </aside>

        <article class="article-body" id="article-root">
          <div class="article-head">
            <div class="eyebrow">${p.categories.map(esc).join(" · ") || "InkWell"}</div>
            <h1>${esc(p.title)}</h1>
          </div>
          ${p.mainImageUrl ? `<img class="article-cover" src="${esc(p.mainImageUrl)}" alt="">` : ""}
          <div class="article-content" id="article-content">
            ${contentHtml}
            
            <!-- Moved Tags to bottom of article -->
            ${
              p.tags && p.tags.length
                ? `
            <div class="tag-list" style="margin-top:40px; margin-bottom: 20px;">
              <span style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;margin-right:10px">Keywords</span>
              ${p.tags.map((t) => `<a href="#/tag/${encodeURIComponent(t)}" class="tag" style="text-decoration:none">#${esc(t)}</a>`).join("")}
            </div>`
                : ""
            }
            
            <hr>
            <div class="author-bio">
              <span class="mini-avatar large">${avatarImg(p.author)}</span>
              <div><b>Written by ${esc(p.author.displayName || p.author.username)}</b><p>${esc(p.author.bio || "A contributing writer at InkWell.")}</p></div>
            </div>
          </div>
        </article>

        <aside class="sidebar sidebar-right">
          ${toc.length ? `<div class="side-block"><b>On this page</b><nav class="toc">${toc.map((t) => `<a class="toc-lv${t.level}" href="#${t.slug}" data-toc="${t.slug}">${esc(t.text)}</a>`).join("")}</nav></div>` : ""}
          <div class="side-block">
            <b>More from InkWell</b>
            <div id="related" class="related-list"></div>
          </div>
        </aside>
      </div>
      
      <button class="focus-exit-btn" id="focus-exit">Exit Focus Mode (Esc)</button>
      <div class="focus-themes"><button data-theme="light"></button><button data-theme="sepia"></button><button data-theme="dark"></button></div>
      <div id="highlight-toolbar">
        <button id="btn-highlight">Highlight</button>
        <button id="btn-undo-highlight" style="display:none;color:#f87171">Remove</button>
        <button id="btn-copy">Copy</button>
      </div>
    `);

    // 1. Save Article
    $("#save-article")?.addEventListener("click", function (e) {
      toggleTBR(p.id, p.title, p.mainImageUrl, e);
    });

    // 2. Share
    $("#share-copy")?.addEventListener("click", () => {
      navigator.clipboard.writeText(shareUrl).then(() => toast("Link copied."));
    });

    // 3. Focus Mode
    const focusToggle = $("#focus-toggle");
    const focusExit = $("#focus-exit");
    const enterFocus = () => {
      document.body.classList.add("focus-mode");
      document.body.classList.add(
        `focus-${localStorage.getItem("inkwell.focusTheme") || "light"}`,
      );
    };
    const exitFocus = () =>
      document.body.classList.remove(
        "focus-mode",
        "focus-light",
        "focus-sepia",
        "focus-dark",
      );
    focusToggle?.addEventListener("click", enterFocus);
    focusExit?.addEventListener("click", exitFocus);
    $$(".focus-themes button").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        document.body.classList.remove(
          "focus-light",
          "focus-sepia",
          "focus-dark",
        );
        document.body.classList.add(`focus-${e.target.dataset.theme}`);
        localStorage.setItem("inkwell.focusTheme", e.target.dataset.theme);
      });
    });
    document.addEventListener("keydown", function escHandler(e) {
      if (e.key === "Escape" && document.body.classList.contains("focus-mode"))
        exitFocus();
    });

    // 4. TTS (Listen)
    const articleContent = $("#article-content");
    let ttsBlocks = []; let currentTtsIndex = 0; let isTtsPlaying = false; let isTtsPaused = false;
    let ignoreNextTtsClick = false; 

    function initTTS() {
      const nodes = articleContent.querySelectorAll('p, h2, h3, blockquote, li');
      ttsBlocks = Array.from(nodes);
      ttsBlocks.forEach((node, index) => {
        node.classList.add('tts-node');
        node.addEventListener('click', (e) => {
          // If the user was just highlighting, don't play TTS
          if (ignoreNextTtsClick) {
            ignoreNextTtsClick = false;
            return;
          }
          // If text is currently selected, don't play TTS
          const sel = window.getSelection();
          if (sel && sel.type === 'Range' && sel.toString().trim().length > 0) return;
          
          startTTS(index);
        });
      });
    }

    function startTTS(index) {
      if (!window.speechSynthesis) return toast("TTS not supported", "error");
      stopTTS();
      currentTtsIndex = index >= 0 ? index : 0;
      isTtsPlaying = true;
      isTtsPaused = false;
      updateTtsUI();
      playCurrentBlock();
    }

    function playCurrentBlock() {
      if (currentTtsIndex >= ttsBlocks.length) return stopTTS();
      const block = ttsBlocks[currentTtsIndex];
      block.classList.add("tts-active");
      block.scrollIntoView({ behavior: "smooth", block: "center" });

      const text = block.innerText.trim();
      if (!text) {
        currentTtsIndex++;
        return playCurrentBlock();
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.onend = () => {
        block.classList.remove("tts-active");
        if (isTtsPlaying && !isTtsPaused) {
          currentTtsIndex++;
          playCurrentBlock();
        }
      };
      window.speechSynthesis.speak(utterance);
    }

    function toggleTTS() {
      if (!isTtsPlaying) startTTS(0);
      else if (isTtsPaused) {
        window.speechSynthesis.resume();
        isTtsPaused = false;
        updateTtsUI();
      } else {
        window.speechSynthesis.pause();
        isTtsPaused = true;
        updateTtsUI();
      }
    }

    function stopTTS() {
      window.speechSynthesis.cancel();
      isTtsPlaying = false;
      isTtsPaused = false;
      ttsBlocks.forEach((b) => b.classList.remove("tts-active"));
      updateTtsUI();
    }

    function updateTtsUI() {
      const btn = $("#tts-toggle");
      if (!btn) return;
      if (!isTtsPlaying) btn.textContent = "🎧 Listen to Article";
      else if (isTtsPaused) btn.textContent = "▶️ Resume Listening";
      else btn.textContent = "⏸ Pause Listening";
    }

    $("#tts-toggle")?.addEventListener("click", toggleTTS);
    window.addEventListener("hashchange", stopTTS, { once: true });
    initTTS();

    // 5. Highlights
    const toolbar = $("#highlight-toolbar"); let currentRange = null;
    store.get('highlights', []).filter(h => h.postId === p.id).forEach(h => applyHighlight(h.text));
    
    // Stop clicks inside the toolbar from bubbling down to the article
    toolbar.addEventListener('click', (e) => e.stopPropagation());

    document.getElementById('article-root').addEventListener('mouseup', (e) => {
      if (toolbar.contains(e.target)) return;
      setTimeout(() => {
        const selection = window.getSelection();
        if (!selection.isCollapsed && selection.toString().trim().length > 0) {
          ignoreNextTtsClick = true;
          
          currentRange = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          toolbar.style.left = `${rect.left + rect.width / 2 + window.scrollX}px`;
          toolbar.style.top = `${rect.top + window.scrollY - 10}px`;
          toolbar.classList.add('active');
          $("#btn-highlight").style.display = 'block';
          $("#btn-undo-highlight").style.display = 'none';
        }
      }, 10);
    });

    articleContent.addEventListener('click', (e) => {
      const mark = e.target.closest('mark.inkwell-highlight');
      if (mark && window.getSelection().isCollapsed) {
        ignoreNextTtsClick = true;
        
        currentRange = null;
        const rect = mark.getBoundingClientRect();
        toolbar.style.left = `${rect.left + rect.width / 2 + window.scrollX}px`;
        toolbar.style.top = `${rect.top + window.scrollY - 10}px`;
        toolbar.classList.add('active');
        $("#btn-highlight").style.display = 'none';
        $("#btn-undo-highlight").style.display = 'block';
        toolbar.dataset.markId = mark.id || `mark-${Date.now()}`;
        if (!mark.id) mark.id = toolbar.dataset.markId;
      }
    });

    document.addEventListener("mousedown", (e) => {
      if (!toolbar.contains(e.target)) toolbar.classList.remove("active");
    });

    $("#btn-highlight")?.addEventListener("click", (e) => {
      if (!currentRange) return;
      const text = currentRange.toString(); applyHighlight(text);
      let list = store.get('highlights', []); list.push({ postId: p.id, text, timestamp: Date.now() }); store.set('highlights', list);
      triggerInkBurst(e); 
      window.getSelection().removeAllRanges(); 
      toolbar.classList.remove('active'); 
      toast("Highlight saved");
    });

    $("#btn-undo-highlight")?.addEventListener("click", () => {
      const mark = document.getElementById(toolbar.dataset.markId);
      if (mark) {
        const text = mark.textContent;
        const parent = mark.parentNode;
        while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
        parent.removeChild(mark);
        parent.normalize();
        let list = store.get("highlights", []);
        list = list.filter((h) => !(h.postId === p.id && h.text === text));
        store.set("highlights", list);
        toast("Highlight removed");
      }
      toolbar.classList.remove("active");
    });

    $("#btn-copy")?.addEventListener("click", () => {
      const textToCopy = currentRange
        ? currentRange.toString()
        : document.getElementById(toolbar.dataset.markId)?.textContent;
      if (textToCopy)
        navigator.clipboard.writeText(`"${textToCopy}"\n— ${p.title}`);
      toast("Quote copied");
      toolbar.classList.remove("active");
    });

    function applyHighlight(text) {
      const walker = document.createTreeWalker(
        articleContent,
        NodeFilter.SHOW_TEXT,
        null,
        false,
      );
      let node;
      while ((node = walker.nextNode())) {
        const idx = node.nodeValue.indexOf(text);
        if (idx > -1) {
          const range = document.createRange();
          range.setStart(node, idx);
          range.setEnd(node, idx + text.length);
          const mark = document.createElement("mark");
          mark.className = "inkwell-highlight";
          range.surroundContents(mark);
          break;
        }
      }
    }

    // 6. Related Posts & TOC
    $$(".toc a").forEach((a) =>
      a.addEventListener("click", (e) => {
        e.preventDefault();
        document
          .getElementById(a.dataset.toc)
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }),
    );

    try {
      const list = await api("/api/posts?page=1");
      const others = list.items.filter((x) => x.id !== p.id).slice(0, 4);
      $("#related").innerHTML = others.length
        ? others
            .map(
              (r) =>
                `<a class="related-item" href="#/post/${r.id}"><b>${esc(r.title)}</b><small>${esc(r.author.username)} · ${r.readingTimeMinutes} min</small></a>`,
            )
            .join("")
        : '<p style="color:var(--muted);font-size:13px">No other articles yet.</p>';
    } catch {}
  } catch (e) {
    shell(
      `<section class="wrap page-head">${empty(e.message, "Back home", "#/")}</section>`,
    );
  }
}

// ==================== AUTH & OTHERS ====================
function authPage(mode) {
  const login = mode === "login";
  shell(`<section class="auth-layout">
    <aside><a class="brand" href="#/">Ink<span>Well</span></a><blockquote>"Words are, of course, the most powerful drug used by mankind."<small>— Rudyard Kipling</small></blockquote></aside>
    <section class="auth-form"><div>
      <div class="eyebrow">${login ? "Welcome back" : "Join the conversation"}</div>
      <h1>${login ? "Sign in to InkWell" : "Create your writer account"}</h1>
      <form id="auth">
        ${login ? "" : `<label>Username<input name="username" autocomplete="username" placeholder="G Nihal" required minlength="3" maxlength="40" pattern="[A-Za-z0-9._\- ]{3,40}"><small>Letters, numbers, spaces, dots, hyphens, underscores. 3–40 characters.</small></label>`}
        <label>Email<input type="email" name="email" autocomplete="email" placeholder="you@example.com" required></label>
        <label>Password<input type="password" name="password" autocomplete="${login ? "current-password" : "new-password"}" placeholder="••••••••" required></label>
        <button class="button" type="submit">${login ? "Sign in →" : "Create account →"}</button>
      </form>
      ${login ? '<p class="form-foot" style="margin-top:10px"><a href="#/forgot-password">Forgot password?</a></p>' : ""}
      <p class="form-foot">${login ? 'New here? <a href="#/register">Create an account</a>' : 'Already a member? <a href="#/login">Sign in</a>'}</p>
    </div></section>
  </section>`);
  $("#auth").addEventListener("submit", async (e) => {
    e.preventDefault();
    const b = $("button", e.target);
    b.disabled = true;
    b.textContent = "Just a moment…";
    try {
      setSession(
        await api(`/api/auth/${login ? "login" : "register"}`, {
          method: "POST",
          body: JSON.stringify(Object.fromEntries(new FormData(e.target))),
        }),
      );
      toast("Success");
      location.hash = "#/editor";
    } catch (err) {
      toast(err.message, "error");
      b.disabled = false;
      b.textContent = login ? "Sign in →" : "Create account →";
    }
  });
}

function forgotPasswordPage() {
  shell(`<section class="auth-layout">
    <aside><a class="brand" href="#/">Ink<span>Well</span></a><blockquote>"Not all those who wander are lost."<small>— J.R.R. Tolkien</small></blockquote></aside>
    <section class="auth-form"><div>
      <div class="eyebrow">Account recovery</div><h1>Reset your password</h1><p id="forgot-subtitle">Enter your email to receive a 6-digit code.</p>
      <div id="spam-note" style="display:none;margin:0 0 16px 0;padding:10px 14px;background:#fff8e1;border-left:3px solid #d4a72c;border-radius:6px;font-size:13px;line-height:1.5;color:#6b655b;">Can't find the email? Check your <b>spam</b> folder.</div>
      <form id="forgot-form">
        <label>Email<input type="email" name="email" autocomplete="email" required placeholder="you@example.com"></label>
        <div id="otp-fields" style="display:none">
          <label>6-digit code<input type="text" name="otpCode" placeholder="123456" maxlength="6" pattern="\\d{6}" autocomplete="one-time-code" inputmode="numeric"></label>
          <label>New password<input type="password" name="newPassword" minlength="8" autocomplete="new-password"></label>
          <label>Confirm new password<input type="password" name="confirmPassword" minlength="8" autocomplete="new-password"></label>
        </div>
        <button class="button" type="submit" id="forgot-submit">Send code →</button>
      </form>
      <p class="form-foot">Remembered it? <a href="#/login">Back to sign in</a></p>
    </div></section>
  </section>`);
  let step = 1;
  let userEmail = "";
  $("#forgot-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const btn = $("#forgot-submit");
    btn.disabled = true;
    if (step === 1) {
      userEmail = f.email;
      btn.textContent = "Sending…";
      try {
        await api("/api/auth/forgot-password/request-otp", {
          method: "POST",
          body: JSON.stringify({ email: userEmail }),
        });
        toast("Code sent.");
        $("#forgot-subtitle").textContent = `Code sent to ${userEmail}`;
        $("#otp-fields").style.display = "block";
        $("#spam-note").style.display = "block";
        btn.textContent = "Reset password →";
        step = 2;
        document.querySelector("[name=otpCode]").required = true;
        document.querySelector("[name=newPassword]").required = true;
        document.querySelector("[name=confirmPassword]").required = true;
        document.querySelector("[name=otpCode]").focus();
      } catch (err) {
        toast(err.message, "error");
      } finally {
        btn.disabled = false;
      }
    } else {
      if (f.newPassword !== f.confirmPassword) {
        toast("Passwords don't match.", "error");
        btn.disabled = false;
        return;
      }
      btn.textContent = "Resetting…";
      try {
        await api("/api/auth/forgot-password/reset", {
          method: "POST",
          body: JSON.stringify({
            email: userEmail,
            otpCode: f.otpCode,
            newPassword: f.newPassword,
          }),
        });
        toast("Password reset.");
        location.hash = "#/login";
      } catch (err) {
        toast(err.message, "error");
        btn.disabled = false;
        btn.textContent = "Reset password →";
      }
    }
  });
}

async function apply() {
  if (!state.user) {
    location.hash = "#/register";
    return;
  }
  location.hash = "#/editor";
}

async function editor() {
  if (!guard(["Editor", "Admin"])) return;
  shell(
    `<section class="wrap dashboard"><div class="dashboard-head"><div><div class="eyebrow">Your writing desk</div><h1>Hello, ${esc(state.user.displayName || state.user.username)}.</h1></div><a class="button" href="#/editor/new">New article +</a></div><div class="stats" id="editor-stats"></div><div class="table-wrap"><div class="section-heading"><h2>Your stories</h2></div><div id="my-posts"></div></div></section>`,
  );
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
    : empty("Start a first draft.", "Write article", "#/editor/new");
  $$(".delete-own-post").forEach(
    (b) =>
      (b.onclick = async () => {
        if (!confirm("Delete?")) return;
        try {
          await api(`/api/posts/${b.dataset.id}`, { method: "DELETE" });
          toast("Deleted");
          editor();
        } catch (e) {
          toast(e.message, "error");
        }
      }),
  );
}

async function composer(id) {
  if (!guard(["Editor", "Admin"])) return;
  let post = id
    ? await api(`/api/posts/mine/${id}`)
    : {
        title: "",
        content: "",
        mainImageUrl: "",
        categories: [],
        tags: [],
        images: [],
      };
  const curImg = post.mainImageUrl || "";
  shell(
    `<section class="editor-page wrap"><div class="editor-top"><a href="#/editor">← Dashboard</a><div><button class="button secondary" id="save">Save draft</button><button class="button" id="submit">${state.user.role === "Admin" ? "Publish" : "Submit for review"} →</button></div></div><div class="editor-grid"><section><input class="title-input" name="title" value="${esc(post.title)}" placeholder="An unforgettable title"><div class="composer-toolbar"><button type="button" data-md="bold"><b>B</b></button><button type="button" data-md="italic"><i>I</i></button><button type="button" data-md="link">🔗</button><button type="button" data-md="quote">"</button><button type="button" data-md="image">📷 Image</button></div><input type="file" accept="image/*" id="inline-file" style="display:none"><textarea class="writing-area" name="content" placeholder="Start writing…\n\nMarkdown is welcome.">${esc(post.content)}</textarea></section><aside class="meta"><h2>Story details</h2><label>Cover image <span style="color:var(--danger)">*</span><input type="file" accept="image/*" id="cover-file"><input type="hidden" name="image" value="${esc(curImg)}"></label><div class="image-preview" id="cover-preview">${curImg ? `<img src="${esc(curImg)}" alt="">` : "<span>No cover</span>"}</div><label>Categories <input name="categories" value="${esc(post.categories.join(", "))}" placeholder="Culture, Design"></label><label>Tags <input name="tags" value="${esc(post.tags.join(", "))}" placeholder="writing, ideas"></label></aside></div></section>`,
  );
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
    ta.value =
      ta.value.slice(0, start) +
      before +
      selected +
      after +
      ta.value.slice(end);
    ta.focus();
  }
  $("#cover-file")?.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      toast("Uploading…");
      const url = await uploadImage(file);
      fields.image.value = url;
      $("#cover-preview").innerHTML = `<img src="${esc(url)}" alt="">`;
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
        const url = prompt("Link:", "https://");
        if (url) wrapSelection("[", `](${url})`);
      } else if (a === "image") inlineFile.click();
    });
  });
  inlineFile?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      toast("Uploading…");
      const url = await uploadImage(file);
      fields.content.value += `\n\n![${file.name}](${url})\n\n`;
      toast("Inserted");
    } catch (err) {
      toast(err.message, "error");
    }
  });
  const save = async (draft) => {
    if (!draft && !fields.image.value) {
      toast("Cover required", "error");
      return;
    }
    const url = id ? `/api/posts/${id}` : "/api/posts";
    const method = id ? "PUT" : "POST";
    const d = await api(url, {
      method,
      body: JSON.stringify({
        title: fields.title.value,
        content: fields.content.value,
        mainImageUrl: fields.image.value,
        images: [],
        categories: fields.categories.value
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
        tags: fields.tags.value
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
        saveAsDraft: draft,
      }),
    });
    if (!draft) location.hash = "#/editor";
    else toast("Saved");
  };
  $("#save").addEventListener("click", () =>
    save(true).catch((e) => toast(e.message, "error")),
  );
  $("#submit").addEventListener("click", () =>
    save(false).catch((e) => toast(e.message, "error")),
  );
}

async function admin() {
  if (!guard(["Admin"])) return;
  shell(
    `<section class="wrap dashboard"><div class="dashboard-head"><div><div class="eyebrow">Editorial control room</div><h1>Good morning, editor.</h1></div></div><div class="stats" id="admin-stats"></div><div class="admin-tabs"><button class="active" data-tab="posts">Pending posts</button><button data-tab="applications">Editor applications</button><button data-tab="users">Community</button></div><div id="admin-content" class="table-wrap"></div></section>`,
  );
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
                `<article class="review"><div><div class="eyebrow">${esc(p.author.username)} · ${date(p.createdAt)}</div><h2>${esc(p.title)}</h2><p>${esc(p.excerpt)}</p><button class="link-button danger-link delete-post" data-id="${p.id}" style="color:var(--danger)">Delete</button></div><div class="review-actions"><button class="button approve" data-id="${p.id}">Approve</button><button class="button danger reject-post" data-id="${p.id}">Return</button></div></article>`,
            )
            .join("")
        : empty("Nothing waiting.", "Home", "#/");
    else if (t === "applications")
      out.innerHTML = applications.filter((a) => a.status === "Pending").length
        ? applications
            .filter((a) => a.status === "Pending")
            .map(
              (a) =>
                `<article class="review"><div><h2>${esc(a.applicant.username)}</h2><p>${esc(a.motivation)}</p></div><div class="review-actions"><button class="button approve-app" data-id="${a.id}">Approve</button><button class="button danger reject-app" data-id="${a.id}">Decline</button></div></article>`,
            )
            .join("")
        : empty("No applications.", "Home", "#/");
    else
      out.innerHTML = `<table><thead><tr><th>Member</th><th>Role</th></tr></thead><tbody>${users.map((u) => `<tr><td><b>${esc(u.username)}</b></td><td><span class="status">${esc(u.role)}</span></td></tr>`).join("")}</tbody></table>`;
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
    $$(".delete-post").forEach(
      (b) =>
        (b.onclick = async () => {
          if (!confirm("Delete?")) return;
          try {
            await api(`/api/admin/posts/${b.dataset.id}`, { method: "DELETE" });
            toast("Deleted");
            admin();
          } catch (e) {
            toast(e.message, "error");
          }
        }),
    );
  }
  async function review(url, action) {
    const comments = action === "Reject" ? prompt("Note:") : "";
    if (action === "Reject" && !comments) return;
    try {
      await api(url, {
        method: "POST",
        body: JSON.stringify({ action, comments }),
      });
      toast("Done");
      admin();
    } catch (e) {
      toast(e.message, "error");
    }
  }
}

function profile() {
  if (!guard()) return;
  const u = state.user;
  const cur = u.profilePictureUrl || "";
  const dn = u.displayName || u.username || "";
  shell(
    `<section class="wrap profile-page"><div class="page-head" style="padding-bottom:20px"><div class="eyebrow">Identity</div><h1>Profile</h1></div><form id="profile" class="profile-form"><div class="profile-grid"><aside class="profile-avatar-col"><div class="profile-avatar" id="avatar-preview">${cur ? `<img src="${esc(cur)}" alt="">` : `<span>${(dn[0] || "U").toUpperCase()}</span>`}</div><input type="file" accept="image/*" id="profile-file" style="display:none"><input type="hidden" name="image" value="${esc(cur)}"><div class="avatar-actions"><button type="button" class="button small secondary" id="pick-image">Upload</button>${cur ? `<button type="button" class="button small danger" id="remove-image">Remove</button>` : ""}</div></aside><div class="profile-fields"><label>Display name<input name="displayName" value="${esc(dn)}"></label><label>Profession<input name="profession" value="${esc(u.profession || "")}"></label><label>Location<input name="location" value="${esc(u.location || "")}"></label><label>Website<input name="website" value="${esc(u.website || "")}"></label><label>Twitter / X<input name="twitterHandle" value="${esc(u.twitterHandle || "")}"></label><label>LinkedIn<input name="linkedinUrl" value="${esc(u.linkedInUrl || "")}"></label><label>Bio<textarea name="bio">${esc(u.bio || "")}</textarea></label><div class="form-actions"><button class="button" type="submit">Save</button><a class="button secondary" href="#/author/${u.id}">View public</a></div></div></div></form></section>`,
  );
  const fileInput = $("#profile-file");
  $("#pick-image")?.addEventListener("click", () => fileInput.click());
  $("#remove-image")?.addEventListener("click", () => {
    $("[name=image]").value = "";
    $("#avatar-preview").innerHTML =
      `<span>${(dn[0] || "U").toUpperCase()}</span>`;
  });
  fileInput?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      toast("Uploading…");
      const url = await uploadImage(file);
      $("[name=image]").value = url;
      $("#avatar-preview").innerHTML = `<img src="${esc(url)}" alt="">`;
    } catch (err) {
      toast(err.message, "error");
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
          location: f.get("location"),
          website: f.get("website"),
          twitterHandle: f.get("twitterHandle"),
          linkedinUrl: f.get("linkedinUrl"),
        }),
      });
      state.user = d.user;
      localStorage.setItem("inkwell_user", JSON.stringify(d.user));
      toast("Updated");
      render();
    } catch (x) {
      toast(x.message, "error");
    }
  });
}

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
  $("#author").innerHTML =
    `<span class="mini-avatar large">${avatarImg(u)}</span><div class="eyebrow">Contributor</div><h1>${esc(name)}</h1>${meta ? `<p class="author-meta">${esc(meta)}</p>` : ""}<p>${esc(u.bio || "Writer.")}</p>`;
  $("#posts").innerHTML =
    d.posts.map(card).join("") || empty("No articles.", "Home", "#/");
}

function about() {
  shell(
    `<section class="wrap page-head about"><div class="eyebrow">Idea</div><h1>A better room for the written word.</h1><p>InkWell is a digital magazine for readers with curiosity and writers with something worth saying.</p><a class="button" href="#/apply">Write for InkWell →</a></section>`,
  );
}

function empty(text, label, href) {
  return `<div class="empty"><span>✦</span><h2>${esc(text)}</h2><a class="button secondary" href="${href}">${esc(label)}</a></div>`;
}
function guard(roles) {
  if (!state.user) {
    location.hash = "#/login";
    return false;
  }
  if (roles && !roles.includes(state.user.role)) {
    location.hash = "#/";
    return false;
  }
  return true;
}

function searchModal() {
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `<div class="search-modal"><button class="close">×</button><label>Search<input autofocus></label><div class="search-results"></div></div>`;
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
                `<a href="#/post/${p.id}" class="search-item">${esc(p.title)}<small>${esc(p.author.username)}</small></a>`,
            )
            .join("")
        : "No results.";
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
    else if (route === "/forgot-password") forgotPasswordPage();
    else if (route === "/apply") await apply();
    else if (route === "/editor") await editor();
    else if (route === "/editor/new") await composer();
    else if (route.startsWith("/editor/edit/"))
      await composer(route.split("/").pop());
    else if (route === "/admin") await admin();
    else if (route === "/profile") profile();
    else if (route === "/about") about();
    else if (route === "/library") libraryPage();
    else if (route === "/categories") await categoriesPage();
    else if (route.startsWith("/post/")) await postPage(route.split("/").pop());
    else if (route.startsWith("/category/"))
      await category(decodeURIComponent(route.split("/").pop()));
    else if (route.startsWith("/tag/"))
      await tagPage(decodeURIComponent(route.split("/").pop()));
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
