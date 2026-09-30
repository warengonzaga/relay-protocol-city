import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const endpoint = loadEnv(mode, process.cwd()).VITE_API_URL?.trim();
  if (endpoint) {
    let url;
    try {
      url = new URL(endpoint);
    } catch {
      throw new Error("VITE_API_URL must be an absolute HTTPS activity URL.");
    }
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      (url.protocol !== "https:" && !(url.protocol === "http:" && local)) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/api/activity"
    ) {
      throw new Error(
        "VITE_API_URL must end in /api/activity, use HTTPS (or local HTTP), and contain no credentials, query, or fragment.",
      );
    }
  }
  return {
    base: mode === "pages" ? "/relay-protocol-city/" : "/",
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
      proxy: { "/api": "http://127.0.0.1:4174" },
    },
    build: {
      rolldownOptions: {
        output: {
          manualChunks: (id) =>
            id.includes("node_modules/three") ? "three" : undefined,
        },
      },
    },
  };
});
