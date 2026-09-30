import { createServer as createHttpServer } from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createDemoTransfers, normalizeRequest } from "./src/activity.js";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".glb": "model/gltf-binary",
};

function isOrigin(value) {
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.hostname.includes("*") &&
      url.origin === value
    );
  } catch {
    return false;
  }
}

export function createServer({
  env = process.env,
  fetchImpl = fetch,
  distDir = fileURLToPath(new URL("./dist", import.meta.url)),
} = {}) {
  const apiKey = env.RELAY_API_KEY?.trim();
  const apiOnly = env.API_ONLY === "true";
  const allowedOrigins = new Set(
    env.ALLOWED_ORIGINS?.trim()
      ? env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim())
      : [],
  );
  if ([...allowedOrigins].some((origin) => !isOrigin(origin)))
    throw new Error(
      "ALLOWED_ORIGINS must contain comma-separated HTTP(S) origins without paths, trailing slashes, credentials, or wildcards",
    );
  const legacy = !apiKey && env.RELAY_ALLOW_LEGACY_PREVIEW === "true";
  const coverage = legacy
    ? "sample"
    : env.RELAY_NETWORK_SCOPE === "global"
      ? "network"
      : "integrator";
  let cached;
  let expiresAt = 0;
  let inFlight;
  const trackedCache = new Map();

  function demo(notice) {
    return {
      mode: "demo",
      coverage: "sample",
      updatedAt: new Date().toISOString(),
      transfers: createDemoTransfers(),
      notice,
      dailyCount: null,
    };
  }

  async function requestRows(parameters) {
    const url = new URL(
      `https://api.relay.link/requests/${legacy ? "v2" : "v3"}`,
    );
    url.search = new URLSearchParams({
      ...parameters,
      ...(!legacy ? { includeAuthenticatedData: "true" } : {}),
    }).toString();
    const upstream = await fetchImpl(url, {
      headers: apiKey ? { "x-api-key": apiKey } : {},
      signal: AbortSignal.timeout(8_000),
    });
    if (!upstream.ok) throw new Error("Relay request failed");
    const body = await upstream.json();
    if (!Array.isArray(body.requests))
      throw new Error("Unexpected Relay response");
    return body.requests;
  }

  function trackedRequest(id) {
    const cached = trackedCache.get(id);
    if (cached && (cached.pending || Date.now() < cached.expiresAt))
      return cached.result;
    // ponytail: 128 process-local entries; use shared storage for a multi-worker public deployment.
    if (trackedCache.size >= 128)
      trackedCache.delete(trackedCache.keys().next().value);
    const entry = { pending: true, expiresAt: 0 };
    entry.result = requestRows({ id, limit: "1" })
      .then((rows) =>
        normalizeRequest(rows.slice(0, 1).find((row) => row.id === id)),
      )
      .catch(() => null)
      .finally(() => {
        entry.pending = false;
        entry.expiresAt = Date.now() + 10_000;
      });
    trackedCache.set(id, entry);
    return entry.result;
  }

  async function trackedActivity(ids) {
    const data = await activity();
    if (!ids.length)
      return { ...data, trackingNotice: null, trackingMissingIds: [] };
    if (data.mode !== "live")
      return {
        ...data,
        trackingNotice:
          "Live request tracking is unavailable. Last known live stages must not advance without new evidence.",
        trackingMissingIds: ids,
      };
    const merged = new Map(data.transfers.map((row) => [row.id, row]));
    const results = await Promise.all(ids.map(trackedRequest));
    const trackingMissingIds = [];
    results.forEach((row, index) => {
      if (!row) {
        trackingMissingIds.push(ids[index]);
        return;
      }
      const previous = merged.get(row.id);
      if (
        !previous ||
        Date.parse(row.updatedAt) >= Date.parse(previous.updatedAt)
      )
        merged.set(row.id, row);
    });
    return {
      ...data,
      transfers: [...merged.values()],
      trackingMissingIds,
      trackingNotice: trackingMissingIds.length
        ? `${trackingMissingIds.length} tracked request(s) could not be refreshed. Last confirmed stages remain unchanged.`
        : null,
    };
  }

  async function refreshActivity() {
    if (!apiKey && !legacy) {
      return demo(
        "Demo city: illustrative transfers, not real Relay activity. Connect an approved Relay API key to watch recent transfers.",
      );
    }
    try {
      const rows = await requestRows({
        limit: "50",
        sortBy: "updatedAt",
        sortDirection: "desc",
      });
      const seen = new Set();
      const transfers = rows
        .slice(0, 50)
        .map(normalizeRequest)
        .filter((row) => {
          if (!row || seen.has(row.id)) return false;
          seen.add(row.id);
          return true;
        });
      const notice = legacy
        ? "Legacy preview: recent public records from Relay v2, retiring November 24, 2026. Pending visibility is not guaranteed. Gate stages use confirmed API evidence; this is not a daily total."
        : coverage === "network"
          ? "Recent records from the configured network feed. Pending stages and app attribution are limited to requests this key can access. Up to 50 records per refresh; daily totals are unavailable."
          : "Recent records visible to this integrator key. Gate stages use confirmed API evidence. Up to 50 records per refresh; pending stages and app attribution are owner-scoped, not all Relay activity.";
      return {
        mode: "live",
        coverage,
        updatedAt: new Date().toISOString(),
        transfers,
        notice,
        dailyCount: null,
      };
    } catch {
      return demo(
        "Relay activity is temporarily unavailable. Showing an illustrative demo, not live transfers.",
      );
    }
  }

  async function activity() {
    if (cached && Date.now() < expiresAt) return cached;
    // ponytail: one process-local cache; use shared storage if deploying multiple workers.
    inFlight ??= refreshActivity()
      .then((result) => {
        cached = result;
        expiresAt = Date.now() + 10_000;
        return result;
      })
      .finally(() => {
        inFlight = undefined;
      });
    return inFlight;
  }

  return createHttpServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    let pathname;
    let requestUrl;
    try {
      requestUrl = new URL(req.url, "http://localhost");
      pathname = decodeURIComponent(requestUrl.pathname);
    } catch {
      res.writeHead(400).end("Invalid URL");
      return;
    }
    if (pathname === "/api/activity") {
      res.setHeader("Vary", "Origin");
      const origin = req.headers.origin;
      const serverOrigin = `${req.socket.encrypted ? "https" : "http"}://${req.headers.host}`;
      if (
        origin !== undefined &&
        (!isOrigin(origin) ||
          (!allowedOrigins.has(origin) && origin !== serverOrigin))
      ) {
        res.writeHead(403).end("Origin not allowed");
        return;
      }
      if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
      if (req.method === "OPTIONS") {
        res.setHeader(
          "Vary",
          "Origin, Access-Control-Request-Method, Access-Control-Request-Headers",
        );
        const method = req.headers["access-control-request-method"];
        const headers = req.headers["access-control-request-headers"];
        if (
          !origin ||
          !["GET", "HEAD"].includes(method) ||
          (headers && headers.toLowerCase().trim() !== "accept")
        ) {
          res.writeHead(403).end("Preflight not allowed");
          return;
        }
        res.writeHead(204, {
          "Access-Control-Allow-Methods": "GET, HEAD",
          ...(headers ? { "Access-Control-Allow-Headers": "Accept" } : {}),
        });
        res.end();
        return;
      }
      if (req.method !== "GET" && req.method !== "HEAD") {
        res
          .writeHead(405, { Allow: "GET, HEAD, OPTIONS" })
          .end("Method not allowed");
        return;
      }
      const parameters = requestUrl.searchParams.getAll("tracked");
      const ids = parameters.length ? parameters[0].split(",") : [];
      if (
        parameters.length > 1 ||
        ids.length > 12 ||
        ids.some((id) => !/^0x[a-fA-F0-9]{64}$/.test(id))
      ) {
        res.writeHead(400, { "Content-Type": "application/json" }).end(
          JSON.stringify({
            error:
              "tracked must contain at most 12 comma-separated Relay request IDs (0x followed by 64 hexadecimal characters).",
          }),
        );
        return;
      }
      const data = await trackedActivity([...new Set(ids)].sort());
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(req.method === "HEAD" ? undefined : JSON.stringify(data));
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD" }).end("Method not allowed");
      return;
    }
    if (pathname === "/healthz") {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(
        req.method === "HEAD" ? undefined : JSON.stringify({ status: "ok" }),
      );
      return;
    }
    if (apiOnly || pathname.startsWith("/api/")) {
      res.writeHead(404).end("Not found");
      return;
    }
    try {
      const root = await realpath(distDir);
      const file = await realpath(
        resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`),
      );
      if (!file.startsWith(root + sep) || !(await stat(file)).isFile()) {
        res.writeHead(404).end("Not found");
        return;
      }
      const body = req.method === "HEAD" ? undefined : await readFile(file);
      res.writeHead(200, {
        "Content-Type": MIME_TYPES[extname(file)] ?? "application/octet-stream",
        "Cache-Control": "no-cache",
      });
      res.end(body);
    } catch {
      res.writeHead(404).end("Not found");
    }
  });
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const port = Number(process.env.PORT ?? 4174);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT must be between 1 and 65535");
  createServer().listen(port, process.env.HOST ?? "127.0.0.1", () => {
    console.log(
      `Relay City server: http://${process.env.HOST ?? "127.0.0.1"}:${port}`,
    );
  });
}
