import express from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveAuthHeaders } from "../auth/resolver.js";
import { requestContext } from "../auth/context.js";

interface Session {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  lastActivity: number;
}

const MAX_SESSIONS = 10_000;
const SESSION_IDLE_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Starts the HTTP server for remote MCP.
 * @param createServer Factory that creates a new McpServer with tools registered.
 *                     Called once per session (each client gets its own server instance).
 */
export async function startHttpServer(createServer: () => McpServer): Promise<void> {
  const app = express();
  app.use(express.json());

  const sessions = new Map<string, Session>();

  // Periodic cleanup: remove idle sessions every 5 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [id, session] of sessions) {
      if (now - session.lastActivity > SESSION_IDLE_MS) {
        session.transport.close();
        sessions.delete(id);
      }
    }
  }, 5 * 60 * 1000);

  // CORS for discovery endpoints (browser-based clients)
  app.use("/.well-known", cors());

  // OAuth discovery proxy — MCP clients auto-fetch this to discover auth endpoints
  app.get("/.well-known/oauth-authorization-server", async (_req, res) => {
    const supabaseUrl = process.env.SUPABASE_URL;
    if (!supabaseUrl) {
      res.status(503).json({ error: "OAuth not configured" });
      return;
    }
    try {
      const upstream = await fetch(
        `${supabaseUrl}/.well-known/oauth-authorization-server/auth/v1`
      );
      const data = await upstream.json();
      res.json(data);
    } catch {
      res.status(502).json({ error: "Failed to fetch OAuth metadata" });
    }
  });

  // Static MCP server card — allows Smithery to scan tools without auth
  app.get("/.well-known/mcp/server-card.json", (_req, res) => {
    res.json({
      serverInfo: { name: "tinify", version: process.env.npm_package_version ?? "1.3.0" },
      authentication: { schemes: ["bearer"], required: false },
    });
  });

  // Health check
  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  // MCP endpoint — POST (requests), GET (SSE stream), DELETE (session end)
  app.all("/mcp", async (req, res) => {
    const authHeader = req.headers.authorization ?? null;
    const existingSessionId = req.headers["mcp-session-id"] as string | undefined;

    // --- Existing session: reuse transport ---
    if (existingSessionId && sessions.has(existingSessionId)) {
      const session = sessions.get(existingSessionId)!;
      session.lastActivity = Date.now();

      if (req.method === "DELETE") {
        session.transport.close();
        sessions.delete(existingSessionId);
        res.status(200).end();
        return;
      }

      const authHeaders = await resolveAuthHeaders(authHeader, existingSessionId);
      await requestContext.run({ authHeaders, sessionId: existingSessionId }, async () => {
        await session.transport.handleRequest(req as any, res as any, req.body);
      });
      return;
    }

    // --- Existing session ID but not found: 404 ---
    if (existingSessionId && !sessions.has(existingSessionId)) {
      res.status(404).json({ error: "Session not found or expired" });
      return;
    }

    // --- New session: create transport + server ---
    // Evict oldest session if at capacity (LRU)
    if (sessions.size >= MAX_SESSIONS) {
      let oldestId: string | null = null;
      let oldestTime = Infinity;
      for (const [id, s] of sessions) {
        if (s.lastActivity < oldestTime) {
          oldestTime = s.lastActivity;
          oldestId = id;
        }
      }
      if (oldestId) {
        sessions.get(oldestId)?.transport.close();
        sessions.delete(oldestId);
      }
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });

    const server = createServer();
    await server.connect(transport);

    // Capture the session ID assigned by the transport after handling the init request
    const tempSessionId = randomUUID();
    const authHeaders = await resolveAuthHeaders(authHeader, tempSessionId);

    await requestContext.run({ authHeaders, sessionId: tempSessionId }, async () => {
      await transport.handleRequest(req as any, res as any, req.body);
    });

    // After init, the transport has a session ID — store it
    if (transport.sessionId) {
      sessions.set(transport.sessionId, {
        transport,
        server,
        lastActivity: Date.now(),
      });
    }
  });

  // Graceful shutdown
  const port = parseInt(process.env.PORT ?? "8080", 10);
  const httpServer = app.listen(port, () => {
    console.error(`Tinify MCP server listening on port ${port} (HTTP mode)`);
  });

  const shutdown = () => {
    console.error("Shutting down: closing active sessions...");
    for (const [id, session] of sessions) {
      session.transport.close();
      sessions.delete(id);
    }
    httpServer.close();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
