import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "../server.mjs";

const pagesOrigin = "https://warengonzaga.github.io";

async function serve(t, options) {
  const server = createServer(options);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test("CORS configuration accepts exact origins and rejects unsafe or ambiguous entries", () => {
  for (const value of [
    undefined,
    "",
    pagesOrigin,
    ` ${pagesOrigin}, http://localhost:5173 `,
  ]) {
    const server = createServer({ env: { ALLOWED_ORIGINS: value } });
    server.close();
  }
  for (const value of [
    "*",
    "null",
    "https://*.github.io",
    "https://user:pass@example.com",
    `${pagesOrigin}/`,
    `${pagesOrigin}/relay-protocol-city`,
    `${pagesOrigin}?q=1`,
    `${pagesOrigin}#fragment`,
    "ftp://example.com",
    `${pagesOrigin},`,
    `,${pagesOrigin}`,
  ]) {
    assert.throws(
      () => createServer({ env: { ALLOWED_ORIGINS: value } }),
      /ALLOWED_ORIGINS/,
    );
  }
});

test("Pages can read the API while disallowed origins are rejected before Relay is called", async (t) => {
  let calls = 0;
  const base = await serve(t, {
    env: { RELAY_API_KEY: "fixture-private-key", ALLOWED_ORIGINS: pagesOrigin },
    fetchImpl: async (_url, options) => {
      calls++;
      assert.equal(options.headers["x-api-key"], "fixture-private-key");
      return { ok: true, json: async () => ({ requests: [] }) };
    },
  });
  for (const origin of [
    "https://example.com",
    `${pagesOrigin}.evil.example`,
    "null",
    `${pagesOrigin}/`,
  ]) {
    const response = await fetch(`${base}/api/activity`, {
      headers: { Origin: origin },
    });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
    assert.equal(response.headers.get("Vary"), "Origin");
  }
  assert.equal(calls, 0);
  for (const origin of [pagesOrigin, base, undefined]) {
    const response = await fetch(`${base}/api/activity`, {
      headers: origin ? { Origin: origin } : {},
    });
    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get("Access-Control-Allow-Origin"),
      origin ?? null,
    );
    assert.equal(
      response.headers.get("Access-Control-Allow-Credentials"),
      null,
    );
    assert.equal(response.headers.get("Vary"), "Origin");
    assert.ok(!(await response.text()).includes("fixture-private-key"));
  }
  assert.equal(calls, 1, "existing shared cache still bounds upstream calls");
});

test("empty allowlist keeps local calls working without trusting forwarded headers", async (t) => {
  const base = await serve(t, {
    env: {},
    fetchImpl: () => assert.fail("No Relay call expected"),
  });
  const local = await fetch(`${base}/api/activity`, {
    headers: { Origin: base },
  });
  assert.equal(local.status, 200);
  assert.equal(local.headers.get("Access-Control-Allow-Origin"), base);
  const remote = await fetch(`${base}/api/activity`, {
    headers: {
      Origin: pagesOrigin,
      "X-Forwarded-Host": "warengonzaga.github.io",
      "X-Forwarded-Proto": "https",
    },
  });
  assert.equal(remote.status, 403);
  assert.equal((await fetch(`${base}/api/activity`)).status, 200);
});

test("preflight permits GET and HEAD only and never fetches Relay", async (t) => {
  const base = await serve(t, {
    env: { RELAY_API_KEY: "fixture-private-key", ALLOWED_ORIGINS: pagesOrigin },
    fetchImpl: () => assert.fail("Preflight must not fetch Relay"),
  });
  for (const method of ["GET", "HEAD"]) {
    const response = await fetch(`${base}/api/activity`, {
      method: "OPTIONS",
      headers: {
        Origin: pagesOrigin,
        "Access-Control-Request-Method": method,
        "Access-Control-Request-Headers": "accept",
      },
    });
    assert.equal(response.status, 204);
    assert.equal(
      response.headers.get("Access-Control-Allow-Origin"),
      pagesOrigin,
    );
    assert.equal(
      response.headers.get("Access-Control-Allow-Methods"),
      "GET, HEAD",
    );
    assert.equal(
      response.headers.get("Access-Control-Allow-Headers"),
      "Accept",
    );
    assert.equal(
      response.headers.get("Access-Control-Allow-Credentials"),
      null,
    );
    assert.match(response.headers.get("Vary"), /Origin/);
    assert.equal(await response.text(), "");
  }
  for (const headers of [
    {},
    { Origin: pagesOrigin },
    { Origin: "null", "Access-Control-Request-Method": "GET" },
    { Origin: pagesOrigin, "Access-Control-Request-Method": "POST" },
    {
      Origin: pagesOrigin,
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "authorization",
    },
    {
      Origin: pagesOrigin,
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "accept, x-api-key",
    },
  ]) {
    assert.equal(
      (await fetch(`${base}/api/activity`, { method: "OPTIONS", headers }))
        .status,
      403,
    );
  }
  const unknown = await fetch(`${base}/api/missing`, {
    method: "OPTIONS",
    headers: { Origin: pagesOrigin, "Access-Control-Request-Method": "GET" },
  });
  assert.equal(unknown.status, 405);
  assert.equal(unknown.headers.get("Access-Control-Allow-Origin"), null);
});

test("API-only mode serves health without the key or upstream and does not serve assets", async (t) => {
  const distDir = await mkdtemp(join(tmpdir(), "relay-api-hosting-"));
  t.after(() => rm(distDir, { recursive: true, force: true }));
  await writeFile(join(distDir, "index.html"), "city website");
  const options = {
    env: { API_ONLY: "true", RELAY_API_KEY: "fixture-private-key" },
    distDir,
    fetchImpl: () =>
      assert.fail("Health and static requests must not fetch Relay"),
  };
  const base = await serve(t, options);
  for (const method of ["GET", "HEAD"]) {
    const response = await fetch(`${base}/healthz`, { method });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Content-Type"), "application/json");
    const body = await response.text();
    assert.equal(body, method === "HEAD" ? "" : '{"status":"ok"}');
    assert.ok(!body.includes("fixture-private-key"));
    for (const path of [
      "/",
      "/index.html",
      "/src/activity.js",
      "/api/missing",
    ]) {
      assert.equal((await fetch(base + path, { method })).status, 404);
    }
  }
  const combined = await serve(t, { ...options, env: {} });
  assert.equal(await (await fetch(combined)).text(), "city website");
  assert.deepEqual(await (await fetch(`${combined}/healthz`)).json(), {
    status: "ok",
  });
});
