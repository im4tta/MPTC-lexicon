import FlexSearch from "flexsearch";
import lexicon from "./data/mptc_lexicon.json";
import "./styles.css";

const SOURCE_URL = lexicon.meta.url;

const P1_FIELDS = [
  { key: "khmer_term", weight: 10 },
  { key: "english_term", weight: 8 },
  { key: "french_term", weight: 6 },
  { key: "definition_km", weight: 3 },
];

const P2_FIELDS = [
  { key: "khmer_term", weight: 10 },
  { key: "english_term", weight: 8 },
];

// ─── Data from JSON ───────────────────────────────────────────────────────────

const p1Entries = lexicon.p1
  .map((e) => ({
    ...e,
    part: "p1",
    french_term: e.french_term || "",
    definition_km: e.definition_km || "",
  }))
  .filter((e) => Number.isFinite(e.id) && e.khmer_term)
  .map((e) => enrichEntry(e, P1_FIELDS));

const p2Entries = lexicon.p2
  .map((e) => ({ ...e, part: "p2", french_term: "", definition_km: "" }))
  .filter((e) => Number.isFinite(e.id) && e.khmer_term && e.english_term)
  .map((e) => enrichEntry(e, P2_FIELDS));

const p1ById = new Map(p1Entries.map((e) => [e.id, e]));
const p2ById = new Map(p2Entries.map((e) => [e.id, e]));
const p1Letters = [...new Set(p1Entries.map((e) => e.letter))];
const p2Letters = [...new Set(p2Entries.map((e) => e.letter))];
const p1Indexes = buildIndexes(p1Entries, P1_FIELDS);
const p2Indexes = buildIndexes(p2Entries, P2_FIELDS);

// ─── State ────────────────────────────────────────────────────────────────────

const state = { query: "", part: "p1", letter: "all" };
let visibleEntries = p1Entries;
let toastTimer;

// ─── Theme ────────────────────────────────────────────────────────────────────

let currentTheme = localStorage.getItem("theme") || "dark";

function applyTheme(t) {
  currentTheme = t;
  localStorage.setItem("theme", t);
  document.documentElement.dataset.theme = t;
  const btn = document.getElementById("theme-toggle");
  if (btn)
    btn.title = t === "dark" ? "Switch to light mode" : "Switch to dark mode";
}

applyTheme(currentTheme);

// ─── Active-part helper ───────────────────────────────────────────────────────

function activePart() {
  return state.part === "p1"
    ? {
        entries: p1Entries,
        byId: p1ById,
        letters: p1Letters,
        indexes: p1Indexes,
        fields: P1_FIELDS,
      }
    : {
        entries: p2Entries,
        byId: p2ById,
        letters: p2Letters,
        indexes: p2Indexes,
        fields: P2_FIELDS,
      };
}

// ─── Build DOM ────────────────────────────────────────────────────────────────

const SUN_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
const MOON_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;

const app = document.getElementById("app");
app.innerHTML = `
  <canvas id="bg-canvas"></canvas>

  <div class="shell">

    <header class="topbar" id="top">
      <div class="brand">
        <span class="brand-gem">M</span>
        <div class="brand-text">
          <h1>MPTC Lexicon <em>2025</em></h1>
        </div>
      </div>
      <div class="topbar-end">
        <button class="btn btn-ghost" id="download-json" type="button" title="Download combined lexicon as JSON">↓ JSON</button>
        <button class="btn btn-ghost btn-icon" id="theme-toggle" type="button">${currentTheme === "dark" ? SUN_SVG : MOON_SVG}</button>
        <button class="btn btn-ghost" type="button" id="export-btn">Export PNG</button>
        <a class="btn btn-gold" href="${SOURCE_URL}" target="_blank" rel="noreferrer">Source PDF</a>
      </div>
    </header>

    <div class="part-tabs" role="tablist" aria-label="Select lexicon part">
      <button class="part-tab part-tab--active" role="tab" aria-selected="true" data-part="p1">
        <span class="part-tab__tag">Part 1</span>
        <span class="part-tab__lang">KH · EN · FR</span>
        <span class="part-tab__count">${p1Entries.length} terms</span>
      </button>
      <button class="part-tab" role="tab" aria-selected="false" data-part="p2">
        <span class="part-tab__tag">Part 2</span>
        <span class="part-tab__lang">KH · EN</span>
        <span class="part-tab__count">${p2Entries.length} terms</span>
      </button>
    </div>

    <section class="search-panel" id="search" aria-label="Search lexicon">
      <label class="search-field" for="search-input">
        <svg class="search-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" stroke-width="1.6"/>
          <path d="M14 14l3.5 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
        </svg>
        <input id="search-input" type="search" autocomplete="off"
          placeholder="ស្វែងរក / Search: Viber, cloud, blockchain, ការបញ្ជូន…" />
        <button id="clear-btn" class="clear-btn" type="button" hidden>✕</button>
      </label>
      <div class="filter-row">
        <div class="chips" id="chips" role="group" aria-label="Filter by Khmer letter"></div>
        <p class="status-line" id="status" aria-live="polite"></p>
      </div>
    </section>

    <div class="results-grid" id="results" aria-label="Results" aria-live="polite"></div>

    <section class="about-card" aria-label="About this project">
      <h3 class="about-card__title">អំពីគម្រោងនេះ</h3>
      <p class="about-card__text">
        👉 ដកស្រង់ចេញពី <strong>សទ្ទានុក្រមបច្ចេកសព្ទឌីជីថល ភាគ១ និងភាគ២</strong> ដែលអាចទាញយកតាមរយៈតំណភ្ជាប់ :
        <a href="https://mptc.gov.kh/lexicon" target="_blank" rel="noreferrer">https://mptc.gov.kh/lexicon</a>
      </p>
      <p class="about-card__text about-card__text--muted">
        គម្រោងនេះគ្រាន់តែជាកម្មវិធីសម្រាប់អ្នកប្រើប្រាស់ទូទៅអាចស្វែងរកបច្ចេកសព្ទឌីជីថលបានលឿនជាងមុន។
      </p>
    </section>

    <footer class="footer" id="bottom">
      <span>© MPTC 2025 · Official Khmer Digital Terminology</span>
      <a href="${SOURCE_URL}" target="_blank" rel="noreferrer">Source PDF ↗</a>
    </footer>

  </div>

  <nav class="fabs" aria-label="Quick navigation">
    <button class="fab" id="fab-top"    title="Go to top">↑</button>
    <button class="fab fab-gold" id="fab-export" title="Export results as PNG">⇩</button>
    <button class="fab" id="fab-bottom" title="Go to bottom">↓</button>
  </nav>

  <div class="toast" id="toast" role="status" hidden></div>
`;

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const searchInput = document.getElementById("search-input");
const clearBtn = document.getElementById("clear-btn");
const chipsEl = document.getElementById("chips");
const resultsEl = document.getElementById("results");
const statusEl = document.getElementById("status");
const toastEl = document.getElementById("toast");

// ─── Boot ─────────────────────────────────────────────────────────────────────

initCanvas();
buildLetterChips();
render();
bindEvents();

// ─── Events ───────────────────────────────────────────────────────────────────

function bindEvents() {
  searchInput.addEventListener("input", (e) => {
    state.query = e.target.value.trim();
    render();
  });

  clearBtn.addEventListener("click", () => {
    state.query = "";
    searchInput.value = "";
    searchInput.focus();
    render();
  });

  document
    .querySelectorAll(".part-tab")
    .forEach((tab) =>
      tab.addEventListener("click", () => switchPart(tab.dataset.part)),
    );

  document.getElementById("theme-toggle").addEventListener("click", () => {
    const next = currentTheme === "dark" ? "light" : "dark";
    applyTheme(next);
    const btn = document.getElementById("theme-toggle");
    btn.innerHTML = next === "dark" ? SUN_SVG : MOON_SVG;
  });

  document
    .getElementById("download-json")
    .addEventListener("click", downloadJson);
  document
    .getElementById("export-btn")
    .addEventListener("click", exportVisible);
  document
    .getElementById("fab-export")
    .addEventListener("click", exportVisible);
  document
    .getElementById("fab-top")
    .addEventListener("click", () =>
      window.scrollTo({ top: 0, behavior: "smooth" }),
    );
  document.getElementById("fab-bottom").addEventListener("click", () =>
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: "smooth",
    }),
  );

  resultsEl.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = Number(btn.dataset.entryId);
    const part = btn.dataset.part;
    const map = part === "p1" ? p1ById : p2ById;
    const entry = map.get(id);
    if (!entry) return;
    if (btn.dataset.action === "copy") await copyEntry(entry);
    if (btn.dataset.action === "png-card") await exportCard(entry);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== searchInput) {
      e.preventDefault();
      searchInput.focus();
    }
    if (e.key === "Escape" && document.activeElement === searchInput) {
      state.query = "";
      searchInput.value = "";
      render();
    }
  });
}

// ─── Part switch ──────────────────────────────────────────────────────────────

function switchPart(part) {
  if (state.part === part) return;
  state.part = part;
  state.letter = "all";
  document.querySelectorAll(".part-tab").forEach((t) => {
    const active = t.dataset.part === part;
    t.classList.toggle("part-tab--active", active);
    t.setAttribute("aria-selected", String(active));
  });
  buildLetterChips();
  render();
}

// ─── Letter chips ─────────────────────────────────────────────────────────────

function buildLetterChips() {
  chipsEl.innerHTML = "";
  const { letters } = activePart();
  chipsEl.append(makeChip("all", "All"), ...letters.map((l) => makeChip(l, l)));
}

function makeChip(value, label) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "chip";
  btn.dataset.letter = value;
  btn.textContent = label;
  btn.addEventListener("click", () => {
    state.letter = value;
    render();
  });
  return btn;
}

// ─── Render ───────────────────────────────────────────────────────────────────

function render() {
  const { entries } = activePart();
  visibleEntries = getVisibleEntries();

  document
    .querySelectorAll(".chip")
    .forEach((c) =>
      c.classList.toggle("chip-active", c.dataset.letter === state.letter),
    );

  clearBtn.hidden = !state.query;

  const parts = [];
  if (state.query) parts.push(`"${state.query}"`);
  if (state.letter !== "all") parts.push(`Letter: ${state.letter}`);
  statusEl.textContent =
    `${visibleEntries.length} / ${entries.length} terms` +
    (parts.length ? ` · ${parts.join(" · ")}` : "");

  if (!visibleEntries.length) {
    resultsEl.innerHTML = `
      <div class="empty">
        <p class="empty-eyebrow">No result</p>
        <h3>No matching term found</h3>
        <p>Try a different keyword or reset the letter filter.</p>
      </div>`;
    return;
  }

  const frag = document.createDocumentFragment();
  visibleEntries.forEach((e) => frag.appendChild(makeCard(e, state.query)));
  resultsEl.replaceChildren(frag);
}

function getVisibleEntries() {
  const { entries } = activePart();
  const base = state.query ? searchActive(state.query) : entries;
  return base.filter(
    (e) => state.letter === "all" || e.letter === state.letter,
  );
}

// ─── Card rendering ───────────────────────────────────────────────────────────

function makeCard(entry, query) {
  const isP1 = entry.part === "p1";
  const card = document.createElement("article");
  card.className = `term-card${isP1 ? "" : " term-card--p2"}`;
  card.dataset.entryId = String(entry.id);
  card.innerHTML = `
    <div class="card-top">
      <span class="badge">${esc(entry.letter)}</span>
      <div class="card-titles">
        <h2>${hi(entry.khmer_term, query)}</h2>
        <p class="card-sub">
          ${hi(entry.english_term, query)}
          ${isP1 ? `<span aria-hidden="true"> · </span>${hi(entry.french_term, query)}` : ""}
        </p>
      </div>
      <div class="card-btns">
        <span class="term-num">#${entry.id}</span>
        <button class="sm-btn" type="button" data-action="copy" data-entry-id="${entry.id}" data-part="${entry.part}">Copy</button>
        <button class="sm-btn sm-btn-gold" type="button" data-action="png-card" data-entry-id="${entry.id}" data-part="${entry.part}">PNG</button>
      </div>
    </div>
    <div class="card-meta ${isP1 ? "" : "card-meta--p2"}">
      <div class="meta-item"><span>Khmer</span><strong>${hi(entry.khmer_term, query)}</strong></div>
      <div class="meta-item"><span>English</span><strong>${hi(entry.english_term, query)}</strong></div>
      ${isP1 ? `<div class="meta-item"><span>French</span><strong>${hi(entry.french_term, query)}</strong></div>` : ""}
    </div>
    ${isP1 && entry.definition_km ? `<p class="card-def">${hi(entry.definition_km, query)}</p>` : ""}`;
  return card;
}

// ─── Search ───────────────────────────────────────────────────────────────────

function searchActive(query) {
  const { entries, byId, indexes, fields } = activePart();
  const q = norm(query);
  if (!q) return entries;

  const scores = new Map();
  const limit = entries.length;

  indexes.forEach(({ key, weight, index }) => {
    index.search(q, limit).forEach((id, rank) => {
      const entry = byId.get(Number(id));
      if (entry) scoreEntry(scores, entry, key, q, weight * (limit - rank));
    });
  });

  entries.forEach((entry) => {
    if (!entry.searchText.includes(q)) return;
    fields.forEach(({ key, weight }) =>
      scoreEntry(scores, entry, key, q, weight * 3),
    );
    if (entry.searchText.startsWith(q))
      scores.set(entry.id, (scores.get(entry.id) || 0) + 30);
  });

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .map(([id]) => byId.get(id))
    .filter(Boolean);
}

function scoreEntry(scores, entry, key, q, base) {
  const val = entry.normalized[key];
  if (!val?.includes(q)) return;
  const exact = val === q ? base * 4 : 0;
  const prefix = val.startsWith(q) ? base * 2 : 0;
  const word = val.split(/[^\p{L}\p{N}]+/u).includes(q) ? base * 1.5 : 0;
  scores.set(
    entry.id,
    (scores.get(entry.id) || 0) + base + exact + prefix + word,
  );
}

function buildIndexes(data, fields) {
  return fields.map(({ key, weight }) => {
    const index = new FlexSearch.Index({
      cache: 100,
      encode: false,
      resolution: 9,
      tokenize: "full",
    });
    data.forEach((e) => index.add(e.id, e.normalized[key]));
    return { key, weight, index };
  });
}

function enrichEntry(entry, fields) {
  const normalized = Object.fromEntries(
    fields.map(({ key }) => [key, norm(entry[key])]),
  );
  return {
    ...entry,
    normalized,
    searchText: fields.map(({ key }) => normalized[key]).join(" "),
  };
}

// ─── Copy ─────────────────────────────────────────────────────────────────────

async function copyEntry(entry) {
  const lines = [entry.khmer_term, `English: ${entry.english_term}`];
  if (entry.french_term) lines.push(`French: ${entry.french_term}`);
  if (entry.definition_km) lines.push(`Definition: ${entry.definition_km}`);
  try {
    await navigator.clipboard.writeText(lines.join("\n"));
    toast("Copied to clipboard.");
  } catch {
    toast("Copy not supported on this browser.");
  }
}

// ─── Download JSON ────────────────────────────────────────────────────────────

function downloadJson() {
  const json = JSON.stringify(lexicon, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  download(url, "mptc_lexicon.json");
  URL.revokeObjectURL(url);
  toast("mptc_lexicon.json downloaded.");
}

// ─── Export ───────────────────────────────────────────────────────────────────

async function exportCard(entry) {
  const slug = slugify(
    entry.english_term || entry.khmer_term || String(entry.id),
  );
  await renderPngViaApi(
    { type: "card", entry, theme: currentTheme },
    `mptc-lexicon-${slug}.png`,
  );
}

async function exportVisible() {
  if (!visibleEntries.length) {
    toast("No results to export.");
    return;
  }

  const filterLabel = state.query
    ? `Search: "${state.query}"${state.letter !== "all" ? ` · Letter: ${state.letter}` : ""}`
    : state.letter !== "all"
      ? `Letter: ${state.letter}`
      : "All entries";

  const slug = state.query ? slugify(state.query) : "results";
  await renderPngViaApi(
    {
      type: "list",
      part: state.part,
      entries: visibleEntries.slice(0, 12),
      filterLabel,
      totalCount: visibleEntries.length,
      theme: currentTheme,
    },
    `mptc-lexicon-${slug}.png`,
  );
}

async function renderPngViaApi(payload, fileName) {
  toast("Generating image…");
  try {
    const res = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => `HTTP ${res.status}`);
      throw new Error(detail);
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    download(url, fileName);
    URL.revokeObjectURL(url);
    toast("PNG exported.");
  } catch (err) {
    console.error("Export error:", err);
    const devNote = import.meta.env.DEV
      ? " (use vercel dev for local export)"
      : "";
    toast(`Export failed.${devNote}`);
  }
}

// ─── Canvas web-line animation ────────────────────────────────────────────────

function initCanvas() {
  const canvas = document.getElementById("bg-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  let W, H, pts, raf;

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function mkPt() {
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.38,
      vy: (Math.random() - 0.5) * 0.38,
      r: Math.random() * 1.4 + 0.5,
      gold: Math.random() > 0.28,
    };
  }

  function setup() {
    resize();
    const count = window.innerWidth < 768 ? 32 : 58;
    pts = Array.from({ length: count }, mkPt);
  }

  function frame() {
    ctx.clearRect(0, 0, W, H);
    const maxD = window.innerWidth < 768 ? 110 : 140;
    const light = document.documentElement.dataset.theme === "light";
    const GOLD = light ? [138, 92, 0] : [201, 168, 76];
    const BLUE = light ? [80, 60, 130] : [80, 130, 220];
    const DOT_A = light ? 0.35 : 0.55;
    const LINE_A_MAX = light ? 0.14 : 0.22;

    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < -20) p.x = W + 20;
      else if (p.x > W + 20) p.x = -20;
      if (p.y < -20) p.y = H + 20;
      else if (p.y > H + 20) p.y = -20;

      for (let j = i + 1; j < pts.length; j++) {
        const q = pts[j];
        const dx = p.x - q.x,
          dy = p.y - q.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < maxD) {
          const [r, g, b] = p.gold ? GOLD : BLUE;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
          ctx.strokeStyle = `rgba(${r},${g},${b},${(1 - d / maxD) * LINE_A_MAX})`;
          ctx.lineWidth = 0.7;
          ctx.stroke();
        }
      }

      const [r, g, b] = p.gold ? GOLD : BLUE;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r},${g},${b},${DOT_A})`;
      ctx.fill();
    }

    raf = requestAnimationFrame(frame);
  }

  setup();
  frame();

  let resizeId;
  window.addEventListener("resize", () => {
    clearTimeout(resizeId);
    resizeId = setTimeout(() => {
      cancelAnimationFrame(raf);
      setup();
      frame();
    }, 150);
  });
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function norm(v) {
  return String(v || "")
    .normalize("NFC")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function hi(text, query) {
  const safe = esc(text);
  if (!query) return safe;
  const re = escRe(esc(query));
  return safe.replace(new RegExp(`(${re})`, "gi"), "<mark>$1</mark>");
}

function esc(v) {
  return String(v)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escRe(v) {
  return String(v).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function slugify(v) {
  return String(v || "lexicon")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9\u1780-\u17ff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function download(url, name) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
}

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  toastEl.classList.add("toast-show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove("toast-show");
    setTimeout(() => {
      toastEl.hidden = true;
    }, 220);
  }, 2400);
}
