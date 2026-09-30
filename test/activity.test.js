import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CHAIN_CONFIG,
  CITY_CHAIN_IDS,
  classifyTransfer,
  createDemoTransfers,
  getDistrictTrips,
  normalizeRequest,
} from "../src/activity.js";
import { createServer } from "../server.mjs";

const amount = (chainId, amountUsd) => ({ currency: { chainId }, amountUsd });
const v2 = {
  id: "0x123",
  status: "success",
  createdAt: "2026-09-30T08:00:00.000Z",
  data: {
    metadata: {
      currencyIn: amount(1, "1245.10"),
      currencyOut: amount(8453, "1230"),
    },
  },
};

test("vehicle thresholds preserve unknown values and every boundary", () => {
  const cases = [
    [null, "pedestrian"],
    [NaN, "pedestrian"],
    [Infinity, "pedestrian"],
    [0, "pedestrian"],
    [99.99, "pedestrian"],
    [100, "car"],
    [999.99, "car"],
    [1000, "bus"],
    [9999.99, "bus"],
    [10000, "truck"],
    [99999.99, "truck"],
    [100000, "train"],
    [999999.99, "train"],
    [1000000, "airplane"],
  ];
  for (const [usd, kind] of cases) assert.equal(classifyTransfer(usd), kind);
});

test("v2 and v3 normalization uses the deposited USD amount and true chain route", () => {
  const normalized = normalizeRequest(v2);
  assert.equal(normalized.amountUsd, 1245.1);
  assert.equal(normalized.originName, "Ethereum");
  assert.equal(normalized.destinationName, "Base");
  assert.equal(normalized.kind, "bus");
  assert.equal(normalized.url, "https://relay.link/transaction/0x123");
  const row = {
    ...v2,
    data: {
      route: {
        quoted: {
          origin: { inputCurrency: amount(137, "2000") },
          destination: { outputCurrency: amount(10, "1900") },
        },
        actual: {
          origin: { inputCurrency: amount(792703809, "200000") },
          destination: { outputCurrency: amount(42161, "199990") },
        },
      },
    },
  };
  assert.equal(normalizeRequest(row).amountUsd, 200000);
  assert.equal(normalizeRequest(row).originName, "Solana");
  assert.equal(normalizeRequest(row).destinationName, "Arbitrum");
  row.data.route.actual = undefined;
  assert.equal(normalizeRequest(row).originName, "Polygon");
  row.data.route.quoted.destination = undefined;
  row.data.route.quoted.origin.outputCurrency = amount(137, "1900");
  assert.equal(normalizeRequest(row).destinationChainId, 137);
});

test("malformed rows are rejected; missing or malformed USD never becomes zero", () => {
  for (const change of [
    { status: "invented-status" },
    { id: "../unsafe" },
    { createdAt: "invalid" },
    { data: {} },
  ])
    assert.equal(normalizeRequest({ ...v2, ...change }), null);
  for (const usd of [
    null,
    undefined,
    "",
    "bad",
    "-1",
    -5,
    true,
    Infinity,
    "1e999",
    "0x100",
  ]) {
    const row = {
      ...v2,
      data: { metadata: { ...v2.data.metadata, currencyIn: amount(1, usd) } },
    };
    assert.equal(normalizeRequest(row).amountUsd, null);
  }
  assert.equal(
    normalizeRequest({
      ...v2,
      data: {
        metadata: { ...v2.data.metadata, currencyIn: amount(99999, "0") },
      },
    }).originName,
    "Chain 99999",
  );
});

test("demo fixtures are clearly artificial and cover all six vehicles", () => {
  const rows = createDemoTransfers();
  assert.equal(rows.length, 36);
  assert.equal(new Set(rows.map((row) => row.id)).size, 36);
  assert.equal(new Set(rows.map((row) => row.kind)).size, 6);
  assert.deepEqual(
    new Set(rows.flatMap((row) => [row.originChainId, row.destinationChainId])),
    new Set(CITY_CHAIN_IDS),
  );
  assert.ok(
    rows.every(
      (row) =>
        row.id.startsWith("demo-") &&
        row.url === null &&
        row.status === "pending" &&
        row.stage === "origin",
    ),
  );
});

test("demo scenarios cover same-chain runs, app routes, failures and both train directions", () => {
  const rows = createDemoTransfers();
  assert.deepEqual(
    new Set(rows.map((row) => row.demoScenario)),
    new Set(["success", "pending", "failed", "blocked"]),
  );
  assert.ok(rows.some((row) => row.originChainId === row.destinationChainId));
  assert.ok(
    rows.some(
      (row) =>
        row.app.key === "opensea" &&
        row.originChainId === 1 &&
        row.destinationChainId === 8453,
    ),
  );
  for (const kind of ["pedestrian", "car"])
    assert.ok(
      rows.some((row) => row.kind === kind && row.demoScenario === "blocked"),
    );
  const trains = rows.filter((row) => row.kind === "train");
  assert.ok(
    trains.some(
      (row) => row.originChainId === 8453 && row.destinationChainId === 1,
    ),
  );
  assert.ok(
    trains.some(
      (row) => row.originChainId === 1 && row.destinationChainId === 8453,
    ),
  );
  assert.ok(
    createDemoTransfers("blocked").every(
      (row) => row.demoScenario === "blocked",
    ),
  );
  assert.equal(CHAIN_CONFIG.length, 12);
  assert.equal(
    new Set(CHAIN_CONFIG.map((chain) => chain.flightBearing)).size,
    12,
  );
  assert.equal(
    CHAIN_CONFIG.find((chain) => chain.id === 8453).flightBearing,
    0,
  );
  assert.equal(
    CHAIN_CONFIG.find((chain) => chain.id === 56).flightBearing,
    180,
  );
});

test("district selection excludes unsupported routes and partitions local, incoming and outgoing trips", () => {
  const trips = [
    { id: "out", originChainId: 1, destinationChainId: 8453 },
    { id: "in", originChainId: 8453, destinationChainId: 1 },
    { id: "eth-local", originChainId: 1, destinationChainId: 1 },
    { id: "base-local", originChainId: 8453, destinationChainId: 8453 },
    { id: "unsupported-origin", originChainId: 56, destinationChainId: 1 },
    { id: "unsupported-destination", originChainId: 1, destinationChainId: 137 },
    { id: "unsupported-local", originChainId: 56, destinationChainId: 56 },
  ];
  const ids = (rows) => rows.map(({ id }) => id);
  assert.deepEqual(ids(getDistrictTrips(trips)), [
    "out", "in", "eth-local", "base-local",
  ]);
  assert.deepEqual(ids(getDistrictTrips(trips, "1", "incoming")), ["in"]);
  assert.deepEqual(ids(getDistrictTrips(trips, 1, "outgoing")), ["out"]);
  assert.deepEqual(ids(getDistrictTrips(trips, 1, "local")), ["eth-local"]);
  assert.deepEqual(ids(getDistrictTrips(trips, "all", "local")), [
    "eth-local", "base-local",
  ]);
  for (const chainId of CITY_CHAIN_IDS) {
    const groups = ["incoming", "outgoing", "local"].flatMap((direction) =>
      getDistrictTrips(trips, chainId, direction),
    );
    assert.equal(new Set(groups).size, groups.length);
    assert.deepEqual(new Set(groups), new Set(getDistrictTrips(trips, chainId)));
  }
  assert.deepEqual(getDistrictTrips(trips, 56), []);
});

test("stages require transaction evidence and retain exact terminal failures", () => {
  const normalize = (status, fields = {}) =>
    normalizeRequest({ ...v2, status, data: { ...v2.data, ...fields } });
  for (const status of [
    "pending",
    "waiting",
    "delayed",
    "depositing",
    "submitted",
  ]) {
    assert.equal(
      normalize(status, { outTxs: [{ chainId: 8453 }] }).stage,
      "origin",
    );
    assert.equal(
      normalize(status, {
        inTxs: [{ chainId: 1, hash: "deposit", status: "success" }],
        outTxs: [{ chainId: 8453 }],
      }).stage,
      "gate",
    );
    assert.equal(
      normalize(status, {
        outTxs: [{ chainId: 8453, txHash: "fill", status: "pending" }],
      }).stage,
      "fill",
    );
  }
  assert.equal(
    normalize("pending", {
      outTxs: [{ chainId: 8453, hash: "failed-fill", status: "failure" }],
    }).stage,
    "origin",
  );
  assert.equal(normalize("success").stage, "complete");
  assert.equal(normalize("refund").stage, "refunded");
  for (const reason of ["BLOCKED", "BLOCKED_WALLET", "TRANSACTION_REVERTED"]) {
    const result = normalize("failure", { failReason: reason });
    assert.equal(result.stage, "failed");
    assert.equal(result.failureReason, reason);
    assert.equal(result.blocked, reason.startsWith("BLOCKED"));
  }
  assert.equal(normalize("success", { failReason: "N/A" }).failureReason, null);
});

test("app attribution keeps missing data unknown and strips private referrer suffixes", () => {
  assert.equal(normalizeRequest(v2).app.kind, "unknown");
  for (const referrer of [
    "relay.link",
    "https://relay.link/path|private-correlation",
  ]) {
    assert.deepEqual(normalizeRequest({ ...v2, referrer }).app, {
      key: "relay",
      name: "Relay",
      kind: "relay",
    });
  }
  const result = normalizeRequest({
    ...v2,
    data: { ...v2.data, referrer: "opensea|private-wallet-id" },
  });
  assert.deepEqual(result.app, {
    key: "opensea",
    name: "OpenSea",
    kind: "integrator",
  });
  assert.ok(!JSON.stringify(result).includes("private-wallet-id"));
  assert.equal(
    normalizeRequest({ ...v2, referrer: "relay.link.evil.example" }).app.kind,
    "integrator",
  );
  assert.equal(
    normalizeRequest({ ...v2, referrer: "<script>bad</script>" }).app.kind,
    "unknown",
  );
});

test("speed uses positive confirmed transaction time or a labeled estimate, never update latency", () => {
  const data = {
    ...v2.data,
    timeEstimate: 9,
    inTxs: [{ chainId: 1, hash: "deposit", status: "success", timestamp: 100 }],
    outTxs: [
      { chainId: 8453, txHash: "fill", status: "success", timestamp: 102 },
    ],
  };
  const measured = normalizeRequest({
    ...v2,
    updatedAt: "2026-09-30T09:00:00.000Z",
    data,
  });
  assert.equal(measured.durationSeconds, 2);
  assert.equal(measured.speedSource, "measured");
  assert.equal(measured.updatedAt, "2026-09-30T09:00:00.000Z");
  for (const timestamp of [undefined, 100, 99]) {
    const estimated = normalizeRequest({
      ...v2,
      data: { ...data, outTxs: [{ ...data.outTxs[0], timestamp }] },
    });
    assert.equal(estimated.durationSeconds, 9);
    assert.equal(estimated.speedSource, "estimated");
  }
  const unknown = normalizeRequest({
    ...v2,
    updatedAt: "2026-09-30T09:00:00.000Z",
  });
  assert.equal(unknown.durationSeconds, null);
  assert.equal(unknown.speedSource, "unknown");
});

async function serve(t, options) {
  const server = createServer(options);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test("no credentials makes no upstream request and explicitly labels demo activity", async (t) => {
  const base = await serve(t, {
    env: {},
    fetchImpl: () => assert.fail("Unexpected upstream request"),
  });
  const data = await (await fetch(`${base}/api/activity`)).json();
  assert.equal(data.mode, "demo");
  assert.equal(data.coverage, "sample");
  assert.equal(data.dailyCount, null);
});

test("live requests share one bounded fetch, keep keys server-side, and respect scope", async (t) => {
  let calls = 0;
  const base = await serve(t, {
    env: { RELAY_API_KEY: "fixture-key" },
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url.pathname, "/requests/v3");
      assert.equal(url.searchParams.get("limit"), "50");
      assert.equal(url.searchParams.has("status"), false);
      assert.equal(url.searchParams.get("includeAuthenticatedData"), "true");
      assert.equal(options.headers["x-api-key"], "fixture-key");
      return {
        ok: true,
        json: async () => ({ requests: [v2, v2, { ...v2, status: "refund" }] }),
      };
    },
  });
  const results = await Promise.all(
    Array.from({ length: 5 }, async () =>
      (await fetch(`${base}/api/activity`)).json(),
    ),
  );
  assert.equal(calls, 1);
  assert.equal(results[0].mode, "live");
  assert.equal(results[0].coverage, "integrator");
  assert.equal(results[0].transfers.length, 1);
  assert.ok(!JSON.stringify(results).includes("fixture-key"));
});

test("legacy opt-in is sample coverage and upstream errors are explicit demo fallback", async (t) => {
  const base = await serve(t, {
    env: { RELAY_ALLOW_LEGACY_PREVIEW: "true" },
    fetchImpl: async (url) => {
      assert.equal(url.pathname, "/requests/v2");
      return { ok: true, json: async () => ({ requests: [v2] }) };
    },
  });
  const data = await (await fetch(`${base}/api/activity`)).json();
  assert.equal(data.coverage, "sample");
  assert.match(data.notice, /Legacy preview/);
  const failedBase = await serve(t, {
    env: { RELAY_API_KEY: "fixture-key" },
    fetchImpl: async () => {
      throw new Error("upstream secrets must not leak");
    },
  });
  const failure = await (await fetch(`${failedBase}/api/activity`)).json();
  assert.equal(failure.mode, "demo");
  assert.match(failure.notice, /temporarily unavailable/);
  assert.ok(!JSON.stringify(failure).includes("upstream secrets"));
});

test("tracked requests survive latest-page eviction and share exact-ID lookups", async (t) => {
  const failedId = `0x${"a".repeat(64)}`;
  const successId = `0x${"b".repeat(64)}`;
  const calls = new Map();
  const base = await serve(t, {
    env: { RELAY_API_KEY: "fixture-key" },
    fetchImpl: async (url) => {
      const id = url.searchParams.get("id");
      calls.set(id, (calls.get(id) ?? 0) + 1);
      assert.equal(url.origin, "https://api.relay.link");
      assert.equal(url.pathname, "/requests/v3");
      assert.equal(url.searchParams.get("includeAuthenticatedData"), "true");
      const rows = id
        ? [
            {
              ...v2,
              id,
              status: id === failedId ? "failure" : "success",
              updatedAt: "2026-09-30T09:00:00.000Z",
              data: {
                ...v2.data,
                failReason: id === failedId ? "BLOCKED_WALLET" : null,
                referrer: "opensea|private-suffix",
              },
            },
          ]
        : [
            v2,
            {
              ...v2,
              id: successId,
              status: "pending",
              updatedAt: "2026-09-30T08:00:00.000Z",
            },
          ];
      if (id) assert.equal(url.searchParams.get("limit"), "1");
      return { ok: true, json: async () => ({ requests: rows }) };
    },
  });
  const responses = await Promise.all(
    Array.from({ length: 5 }, (_, index) =>
      fetch(
        `${base}/api/activity?tracked=${index % 2 ? failedId + "," + successId : successId + "," + failedId}`,
      ).then((response) => response.json()),
    ),
  );
  assert.equal(calls.get(null), 1);
  assert.equal(calls.get(failedId), 1);
  assert.equal(calls.get(successId), 1);
  for (const data of responses) {
    assert.equal(data.transfers.length, 3);
    assert.equal(
      data.transfers.find((row) => row.id === failedId).stage,
      "failed",
    );
    assert.equal(
      data.transfers.find((row) => row.id === failedId).failureReason,
      "BLOCKED_WALLET",
    );
    assert.equal(
      data.transfers.find((row) => row.id === successId).stage,
      "complete",
    );
    assert.equal(data.trackingNotice, null);
    assert.deepEqual(data.trackingMissingIds, []);
    assert.ok(!JSON.stringify(data).includes("private-suffix"));
  }
});

test("missing or failed tracked lookups report incomplete tracking without advancing a stage", async (t) => {
  const unavailableId = `0x${"c".repeat(64)}`;
  const invisibleId = `0x${"d".repeat(64)}`;
  const base = await serve(t, {
    env: { RELAY_ALLOW_LEGACY_PREVIEW: "true" },
    fetchImpl: async (url) => {
      const id = url.searchParams.get("id");
      assert.equal(url.pathname, "/requests/v2");
      assert.equal(url.searchParams.has("includeAuthenticatedData"), false);
      if (id === unavailableId) throw new Error("secret upstream error");
      return {
        ok: true,
        json: async () => ({
          requests: id ? [] : [{ ...v2, id: unavailableId, status: "pending" }],
        }),
      };
    },
  });
  const data = await (
    await fetch(`${base}/api/activity?tracked=${unavailableId},${invisibleId}`)
  ).json();
  assert.equal(data.mode, "live");
  assert.equal(data.transfers.length, 1);
  assert.equal(data.transfers[0].status, "pending");
  assert.deepEqual(data.trackingMissingIds, [unavailableId, invisibleId]);
  assert.match(data.trackingNotice, /2 tracked request/);
  assert.ok(!JSON.stringify(data).includes("secret upstream error"));
});

test("tracked IDs reject malformed input and enforce the twelve-request bound before fetching", async (t) => {
  let calls = 0;
  const base = await serve(t, {
    env: { RELAY_API_KEY: "fixture-key" },
    fetchImpl: async () => {
      calls++;
      return { ok: true, json: async () => ({ requests: [] }) };
    },
  });
  const ids = Array.from(
    { length: 13 },
    (_, index) => `0x${index.toString(16).padStart(64, "0")}`,
  );
  for (const query of [
    "",
    "../secret",
    "https://evil.example",
    "0x123",
    ids.slice(0, 2).join(",") + ",",
    ids.join(","),
    ids[0] + "&tracked=" + ids[1],
  ]) {
    assert.equal(
      (await fetch(`${base}/api/activity?tracked=${query}`)).status,
      400,
    );
  }
  assert.equal(calls, 0);
  const response = await fetch(
    `${base}/api/activity?tracked=${ids.slice(0, 12).join(",")}`,
  );
  assert.equal(response.status, 200);
  assert.equal(calls, 13);
  assert.equal((await response.json()).trackingMissingIds.length, 12);
});

test("static serving prevents traversal and symlink escapes and rejects writes", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "relay-city-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dist = join(root, "dist");
  await mkdir(dist);
  await writeFile(join(dist, "index.html"), "<h1>Relay City</h1>");
  await writeFile(join(root, "secret.txt"), "private");
  await symlink(join(root, "secret.txt"), join(dist, "escape.txt"));
  const base = await serve(t, { env: {}, distDir: dist });
  assert.equal(await (await fetch(base)).text(), "<h1>Relay City</h1>");
  for (const path of ["/..%2fsecret.txt", "/escape.txt", "/api/missing"]) {
    assert.equal((await fetch(base + path)).status, 404);
  }
  assert.equal(
    (await fetch(`${base}/api/activity`, { method: "POST" })).status,
    405,
  );
});
