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
  const idx = list.findIndex((x) => String(x.id) === String(id));
  let saved = false;
  if (idx > -1) {
    list.splice(idx, 1);
    toast("Removed from Reading List");
  } else {
    list.unshift({
      id: String(id),
      title,
      image,
      state: "Saved",
      savedAt: Date.now(),
    });
    toast("Saved to Reading List");
    saved = true;
    if (e) triggerInkBurst(e);
  }
  store.set("library", list);
  $$(`.save-article-btn[data-id="${id}"]`).forEach((btn) => {
    btn.textContent = saved ? "Saved" : "Save for Later";
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

// ==================== HELPERS & SEO ====================
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

const getEditorialRole = (u, context = "editorial") => {
  if (!u) return "Reader";
  const role = (u.role || "").toLowerCase();
  const bio = (u.bio || "").toLowerCase();
  const isMainAdmin = role === "admin" || u.username === "editorial_admin" || u.id === 1 || (u.displayName === "G Nihal" && role === "admin") || bio.includes("founder");

  if (isMainAdmin) {
    if (context === "publisher" || context === "community" || context === "admin") {
      return "Founder & Publisher";
    }
    if (context === "both") {
      return "Founder & Publisher · Editor-in-Chief";
    }
    return "Founder & Editor-in-Chief";
  }
  if (role === "featured columnist" || role === "senior editor") return "Featured Columnist";
  if (role === "contributing writer" || role === "staff editor" || role === "editor" || role === "writer") return "Contributing Writer";
  return u.role || "Reader";
};

const canWrite = (u) => {
  if (!u) return false;
  const r = (u.role || "").toLowerCase();
  return r === "admin" || r === "featured columnist" || r === "contributing writer" || r === "senior editor" || r === "staff editor" || r === "editor" || r === "writer";
};

function toast(message, type = "") {
  const t = $("#toast");
  t.textContent = message;
  t.className = `show ${type}`;
  setTimeout(() => (t.className = ""), 3600);
}

function updateMeta(title, description, image) {
  document.title = title;
  const setMeta = (attr, key, val) => {
    let el = document.querySelector(`meta[${attr}="${key}"]`);
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute(attr, key);
      document.head.appendChild(el);
    }
    el.setAttribute("content", val);
  };
  setMeta("name", "description", description);
  setMeta("property", "og:title", title);
  setMeta("property", "og:description", description);
  if (image) setMeta("property", "og:image", image);
}

// ==================== IN-MEMORY API CACHE ====================
const apiCache = new Map();
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes

function getCached(url) {
  const item = apiCache.get(url);
  if (!item) return null;
  if (Date.now() - item.time > CACHE_TTL_MS) {
    apiCache.delete(url);
    return null;
  }
  return item.data;
}

function setCache(url, data) {
  if (
    url.startsWith("/api/posts") ||
    url.startsWith("/api/categories") ||
    url.startsWith("/api/featured") ||
    url.startsWith("/api/authors") ||
    url.startsWith("/api/series")
  ) {
    apiCache.set(url, { data, time: Date.now() });
  }
}

function invalidateApiCache() {
  apiCache.clear();
}

async function api(url, options = {}) {
  const method = (options.method || "GET").toUpperCase();

  // Return cached GET responses instantly if available
  if (method === "GET") {
    const cached = getCached(url);
    if (cached) return cached;
  }

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

  if (method === "GET") {
    setCache(url, data);
  } else {
    // Invalidate cache on mutations (create, edit, delete, role changes)
    invalidateApiCache();
  }

  return data;
}

const state = {
  user: JSON.parse(localStorage.getItem("inkwell_user") || "null"),
  token: localStorage.getItem("inkwell_token"),
  categories: [],
  cloudinary: null,
  theme:
    localStorage.getItem("inkwell_theme") ||
    (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
};
document.documentElement.dataset.theme = state.theme;

function clearShell() {
  app.innerHTML = "";
}

function setSession(d) {
  state.token = d.token;
  state.user = d.user;
  localStorage.setItem("inkwell_token", d.token);
  localStorage.setItem("inkwell_user", JSON.stringify(d.user));
  invalidateApiCache();
  clearShell();
}

function logout() {
  state.user = null;
  state.token = null;
  localStorage.removeItem("inkwell_token");
  localStorage.removeItem("inkwell_user");
  invalidateApiCache();
  clearShell();
  navigate("/");
  toast("You are signed out.");
}

function markdown(text) {
  return esc(text)
    .replace(
      /!\[([^\]]*)\]\(((?:https?:\/\/|\/)[^)]+)\)/g,
      (_, alt, url) =>
        `<figure class="article-image"><img src="${url}" alt="${alt}" loading="lazy" />${alt ? `<figcaption>${alt}</figcaption>` : ""}</figure>`,
    )
    .replace(
      /\[([^\]]+)\]\(((?:https?:\/\/|\/)[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
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

// ==================== LOCAL FALLBACK SUMMARIZER ====================
function generateSummary(content) {
  let text = content
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#+\s+.*$/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/[#*_>`]/g, "")
    .replace(/\n+/g, " ")
    .trim();

  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  if (sentences.length <= 4) return sentences.join(" ");

  const stopWords = new Set([
    "the",
    "and",
    "a",
    "to",
    "of",
    "in",
    "i",
    "is",
    "that",
    "it",
    "on",
    "you",
    "this",
    "for",
    "but",
    "with",
    "are",
    "have",
    "be",
    "at",
    "or",
    "as",
    "was",
    "so",
    "if",
    "out",
    "not",
    "we",
    "they",
    "he",
    "she",
    "my",
    "our",
  ]);
  const wordFreq = {};
  const words = text.toLowerCase().match(/\b\w+\b/g) || [];

  words.forEach((word) => {
    if (!stopWords.has(word) && word.length > 2) {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    }
  });

  const sentenceScores = sentences.map((sentence, index) => {
    const sentenceWords = sentence.toLowerCase().match(/\b\w+\b/g) || [];
    let score = 0;
    sentenceWords.forEach((word) => {
      if (wordFreq[word]) score += wordFreq[word];
    });
    score = score / (sentenceWords.length || 1);
    if (index < 2) score *= 1.3;
    return { sentence: sentence.trim(), score, index };
  });

  const sentenceCount = Math.min(
    8,
    Math.max(3, Math.ceil(sentences.length * 0.3)),
  );

  const topSentences = sentenceScores
    .sort((a, b) => b.score - a.score)
    .slice(0, sentenceCount)
    .sort((a, b) => a.index - b.index)
    .map((s) => s.sentence);

  return topSentences.join(" ");
}

// ==================== HOUSE ADS ====================
function renderAd(specificKey = null) {
  const ads = {
    mycodendotes: `<div class="promo-card"><div class="promo-img" style="background-image: url('/assets/mycodenotes.png');"></div><div class="promo-content"><span class="promo-tag">Creator's Pick</span><h3>MyCodeNotes</h3><p>A structured learning hub for DSA, web dev, and quick notes.</p><a href="https://mycodenotes.dev" target="_blank" class="promo-btn">Visit Site →</a></div></div>`,
    kwikcric: `<div class="promo-card"><div class="promo-img" style="background-image: url('/assets/kwikcric.png');"></div><div class="promo-content"><span class="promo-tag">Creator's Pick</span><h3>KwikCric</h3><p>A comprehensive cricket platform combining extensive stats and interactive games.</p><a href="https://kwikcric.vercel.app" target="_blank" class="promo-btn">Explore KwikCric →</a></div></div>`,
  };
  const adKeys = Object.keys(ads);
  const key = specificKey || adKeys[Math.floor(Math.random() * adKeys.length)];
  return ads[key];
}

// ==================== ROUTER & SHELL ====================
function navigate(url) {
  history.pushState(null, "", url);
  render();
}

document.addEventListener("click", (e) => {
  const a = e.target.closest("a");
  if (a && a.href && a.origin === location.origin && !a.target) {
    const url = new URL(a.href);
    if (url.pathname === location.pathname && url.hash) return;
    if (url.pathname !== location.pathname || url.search !== location.search) {
      e.preventDefault();
      navigate(url.pathname + url.search);
    }
  }
});

window.addEventListener("popstate", render);

function updateNavActive() {
  const cur = location.pathname;
  $$(".nav-links a").forEach((a) => {
    const h = a.getAttribute("href");
    if (h === "/" && cur === "/") a.classList.add("active");
    else if (h !== "/" && cur.startsWith(h)) a.classList.add("active");
    else a.classList.remove("active");
  });
}

function shell(content) {
  const main = $("#main");
  if (main) {
    main.innerHTML = content;
    $(".nav-links")?.classList.remove("open");
    updateNavActive();
    return;
  }
  const u = state.user;
  app.innerHTML = `
    <header>
      <nav class="nav wrap">
        <a class="brand" href="/" aria-label="InkWell home"><span class="nib">✦</span>Ink<span>Well</span></a>
        <button class="mobile-menu" aria-label="Open menu">☰</button>
        <div class="nav-links">
          <a href="/">Home</a><a href="/articles">Articles</a><a href="/series">Series</a><a href="/categories">Categories</a><a href="/library">Saved</a><a href="/about">About</a>
        </div>
        <div class="nav-actions">
          <button class="icon" id="random-post" title="Surprise me">🎲</button>
          <button class="icon" id="search-button" aria-label="Search">⌕</button>
          <button class="icon" id="theme" aria-label="Change theme">${state.theme === "dark" ? "☀" : "☾"}</button>
          ${
            u
              ? `
            ${u.role === "Admin" ? `<a class="button small secondary" href="/admin" style="margin-right:6px;">Admin Desk</a>` : ""}
            ${canWrite(u) ? `<a class="button small" href="/editor/new" style="margin-right:6px;">Write</a>` : `<a class="button small secondary" href="/apply" style="margin-right:6px;">Apply to Write</a>`}
            <a class="avatar" href="/profile" title="Profile">${u.profilePictureUrl ? `<img src="${esc(u.profilePictureUrl)}" alt="">` : initials(u)}</a>
            <button class="link-button" id="logout">Log out</button>
          `
              : `
            <a href="/login">Log in</a>
            <a class="button small" href="/register">Start writing</a>
          `
          }
        </div>
      </nav>
    </header>
    <main id="main">${content}</main>
    <footer>
      <div class="wrap footer-grid">
        <div><a class="brand" href="/">Ink<span>Well</span></a><p>Where readers become writers.</p></div>
        <div><b>Explore</b><a href="/">Latest articles</a><a href="/articles">Catalog</a><a href="/series">Series</a><a href="/categories">Categories</a><a href="/library">Saved</a></div>
        <div><b>Write</b>${u ? (canWrite(u) ? `<a href="/editor/new">New article</a><a href="/editor">Dashboard</a>` : `<a href="/apply">Apply to Write</a>`) : `<a href="/register">Start writing</a>`}</div>
        <div><b>Legal</b><a href="/about">About</a><a href="/privacy">Privacy</a><a href="/contact">Contact</a></div>
      </div>
      <div class="wrap fineprint">© ${new Date().getFullYear()} InkWell. Made for considered writing.</div>
    </footer>
    <button class="back-top" id="back-top" aria-label="Back to top">↑</button>
  `;
  bindShell();
  updateNavActive();
}

function bindShell() {
  $("#theme")?.addEventListener("click", () => {
    state.theme = state.theme === "dark" ? "light" : "dark";
    localStorage.setItem("inkwell_theme", state.theme);
    document.documentElement.dataset.theme = state.theme;
    const btn = $("#theme");
    if (btn) btn.textContent = state.theme === "dark" ? "☀" : "☾";
  });
  $("#logout")?.addEventListener("click", logout);
  $(".mobile-menu")?.addEventListener("click", () =>
    $(".nav-links").classList.toggle("open"),
  );
  $("#search-button")?.addEventListener("click", searchModal);
  $("#back-top")?.addEventListener("click", () =>
    window.scrollTo({ top: 0, behavior: "smooth" }),
  );

  $("#random-post")?.addEventListener("click", async () => {
    try {
      const d = await api("/api/posts/random");
      if (d.id) navigate(`/post/${d.id}`);
    } catch {
      toast("No posts found");
    }
  });
}

// ==================== SPOTLIGHT CARD ====================
function renderSpotlightCard(item) {
  if (item.itemType === "Series" && item.series) {
    const s = item.series;
    return `
      <a class="spotlight-card fade-in-up" href="/series/${esc(s.slug)}">
        <div class="spotlight-cover">
          <span class="spotlight-badge badge-series">✦ SERIES · ${s.partsCount} PARTS</span>
          ${s.coverImageUrl ? `<img loading="lazy" src="${esc(s.coverImageUrl)}" alt="${esc(s.title)}">` : `<div style="width:100%;height:100%;background:var(--soft);display:flex;align-items:center;justify-content:center;font-size:2rem;color:var(--accent);">✦</div>`}
        </div>
        <div class="spotlight-body">
          <div class="spotlight-meta">
            <span>By ${esc(s.author?.displayName || s.author?.username || "InkWell")}</span>
            <span>·</span>
            <span>${s.totalReadingTimeMinutes} min series</span>
          </div>
          <h3 class="spotlight-title">${esc(s.title)}</h3>
          <p class="spotlight-excerpt">${esc(s.description || "An in-depth multi-part investigative series.")}</p>
          <div class="spotlight-footer">
            <span>${s.partsCount} In-Depth Chapters</span>
            <span class="spotlight-cta">Explore full series →</span>
          </div>
        </div>
      </a>
    `;
  } else if (item.post) {
    const p = item.post;
    return `
      <a class="spotlight-card fade-in-up" href="/post/${p.id}">
        <div class="spotlight-cover">
          <span class="spotlight-badge">✦ EDITOR'S PICK</span>
          ${p.mainImageUrl ? `<img loading="lazy" src="${esc(p.mainImageUrl)}" alt="${esc(p.title)}">` : `<div style="width:100%;height:100%;background:var(--soft);display:flex;align-items:center;justify-content:center;font-size:2rem;color:var(--accent);">✦</div>`}
        </div>
        <div class="spotlight-body">
          <div class="spotlight-meta">
            <span>By ${esc(p.author?.displayName || p.author?.username || "InkWell")}</span>
            <span>·</span>
            <span>${p.readingTimeMinutes} min read</span>
          </div>
          <h3 class="spotlight-title">${esc(p.title)}</h3>
          <p class="spotlight-excerpt">${esc(p.excerpt || "")}</p>
          <div class="spotlight-footer">
            <span>${date(p.publishedAt || p.createdAt)}</span>
            <span class="spotlight-cta">Read full article →</span>
          </div>
        </div>
      </a>
    `;
  }
  return "";
}

// ==================== POST CARD ====================
function card(p) {
  const authorName = p.author.displayName || p.author.username;
  return `<article class="post-card fade-in-up">
    <a class="cover ${p.mainImageUrl ? "" : "gradient"}" href="/post/${p.id}">
      ${p.mainImageUrl ? `<img loading="lazy" src="${esc(p.mainImageUrl)}" alt="">` : "<span>✦</span>"}
    </a>
    <div class="card-body">
      <div class="eyebrow">${p.categories.map(esc).join(" · ") || "InkWell"}</div>
      <h3><a href="/post/${p.id}" title="${esc(p.title)}">${esc(p.title)}</a></h3>
      <p class="card-excerpt">${esc(p.excerpt)}</p>
      <div class="card-footer-box">
        <div class="byline">
          <span class="mini-avatar">${avatarImg(p.author)}</span>
          <span><a href="/author/${p.author.id}">${esc(authorName)}</a> · ${date(p.publishedAt || p.createdAt)}</span>
          <span>${p.readingTimeMinutes} min</span>
        </div>
        <a class="card-read-more" href="/post/${p.id}">Read full article <span>→</span></a>
      </div>
    </div>
  </article>`;
}

// ==================== SHARE SUMMARY MODAL ====================
function openSummaryModal(title, author, summary) {
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <div class="summary-modal">
      <h2>Article Summary</h2>
      <p class="muted">Download the image or share directly to your socials.</p>
      
      <div class="summary-preview-box" id="share-preview-target">
        <div class="summary-card">
          <h3 class="summary-title">${esc(title)}</h3>
          <p class="summary-text">${esc(summary)}</p>
          <div class="summary-footer">
            <span class="summary-author">— ${esc(author)}</span>
            <a href="https://inkwell-3m7y.onrender.com" target="_blank" class="summary-url">inkwell-3m7y.onrender.com</a>
            <span class="summary-brand">✦ InkWell</span>
          </div>
        </div>
      </div>

      <div class="summary-actions">
        <button class="button secondary" id="btn-download">Download</button>
        <button class="button" id="btn-native-share">Share</button>
        <button class="button danger" onclick="this.closest('.modal-backdrop').remove()">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const target = $("#share-preview-target", modal);

  $("#btn-download", modal).onclick = async () => {
    if (typeof htmlToImage === "undefined")
      return toast("Image library not loaded yet.", "error");
    try {
      toast("Generating image...");
      const dataUrl = await htmlToImage.toPng(target, {
        quality: 1.0,
        pixelRatio: 2,
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = "inkwell-summary.png";
      a.click();
      toast("Image downloaded!");
    } catch (err) {
      toast("Failed to generate image", "error");
    }
  };

  $("#btn-native-share", modal).onclick = async () => {
    if (typeof htmlToImage === "undefined")
      return toast("Image library not loaded yet.", "error");
    try {
      const dataUrl = await htmlToImage.toPng(target, {
        quality: 1.0,
        pixelRatio: 2,
      });
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], "summary.png", { type: "image/png" });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "InkWell Summary",
          text: `"${title}" — ${author}`,
        });
      } else {
        toast("Native sharing not supported. Download instead.", "error");
      }
    } catch (err) {
      console.error(err);
    }
  };
}

// ==================== HOME ====================
async function home() {
  updateMeta(
    "InkWell — Where readers become writers",
    "A digital magazine for readers with curiosity and writers with something worth saying.",
    "https://images.unsplash.com/photo-1455390582262-044cdead2708?auto=format&fit=crop&w=1200&q=80",
  );

  shell(`
    <section class="hero wrap">
      <div class="hero-copy">
        <div class="eyebrow">A home for thoughtful writing</div>
        <h1>Where readers<br>become <i>writers.</i></h1>
        <p>Ideas worth sitting with, stories worth sharing, and a welcoming room for your next piece of work.</p>
        <div class="actions">
          <a class="button" href="#articles">Start reading <span>→</span></a>
          <a class="button secondary" href="${state.user ? "/editor/new" : "/register"}">${state.user ? "Continue writing" : "Start writing"}</a>
        </div>
      </div>
      <div class="hero-art"><div class="orb"></div><div class="paper-note">MAKE ROOM<br>FOR IDEAS <b>↗</b></div><span class="spark one">✦</span><span class="spark two">✦</span></div>
    </section>

    <!-- ADMIN CURATED SPOTLIGHT -->
    <section class="wrap spotlight-section" id="spotlight-section" style="display:none;"></section>

    <section class="wrap category-bar" id="category-bar"></section>
    <section class="wrap" id="articles">
      <div class="section-heading">
        <div><div class="eyebrow">Fresh from the inkwell</div><h2>Latest articles</h2></div>
        <button class="link-button" id="open-search">Search articles ↗</button>
      </div>
      <div class="post-grid" id="posts"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>
      <div id="home-more" style="text-align:center; margin: 40px 0;"></div>
    </section>
    <section class="cta wrap">
      <div><div class="eyebrow">Your perspective matters</div><h2>Have something to say?</h2><p>Write your next article and share it with a community of curious readers.</p></div>
      <a class="button pale" href="${state.user ? "/editor/new" : "/register"}">${state.user ? "Write an article" : "Start writing"} →</a>
    </section>
  `);

  try {
    const [cats, data, featured] = await Promise.all([
      api("/api/categories"),
      api("/api/posts"),
      api("/api/featured").catch(() => []),
    ]);
    state.categories = cats;

    // Render Admin Curated Spotlight if configured
    if (featured && featured.length > 0) {
      const spotlightEl = $("#spotlight-section");
      if (spotlightEl) {
        spotlightEl.style.display = "block";
        spotlightEl.innerHTML = `
          <div class="spotlight-header">
            <div>
              <div class="eyebrow">Curated Selection</div>
              <h2>Editor's Spotlight</h2>
            </div>
            <a class="link-button" href="/series">Browse all series ↗</a>
          </div>
          <div class="spotlight-grid">
            ${featured.map(renderSpotlightCard).join("")}
          </div>
        `;
      }
    }

    $("#category-bar").innerHTML =
      `<a class="chip active" href="/articles">All (${data.total})</a>${cats.map((c) => `<a class="chip" href="/category/${encodeURIComponent(c.name)}">${esc(c.name)}</a>`).join("")}`;
    $("#posts").innerHTML = data.items.length
      ? data.items.map(card).join("")
      : empty("No articles match that search.", "Clear filters", "/");
    if (data.total > 6 || data.total > data.items.length) {
      $("#home-more").innerHTML = `<a class="button secondary" href="/articles">Browse all articles (${data.total}) <span>→</span></a>`;
    }
  } catch (e) {
    $("#posts").innerHTML = empty(
      "The library is waking up.",
      "Try again",
      "/",
    );
  }
  $("#open-search")?.addEventListener("click", searchModal);
}

// ==================== ALL ARTICLES ====================
async function articlesPage(page = 1) {
  updateMeta(
    "All Articles — InkWell",
    "Explore every published story, essay, and thought on InkWell.",
  );

  shell(`
    <section class="page-head wrap">
      <div class="eyebrow">Library</div>
      <h1>All Articles</h1>
      <p>Explore every published story, essay, and thought on InkWell.</p>
    </section>
    <section class="wrap category-bar" id="category-bar"></section>
    <section class="wrap">
      <div class="post-grid" id="posts"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>
      <div class="pagination-row" id="pagination"></div>
    </section>
  `);

  try {
    const [cats, data] = await Promise.all([
      api("/api/categories"),
      api(`/api/posts?page=${page}`),
    ]);
    state.categories = cats;
    $("#category-bar").innerHTML = `<a class="chip active" href="/articles">All (${data.total})</a>${cats.map((c) => `<a class="chip" href="/category/${encodeURIComponent(c.name)}">${esc(c.name)}</a>`).join("")}`;

    $("#posts").innerHTML = data.items.length
      ? data.items.map(card).join("")
      : empty("No articles published yet.", "Start writing", "/editor/new");

    const totalPages = Math.ceil(data.total / (data.pageSize || 9));
    if (totalPages > 1) {
      let pagHtml = "";
      if (page > 1) {
        pagHtml += `<button class="button small secondary" id="prev-page">← Previous</button>`;
      }
      pagHtml += `<span style="font-size:14px;color:var(--muted);font-weight:600">Page ${page} of ${totalPages}</span>`;
      if (page < totalPages) {
        pagHtml += `<button class="button small secondary" id="next-page">Next →</button>`;
      }
      $("#pagination").innerHTML = pagHtml;

      $("#prev-page")?.addEventListener("click", () => {
        window.history.pushState(null, "", `/articles?page=${page - 1}`);
        articlesPage(page - 1);
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
      $("#next-page")?.addEventListener("click", () => {
        window.history.pushState(null, "", `/articles?page=${page + 1}`);
        articlesPage(page + 1);
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }
  } catch (e) {
    $("#posts").innerHTML = empty("Could not load articles.", "Try again", "/articles");
  }
}

// ==================== SERIES PAGES ====================
async function seriesListPage() {
  updateMeta(
    "Series & Anthologies — InkWell",
    "Deep-dive multi-part investigative series and long-form anthologies.",
  );
  shell(`
    <section class="wrap series-directory-hero">
      <div class="eyebrow">Investigative & Thematic Collections</div>
      <h1>Editorial Series</h1>
      <p>Extended investigative journalism, architectural studies, and deep-dives organized into episodic chapters.</p>
    </section>
    <section class="wrap">
      <div class="series-grid" id="series-grid">
        <div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>
      </div>
    </section>
  `);

  try {
    const list = await api("/api/series");
    const container = $("#series-grid");
    if (!container) return;
    if (!list || list.length === 0) {
      container.innerHTML = empty("No series published yet.", "Back home", "/");
      return;
    }

    container.innerHTML = list.map((s) => `
      <a class="series-card fade-in-up" href="/series/${esc(s.slug)}">
        <div class="series-card-cover">
          <span class="series-chapter-badge">${s.partsCount} ${s.partsCount === 1 ? 'Chapter' : 'Chapters'}</span>
          ${s.coverImageUrl ? `<img loading="lazy" src="${esc(s.coverImageUrl)}" alt="${esc(s.title)}">` : `<div style="width:100%;height:100%;background:var(--soft);display:flex;align-items:center;justify-content:center;font-size:2.5rem;color:var(--accent);">✦</div>`}
        </div>
        <div class="series-card-body">
          <div style="font-size:0.8rem;color:var(--muted);margin-bottom:6px;">
            By ${esc(s.author?.displayName || s.author?.username || "InkWell")} · ${s.totalReadingTimeMinutes} min total read
          </div>
          <h2 class="series-card-title">${esc(s.title)}</h2>
          <p class="series-card-desc">${esc(s.description || "An investigative multi-part series.")}</p>
          <div class="series-card-footer">
            <span>Explore full series</span>
            <span>→</span>
          </div>
        </div>
      </a>
    `).join("");
  } catch (err) {
    $("#series-grid").innerHTML = empty("Failed to load series.", "Retry", "/series");
  }
}

async function seriesDetailPage(slug) {
  if (!getCached(`/api/series/${encodeURIComponent(slug)}`)) {
    shell(`<div class="article-skeleton wrap"></div>`);
  }
  try {
    const s = await api(`/api/series/${encodeURIComponent(slug)}`);
    updateMeta(
      `${s.title} (Series) — InkWell`,
      s.description || `A multi-part series by ${s.author?.displayName || s.author?.username}`,
      s.coverImageUrl
    );

    const firstPostId = s.posts && s.posts.length > 0 ? s.posts[0].id : null;

    shell(`
      <div class="wrap">
        <section class="series-detail-hero">
          <div class="series-hero-content">
            <div class="eyebrow"><a href="/series" style="color:var(--muted);">Series</a> · Multi-Part Anthology</div>
            <h1>${esc(s.title)}</h1>
            <p style="font-size:1.1rem;color:var(--muted);line-height:1.6;margin:16px 0;">${esc(s.description || "")}</p>
            
            <div class="series-hero-stats">
              <div class="series-hero-stat">
                <b>${s.partsCount}</b>
                <span>${s.partsCount === 1 ? 'Chapter' : 'Chapters'}</span>
              </div>
              <div class="series-hero-stat">
                <b>${s.totalReadingTimeMinutes}</b>
                <span>Total Mins</span>
              </div>
              <div class="series-hero-stat">
                <b>${date(s.createdAt)}</b>
                <span>Released</span>
              </div>
            </div>

            <div class="series-hero-meta">
              <a href="/author/${s.author?.id}" class="mini-avatar" style="text-decoration:none;">${avatarImg(s.author)}</a>
              <div>
                <a href="/author/${s.author?.id}" style="font-weight:700;color:var(--ink);">${esc(s.author?.displayName || s.author?.username)}</a>
                <small style="display:block;color:var(--accent);font-weight:600;">${getEditorialRole(s.author)}</small>
              </div>
            </div>

            ${firstPostId ? `
              <div style="margin-top:24px;">
                <a class="button" href="/post/${firstPostId}">Begin Reading Part 1 <span>→</span></a>
              </div>
            ` : ""}
          </div>
          <div class="series-hero-cover">
            ${s.coverImageUrl ? `<img src="${esc(s.coverImageUrl)}" alt="${esc(s.title)}">` : `<div style="width:100%;height:100%;background:var(--soft);display:flex;align-items:center;justify-content:center;font-size:3rem;color:var(--accent);">✦</div>`}
          </div>
        </section>

        <section style="margin-bottom:60px;">
          <div style="margin-bottom:28px;">
            <div class="eyebrow">The Complete Series</div>
            <h2 style="font-family:Fraunces,Georgia,serif;font-size:1.75rem;margin:4px 0 0;">Table of Chapters</h2>
          </div>

          <div class="chapter-timeline">
            ${s.posts && s.posts.length > 0 ? s.posts.map((p, idx) => `
              <a class="chapter-item fade-in-up" href="/post/${p.id}">
                <div class="chapter-number-badge">
                  <small>Part</small>
                  <span>${String(p.seriesOrder || idx + 1).padStart(2, '0')}</span>
                </div>
                <div class="chapter-info">
                  <h3>${esc(p.title)}</h3>
                  <p>${esc(p.excerpt || "")}</p>
                  <div class="chapter-meta">
                    <span>${p.readingTimeMinutes} min read</span>
                    <span>·</span>
                    <span>${date(p.publishedAt || p.createdAt)}</span>
                    <span class="chapter-cta" style="margin-left:auto;font-weight:600;color:var(--accent);">Read full chapter →</span>
                  </div>
                </div>
                ${p.mainImageUrl ? `
                  <div class="chapter-item-thumbnail">
                    <img loading="lazy" src="${esc(p.mainImageUrl)}" alt="">
                  </div>
                ` : ""}
              </a>
            `).join("") : `<div class="empty-state">No chapters have been published in this series yet.</div>`}
          </div>
        </section>
      </div>
    `);
  } catch (err) {
    shell(`<section class="wrap page-head">${empty("Series not found.", "Browse all series", "/series")}</section>`);
  }
}

// ==================== STATIC PAGES ====================
function aboutPage() {
  updateMeta("About — InkWell", "The story behind InkWell.");
  shell(
    `<section class="wrap page-head about"><div class="eyebrow">Idea</div><h1>A better room for the written word.</h1><p>InkWell is a digital magazine for readers with curiosity and writers with something worth saying. Every story passes through an editorial review before it becomes part of the public library.</p><a class="button" href="/apply">Write for InkWell →</a></section>`,
  );
}

function privacyPage() {
  updateMeta("Privacy Policy — InkWell", "How InkWell handles your data.");
  shell(`<section class="wrap page-head about"><div class="eyebrow">Legal</div><h1>Privacy Policy</h1>
    <p><strong>Last updated:</strong> ${new Date().toLocaleDateString()}</p>
    <p>At InkWell, we take your privacy seriously. Here is how we handle your data:</p>
    <ul style="line-height:1.8; margin-bottom:40px; margin-left:20px;">
      <li><strong>Authentication:</strong> We use JWT tokens and BCrypt hashing to keep your account secure. We do not sell your data.</li>
      <li><strong>Content:</strong> Articles and images you upload are stored on our secure PostgreSQL database and Cloudinary.</li>
      <li><strong>Local Storage:</strong> Reader features like Highlights, the Saved Library, and Focus Mode preferences are stored entirely on your device, not on our servers.</li>
    </ul>
  </section>`);
}

function contactPage() {
  updateMeta("Contact Us — InkWell", "Get in touch with the InkWell team.");
  shell(`<section class="wrap page-head about"><div class="eyebrow">Get in touch</div><h1>Contact Us</h1>
    <p>Have a question, found a bug, or want to say hello? Send us a message and it will go directly to our team.</p>
    <form id="contact-form" class="form" style="margin-top:30px; max-width:500px;">
      <label>Your Name<input type="text" name="name" required></label>
      <label>Your Email<input type="email" name="email" required></label>
      <label>Message<textarea name="message" required minlength="10" style="min-height:120px"></textarea></label>
      <button class="button" type="submit" style="width:100%; margin-top:15px">Send Message →</button>
    </form>
  </section>`);

  $("#contact-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("button", e.target);
    btn.disabled = true;
    btn.textContent = "Sending...";
    try {
      const f = Object.fromEntries(new FormData(e.target));
      await api("/api/contact", { method: "POST", body: JSON.stringify(f) });
      toast("Message sent successfully!");
      e.target.reset();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Send Message →";
    }
  });
}

// ==================== CATEGORIES & TAGS ====================
async function categoriesPage() {
  updateMeta("Categories — InkWell", "Explore all topics on InkWell.");
  shell(
    `<section class="page-head wrap"><div class="eyebrow">Explore InkWell</div><h1>All categories</h1><p>Find stories by the questions they explore.</p></section><section class="wrap category-grid" id="cat-grid"><div class="skeleton"></div></section>`,
  );
  try {
    const cats = await api("/api/categories");
    $("#cat-grid").innerHTML = cats.length
      ? cats
          .map(
            (c) =>
              `<a class="category-card" href="/category/${encodeURIComponent(c.name)}"><b>${esc(c.name)}</b><span>${c.postCount || 0} articles</span></a>`,
          )
          .join("")
      : empty("No categories yet.", "Back home", "/");
  } catch (e) {
    $("#cat-grid").innerHTML = empty(
      "Could not load categories.",
      "Try again",
      "/categories",
    );
  }
}

async function category(name) {
  updateMeta(`${name} — InkWell`, `articles in ${name}.`);
  shell(
    `<section class="page-head wrap"><div class="eyebrow">InkWell category</div><h1>${esc(name)}</h1><p>Stories gathered around one good question.</p></section><section class="wrap post-grid" id="posts"></section>`,
  );
  const d = await api(`/api/posts?category=${encodeURIComponent(name)}`);
  $("#posts").innerHTML = d.items.length
    ? d.items.map(card).join("")
    : empty(
        "No published articles in this category yet.",
        "Explore all articles",
        "/",
      );
}

async function tagPage(name) {
  updateMeta(`#${name} — InkWell`, `article tagged with #${name}.`);
  shell(
    `<section class="page-head wrap"><div class="eyebrow">Keyword</div><h1>#${esc(name)}</h1><p>All articles tagged with ${esc(name)}.</p></section><section class="wrap post-grid" id="posts"><div class="skeleton"></div></section>`,
  );
  const d = await api(`/api/posts?tag=${encodeURIComponent(name)}`);
  $("#posts").innerHTML = d.items.length
    ? d.items.map(card).join("")
    : empty(
        "No published articles with this tag yet.",
        "Explore all articles",
        "/",
      );
}

// ==================== LIBRARY ====================
function libraryPage() {
  updateMeta("Saved articles — InkWell", "Your personal reading list.");
  const saved = store.get("library", []);
  shell(`
    <section class="page-head wrap"><div class="eyebrow">Your reading list</div><h1>Saved Stories</h1><p>Articles you've saved to read later. Stored locally on this device.</p></section>
    <section class="wrap post-grid" id="lib-posts">
      ${
        saved.length
          ? saved
              .map(
                (item) => `
        <article class="post-card fade-in-up">
          <a class="cover ${item.image ? "" : "gradient"}" href="/post/${item.id}">
            ${item.image ? `<img loading="lazy" src="${esc(item.image)}" alt="">` : "<span>✦</span>"}
          </a>
          <div class="card-body">
            <div class="eyebrow">${item.state}</div>
            <h3><a href="/post/${item.id}">${esc(item.title)}</a></h3>
            <div class="byline" style="margin-top:20px">
              <span>Saved ${date(item.savedAt)}</span>
              <button class="link-button remove-lib" data-id="${item.id}" style="margin-left:auto;color:var(--danger)">Remove</button>
            </div>
          </div>
        </article>
      `,
              )
              .join("")
          : empty("Your reading list is empty.", "Explore articles", "/")
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

// ==================== POST PAGE ====================
async function postPage(id) {
  if (!getCached(`/api/posts/${id}`)) {
    shell(`<div class="article-skeleton wrap"></div>`);
  }
  try {
    const p = await api(`/api/posts/${id}`);
    updateMeta(
      `${p.title} — InkWell`,
      p.excerpt || "Read this article on InkWell.",
      p.mainImageUrl,
    );

    const isSaved = store
      .get("library", [])
      .some((x) => String(x.id) === String(p.id));
    const toc = [];
    p.content.replace(/^(##|###) (.+)$/gm, (m, hashes, text) =>
      toc.push({ level: hashes.length, text, slug: slugify(text) }),
    );
    const contentHtml = markdown(p.content);
    const shareUrl = location.href;
    const shareText = encodeURIComponent(p.title + " — InkWell");
    const encUrl = encodeURIComponent(shareUrl);

    // Generate Two Different Ads for Desktop
    const adKeys = ["mycodendotes", "kwikcric"];
    const leftAdKey = adKeys[Math.floor(Math.random() * adKeys.length)];
    let rightAdKey = adKeys[Math.floor(Math.random() * adKeys.length)];
    if (adKeys.length > 1) {
      while (leftAdKey === rightAdKey) {
        rightAdKey = adKeys[Math.floor(Math.random() * adKeys.length)];
      }
    }

    // Reusable HTML Blocks
    const toolsHtml = `
      <div class="side-block tools-block">
        <b>Tools</b>
        <button class="focus-btn summary-btn">Read Summary</button>
        <button class="focus-btn focus-toggle">Focus Mode</button>
        <button class="focus-btn tts-toggle">🎧 Listen to Article</button>
        <button class="focus-btn save-article-btn ${isSaved ? "saved" : ""}" data-id="${p.id}" data-title="${esc(p.title)}" data-img="${esc(p.mainImageUrl || "")}">${isSaved ? "Saved" : "Save for Later"}</button>
      </div>
    `;

    const shareHtml = `
      <div class="side-block share-block">
        <b>Share</b>
        <div class="share-mini">
          <a href="https://wa.me/?text=${shareText}%20${encUrl}" target="_blank" rel="noopener" title="WhatsApp">W</a>
          <a href="https://twitter.com/intent/tweet?text=${shareText}&url=${encUrl}" target="_blank" rel="noopener" title="X">X</a>
          <a href="https://www.facebook.com/sharer/sharer.php?u=${encUrl}" target="_blank" rel="noopener" title="Facebook">f</a>
          <a href="https://www.linkedin.com/sharing/share-offsite/?url=${encUrl}" target="_blank" rel="noopener" title="LinkedIn">in</a>
          <button class="share-copy-btn" title="Copy link">⧉</button>
        </div>
      </div>
    `;

    // Series Navigation Data
    const seriesBadgeHtml = p.series ? `
      <div class="series-badge-row">
        <a href="/series/${esc(p.series.slug)}" class="series-pill" title="View all chapters in this series">
          <span class="series-tag">SERIES</span>
          <span class="series-part-label">Part ${p.seriesOrder || 1} of ${p.series.parts?.length || 1}</span>
          <span class="series-dot">·</span>
          <span class="series-title-text">${esc(p.series.title)}</span>
        </a>
      </div>
    ` : "";

    const seriesRoadmapHtml = p.series && p.series.parts && p.series.parts.length > 1 ? `
      <div class="side-block series-roadmap-card">
        <div class="series-roadmap-header">
          <div class="eyebrow" style="margin-bottom:2px;">Multi-Part Series</div>
          <a href="/series/${esc(p.series.slug)}" class="series-roadmap-title">${esc(p.series.title)}</a>
        </div>
        <div class="series-roadmap-list">
          ${p.series.parts.map(part => `
            <a href="/post/${part.id}" class="series-roadmap-item ${part.isCurrent ? 'active' : ''}">
              <span class="part-number">${part.seriesOrder}</span>
              <span class="part-title">${esc(part.title)}</span>
              ${part.isCurrent ? '<span class="current-badge">Reading</span>' : ''}
            </a>
          `).join('')}
        </div>
      </div>
    ` : "";

    let prevPart = null;
    let nextPart = null;
    if (p.series && p.series.parts && p.series.parts.length > 1) {
      const currentIdx = p.series.parts.findIndex(x => x.id === p.id);
      if (currentIdx > 0) prevPart = p.series.parts[currentIdx - 1];
      if (currentIdx >= 0 && currentIdx < p.series.parts.length - 1) nextPart = p.series.parts[currentIdx + 1];
    }

    const seriesNavFooterHtml = (prevPart || nextPart) ? `
      <div class="series-nav-footer">
        ${prevPart ? `
          <a href="/post/${prevPart.id}" class="series-nav-btn prev">
            <span class="nav-dir">← Previous Chapter</span>
            <span class="nav-title">Part ${prevPart.seriesOrder}: ${esc(prevPart.title)}</span>
          </a>
        ` : `<div></div>`}
        ${nextPart ? `
          <a href="/post/${nextPart.id}" class="series-nav-btn next">
            <span class="nav-dir">Next Chapter →</span>
            <span class="nav-title">Part ${nextPart.seriesOrder}: ${esc(nextPart.title)}</span>
          </a>
        ` : `<div></div>`}
      </div>
    ` : "";

    shell(`
      <div class="wrap article-layout">
        <!-- DESKTOP LEFT SIDEBAR -->
        <aside class="sidebar sidebar-left desktop-only">
          <div class="side-block author-card">
            <a class="mini-avatar large" href="/author/${p.author.id}">${avatarImg(p.author)}</a>
            <div><a href="/author/${p.author.id}">${esc(p.author.displayName || p.author.username)}</a><small>${date(p.publishedAt || p.createdAt)} · ${p.readingTimeMinutes} min read</small></div>
          </div>
          ${p.categories.length ? `<div class="side-block"><b>Filed under</b>${p.categories.map((c) => `<a href="/category/${encodeURIComponent(c)}">${esc(c)}</a>`).join("")}</div>` : ""}
          
          ${toolsHtml}
          ${shareHtml}
          
          <div class="ad-container-left">${renderAd(leftAdKey)}</div>
        </aside>

        <!-- MAIN ARTICLE -->
        <article class="article-body" id="article-root">
          
          <!-- MOBILE TOOLS (Above Title) -->
          <div class="mobile-only mobile-tools-row">
            ${toolsHtml}
          </div>

          <div class="article-head">
            ${seriesBadgeHtml}
            <div class="eyebrow">${p.categories.map(esc).join(" · ") || "InkWell"}</div>
            <h1>${esc(p.title)}</h1>
          </div>
          ${p.mainImageUrl ? `<img class="article-cover" src="${esc(p.mainImageUrl)}" alt="">` : ""}
          
          <div class="article-content" id="article-content">
            ${contentHtml}
            ${p.tags && p.tags.length ? `<div class="tag-list" style="margin-top:40px; margin-bottom: 20px;"><span style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;margin-right:10px">Keywords</span>${p.tags.map((t) => `<a href="/tag/${encodeURIComponent(t)}" class="tag" style="text-decoration:none">#${esc(t)}</a>`).join("")}</div>` : ""}
            <hr>
            <div class="author-bio"><span class="mini-avatar large">${avatarImg(p.author)}</span><div><b>Written by ${esc(p.author.displayName || p.author.username)}</b><p>${esc(p.author.bio || "A contributing writer at InkWell.")}</p></div></div>
            
            ${seriesNavFooterHtml}

            <!-- MOBILE SHARE (Below Author) -->
            <div class="mobile-only mobile-share-row">
              ${shareHtml}
            </div>
          </div>
        </article>

        <!-- DESKTOP RIGHT SIDEBAR -->
        <aside class="sidebar sidebar-right">
          ${seriesRoadmapHtml}
          <div class="desktop-only">
            ${toc.length ? `<div class="side-block"><b>On this page</b><nav class="toc">${toc.map((t) => `<a class="toc-lv${t.level}" href="#${t.slug}" data-toc="${t.slug}">${esc(t.text)}</a>`).join("")}</nav></div>` : ""}
          </div>
          <div class="side-block"><b>More from InkWell</b><div id="related" class="related-list"></div></div>
          
          <div class="ad-container-right">${renderAd(rightAdKey)}</div>
        </aside>
      </div>
      
      <button class="focus-exit-btn" id="focus-exit">Exit Focus Mode (Esc)</button>
      <div class="focus-themes"><button data-theme="light"></button><button data-theme="sepia"></button><button data-theme="dark"></button></div>
      <div id="highlight-toolbar"><button id="btn-highlight">Highlight</button><button id="btn-undo-highlight" style="display:none;color:#f87171">Remove</button><button id="btn-copy">Copy</button></div>
    `);

    // --- ALL EVENT LISTENERS ---
    $$(".save-article-btn").forEach((btn) =>
      btn.addEventListener("click", function (e) {
        toggleTBR(p.id, p.title, p.mainImageUrl, e);
      }),
    );
    $$(".share-copy-btn").forEach((btn) =>
      btn.addEventListener("click", () => {
        navigator.clipboard
          .writeText(shareUrl)
          .then(() => toast("Link copied."));
      }),
    );

    // Summary
    $$(".summary-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const originalText = btn.innerHTML;
        btn.innerHTML = "✨ Generating...";
        btn.disabled = true;
        btn.style.opacity = "0.7";
        try {
          const response = await api(`/api/posts/${p.id}/summarize`, {
            method: "POST",
          });
          openSummaryModal(
            p.title,
            p.author.displayName || p.author.username,
            response.summary,
          );
        } catch (err) {
          toast("AI unavailable. Generating local summary...", "error");
          let cleanContent = p.content;
          const firstLine = cleanContent.split("\n")[0];
          if (
            firstLine.includes(p.title) ||
            firstLine.length < p.title.length + 5
          )
            cleanContent = cleanContent.substring(firstLine.length).trim();
          openSummaryModal(
            p.title,
            p.author.displayName || p.author.username,
            generateSummary(cleanContent),
          );
        } finally {
          btn.innerHTML = originalText;
          btn.disabled = false;
          btn.style.opacity = "1";
        }
      });
    });

    // Focus Mode
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
    $$(".focus-toggle").forEach((btn) =>
      btn.addEventListener("click", enterFocus),
    );
    $("#focus-exit")?.addEventListener("click", exitFocus);
    $$(".focus-themes button").forEach((btn) =>
      btn.addEventListener("click", (e) => {
        document.body.classList.remove(
          "focus-light",
          "focus-sepia",
          "focus-dark",
        );
        document.body.classList.add(`focus-${e.target.dataset.theme}`);
        localStorage.setItem("inkwell.focusTheme", e.target.dataset.theme);
      }),
    );
    document.addEventListener("keydown", function escHandler(e) {
      if (e.key === "Escape" && document.body.classList.contains("focus-mode"))
        exitFocus();
    });

    // TTS
    let ttsBlocks = [];
    let currentTtsIndex = 0;
    let isTtsPlaying = false;
    let isTtsPaused = false;
    let ignoreNextTtsClick = false;
    function initTTS() {
      const nodes = $("#article-content").querySelectorAll(
        "p, h2, h3, blockquote, li",
      );
      ttsBlocks = Array.from(nodes);
      ttsBlocks.forEach((node, index) => {
        node.classList.add("tts-node");
        node.addEventListener("click", (e) => {
          if (ignoreNextTtsClick) {
            ignoreNextTtsClick = false;
            return;
          }
          const sel = window.getSelection();
          if (sel && sel.type === "Range" && sel.toString().trim().length > 0)
            return;
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
      $$(".tts-toggle").forEach((btn) => {
        if (!isTtsPlaying) btn.textContent = "🎧 Listen to Article";
        else if (isTtsPaused) btn.textContent = "▶️ Resume Listening";
        else btn.textContent = "⏸ Pause Listening";
      });
    }
    $$(".tts-toggle").forEach((btn) =>
      btn.addEventListener("click", toggleTTS),
    );
    window.addEventListener("hashchange", stopTTS, { once: true });
    initTTS();

    // Highlights
    const toolbar = $("#highlight-toolbar");
    let currentRange = null;
    store
      .get("highlights", [])
      .filter((h) => h.postId === p.id)
      .forEach((h) => applyHighlight(h.text));
    toolbar.addEventListener("click", (e) => e.stopPropagation());
    document.getElementById("article-root").addEventListener("mouseup", (e) => {
      if (toolbar.contains(e.target)) return;
      setTimeout(() => {
        const selection = window.getSelection();
        if (!selection.isCollapsed && selection.toString().trim().length > 0) {
          ignoreNextTtsClick = true;
          currentRange = selection.getRangeAt(0);
          const rect = currentRange.getBoundingClientRect();
          toolbar.style.left = `${rect.left + rect.width / 2 + window.scrollX}px`;
          toolbar.style.top = `${rect.top + window.scrollY - 10}px`;
          toolbar.classList.add("active");
          $("#btn-highlight").style.display = "block";
          $("#btn-undo-highlight").style.display = "none";
        }
      }, 10);
    });
    document
      .getElementById("article-content")
      .addEventListener("click", (e) => {
        const mark = e.target.closest("mark.inkwell-highlight");
        if (mark && window.getSelection().isCollapsed) {
          ignoreNextTtsClick = true;
          currentRange = null;
          const rect = mark.getBoundingClientRect();
          toolbar.style.left = `${rect.left + rect.width / 2 + window.scrollX}px`;
          toolbar.style.top = `${rect.top + window.scrollY - 10}px`;
          toolbar.classList.add("active");
          $("#btn-highlight").style.display = "none";
          $("#btn-undo-highlight").style.display = "block";
          toolbar.dataset.markId = mark.id || `mark-${Date.now()}`;
          if (!mark.id) mark.id = toolbar.dataset.markId;
        }
      });
    document.addEventListener("mousedown", (e) => {
      if (!toolbar.contains(e.target)) toolbar.classList.remove("active");
    });
    $("#btn-highlight")?.addEventListener("click", (e) => {
      if (!currentRange) return;
      const text = currentRange.toString();
      applyHighlight(text);
      let list = store.get("highlights", []);
      list.push({ postId: p.id, text, timestamp: Date.now() });
      store.set("highlights", list);
      triggerInkBurst(e);
      window.getSelection().removeAllRanges();
      toolbar.classList.remove("active");
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
        document.getElementById("article-content"),
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

    // Related & TOC
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
                `<a class="related-item" href="/post/${r.id}"><b>${esc(r.title)}</b><small>${esc(r.author.displayName || r.author.username)} · ${r.readingTimeMinutes} min</small></a>`,
            )
            .join("")
        : '<p style="color:var(--muted);font-size:13px">No other articles yet.</p>';
    } catch {}

    // Series Floating Up-Next Pill
    $$(".series-up-next-pill").forEach((el) => el.remove());
    let upNextPill = null;
    if (nextPart) {
      upNextPill = document.createElement("a");
      upNextPill.className = "series-up-next-pill";
      upNextPill.href = `/post/${nextPart.id}`;
      upNextPill.innerHTML = `
        <span class="up-next-label">Up Next · Part ${nextPart.seriesOrder}</span>
        <span class="up-next-title">${esc(nextPart.title)}</span>
        <span class="up-next-arrow">→</span>
      `;
      document.body.appendChild(upNextPill);
    }

    // Scroll Sync
    const progressBar = $("#reading-progress-bar");
    const leftSidebar = $(".sidebar-left");
    const rightSidebar = $(".sidebar-right");
    window.onscroll = () => {
      const articleContent = $("#article-content");
      if (!articleContent) return;
      const rect = articleContent.getBoundingClientRect();
      const totalHeight = articleContent.scrollHeight - window.innerHeight;
      const scrolled = Math.max(0, -rect.top);
      const progress = Math.min(
        100,
        Math.max(0, (scrolled / totalHeight) * 100),
      );
      if (progressBar) progressBar.style.width = `${progress}%`;

      if (upNextPill) {
        if (progress >= 80) {
          upNextPill.classList.add("visible");
        } else {
          upNextPill.classList.remove("visible");
        }
      }

      if (progress > 10 && progress < 90) {
        let list = store.get("library", []);
        const item = list.find((x) => x.id === p.id);
        if (item && item.state === "Saved") {
          item.state = "In progress";
          store.set("library", list);
        }
      } else if (progress >= 90) {
        let list = store.get("library", []);
        const item = list.find((x) => x.id === p.id);
        if (item && item.state !== "Finished") {
          item.state = "Finished";
          store.set("library", list);
          toast("Marked as Finished");
        }
      }
      if (window.innerWidth > 800) {
        const maxScroll =
          document.documentElement.scrollHeight - window.innerHeight;
        const scrollFraction =
          maxScroll > 0
            ? Math.min(1, Math.max(0, window.scrollY / maxScroll))
            : 0;
        if (leftSidebar && leftSidebar.scrollHeight > leftSidebar.clientHeight)
          leftSidebar.scrollTop =
            scrollFraction *
            (leftSidebar.scrollHeight - leftSidebar.clientHeight);
        if (
          rightSidebar &&
          rightSidebar.scrollHeight > rightSidebar.clientHeight
        )
          rightSidebar.scrollTop =
            scrollFraction *
            (rightSidebar.scrollHeight - rightSidebar.clientHeight);
      }
    };
  } catch (e) {
    shell(
      `<section class="wrap page-head">${empty(e.message, "Back home", "/")}</section>`,
    );
  }
}

// ==================== AUTH & PROFILE ====================
function authPage(mode) {
  const login = mode === "login";
  updateMeta(`${login ? "Log In" : "Sign Up"} — InkWell`, "Join InkWell.");
  shell(`<section class="auth-layout">
    <aside><a class="brand" href="/">Ink<span>Well</span></a><blockquote>"Words are, of course, the most powerful drug used by mankind."<small>— Rudyard Kipling</small></blockquote></aside>
    <section class="auth-form"><div>
      <div class="eyebrow">${login ? "Welcome back" : "Join the conversation"}</div>
      <h1>${login ? "Sign in to InkWell" : "Create your writer account"}</h1>
      <p id="auth-subtitle" style="color:var(--muted);margin-bottom:18px;">${login ? "Enter your email and password to access your desk." : "Every member starts as a Reader. Enter your details to verify your email."}</p>
      
      <form id="auth">
        ${login ? "" : `<label>Username<input name="username" id="auth-username" autocomplete="username" placeholder="G Nihal" required minlength="3" maxlength="40" pattern="[A-Za-z0-9._\\- ]{3,40}"><small>Letters, numbers, spaces, dots, hyphens, underscores. 3–40 characters.</small></label>`}
        <label>Email<input type="email" name="email" id="auth-email" autocomplete="email" placeholder="you@example.com" required></label>
        <label>Password<input type="password" name="password" id="auth-password" autocomplete="${login ? "current-password" : "new-password"}" placeholder="••••••••" required minlength="8"><small>${login ? "" : "At least 8 characters with a letter and a number."}</small></label>

        ${login ? "" : `
          <div id="reg-otp-container" style="display:none;margin-top:14px;">
            <div id="reg-spam-note" style="margin:0 0 14px 0;padding:11px 14px;background:#fff8e1;border-left:3px solid #d4a72c;border-radius:6px;font-size:13px;line-height:1.5;color:#6b655b;">
              We sent a 6-digit verification code to your email. Can't find it? Check your <b>spam</b> folder.
            </div>
            <label>6-Digit Verification Code
              <input type="text" name="otpCode" id="reg-otp-code" placeholder="123456" maxlength="6" pattern="\\d{6}" autocomplete="one-time-code" inputmode="numeric">
              <small>Enter the code sent to your inbox.</small>
            </label>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;margin-bottom:12px;">
              <small style="color:var(--muted);">Code valid for 10 minutes</small>
              <button type="button" id="reg-resend-btn" class="link-button" style="font-size:0.82rem;color:var(--accent);">Resend code</button>
            </div>
          </div>
        `}

        <button class="button" type="submit" id="auth-submit-btn">${login ? "Sign in →" : "Send verification code →"}</button>
      </form>

      ${login ? '<p class="form-foot" style="margin-top:10px"><a href="/forgot-password">Forgot password?</a></p>' : ""}
      <p class="form-foot">${login ? 'New here? <a href="/register">Create an account</a>' : 'Already a member? <a href="/login">Sign in</a>'}</p>
    </div></section>
  </section>`);

  let otpSent = false;
  let resendCooldown = 0;
  let cooldownTimer = null;

  const startCooldown = () => {
    resendCooldown = 60;
    const resendBtn = $("#reg-resend-btn");
    if (!resendBtn) return;
    resendBtn.disabled = true;
    resendBtn.textContent = `Resend in ${resendCooldown}s`;
    clearInterval(cooldownTimer);
    cooldownTimer = setInterval(() => {
      resendCooldown--;
      if (resendCooldown <= 0) {
        clearInterval(cooldownTimer);
        resendBtn.disabled = false;
        resendBtn.textContent = "Resend code";
      } else {
        resendBtn.textContent = `Resend in ${resendCooldown}s`;
      }
    }, 1000);
  };

  $("#reg-resend-btn")?.addEventListener("click", async () => {
    if (resendCooldown > 0) return;
    const email = $("#auth-email").value.trim();
    const username = $("#auth-username")?.value.trim() || "";
    if (!email || !username) {
      toast("Please enter your username and email first.", "error");
      return;
    }
    try {
      toast("Resending verification code...");
      await api("/api/auth/register/request-otp", {
        method: "POST",
        body: JSON.stringify({ email, username }),
      });
      toast("New verification code sent!");
      startCooldown();
    } catch (err) {
      toast(err.message, "error");
    }
  });

  $("#auth").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#auth-submit-btn");
    const formData = Object.fromEntries(new FormData(e.target));

    if (login) {
      btn.disabled = true;
      btn.textContent = "Signing in…";
      try {
        const res = await api("/api/auth/login", {
          method: "POST",
          body: JSON.stringify(formData),
        });
        setSession(res);
        toast("Welcome back, " + (res.user.displayName || res.user.username));
        navigate(canWrite(res.user) ? "/editor" : "/");
      } catch (err) {
        toast(err.message, "error");
        btn.disabled = false;
        btn.textContent = "Sign in →";
      }
      return;
    }

    // REGISTRATION WITH EMAIL OTP
    if (!otpSent) {
      btn.disabled = true;
      btn.textContent = "Sending code…";
      try {
        await api("/api/auth/register/request-otp", {
          method: "POST",
          body: JSON.stringify({
            username: formData.username,
            email: formData.email,
          }),
        });
        otpSent = true;
        toast("Verification code sent! Please check your email.");
        $("#reg-otp-container").style.display = "block";
        $("#reg-otp-code").required = true;
        $("#reg-otp-code").focus();
        btn.disabled = false;
        btn.textContent = "Verify & Create Account →";
        startCooldown();
      } catch (err) {
        toast(err.message, "error");
        btn.disabled = false;
        btn.textContent = "Send verification code →";
      }
    } else {
      if (!formData.otpCode || formData.otpCode.length !== 6) {
        toast("Please enter the 6-digit verification code.", "error");
        $("#reg-otp-code").focus();
        return;
      }
      btn.disabled = true;
      btn.textContent = "Verifying & creating account…";
      try {
        const res = await api("/api/auth/register", {
          method: "POST",
          body: JSON.stringify(formData),
        });
        setSession(res);
        toast("Email verified! Welcome to InkWell, " + (res.user.displayName || res.user.username));
        navigate("/");
      } catch (err) {
        toast(err.message, "error");
        btn.disabled = false;
        btn.textContent = "Verify & Create Account →";
      }
    }
  });
}

function forgotPasswordPage() {
  updateMeta("Forgot Password — InkWell", "Reset your password.");
  shell(`<section class="auth-layout">
    <aside><a class="brand" href="/">Ink<span>Well</span></a><blockquote>"Not all those who wander are lost."<small>— J.R.R. Tolkien</small></blockquote></aside>
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
      <p class="form-foot">Remembered it? <a href="/login">Back to sign in</a></p>
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
        navigate("/login");
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
    navigate("/login");
    return;
  }
  updateMeta("Apply for an Editorial Position — InkWell", "Join the InkWell writing staff.");
  shell(`<div class="article-skeleton wrap"></div>`);
  try {
    const apps = await api("/api/editor-applications/mine").catch(() => []);
    const pendingApp = apps.find(a => a.status === "Pending");

    shell(`
      <section class="wrap narrow page-head" style="padding-top:40px;padding-bottom:20px;">
        <div class="eyebrow">Editorial Masthead</div>
        <h1>Apply for an Editorial Position</h1>
        <p>InkWell is an editorial publication built on deep curiosity, high standards, and craft. Apply to join our writing staff or request promotion to an advanced desk.</p>
        
        <div style="background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px 20px;margin:24px 0;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <small style="color:var(--muted);text-transform:uppercase;font-size:0.75rem;font-weight:700;">Your Current Standing</small>
            <div style="font-weight:700;font-size:1.1rem;color:var(--ink);">${getEditorialRole(state.user)}</div>
          </div>
          <span class="status status-${(state.user.role || '').toLowerCase().replace(' ', '-')}">${state.user.role || 'Reader'}</span>
        </div>
      </section>

      <section class="wrap narrow" style="margin-bottom:60px;">
        ${pendingApp ? `
          <div style="background:var(--soft);border:1px solid var(--accent);border-radius:12px;padding:28px;text-align:center;">
            <div style="font-size:2rem;margin-bottom:8px;">⏳</div>
            <h3 style="margin:0 0 8px;">Application Under Review</h3>
            <p style="color:var(--ink);margin:0 0 10px;">
              You applied for promotion to <b>${esc(pendingApp.requestedRole)}</b> on ${date(pendingApp.appliedAt)}.
            </p>
            <p style="color:var(--muted);font-size:0.9rem;margin:0;">
              The Founder & Editor-in-Chief is reviewing your writing pitch and portfolio. You will be updated as soon as an editorial decision is reached.
            </p>
          </div>
        ` : `
          <form id="apply-form" style="background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:28px;display:flex;flex-direction:column;gap:18px;">
            <div>
              <label style="font-weight:600;display:block;margin-bottom:6px;">Select Desired Position (Lowest to Highest)</label>
              <select name="requestedRole" style="width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:var(--paper);font-size:0.95rem;color:var(--ink);">
                <option value="Contributing Writer">Level 2: Contributing Writer — Publish articles & essays on InkWell</option>
                <option value="Featured Columnist">Level 3: Featured Columnist — Prolific long-form & series writer</option>
              </select>
            </div>

            <div>
              <label style="font-weight:600;display:block;margin-bottom:6px;">Your Writing Background & Motivation</label>
              <textarea name="motivation" rows="6" placeholder="Tell us about the topics you explore (urban planning, technology, culture, design), your writing experience, or links to published pieces..." style="width:100%;padding:12px;border:1px solid var(--line);border-radius:8px;background:var(--paper);font-size:0.95rem;line-height:1.5;color:var(--ink);"></textarea>
            </div>

            <button type="submit" class="button" style="align-self:flex-start;">Submit Application →</button>
          </form>
        `}
      </section>
    `);

    $("#apply-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const requestedRole = $("[name=requestedRole]", e.target).value;
      const motivation = $("[name=motivation]", e.target).value.trim();
      if (!motivation || motivation.length < 20) {
        toast("Please provide at least a couple of sentences explaining your writing background.", "error");
        return;
      }
      try {
        await api("/api/editor-applications", {
          method: "POST",
          body: JSON.stringify({ requestedRole, motivation })
        });
        toast("Application submitted successfully!");
        apply();
      } catch (err) {
        toast(err.message, "error");
      }
    });
  } catch (err) {
    shell(`<section class="wrap page-head">${empty("Could not load application.", "Back home", "/")}</section>`);
  }
}

function profile() {
  if (!guard()) return;
  updateMeta("Your Profile — InkWell", "Update your profile.");
  const u = state.user;
  const cur = u.profilePictureUrl || "";
  const dn = u.displayName || u.username || "";
  shell(
    `<section class="wrap profile-page"><div class="page-head" style="padding-bottom:20px"><div class="eyebrow">Identity</div><h1>Profile</h1></div><form id="profile" class="profile-form"><div class="profile-grid"><aside class="profile-avatar-col"><div class="profile-avatar" id="avatar-preview">${cur ? `<img src="${esc(cur)}" alt="">` : `<span>${(dn[0] || "U").toUpperCase()}</span>`}</div><input type="file" accept="image/*" id="profile-file" style="display:none"><input type="hidden" name="image" value="${esc(cur)}"><div class="avatar-actions"><button type="button" class="button small secondary" id="pick-image">Upload</button>${cur ? `<button type="button" class="button small danger" id="remove-image">Remove</button>` : ""}</div></aside><div class="profile-fields"><label>Display name<input name="displayName" value="${esc(dn)}"></label><label>Profession<input name="profession" value="${esc(u.profession || "")}"></label><label>Location<input name="location" value="${esc(u.location || "")}"></label><label>Website<input name="website" value="${esc(u.website || "")}"></label><label>Twitter / X<input name="twitterHandle" value="${esc(u.twitterHandle || "")}"></label><label>LinkedIn<input name="linkedinUrl" value="${esc(u.linkedInUrl || "")}"></label><label>Bio<textarea name="bio">${esc(u.bio || "")}</textarea></label><div class="form-actions"><button class="button" type="submit">Save</button><a class="button secondary" href="/author/${u.id}">View public</a></div></div></div></form></section>`,
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
  if (!getCached(`/api/authors/${id}`)) {
    shell(`<div class="article-skeleton wrap"></div>`);
  }
  try {
    const d = await api(`/api/authors/${id}`);
    const u = d.author;
    const name = u.displayName || u.username;
    const roleTitle = getEditorialRole(u, "both");
    updateMeta(`${name} (${roleTitle}) — InkWell`, u.bio || `Read articles and series by ${name} on InkWell.`);

    const meta = [u.profession, u.studies, u.location]
      .filter(Boolean)
      .join(" · ");

    const seriesHtml = d.series && d.series.length > 0 ? `
      <section class="wrap" style="margin-bottom: 48px;">
        <div class="section-heading">
          <div>
            <div class="eyebrow">Anthologies & Investigations</div>
            <h2>Series by ${esc(name)}</h2>
          </div>
        </div>
        <div class="series-grid">
          ${d.series.map((s) => `
            <a class="series-card fade-in-up" href="/series/${esc(s.slug)}">
              <div class="series-card-cover">
                <span class="series-chapter-badge">${s.partsCount} ${s.partsCount === 1 ? 'Chapter' : 'Chapters'}</span>
                ${s.coverImageUrl ? `<img loading="lazy" src="${esc(s.coverImageUrl)}" alt="${esc(s.title)}">` : `<div style="width:100%;height:100%;background:var(--soft);display:flex;align-items:center;justify-content:center;font-size:2.5rem;color:var(--accent);">✦</div>`}
              </div>
              <div class="series-card-body">
                <div style="font-size:0.8rem;color:var(--muted);margin-bottom:6px;">
                  By ${esc(name)} · ${s.partsCount} ${s.partsCount === 1 ? 'Part' : 'Parts'} · ${s.totalReadingTimeMinutes} min total read
                </div>
                <h3 class="series-card-title">${esc(s.title)}</h3>
                <p class="series-card-desc">${esc(s.description || "")}</p>
                <div class="series-card-footer">
                  <span>Explore full series</span>
                  <span>→</span>
                </div>
              </div>
            </a>
          `).join("")}
        </div>
      </section>
    ` : "";

    shell(`
      <section class="wrap page-head" id="author">
        <span class="mini-avatar large">${avatarImg(u)}</span>
        <div class="eyebrow">${roleTitle}</div>
        <h1>${esc(name)}</h1>
        ${meta ? `<p class="author-meta">${esc(meta)}</p>` : ""}
        <p>${esc(u.bio || "Contributing writer at InkWell.")}</p>
        ${u.website || u.linkedInUrl || u.twitterHandle ? `
          <div style="display:flex;gap:14px;margin-top:12px;font-size:13px;font-weight:600;">
            ${u.website ? `<a href="${esc(u.website)}" target="_blank" rel="noopener" style="color:var(--accent);">Website ↗</a>` : ""}
            ${u.linkedInUrl ? `<a href="${esc(u.linkedInUrl)}" target="_blank" rel="noopener" style="color:var(--accent);">LinkedIn ↗</a>` : ""}
            ${u.twitterHandle ? `<a href="https://twitter.com/${esc(u.twitterHandle.replace('@',''))}" target="_blank" rel="noopener" style="color:var(--accent);">X ↗</a>` : ""}
          </div>
        ` : ""}
      </section>

      ${seriesHtml}

      <section class="wrap">
        <div class="section-heading">
          <div>
            <div class="eyebrow">Public Library</div>
            <h2>Articles by ${esc(name)}</h2>
          </div>
        </div>
        <div class="post-grid" id="posts">
          ${d.posts && d.posts.length ? d.posts.map(card).join("") : empty("No articles published yet.", "Explore library", "/")}
        </div>
      </section>
    `);
  } catch (err) {
    shell(`<section class="wrap page-head">${empty("Author profile not found.", "Back home", "/")}</section>`);
  }
}

// ==================== EDITOR & ADMIN ====================
async function editor() {
  if (!guard(["Admin", "Senior Editor", "Staff Editor", "Contributing Writer", "Editor"])) {
    toast("Apply to join our writing staff to access the editorial desk.");
    navigate("/apply");
    return;
  }
  updateMeta("Dashboard — InkWell", "Your writing desk.");
  shell(
    `<section class="wrap dashboard"><div class="dashboard-head"><div><div class="eyebrow">Your writing desk</div><h1>Hello, ${esc(state.user.displayName || state.user.username)}.</h1></div><a class="button" href="/editor/new">New article +</a></div><div class="stats" id="editor-stats"></div><div class="table-wrap"><div class="section-heading"><h2>Your articles</h2></div><div id="my-posts"></div></div></section>`,
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
    ? `<table><thead><tr><th>Story</th><th>Status</th><th>Updated</th><th></th></tr></thead><tbody>${posts.map((p) => `<tr><td><b>${esc(p.title)}</b>${p.rejectionReason ? `<small class="reject">Returned: ${esc(p.rejectionReason)}</small>` : ""}</td><td><span class="status ${p.status.toLowerCase()}">● ${p.status.replace("Review", " review")}</span></td><td>${date(p.updatedAt)}</td><td><a href="/editor/edit/${p.id}">Edit →</a> <button class="link-button delete-own-post" data-id="${p.id}" style="color:var(--danger);margin-left:8px">Delete</button></td></tr>`).join("")}</tbody></table>`
    : empty("Start a first draft.", "Write article", "/editor/new");
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
  if (!guard(["Admin", "Senior Editor", "Staff Editor", "Contributing Writer", "Editor"])) {
    toast("Apply to join our writing staff to compose articles.");
    navigate("/apply");
    return;
  }
  updateMeta("Write an Article — InkWell", "Compose your next story.");
  const [post, seriesList] = await Promise.all([
    id
      ? api(`/api/posts/mine/${id}`)
      : Promise.resolve({
          title: "",
          content: "",
          mainImageUrl: "",
          categories: [],
          tags: [],
          images: [],
          seriesId: null,
          seriesOrder: null,
        }),
    api("/api/series").catch(() => []),
  ]);
  const curImg = post.mainImageUrl || "";

  shell(`
    <section class="editor-page wrap">
      <div class="editor-top">
        <a href="/editor">← Dashboard</a>
        <div>
          <button class="button secondary" id="toggle-preview">Preview</button>
          <button class="button secondary" id="save">Save draft</button>
          <button class="button" id="submit">${state.user.role === "Admin" ? "Publish" : "Submit for review"} →</button>
        </div>
      </div>
      <div class="editor-grid">
        <section>
          <input class="title-input" name="title" value="${esc(post.title)}" placeholder="An unforgettable title">
          <div class="composer-toolbar">
            <button type="button" data-md="bold"><b>B</b></button>
            <button type="button" data-md="italic"><i>I</i></button>
            <button type="button" data-md="link">🔗</button>
            <button type="button" data-md="quote">"</button>
            <button type="button" data-md="image">📷 Image</button>
          </div>
          <input type="file" accept="image/*" id="inline-file" style="display:none">
          
          <textarea class="writing-area" name="content" placeholder="Start writing…\n\nMarkdown is welcome.">${esc(post.content)}</textarea>
          
          <!-- LIVE PREVIEW DIV -->
          <div id="editor-preview" style="display:none; border: 1px solid var(--line); padding: 32px; background: var(--surface); min-height: 620px; overflow-y:auto; border-radius: 12px; max-width: 100%;">
            <div class="article-content" id="preview-content" style="padding-bottom: 0; max-width: 800px; margin: 0 auto;"></div>
          </div>
        </section>
        
        <aside class="meta">
          <h2>Story details</h2>
          <label>Cover image <span style="color:var(--danger)">*</span><input type="file" accept="image/*" id="cover-file"><input type="hidden" name="image" value="${esc(curImg)}"></label>
          <div class="image-preview" id="cover-preview">${curImg ? `<img src="${esc(curImg)}" alt="">` : "<span>No cover</span>"}</div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;margin-bottom:6px;">
            <label style="margin:0;font-size:14px;font-weight:600;">Part of a Series? (Optional)</label>
            <button type="button" class="link-button" id="btn-quick-new-series" style="color:var(--accent);font-size:12px;font-weight:700;">+ New Series</button>
          </div>
          <select name="seriesId" id="series-select" style="width:100%;padding:9px 12px;border:1px solid var(--line);border-radius:8px;background:var(--paper);color:var(--ink);margin-bottom:10px;">
            <option value="">None (Standalone Article)</option>
            ${seriesList.map((s) => `<option value="${s.id}" ${post.seriesId === s.id ? 'selected' : ''}>${esc(s.title)}</option>`).join("")}
          </select>

          <!-- INLINE QUICK CREATE SERIES FORM -->
          <div id="quick-series-form" style="display:none;background:var(--surface);border:1px solid var(--accent);border-radius:10px;padding:14px;margin-bottom:14px;">
            <b style="font-size:13px;display:block;margin-bottom:8px;color:var(--accent);">Create New Multi-Part Series</b>
            <label style="font-size:12px;">Series Title <span style="color:var(--danger)">*</span>
              <input type="text" id="quick-series-title" placeholder="e.g., Bengaluru's Transit Revolution" style="padding:6px 8px;font-size:13px;margin-bottom:8px;">
            </label>
            <label style="font-size:12px;">Premise / Description
              <textarea id="quick-series-desc" rows="2" placeholder="Brief synopsis of this series..." style="padding:6px 8px;font-size:12px;margin-bottom:8px;"></textarea>
            </label>
            <label style="font-size:12px;">Series Cover Image (Optional)
              <input type="file" accept="image/*" id="quick-series-file" style="font-size:12px;margin-bottom:10px;">
            </label>
            <div style="display:flex;gap:8px;">
              <button type="button" class="button small" id="quick-series-submit-btn" style="padding:6px 12px;font-size:12px;">Create & Link</button>
              <button type="button" class="button small secondary" id="quick-series-cancel-btn" style="padding:6px 12px;font-size:12px;">Cancel</button>
            </div>
          </div>

          <div id="series-order-wrap" style="${post.seriesId ? '' : 'display:none;'}">
            <label>Series Chapter Number
              <input type="number" min="1" max="100" name="seriesOrder" value="${post.seriesOrder || 1}">
            </label>
          </div>
          <label>Categories <input name="categories" value="${esc(post.categories.join(", "))}" placeholder="Culture, Design"></label>
          <label>Tags <input name="tags" value="${esc(post.tags.join(", "))}" placeholder="writing, ideas"></label>
        </aside>
      </div>
    </section>
  `);

  const fields = {
    title: $("[name=title]"),
    content: $("[name=content]"),
    image: $("[name=image]"),
    categories: $("[name=categories]"),
    tags: $("[name=tags]"),
    seriesId: $("[name=seriesId]"),
    seriesOrder: $("[name=seriesOrder]"),
  };
  const inlineFile = $("#inline-file");
  const previewDiv = $("#editor-preview");
  const previewContent = $("#preview-content");
  const textarea = $("[name=content]");
  let previewMode = false;

  $("#toggle-preview")?.addEventListener("click", () => {
    previewMode = !previewMode;
    if (previewMode) {
      textarea.style.display = "none";
      previewDiv.style.display = "block";
      // Render the markdown into the article-content container
      previewContent.innerHTML =
        markdown(textarea.value) ||
        "<p style='color:var(--muted)'>Nothing to preview yet…</p>";
      $("#toggle-preview").textContent = "Edit";
    } else {
      textarea.style.display = "block";
      previewDiv.style.display = "none";
      $("#toggle-preview").textContent = "Preview";
    }
  });

  textarea.addEventListener("input", () => {
    if (previewMode) previewContent.innerHTML = markdown(textarea.value);
  });

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

  fields.seriesId?.addEventListener("change", (e) => {
    const wrap = $("#series-order-wrap");
    if (wrap) wrap.style.display = e.target.value ? "block" : "none";
  });

  // Quick Inline Series Creation within Composer
  $("#btn-quick-new-series")?.addEventListener("click", () => {
    const form = $("#quick-series-form");
    if (form) {
      form.style.display = form.style.display === "none" ? "block" : "none";
      if (form.style.display === "block") $("#quick-series-title")?.focus();
    }
  });

  $("#quick-series-cancel-btn")?.addEventListener("click", () => {
    const form = $("#quick-series-form");
    if (form) form.style.display = "none";
  });

  $("#quick-series-submit-btn")?.addEventListener("click", async () => {
    const title = $("#quick-series-title")?.value.trim();
    const desc = $("#quick-series-desc")?.value.trim();
    const file = $("#quick-series-file")?.files?.[0];

    if (!title) {
      toast("Series title is required", "error");
      return;
    }

    const submitBtn = $("#quick-series-submit-btn");
    submitBtn.disabled = true;
    submitBtn.textContent = "Creating...";

    try {
      let coverUrl = null;
      if (file) {
        toast("Uploading series cover...");
        coverUrl = await uploadImage(file);
      }

      const res = await api("/api/series", {
        method: "POST",
        body: JSON.stringify({
          title,
          description: desc,
          coverImageUrl: coverUrl,
        }),
      });

      const newSeries = res.series;
      const select = $("[name=seriesId]");
      const opt = document.createElement("option");
      opt.value = newSeries.id;
      opt.textContent = newSeries.title;
      opt.selected = true;
      select.appendChild(opt);

      const orderWrap = $("#series-order-wrap");
      if (orderWrap) orderWrap.style.display = "block";
      const orderInput = $("[name=seriesOrder]");
      if (orderInput && (!orderInput.value || orderInput.value === "0")) orderInput.value = "1";

      $("#quick-series-form").style.display = "none";
      toast(`Series "${newSeries.title}" created & linked!`);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Create & Link";
    }
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
        seriesId: fields.seriesId?.value ? parseInt(fields.seriesId.value, 10) : null,
        seriesOrder: fields.seriesId?.value && fields.seriesOrder?.value ? parseInt(fields.seriesOrder.value, 10) : null,
        saveAsDraft: draft,
      }),
    });
    if (!draft) navigate("/editor");
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
  updateMeta("Admin Panel — InkWell", "Editorial control room.");
  shell(
    `<section class="wrap dashboard"><div class="dashboard-head"><div><div class="eyebrow">Editorial control room</div><h1>Good morning, editor.</h1></div></div><div class="stats" id="admin-stats"></div><div class="admin-tabs"><button class="active" data-tab="posts">Pending posts</button><button data-tab="spotlight">Homepage Spotlight ✦</button><button data-tab="series">Series Manager</button><button data-tab="applications">Editor applications</button><button data-tab="users">Community</button></div><div id="admin-content" class="table-wrap"></div></section>`,
  );
  const [stats, posts, applications, users] = await Promise.all([
    api("/api/admin/stats"),
    api("/api/admin/pending-posts"),
    api("/api/admin/applications"),
    api("/api/admin/users"),
  ]);
  $("#admin-stats").innerHTML = [
    [stats.pendingPosts, "Articles to review"],
    [stats.pendingApplications, "Applications"],
    [stats.published, "Published"],
    [stats.editors, "Editors"],
  ]
    .map((x) => `<div><b>${x[0]}</b><span>${x[1]}</span></div>`)
    .join("");

  const renderTab = async (t) => {
    const out = $("#admin-content");
    if (t === "posts") {
      out.innerHTML = posts.length
        ? posts
            .map(
              (p) =>
                `<article class="review"><div><div class="eyebrow">${esc(p.author.displayName || p.author.username)} · ${date(p.createdAt)}</div><h2>${esc(p.title)}</h2><p>${esc(p.excerpt)}</p><button class="link-button danger-link delete-post" data-id="${p.id}" style="color:var(--danger)">Delete</button></div><div class="review-actions"><button class="button approve" data-id="${p.id}">Approve</button><button class="button danger reject-post" data-id="${p.id}">Return</button></div></article>`,
            )
            .join("")
        : empty("Nothing waiting.", "Home", "/");
      bindAdmin();
    } else if (t === "spotlight") {
      out.innerHTML = `<div class="skeleton" style="height:260px;"></div>`;
      try {
        const featData = await api("/api/admin/featured");
        let currentSpotlight = [...(featData.items || [])];

        const renderSpotlightAdmin = () => {
          out.innerHTML = `
            <div class="admin-spotlight-wrapper">
              <div class="drag-queue-container">
                <div class="drag-queue-header">
                  <div>
                    <h3>Homepage Spotlight Showcase</h3>
                    <p style="color:var(--muted);font-size:0.85rem;margin:4px 0 0;">
                      Drag & drop cards using the grab handle (⠿) or use the arrows to reorder. Click "Save Order" to update the live homepage.
                    </p>
                  </div>
                  <button class="button small" id="save-spotlight-btn">Save Order</button>
                </div>
                <div class="drag-queue-list" id="spotlight-queue">
                  ${currentSpotlight.length === 0 ? `<div style="padding:28px;text-align:center;color:var(--muted);">No items featured yet. Select an article or series on the right to add!</div>` : currentSpotlight.map((it, idx) => `
                    <div class="admin-drag-item" draggable="true" data-index="${idx}">
                      <span class="drag-handle" title="Drag to reorder">⠿</span>
                      ${it.imageUrl ? `<img class="drag-item-thumb" src="${esc(it.imageUrl)}">` : `<div class="drag-item-thumb"></div>`}
                      <div class="drag-item-info">
                        <div>
                          <span class="drag-item-type ${it.itemType === 'Series' ? 'type-series' : ''}">${it.itemType}</span>
                          <span class="drag-item-title">${esc(it.title)}</span>
                        </div>
                        <div class="drag-item-author">By ${esc(it.author || "Editorial")}</div>
                      </div>
                      <div class="drag-item-actions">
                        <button class="drag-btn-move" data-action="up" data-index="${idx}" title="Move up" ${idx === 0 ? 'disabled style="opacity:0.3"' : ''}>▲</button>
                        <button class="drag-btn-move" data-action="down" data-index="${idx}" title="Move down" ${idx === currentSpotlight.length - 1 ? 'disabled style="opacity:0.3"' : ''}>▼</button>
                        <button class="drag-btn-delete" data-action="delete" data-index="${idx}" title="Remove from Spotlight">×</button>
                      </div>
                    </div>
                  `).join("")}
                </div>
              </div>

              <div class="spotlight-picker-box">
                <h3>Add to Spotlight</h3>
                <p style="color:var(--muted);font-size:0.85rem;margin:0 0 14px;">Select an article or multi-part series to showcase on the homepage.</p>
                <select id="spotlight-item-select">
                  ${(featData.availableSeries && featData.availableSeries.length) ? `
                    <optgroup label="Multi-Part Series">
                      ${featData.availableSeries.map(s => `<option value="Series:${s.id}">${esc(s.title)} (${s.partsCount} parts)</option>`).join('')}
                    </optgroup>
                  ` : ''}
                  ${(featData.availablePosts && featData.availablePosts.length) ? `
                    <optgroup label="Published Articles">
                      ${featData.availablePosts.map(p => `<option value="Post:${p.id}">${esc(p.title)} — by ${esc(p.author)}</option>`).join('')}
                    </optgroup>
                  ` : ''}
                </select>
                <button class="button secondary small" id="add-to-spotlight-btn" style="width:100%;">+ Add to Showcase</button>
              </div>
            </div>
          `;

          // Add to spotlight
          $("#add-to-spotlight-btn")?.addEventListener("click", () => {
            const val = $("#spotlight-item-select")?.value;
            if (!val) return;
            const [type, strId] = val.split(":");
            const itemId = parseInt(strId, 10);
            if (currentSpotlight.some(x => x.itemType === type && x.itemId === itemId)) {
              toast("Item is already in spotlight queue", "error");
              return;
            }
            if (type === "Series") {
              const s = featData.availableSeries.find(x => x.id === itemId);
              if (s) currentSpotlight.push({ itemType: "Series", itemId: s.id, title: s.title, author: s.author, imageUrl: s.imageUrl, partsCount: s.partsCount });
            } else {
              const p = featData.availablePosts.find(x => x.id === itemId);
              if (p) currentSpotlight.push({ itemType: "Post", itemId: p.id, title: p.title, author: p.author, imageUrl: p.imageUrl });
            }
            renderSpotlightAdmin();
            toast("Added to queue. Remember to Save Order!");
          });

          // Save spotlight order
          $("#save-spotlight-btn")?.addEventListener("click", async () => {
            const btn = $("#save-spotlight-btn");
            btn.disabled = true;
            btn.textContent = "Saving...";
            try {
              await api("/api/admin/featured", {
                method: "PUT",
                body: JSON.stringify({
                  items: currentSpotlight.map(x => ({ itemType: x.itemType, itemId: x.itemId }))
                })
              });
              toast("Homepage spotlight order saved successfully!");
            } catch (err) {
              toast(err.message, "error");
            } finally {
              btn.disabled = false;
              btn.textContent = "Save Order";
            }
          });

          // Move up / down / delete
          $$(".drag-btn-move", out).forEach(btn => {
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              const idx = parseInt(btn.dataset.index, 10);
              const act = btn.dataset.action;
              if (act === "up" && idx > 0) {
                const temp = currentSpotlight[idx - 1];
                currentSpotlight[idx - 1] = currentSpotlight[idx];
                currentSpotlight[idx] = temp;
                renderSpotlightAdmin();
              } else if (act === "down" && idx < currentSpotlight.length - 1) {
                const temp = currentSpotlight[idx + 1];
                currentSpotlight[idx + 1] = currentSpotlight[idx];
                currentSpotlight[idx] = temp;
                renderSpotlightAdmin();
              }
            });
          });

          $$(".drag-btn-delete", out).forEach(btn => {
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              const idx = parseInt(btn.dataset.index, 10);
              currentSpotlight.splice(idx, 1);
              renderSpotlightAdmin();
            });
          });

          // HTML5 Drag and Drop Handlers
          let dragSrcIdx = -1;
          const dragEls = $$(".admin-drag-item", out);
          dragEls.forEach(el => {
            el.addEventListener("dragstart", (e) => {
              dragSrcIdx = parseInt(el.dataset.index, 10);
              el.classList.add("dragging");
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", dragSrcIdx);
            });
            el.addEventListener("dragend", () => {
              el.classList.remove("dragging");
              dragEls.forEach(x => x.classList.remove("drag-over"));
            });
            el.addEventListener("dragover", (e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              el.classList.add("drag-over");
            });
            el.addEventListener("dragleave", () => {
              el.classList.remove("drag-over");
            });
            el.addEventListener("drop", (e) => {
              e.preventDefault();
              el.classList.remove("drag-over");
              const targetIdx = parseInt(el.dataset.index, 10);
              if (dragSrcIdx === -1 || dragSrcIdx === targetIdx) return;
              const [draggedItem] = currentSpotlight.splice(dragSrcIdx, 1);
              currentSpotlight.splice(targetIdx, 0, draggedItem);
              renderSpotlightAdmin();
            });
          });
        };

        renderSpotlightAdmin();
      } catch (err) {
        out.innerHTML = empty("Failed to load spotlight settings.", "Retry", "/admin");
      }
    } else if (t === "series") {
      out.innerHTML = `<div class="skeleton" style="height:260px;"></div>`;
      try {
        const seriesList = await api("/api/series");
        out.innerHTML = `
          <div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
              <div>
                <h3 style="margin:0;">Multi-Part Series Catalog</h3>
                <p style="color:var(--muted);font-size:0.85rem;margin:4px 0 0;">Create and organize long-form investigative series.</p>
              </div>
              <button class="button small" id="btn-create-series">+ Create New Series</button>
            </div>

            <!-- CREATE SERIES FORM -->
            <div id="series-create-form" style="display:none;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:24px;margin-bottom:24px;">
              <h4 style="margin:0 0 16px;">Create a New Series</h4>
              <div style="display:flex;flex-direction:column;gap:12px;">
                <label>Series Title <span style="color:var(--danger)">*</span>
                  <input type="text" id="new-series-title" placeholder="e.g., Bengaluru's Transit Revolution">
                </label>
                <label>Description / Premise
                  <textarea id="new-series-desc" rows="3" placeholder="A multi-part study exploring transit infrastructure, metro tunneling, and last-mile connectivity..."></textarea>
                </label>
                <label>Cover Image URL (or upload file below)
                  <input type="text" id="new-series-cover" placeholder="https://res.cloudinary.com/...">
                </label>
                <label>Upload Cover Image File
                  <input type="file" accept="image/*" id="new-series-file">
                </label>
                <div style="display:flex;gap:10px;margin-top:8px;">
                  <button class="button small" id="submit-new-series">Create Series</button>
                  <button class="button small secondary" id="cancel-new-series">Cancel</button>
                </div>
              </div>
            </div>

            <div class="series-admin-grid">
              ${seriesList.length === 0 ? `<div style="grid-column:1/-1;text-align:center;padding:32px;color:var(--muted);">No series created yet. Click "+ Create New Series" above!</div>` : seriesList.map(s => `
                <div class="series-admin-card">
                  <div style="display:flex;gap:12px;margin-bottom:12px;">
                    ${s.coverImageUrl ? `<img src="${esc(s.coverImageUrl)}" style="width:70px;height:50px;object-fit:cover;border-radius:6px;background:var(--soft);">` : `<div style="width:70px;height:50px;background:var(--soft);border-radius:6px;display:flex;align-items:center;justify-content:center;color:var(--accent);">✦</div>`}
                    <div style="flex:1;min-width:0;">
                      <h4 style="margin:0 0 4px;font-size:0.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(s.title)}</h4>
                      <small style="color:var(--muted);">${s.partsCount} ${s.partsCount === 1 ? 'part' : 'parts'} · By ${esc(s.author?.displayName || s.author?.username)}</small>
                    </div>
                  </div>
                  <p>${esc(s.description || "No description provided.")}</p>
                  <div class="series-admin-card-actions">
                    <a href="/series/${esc(s.slug)}" target="_blank" style="color:var(--accent);font-weight:600;">View Page ↗</a>
                    <button class="link-button danger-link delete-series-btn" data-id="${s.id}" style="color:var(--danger)">Delete</button>
                  </div>
                </div>
              `).join("")}
            </div>
          </div>
        `;

        $("#btn-create-series")?.addEventListener("click", () => {
          $("#series-create-form").style.display = "block";
          $("#new-series-title").focus();
        });
        $("#cancel-new-series")?.addEventListener("click", () => {
          $("#series-create-form").style.display = "none";
        });

        $("#new-series-file")?.addEventListener("change", async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            toast("Uploading cover image...");
            const url = await uploadImage(file);
            $("#new-series-cover").value = url;
            toast("Cover image uploaded!");
          } catch (err) {
            toast(err.message, "error");
          }
        });

        $("#submit-new-series")?.addEventListener("click", async () => {
          const title = $("#new-series-title").value.trim();
          const desc = $("#new-series-desc").value.trim();
          const cover = $("#new-series-cover").value.trim();
          if (!title) {
            toast("Series title is required", "error");
            return;
          }
          try {
            await api("/api/series", {
              method: "POST",
              body: JSON.stringify({
                title,
                description: desc,
                coverImageUrl: cover || null
              })
            });
            toast("Series created successfully!");
            renderTab("series");
          } catch (err) {
            toast(err.message, "error");
          }
        });

        $$(".delete-series-btn", out).forEach(btn => {
          btn.addEventListener("click", async () => {
            if (!confirm("Are you sure you want to delete this series? Articles in it will NOT be deleted, only unlinked.")) return;
            try {
              await api(`/api/series/${btn.dataset.id}`, { method: "DELETE" });
              toast("Series deleted");
              renderTab("series");
            } catch (err) {
              toast(err.message, "error");
            }
          });
        });
      } catch (err) {
        out.innerHTML = empty("Failed to load series catalog.", "Retry", "/admin");
      }
    } else if (t === "applications") {
      const pending = applications.filter((a) => a.status === "Pending");
      const past = applications.filter((a) => a.status !== "Pending");

      if (applications.length === 0) {
        out.innerHTML = empty("No promotion applications submitted yet.", "Home", "/");
      } else {
        out.innerHTML = `
          <div>
            <div style="margin-bottom:20px;">
              <h3 style="margin:0 0 4px;">Editorial Promotion Applications (${pending.length} Pending)</h3>
              <p style="color:var(--muted);font-size:0.85rem;margin:0;">
                Review contributor and editor promotion requests. You can grant the requested tier, assign a different masthead position, or decline.
              </p>
            </div>

            ${pending.length === 0 ? `<div style="padding:24px;background:var(--soft);border-radius:10px;text-align:center;color:var(--muted);margin-bottom:24px;">No applications currently awaiting review.</div>` : `
              <div style="display:flex;flex-direction:column;gap:18px;margin-bottom:32px;">
                ${pending.map(a => {
                  const applicantName = a.applicant?.displayName || a.applicant?.username || "Applicant";
                  const applicantUsername = a.applicant?.username || "";
                  const currentRole = a.currentRole || a.applicant?.role || "Reader";
                  const reqRole = a.requestedRole || "Contributing Writer";
                  return `
                    <article class="review" style="background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:22px;">
                      <div style="flex:1;">
                        <div class="eyebrow" style="margin-bottom:6px;">
                          <b>${esc(applicantName)}</b> (@${esc(applicantUsername)}) · Applied ${date(a.appliedAt)}
                        </div>
                        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap;">
                          <span style="font-size:0.8rem;color:var(--muted);">Current Standing:</span>
                          <span class="status status-${esc(currentRole.toLowerCase().replace(/\s+/g, '-'))}">${esc(currentRole)}</span>
                          <span style="font-size:0.8rem;color:var(--muted);">→ Requested:</span>
                          <span style="font-size:0.82rem;font-weight:700;color:var(--accent);background:var(--soft);padding:3px 10px;border-radius:999px;border:1px solid var(--line);">${esc(reqRole)}</span>
                        </div>
                        <blockquote style="border-left:3px solid var(--accent);margin:12px 0;padding:10px 16px;background:var(--paper);border-radius:0 8px 8px 0;font-style:italic;color:var(--ink);line-height:1.6;">
                          "${esc(a.motivation)}"
                        </blockquote>
                        ${a.applicant?.bio ? `<div style="font-size:0.82rem;color:var(--muted);margin-top:6px;">Bio: ${esc(a.applicant.bio)}</div>` : ''}
                      </div>
                      <div class="review-actions" style="display:flex;flex-direction:column;gap:10px;min-width:220px;">
                        <label style="font-size:0.75rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;">Position to Assign</label>
                        <select class="app-assign-select" id="app-assign-${a.id}">
                          <option value="Contributing Writer" ${reqRole === 'Contributing Writer' ? 'selected' : ''}>Contributing Writer (Level 2)</option>
                          <option value="Featured Columnist" ${reqRole === 'Featured Columnist' ? 'selected' : ''}>Featured Columnist (Level 3)</option>
                          <option value="Admin" ${reqRole === 'Admin' ? 'selected' : ''}>Admin (Founder & Publisher)</option>
                        </select>
                        <div style="display:flex;gap:8px;width:100%;margin-top:4px;">
                          <button class="button small approve-app" data-id="${a.id}" style="flex:1;">Approve</button>
                          <button class="button small danger reject-app" data-id="${a.id}">Decline</button>
                        </div>
                      </div>
                    </article>
                  `;
                }).join("")}
              </div>
            `}

            ${past.length > 0 ? `
              <div style="margin-top:32px;border-top:1px solid var(--line);padding-top:20px;">
                <h4 style="margin:0 0 12px;color:var(--muted);">Past Application Decisions (${past.length})</h4>
                <div style="display:flex;flex-direction:column;gap:10px;">
                  ${past.map(p => `
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:var(--soft);border-radius:8px;font-size:0.88rem;">
                      <div>
                        <b>${esc(p.applicant?.displayName || p.applicant?.username || "Applicant")}</b> 
                        <span style="color:var(--muted);font-size:0.8rem;">(@${esc(p.applicant?.username || "")}) · ${date(p.reviewedAt || p.appliedAt)}</span>
                        ${p.reviewNotes ? `<span style="display:block;font-size:0.8rem;color:var(--muted);font-style:italic;margin-top:2px;">Note: ${esc(p.reviewNotes)}</span>` : ''}
                      </div>
                      <div style="display:flex;align-items:center;gap:10px;">
                        <span style="font-size:0.8rem;color:var(--muted);">Requested: ${esc(p.requestedRole || 'Writer')}</span>
                        <span class="status status-${(p.status || '').toLowerCase()}">${esc(p.status)}</span>
                      </div>
                    </div>
                  `).join("")}
                </div>
              </div>
            ` : ''}
          </div>
        `;
      }
      bindAdmin();
    } else {
      out.innerHTML = `
        <div>
          <div style="margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
            <div>
              <h3 style="margin:0 0 4px;">Editorial Community & Masthead Roster</h3>
              <p style="color:var(--muted);font-size:0.85rem;margin:0;">
                Directly manage user roles and promotion levels across InkWell's 5-tier masthead hierarchy.
              </p>
            </div>
            <div style="font-size:0.82rem;background:var(--soft);padding:6px 14px;border-radius:8px;border:1px solid var(--line);color:var(--muted);">
              Total Members: <b style="color:var(--ink);">${users.length}</b>
            </div>
          </div>

          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr>
                <th style="padding:12px 14px;">Member / Identity</th>
                <th style="padding:12px 14px;">Current Masthead Title</th>
                <th style="padding:12px 14px;">Role Level</th>
                <th style="padding:12px 14px;min-width:200px;">Change Role Permission</th>
              </tr>
            </thead>
            <tbody>
              ${users.map((u) => {
                const isMainAdmin = u.username === "editorial_admin" || (u.displayName === "G Nihal" && u.role === "Admin") || u.id === 1;
                const editorialTitle = isMainAdmin ? "Founder & Publisher" : getEditorialRole(u, "community");
                const memberName = u.displayName || u.username;
                const roleClass = (u.role || "Reader").toLowerCase().replace(/\s+/g, "-");
                
                return `
                  <tr style="border-bottom:1px solid var(--line);">
                    <td style="padding:14px;">
                      <div style="display:flex;align-items:center;gap:12px;">
                        <div style="width:38px;height:38px;border-radius:50%;background:var(--soft);display:flex;align-items:center;justify-content:center;font-weight:700;color:var(--accent);font-size:0.9rem;border:1px solid var(--line);overflow:hidden;">
                          ${u.profilePictureUrl ? `<img src="${esc(u.profilePictureUrl)}" style="width:100%;height:100%;object-fit:cover;">` : initials(u)}
                        </div>
                        <div>
                          <div style="display:flex;align-items:center;gap:6px;">
                            <b style="font-size:0.95rem;color:var(--ink);">${esc(memberName)}</b>
                            ${isMainAdmin ? `<span style="background:var(--accent);color:#fff;font-size:0.65rem;font-weight:700;padding:2px 8px;border-radius:4px;letter-spacing:0.5px;text-transform:uppercase;">FOUNDER & PUBLISHER</span>` : ''}
                          </div>
                          <small style="color:var(--muted);font-size:0.8rem;display:block;margin-top:2px;">
                            @${esc(u.username)} · ${esc(u.email || "")}
                          </small>
                        </div>
                      </div>
                    </td>
                    <td style="padding:14px;">
                      <div style="font-weight:600;font-size:0.9rem;color:var(--ink);">${esc(editorialTitle)}</div>
                      <small style="color:var(--muted);font-size:0.75rem;">${esc(u.profession || "Editorial Contributor")}</small>
                    </td>
                    <td style="padding:14px;">
                      <span class="status status-${roleClass}" id="user-role-badge-${u.id}">
                        ${esc(u.role || "Reader")}
                      </span>
                    </td>
                    <td style="padding:14px;">
                      ${isMainAdmin ? `
                        <span style="font-size:0.82rem;color:var(--muted);font-style:italic;">Founder & Publisher</span>
                      ` : `
                        <select class="user-role-select" data-id="${u.id}" data-name="${esc(memberName)}" data-prev-role="${esc(u.role || 'Reader')}">
                          <option value="Reader" ${u.role === 'Reader' ? 'selected' : ''}>Reader (Level 1)</option>
                          <option value="Contributing Writer" ${u.role === 'Contributing Writer' || u.role === 'Editor' || u.role === 'Staff Editor' ? 'selected' : ''}>Contributing Writer (Level 2)</option>
                          <option value="Featured Columnist" ${u.role === 'Featured Columnist' || u.role === 'Senior Editor' ? 'selected' : ''}>Featured Columnist (Level 3)</option>
                          <option value="Admin" ${u.role === 'Admin' ? 'selected' : ''}>Admin (Founder & Publisher)</option>
                        </select>
                      `}
                    </td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      `;
      bindAdmin();
    }
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
    $$(".approve-app").forEach((b) => {
      b.onclick = async () => {
        const id = b.dataset.id;
        const assignSelect = $(`#app-assign-${id}`);
        const assignedRole = assignSelect ? assignSelect.value : "Contributing Writer";
        try {
          b.disabled = true;
          b.textContent = "Approving...";
          const res = await api(`/api/admin/applications/${id}/review`, {
            method: "POST",
            body: JSON.stringify({ action: "Approve", assignedRole }),
          });
          toast(res.message || `Application approved. Assigned ${assignedRole}!`);
          admin();
        } catch (e) {
          toast(e.message, "error");
          b.disabled = false;
          b.textContent = "Approve";
        }
      };
    });
    $$(".reject-app").forEach((b) => {
      b.onclick = async () => {
        const id = b.dataset.id;
        const note = prompt("Decline reason or feedback for applicant (optional):");
        if (note === null) return;
        try {
          b.disabled = true;
          b.textContent = "Declining...";
          const res = await api(`/api/admin/applications/${id}/review`, {
            method: "POST",
            body: JSON.stringify({ action: "Reject", comments: note || "Application declined by the editorial desk." }),
          });
          toast(res.message || "Application declined.");
          admin();
        } catch (e) {
          toast(e.message, "error");
          b.disabled = false;
          b.textContent = "Decline";
        }
      };
    });
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
    $$(".user-role-select", $("#admin-content")).forEach((sel) => {
      sel.onchange = async (e) => {
        const userId = e.target.dataset.id;
        const newRole = e.target.value;
        const userName = e.target.dataset.name;
        const prevRole = e.target.dataset.prevRole;
        if (!confirm(`Change ${userName}'s editorial standing from "${prevRole}" to "${newRole}"?`)) {
          e.target.value = prevRole;
          return;
        }
        try {
          e.target.disabled = true;
          await api(`/api/admin/users/${userId}/role`, {
            method: "PUT",
            body: JSON.stringify({ role: newRole }),
          });
          e.target.dataset.prevRole = newRole;
          toast(`Updated ${userName}'s role to ${newRole}`);
          const badge = $(`#user-role-badge-${userId}`);
          if (badge) {
            badge.textContent = newRole;
            badge.className = `status status-${newRole.toLowerCase().replace(/\s+/g, "-")}`;
          }
        } catch (err) {
          toast(err.message, "error");
          e.target.value = prevRole;
        } finally {
          e.target.disabled = false;
        }
      };
    });
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

// ==================== HELPERS & MODALS ====================
function empty(text, label, href) {
  return `<div class="empty"><span>✦</span><h2>${esc(text)}</h2><a class="button secondary" href="${href}">${esc(label)}</a></div>`;
}
function guard(roles) {
  if (!state.user) {
    navigate("/login");
    return false;
  }
  if (roles && !roles.includes(state.user.role)) {
    navigate("/");
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
                `<a href="/post/${p.id}" class="search-item">${esc(p.title)}<small>${esc(p.author.displayName || p.author.username)}</small></a>`,
            )
            .join("")
        : "No results.";
    }, 240);
  };
}

// ==================== ROUTER INITIALIZATION ====================
async function render() {
  const route = location.pathname;
  window.scrollTo({ top: 0, behavior: "instant" });
  $$(".series-up-next-pill").forEach((el) => el.remove());
  try {
    if (route === "/") await home();
    else if (route === "/articles" || route.startsWith("/articles")) {
      const urlParams = new URLSearchParams(location.search);
      const page = parseInt(urlParams.get("page") || "1", 10);
      await articlesPage(page);
    }
    else if (route === "/series") await seriesListPage();
    else if (route.startsWith("/series/"))
      await seriesDetailPage(decodeURIComponent(route.split("/").pop()));
    else if (route === "/login") authPage("login");
    else if (route === "/register") authPage("register");
    else if (route === "/forgot-password") forgotPasswordPage();
    else if (route === "/about") aboutPage();
    else if (route === "/privacy") privacyPage();
    else if (route === "/contact") contactPage();
    else if (route === "/apply") await apply();
    else if (route === "/editor") await editor();
    else if (route === "/editor/new") await composer();
    else if (route.startsWith("/editor/edit/"))
      await composer(route.split("/").pop());
    else if (route === "/admin") await admin();
    else if (route === "/profile") profile();
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
      `<section class="wrap page-head">${empty(e.message, "Back home", "/")}</section>`,
    );
  }
}

addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    searchModal();
  }
});
render();
ensureCloudinaryConfig();
