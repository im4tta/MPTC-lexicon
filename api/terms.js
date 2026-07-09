/**
 * GET /api/terms
 *
 * Query parameters:
 *   q       - free-text search across Khmer / English / French / definition
 *   id      - fetch a single term by numeric id (overrides q)
 *   part    - "p1" (KH·EN·FR) or "p2" (KH·EN)
 *   letter  - filter by Khmer letter (e.g. "ក")
 *   limit   - page size (default 50, max 500)
 *   offset  - pagination offset (default 0)
 *
 * Responses:
 *   { total, count, limit, offset, results: [...] }   for list/search
 *   { term: {...} }                                    for ?id=
 */

import lexicon from "../src/data/mptc_lexicon.json" with { type: "json" };

// ─── Normalisation ────────────────────────────────────────────────────────────

const STOP = new Set([""]);

function norm(v) {
  return String(v || "")
    .normalize("NFC")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Build a flat, searchable index once per cold start ───────────────────────

function buildEntries() {
  const p1 = (lexicon.p1 || []).map((e) => ({
    ...e,
    part: "p1",
    french_term: e.french_term || "",
    definition_km: e.definition_km || "",
  }));

  const p2 = (lexicon.p2 || []).map((e) => ({
    ...e,
    part: "p2",
    french_term: "",
    definition_km: "",
  }));

  return [...p1, ...p2].map((e) => {
    const haystack = norm(
      [e.khmer_term, e.english_term, e.french_term, e.definition_km].join(" "),
    );
    return { ...e, _text: haystack };
  });
}

const ENTRIES = buildEntries();
const BY_ID = new Map(ENTRIES.map((e) => [e.id, e]));

const FIELD_WEIGHTS = {
  khmer_term: 10,
  english_term: 8,
  french_term: 6,
  definition_km: 3,
};

function score(entry, q) {
  let s = 0;
  for (const [field, weight] of Object.entries(FIELD_WEIGHTS)) {
    const val = norm(entry[field]);
    if (!val) continue;
    if (val === q) s += weight * 4;
    else if (val.startsWith(q)) s += weight * 2;
    else if (val.includes(q)) s += weight;
  }
  return s;
}

function search(q, { part, letter, limit, offset }) {
  const matches = ENTRIES.filter((e) => {
    if (part && e.part !== part) return false;
    if (letter && e.letter !== letter) return false;
    return e._text.includes(q);
  }).map((e) => ({ e, s: score(e, q) }));

  matches.sort((a, b) => b.s - a.s || a.e.id - b.e.id);

  const total = matches.length;
  const slice = matches
    .slice(offset, offset + limit)
    .map(({ e }) => {
      const { _text, ...term } = e;
      return { ...term, score: score(e, q) };
    });

  return { total, results: slice };
}

function list({ part, letter, limit, offset }) {
  let base = ENTRIES;
  if (part) base = base.filter((e) => e.part === part);
  if (letter) base = base.filter((e) => e.letter === letter);

  const sorted = [...base].sort((a, b) => a.id - b.id);
  const total = sorted.length;
  const slice = sorted.slice(offset, offset + limit).map((e) => {
    const { _text, ...term } = e;
    return term;
  });

  return { total, results: slice };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "public, max-age=86400");

  const url = new URL(req.url, "https://mptclexicon.vercel.app");
  const params = url.searchParams;

  const limit = Math.min(
    Math.max(Number(params.get("limit")) || 50, 1),
    500,
  );
  const offset = Math.max(Number(params.get("offset")) || 0, 0);

  // Single term by id
  if (params.has("id")) {
    const id = Number(params.get("id"));
    const entry = BY_ID.get(id);
    if (!entry) {
      res.status(404).json({ error: "Term not found", id });
      return;
    }
    const { _text, ...term } = entry;
    res.status(200).json({ term });
    return;
  }

  const part = params.get("part");
  const letter = params.get("letter");
  const q = norm(params.get("q") || "");

  const body = q
    ? search(q, { part, letter, limit, offset })
    : list({ part, letter, limit, offset });

  res.status(200).json({
    query: q || null,
    count: body.results.length,
    limit,
    offset,
    ...body,
  });
}
