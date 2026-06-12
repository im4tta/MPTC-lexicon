/**
 * POST /api/export
 * Body: { type, entry?, entries?, part?, filterLabel?, totalCount?, theme? }
 * Response: image/png
 *
 * Rendered with sone — Seanghay Yath's declarative Skia layout engine.
 * Fonts fetched from Google Fonts on cold start; cached in /tmp.
 */

import { Font, sone, Column, Row, Text } from "sone";
import { existsSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// ─── Colour themes ────────────────────────────────────────────────────────────

const DARK = {
  BG_MAIN: "#0c0e1a",
  TEXT: "#ede0c4",
  GOLD: "#c9a84c",
  GOLD_BRIGHT: "#e5cc74",
  MUTED: "rgba(237,224,196,0.55)",
  MUTED_DIM: "rgba(237,224,196,0.32)",
  BORDER: "rgba(201,168,76,0.20)",
  BORDER_CARD: "rgba(201,168,76,0.32)",
  BG_CARD: "rgba(255,255,255,0.05)",
  BG_DEF: "rgba(255,255,255,0.04)",
  SEPARATOR: "rgba(201,168,76,0.22)",
  CREDIT: "rgba(237,224,196,0.22)",
  DEF_TEXT: "rgba(237,224,196,0.82)",
};

const LIGHT = {
  BG_MAIN: "#f5f0e8",
  TEXT: "#2a1800",
  GOLD: "#7a4a00",
  GOLD_BRIGHT: "#5c3600",
  MUTED: "rgba(90,50,0,0.55)",
  MUTED_DIM: "rgba(90,50,0,0.32)",
  BORDER: "rgba(138,92,0,0.18)",
  BORDER_CARD: "rgba(138,92,0,0.28)",
  BG_CARD: "rgba(138,92,0,0.06)",
  BG_DEF: "rgba(138,92,0,0.04)",
  SEPARATOR: "rgba(138,92,0,0.18)",
  CREDIT: "rgba(90,50,0,0.22)",
  DEF_TEXT: "rgba(42,24,0,0.78)",
};

// ─── Font loading ─────────────────────────────────────────────────────────────

let fontsReady = false;

const FONT_SPECS = [
  {
    alias: "NotoSansKhmer",
    family: "Noto Sans Khmer",
    weights: [
      { g: "400", s: "400" },
      { g: "700", s: "bold" },
    ],
  },
  {
    alias: "Inter",
    family: "Inter",
    weights: [
      { g: "400", s: "400" },
      { g: "700", s: "bold" },
      { g: "800", s: "800" },
    ],
  },
];

async function fetchFontUrl(family, weight) {
  const css = await fetch(
    `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&display=swap`,
    {
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) Chrome/125.0.0.0",
      },
    },
  ).then((r) => r.text());
  return (
    css.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/)?.[1] ?? null
  );
}

async function ensureFonts() {
  if (fontsReady) return;
  const tmp = tmpdir();
  for (const { alias, family, weights } of FONT_SPECS) {
    for (const { g, s } of weights) {
      const file = join(tmp, `sone-${alias}-${g}.ttf`);
      if (!existsSync(file)) {
        const url = await fetchFontUrl(family, g);
        if (!url) {
          console.warn(`[export] Font not found: ${alias} ${g}`);
          continue;
        }
        writeFileSync(
          file,
          Buffer.from(await fetch(url).then((r) => r.arrayBuffer())),
        );
      }
      await Font.load(alias, [file], { weight: s });
    }
  }
  fontsReady = true;
}

// ─── Layout helpers ───────────────────────────────────────────────────────────

function metaBlock(label, value, C) {
  return Column(
    Text(label.toUpperCase())
      .font("Inter")
      .size(11)
      .weight("800")
      .color(C.MUTED)
      .letterSpacing(1),
    Text(value || "—")
      .font("NotoSansKhmer")
      .size(15)
      .weight("bold")
      .color(C.TEXT)
      .lineHeight(1.4),
  )
    .gap(6)
    .padding(14)
    .bg(C.BG_CARD)
    .rounded(14)
    .borderWidth(1)
    .borderColor(C.BORDER)
    .flex(1);
}

function creditRow(C) {
  return Text("Powered by SONE")
    .font("Inter")
    .size(11)
    .color(C.CREDIT);
}

function buildCardLayout(entry, C) {
  const isP1 = entry.part === "p1";
  const partLabel = isP1 ? "Part 1: KH · EN · FR" : "Part 2: KH · EN";
  const subtitle = isP1
    ? `${entry.english_term} · ${entry.french_term}`
    : entry.english_term;

  return Column(
    // Header
    Row(
      Column(
        Text(`MPTC Lexicon 2025 · ${partLabel}`)
          .font("Inter")
          .size(11)
          .weight("800")
          .color(C.GOLD)
          .letterSpacing(1.4),
        Text(entry.khmer_term)
          .font("NotoSansKhmer")
          .size(42)
          .weight("bold")
          .color(C.TEXT)
          .lineHeight(1.3),
        Text(subtitle).font("Inter").size(17).color(C.MUTED).lineHeight(1.5),
      )
        .gap(10)
        .flex(1),
      Row(
        Text(`#${entry.id}`)
          .font("Inter")
          .size(13)
          .weight("800")
          .color("#e5cc74"),
      )
        .padding(8, 28)
        .bg("#1a0d02")
        .rounded(999)
        .borderWidth(1.5)
        .borderColor("#c9a84c"),
    )
      .gap(16)
      .padding(0, 0, 22, 0)
      .borderWidth(0, 0, 1, 0)
      .borderColor(C.SEPARATOR),

    // Meta grid
    Row(
      metaBlock("Letter", entry.letter, C),
      metaBlock("English", entry.english_term, C),
      ...(isP1 ? [metaBlock("French", entry.french_term, C)] : []),
    )
      .gap(12)
      .padding(22, 0),

    // Definition (Part 1)
    ...(isP1 && entry.definition_km
      ? [
          Text(entry.definition_km)
            .font("NotoSansKhmer")
            .size(15)
            .color(C.DEF_TEXT)
            .lineHeight(1.9)
            .padding(18)
            .bg(C.BG_DEF)
            .rounded(16)
            .borderWidth(1)
            .borderColor(`${C.GOLD}22`),
        ]
      : []),

    // Footer — JSON source
    Row(
      Text("Source: mptc_lexicon.json · MPTC Digital Terminology 2025")
        .font("Inter")
        .size(12)
        .color(C.MUTED_DIM)
        .flex(1),
      Text(isP1 ? "Part 1: KH·EN·FR" : "Part 2: KH·EN")
        .font("Inter")
        .size(12)
        .color(C.MUTED_DIM),
    ).padding(20, 0, 8, 0),

    // Sone credit
    creditRow(C),
  )
    .gap(0)
    .padding(40)
    .width(900)
    .bg(C.BG_MAIN)
    .rounded(28)
    .borderWidth(1)
    .borderColor(C.BORDER_CARD);
}

function buildListLayout({ part, entries, filterLabel, totalCount }, C) {
  const isP1 = part === "p1";
  const partLabel = isP1 ? "Part 1: KH · EN · FR" : "Part 2: KH · EN";
  const shown = entries.length;

  const cards = entries.map((e) =>
    Row(
      Column(
        Text(e.letter)
          .font("NotoSansKhmer")
          .size(18)
          .weight("bold")
          .color(C.GOLD_BRIGHT),
      )
        .width(50)
        .height(50)
        .bg(`${C.GOLD}22`)
        .rounded(14)
        .borderWidth(1)
        .borderColor(C.BORDER)
        .alignItems("center")
        .justifyContent("center"),
      Column(
        Row(
          Text(e.khmer_term)
            .font("NotoSansKhmer")
            .size(18)
            .weight("bold")
            .color(C.TEXT)
            .flex(1),
          Row(
            Text(`#${e.id}`)
              .font("Inter")
              .size(12)
              .weight("800")
              .color("#e5cc74"),
          )
            .padding(6, 20)
            .bg("#1a0d02")
            .rounded(999)
            .borderWidth(1.5)
            .borderColor("#c9a84c"),
        ).gap(8),
        Text(
          isP1 && e.french_term
            ? `${e.english_term} · ${e.french_term}`
            : e.english_term,
        )
          .font("Inter")
          .size(14)
          .color(C.MUTED)
          .lineHeight(1.45),
        ...(isP1 && e.definition_km
          ? [
              Text(e.definition_km)
                .font("NotoSansKhmer")
                .size(13)
                .color(C.MUTED)
                .lineHeight(1.75),
            ]
          : []),
      )
        .gap(5)
        .flex(1),
    )
      .gap(14)
      .alignItems("flex-start")
      .padding(14)
      .bg(C.BG_CARD)
      .rounded(16)
      .borderWidth(1)
      .borderColor(C.BORDER),
  );

  return Column(
    // Header
    Column(
      Text(`MPTC Lexicon 2025 · ${partLabel}`)
        .font("Inter")
        .size(11)
        .weight("800")
        .color(C.GOLD)
        .letterSpacing(1.4),
      Text(filterLabel)
        .font("Inter")
        .size(28)
        .weight("800")
        .color(C.TEXT)
        .lineHeight(1.2),
      Text(
        shown < totalCount
          ? `${totalCount} terms · showing first ${shown}`
          : `${totalCount} terms`,
      )
        .font("Inter")
        .size(14)
        .color(C.MUTED),
    )
      .gap(8)
      .padding(0, 0, 22, 0)
      .borderWidth(0, 0, 1, 0)
      .borderColor(C.SEPARATOR),

    // Entries
    Column(...cards)
      .gap(10)
      .padding(22, 0),

    // Footer — JSON source
    Row(
      Text("Source: mptc_lexicon.json · MPTC Digital Terminology 2025")
        .font("Inter")
        .size(12)
        .color(C.MUTED_DIM)
        .flex(1),
      Text(isP1 ? "Part 1: KH·EN·FR" : "Part 2: KH·EN")
        .font("Inter")
        .size(12)
        .color(C.MUTED_DIM),
    ).padding(0, 0, 8, 0),

    // Sone credit
    creditRow(C),
  )
    .gap(0)
    .padding(40)
    .width(1080)
    .bg(C.BG_MAIN)
    .rounded(28)
    .borderWidth(1)
    .borderColor(C.BORDER_CARD);
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      /* ignore */
    }
  }

  if (!body?.type) {
    res.status(400).json({ error: "Missing type" });
    return;
  }

  const C = body.theme === "light" ? LIGHT : DARK;

  try {
    await ensureFonts();

    let layout;

    if (body.type === "card") {
      if (!body.entry) {
        res.status(400).json({ error: "Missing entry" });
        return;
      }
      layout = buildCardLayout(body.entry, C);
    } else if (body.type === "list") {
      if (!body.entries?.length) {
        res.status(400).json({ error: "Missing entries" });
        return;
      }
      layout = buildListLayout(body, C);
    } else {
      res.status(400).json({ error: `Unknown type: ${body.type}` });
      return;
    }

    const png = await sone(layout).png({ density: 3 });
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "no-store");
    res.end(png);
  } catch (err) {
    console.error("[export]", err);
    res
      .status(500)
      .json({ error: "Render failed", detail: String(err.message) });
  }
}
