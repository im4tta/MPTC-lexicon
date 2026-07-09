/**
 * Vercel serverless wrapper for the MPTC Lexicon MCP server.
 *
 * Exposes the same tools (search_lexicon, get_term) at the managed endpoint:
 *   POST /.vercel/mcp/mcp  (Vercel MCP gateway)  — OR mount via /api/mcp
 *
 * This file is the deployable entry; the server logic lives in mcp-server.mjs
 * (which is also runnable standalone with `node mcp-server.mjs`).
 */

import { makeServer } from "../mcp-server.mjs";

const sessions = new Map();

function buildTransport() {
  // Lazily import the SDK transport here (CommonJS interop through ESM).
  return import("@modelcontextprotocol/sdk/server/streamableHttp.js").then(
    ({ StreamableHTTPServerTransport }) => {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        enableJsonResponse: true,
        onsessioninitialized: (id) => sessions.set(id, transport),
      });
      transport.onclose = () => {
        if (transport.sessionId) sessions.delete(transport.sessionId);
      };
      return makeServer()
        .connect(transport)
        .then(() => transport);
    },
  );
}

export default async function handler(req, res) {
  const ct = req.headers["content-type"] || "";
  if (req.method === "POST") {
    if (!ct.includes("application/json")) {
      res.status(400).json({ error: "Expected application/json" });
      return;
    }
    const sid = req.headers["mcp-session-id"];
    let transport = sid && sessions.get(sid);
    if (!transport) transport = await buildTransport();

    // Vercel gives us parsed body already; pass through.
    await transport.handleRequest(req, res, req.body);
    return;
  }

  if ((req.method === "GET" || req.method === "DELETE")) {
    const sid = req.headers["mcp-session-id"];
    const transport = sid && sessions.get(sid);
    if (!transport) {
      res.status(404).json({ error: "Unknown session" });
      return;
    }
    await transport.handleRequest(req, res);
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}

export const config = { maxDuration: 30 };
