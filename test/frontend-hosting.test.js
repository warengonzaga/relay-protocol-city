import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import configure from "../vite.config.js";

test("Pages builds use the repository path and reject unsafe public API endpoints", () => {
  const originalDirectory = process.cwd();
  const originalEndpoint = process.env.VITE_API_URL;
  const emptyDirectory = mkdtempSync(join(tmpdir(), "relay-city-config-"));
  try {
    process.chdir(emptyDirectory);
    delete process.env.VITE_API_URL;
    assert.equal(configure({ mode: "pages" }).base, "/relay-protocol-city/");
    assert.equal(configure({ mode: "development" }).base, "/");
    assert.equal(configure({ mode: "production" }).base, "/");
    for (const endpoint of [
      "https://city-api.example/api/activity",
      "http://127.0.0.1:4175/api/activity",
      "http://localhost:4175/api/activity",
    ]) {
      process.env.VITE_API_URL = endpoint;
      assert.doesNotThrow(() => configure({ mode: "pages" }));
    }
    for (const endpoint of [
      "not-a-url",
      "http://remote.example/api/activity",
      "https://user:password@example.com/api/activity",
      "https://example.com/api/activity?apiKey=unsafe",
      "https://example.com/api/activity#fragment",
      "https://example.com/",
      "javascript:alert(1)",
      "//example.com/api/activity",
    ]) {
      process.env.VITE_API_URL = endpoint;
      assert.throws(() => configure({ mode: "pages" }), /VITE_API_URL/);
    }
  } finally {
    process.chdir(originalDirectory);
    if (originalEndpoint === undefined) delete process.env.VITE_API_URL;
    else process.env.VITE_API_URL = originalEndpoint;
    rmSync(emptyDirectory, { recursive: true, force: true });
  }
});
