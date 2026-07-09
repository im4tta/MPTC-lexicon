/**
 * MPTC Lexicon — MCP server (remote / Streamable HTTP transport)
 *
 * Exposes the lexicon to AI tools (Claude, etc.) as callable tools:
 *   - search_lexicon(query, part?, letter?, limit?)  → ranked term search
 *   - get_term(id)                                    → single term by id
 *
 * Deploy: any Node host. On Vercel, wrap with api/mcp.js (see api/mcp.js).
 *
 * Local:  node mcp-server.mjs   (listens on :3000, endpoint /mcp)
 * Health: GET  /healthz
 * MCP:    POST /mcp   (Accept: application/json, text/event-stream)
 */

import { readFileSync } from "fs";
import { createServer } from "http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const lexicon = JSON.parse(
  readFileSync(new URL("./src/data/mptc_lexicon.json", import.meta.url), "utf8").replace(/^\uFEFF/, ""),
);

function norm(v) {
  return String(v || "").normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
}

const ENTRIES = [
  ...(lexicon.p1 || []).map((e) => ({ ...e, part: "p1", french_term: e.french_term || "", definition_km: e.definition_km || "" })),
  ...(lexicon.p2 || []).map((e) => ({ ...e, part: "p2", french_term: "", definition_km: "" })),
].map((e) => ({ ...e, _text: norm([e.khmer_term, e.english_term, e.french_term, e.definition_km].join(" ")) }));

const BY_ID = new Map(ENTRIES.map((e) => [e.id, e]));

const WEIGHTS = { khmer_term: 10, english_term: 8, french_term: 6, definition_km: 3 };
function score(entry, q) {
  let s = 0;
  for (const [f, w] of Object.entries(WEIGHTS)) {
    const v = norm(entry[f]);
    if (!v) continue;
    if (v === q) s += w * 4;
    else if (v.startsWith(q)) s += w * 2;
    else if (v.includes(q)) s += w;
  }
  return s;
}

function search(q, { part, letter, limit = 20 } = {}) {
  const matches = ENTRIES.filter((e) => {
    if (part && e.part !== part) return false;
    if (letter && e.letter !== letter) return false;
    return e._text.includes(q);
  }).map((e) => ({ e, s: score(e, q) }));
  matches.sort((a, b) => b.s - a.s || a.e.id - b.e.id);
  return matches.slice(0, limit).map(({ e }) => publicTerm(e));
}

function publicTerm(e) {
  return {
    id: e.id,
    part: e.part,
    letter: e.letter,
    khmer_term: e.khmer_term,
    english_term: e.english_term,
    french_term: e.french_term || null,
    definition_km: e.definition_km || null,
  };
}

function makeServer() {
  const server = new McpServer({
    name: "mptc-lexicon",
    version: lexicon.meta?.version || "2025",
  });

  server.registerTool(
    "search_lexicon",
    {
      title: "Search MPTC Lexicon",
      description:
        "Search the official MPTC (Cambodia) Digital Terminology Lexicon across Khmer, English, and French. Returns ranked term matches with ids.",
      inputSchema: {
        query: z.string().describe("Search term in Khmer, English, or French"),
        part: z.enum(["p1", "p2"]).optional().describe("p1 = KH·EN·FR+definition, p2 = KH·EN only"),
        letter: z.string().optional().describe("Filter by Khmer letter, e.g. 'ក'"),
        limit: z.number().min(1).max(100).optional().describe("Max results (default 20)"),
      },
    },
    async ({ query, part, letter, limit }) => {
      const results = search(norm(query), { part, letter, limit });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ count: results.length, results }, null, 2),
          },
        ],
      };
    },
  );

  server.registerTool(
    "get_term",
    {
      title: "Get MPTC Lexicon Term",
      description: "Fetch a single lexicon term by its numeric id.",
      inputSchema: {
        id: z.number().describe("Numeric term id"),
      },
    },
    async ({ id }) => {
      const e = BY_ID.get(id);
      if (!e) {
        return { content: [{ type: "text", text: JSON.stringify({ error: "Term not found", id }) }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(publicTerm(e), null, 2) }] };
    },
  );

  return server;
}

// ─── Transport / HTTP ──────────────────────────────────────────────────────────

const sessions = new Map();
const PORT = Number(process.env.PORT) || 3000;

const httpServer = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/healthz") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, terms: ENTRIES.length }));
    return;
  }

  if (req.method === "POST" && url.pathname === "/mcp") {
    const ct = req.headers["content-type"] || "";
    const accept = req.headers["accept"] || "";
    if (!ct.includes("application/json")) {
      res.writeHead(400).end("Expected application/json");
      return;
    }

    const body = await readBody(req);
    const sid = req.headers["mcp-session-id"];

    let transport;
    if (sid && sessions.has(sid)) {
      transport = sessions.get(sid);
    } else {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        enableJsonResponse: !accept.includes("text/event-stream"),
        onsessioninitialized: (id) => sessions.set(id, transport),
      });
      transport.onclose = () => {
        if (transport.sessionId) sessions.delete(transport.sessionId);
      };
      const server = makeServer();
      await server.connect(transport);
    }

    await transport.handleRequest(req, res, body);
    return;
  }

  if ((req.method === "GET" || req.method === "DELETE") && url.pathname === "/mcp") {
    const sid = req.headers["mcp-session-id"];
    const transport = sid && sessions.get(sid);
    if (!transport) {
      res.writeHead(404).end("Unknown session");
      return;
    }
    await transport.handleRequest(req, res);
    return;
  }

  res.writeHead(404).end("Not found");
});

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

// Only start the standalone listener when run directly (node mcp-server.mjs),
// not when imported by the Vercel wrapper (api/mcp.js).
if (import.meta.url === `file://${process.argv[1]}`) {
  httpServer.listen(PORT, () => {
    console.log(`MPTC Lexicon MCP server on :${PORT}  (/mcp)`);
  });
}

export { makeServer };
