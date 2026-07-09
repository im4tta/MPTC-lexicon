/**
 * SSG: generate one static HTML page per lexicon term into dist/term/<slug>.html
 *
 * Each page is fully server-rendered (no JS needed) so search engines and AI
 * crawlers can read the Khmer / English / French content directly, plus a
 * schema.org DefinedTerm JSON-LD block.
 *
 * Run after `vite build`: node scripts/build-ssg.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const dist = join(root, "dist");

const SITE = "https://mptclexicon.vercel.app";
const lexicon = JSON.parse(
  readFileSync(join(root, "src", "data", "mptc_lexicon.json"), "utf8").replace(/^\uFEFF/, ""),
);

function slugify(v, id) {
  const base = String(v || "term")
    .normalize("NFC")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9\u1780-\u17ff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "term"}-${id}`;
}

function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function definedTerm(entry) {
  const term = {
    "@context": "https://schema.org",
    "@type": "DefinedTerm",
    "@id": `${SITE}/term/${entry.slug}`,
    "name": entry.khmer_term,
    "termCode": String(entry.id),
    "inDefinedTermSet": {
      "@type": "DefinedTermSet",
      "name": "MPTC Digital Terminology Lexicon 2025",
      "publisher": {
        "@type": "GovernmentOrganization",
        "name": "Ministry of Posts and Telecommunications of Cambodia",
        "url": "https://mptc.gov.kh",
      },
    },
    "description": entry.definition_km || `${entry.english_term}${entry.french_term ? " / " + entry.french_term : ""}`,
  };
  const aliases = [entry.english_term];
  if (entry.french_term) aliases.push(entry.french_term);
  if (aliases.length) term.alternateName = aliases;
  return JSON.stringify(term);
}

function page(entry) {
  const isP1 = entry.part === "p1";
  const langLine = isP1 ? "Khmer · English · French" : "Khmer · English";
  const defBlock = isP1 && entry.definition_km
    ? `<section class="def"><h2>Definition (និយមន័យ)</h2><p>${esc(entry.definition_km)}</p></section>`
    : "";
  const frBlock = isP1 && entry.french_term
    ? `<div class="row"><span class="k">French</span><span class="v">${esc(entry.french_term)}</span></div>`
    : "";

  const styles = `
<style>
:root{color-scheme:dark;--bg:#09080f;--text:#ede0c4;--muted:rgba(237,224,196,.5);--gold:#c9a84c;--line:rgba(201,168,76,.22);--card:rgba(255,255,255,.04)}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"Inter","Noto Sans Khmer",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:radial-gradient(1200px 600px at 70% -10%,rgba(201,168,76,.1),transparent),var(--bg);color:var(--text);min-height:100vh;padding:32px 18px;line-height:1.6}
.term{max-width:720px;margin:0 auto;background:var(--card);border:1px solid var(--line);border-radius:22px;padding:34px}
nav{margin-bottom:22px}
nav a{color:var(--gold);text-decoration:none;font-weight:600;font-size:14px}
nav a:hover{text-decoration:underline}
header{display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap}
.badge{display:inline-flex;align-items:center;justify-content:center;min-width:44px;height:44px;padding:0 10px;background:rgba(201,168,76,.14);border:1px solid var(--line);border-radius:12px;font-family:"Noto Sans Khmer",sans-serif;font-weight:700;font-size:20px;color:var(--gold)}
.part{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.num{margin-left:auto;font-size:12px;font-weight:800;color:var(--gold);background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);padding:4px 14px;border-radius:999px}
h1.khmer{font-family:"Noto Sans Khmer",sans-serif;font-size:38px;font-weight:700;line-height:1.3;margin-bottom:22px}
.rows{display:flex;flex-direction:column;gap:10px;margin-bottom:22px}
.row{display:flex;gap:14px;padding:14px 16px;background:rgba(255,255,255,.03);border:1px solid var(--line);border-radius:14px;align-items:baseline}
.row .k{flex:0 0 90px;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.row .v{font-size:17px}
.def{margin-bottom:22px;padding:18px;background:rgba(255,255,255,.03);border:1px solid var(--line);border-radius:16px}
.def h2{font-size:13px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--gold);margin-bottom:8px}
.def p{font-family:"Noto Sans Khmer",sans-serif;font-size:15px;line-height:1.9}
.src{font-size:13px;color:var(--muted)}
.src a{color:var(--gold)}
</style>`;

  return `<!doctype html>
<html lang="km">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(entry.khmer_term)} — ${esc(entry.english_term)} | MPTC Lexicon 2025</title>
<meta name="description" content="${esc(entry.khmer_term)} = ${esc(entry.english_term)}${entry.french_term ? " / " + esc(entry.french_term) : ""}. Official MPTC Digital Terminology Lexicon (Cambodia)." />
<meta name="robots" content="index, follow" />
<link rel="canonical" href="${SITE}/term/${entry.slug}" />
<script type="application/ld+json">${definedTerm(entry)}</script>
${styles}
</head>
<body class="term-page">
<main class="term">
<nav><a href="/">← MPTC Lexicon 2025</a></nav>
<header>
<span class="badge">${esc(entry.letter)}</span>
<span class="part">${esc(langLine)}</span>
<span class="num">#${entry.id}</span>
</header>
<h1 class="khmer">${esc(entry.khmer_term)}</h1>
<div class="rows">
<div class="row"><span class="k">Khmer</span><span class="v">${esc(entry.khmer_term)}</span></div>
<div class="row"><span class="k">English</span><span class="v">${esc(entry.english_term)}</span></div>
${frBlock}
</div>
${defBlock}
<p class="src">Source: MPTC Digital Terminology Lexicon 2025 — <a href="${esc(lexicon.meta.url)}">official PDF</a></p>
</main>
</body>
</html>`;
}

// ─── Build ─────────────────────────────────────────────────────────────────────

const outDir = join(dist, "term");
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const entries = [];
for (const e of lexicon.p1 || []) {
  entries.push({ ...e, part: "p1", french_term: e.french_term || "", definition_km: e.definition_km || "" });
}
for (const e of lexicon.p2 || []) {
  entries.push({ ...e, part: "p2", french_term: "", definition_km: "" });
}

const urls = [];
for (const e of entries) {
  const slug = slugify(e.english_term || e.khmer_term, e.id);
  const entry = { ...e, slug };
  writeFileSync(join(outDir, `${slug}.html`), page(entry), "utf8");
  urls.push(`${SITE}/term/${slug}`);
}

// ─── Sitemap with all term URLs ────────────────────────────────────────────────

const today = new Date().toISOString().slice(0, 10);
const urlset = (loc, priority, changefreq) =>
  `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlset(`${SITE}/`, "1.0", "weekly")}
${urlset(`${SITE}/mptc_lexicon.json`, "0.9", "monthly")}
${urlset(`${SITE}/api/lexicon`, "0.9", "monthly")}
${urlset(`${SITE}/api/terms`, "0.8", "monthly")}
${urls.map((u) => urlset(u, "0.7", "monthly")).join("\n")}
</urlset>
`;
writeFileSync(join(dist, "sitemap.xml"), sitemap, "utf8");

console.log(`✓ SSG: ${entries.length} term pages → dist/term/`);
console.log(`✓ sitemap.xml: ${urls.length + 4} URLs`);
