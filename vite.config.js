import { defineConfig } from "vite";

export default defineConfig({
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
});
