import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const frontendDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(frontendDir, "..");

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    fs: {
      // Allow importing `docs/*.md` from `frontend/src` (e.g. decisions log on About page).
      allow: [frontendDir, repoRoot],
    },
    proxy: {
      "/api": { target: "http://127.0.0.1:4000", changeOrigin: true },
    },
  },
});
