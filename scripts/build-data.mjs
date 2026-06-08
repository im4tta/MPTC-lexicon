/**
 * Combines mptc_lexicon_2025.csv (Part 1: KH·EN·FR) and
 * digital_technology_lexicon.csv (Part 2: KH·EN) into a single
 * src/data/mptc_lexicon.json that the app imports directly.
 *
 * Run: node scripts/build-data.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root      = join(__dirname, "..");

const SOURCE_URL =
  "https://mptc.obsv3.kh-gov-1.mptccloud.gov.kh/2026/05/MPTC-Lexicon-Digital-Terminology-Update.pdf";

// ─── CSV parser ───────────────────────────────────────────────────────────────

function parseCsv(text) {
  const clean = String(text).replace(/^\uFEFF/, "");
  const rows = [];
  let row = [], val = "", inQ = false;

  for (let i = 0; i < clean.length; i++) {
    const c = clean[i], n = clean[i + 1];
    if (c === '"' && inQ && n === '"') { val += '"'; i++; continue; }
    if (c === '"') { inQ = !inQ; continue; }
    if (c === "," && !inQ) { row.push(val); val = ""; continue; }
    if ((c === "\n" || c === "\r") && !inQ) {
      if (c === "\r" && n === "\n") i++;
      row.push(val); rows.push(row); row = []; val = ""; continue;
    }
    val += c;
  }
  if (val || row.length) { row.push(val); rows.push(row); }

  const [rawH, ...records] = rows.filter(r => r.some(Boolean));
  const headers = rawH.map(h => String(h).replace(/^\uFEFF/, "").trim());
  return records.map(r =>
    headers.reduce((obj, h, i) => { obj[h] = r[i] ?? ""; return obj; }, {})
  );
}

// ─── First Khmer character ────────────────────────────────────────────────────

function firstKhmerLetter(text) {
  const s = String(text || "").trim();
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (cp >= 0x1780 && cp <= 0x17ff) return ch;
  }
  return s.charAt(0) || "#";
}

// ─── Part 1: KH · EN · FR with definitions ────────────────────────────────────

const p1 = parseCsv(readFileSync(join(root, "mptc_lexicon_2025.csv"), "utf8"))
  .map(row => ({
    id:           Number(row.id),
    letter:       row.letter,
    khmer_term:   row.khmer_term,
    english_term: row.english_term,
    french_term:  row.french_term,
    definition_km: row.definition_km,
  }))
  .filter(e => Number.isFinite(e.id) && e.khmer_term);

// ─── Part 2: KH · EN ─────────────────────────────────────────────────────────

const p2 = parseCsv(readFileSync(join(root, "digital_technology_lexicon.csv"), "utf8"))
  .map(row => ({
    id:           Number(row.id),
    letter:       firstKhmerLetter(row.khmer_term),
    khmer_term:   row.khmer_term,
    english_term: row.english_term,
  }))
  .filter(e => Number.isFinite(e.id) && e.khmer_term && e.english_term);

// ─── Write output ─────────────────────────────────────────────────────────────

const out = {
  meta: {
    title:     "MPTC Digital Terminology Lexicon",
    version:   "2025",
    source:    "Ministry of Posts and Telecommunications of Cambodia (MPTC)",
    url:       SOURCE_URL,
    generated: new Date().toISOString().slice(0, 10),
    total:     p1.length + p2.length,
    p1_count:  p1.length,
    p2_count:  p2.length,
  },
  p1,
  p2,
};

const outPath = join(root, "src", "data", "mptc_lexicon.json");
mkdirSync(join(root, "src", "data"), { recursive: true });
writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");

console.log(`✓ mptc_lexicon.json written`);
console.log(`  Part 1: ${p1.length} entries (KH · EN · FR + definition)`);
console.log(`  Part 2: ${p2.length} entries (KH · EN)`);
console.log(`  Total:  ${p1.length + p2.length} entries`);
