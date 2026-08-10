import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // Keep local development self-contained; deployed builds use the public API
  // URL injected by VITE_API_BASE_URL.
  const apiTarget = mode === "development"
    ? (env.VITE_DEV_API_BASE_URL || "http://localhost:3000")
    : (env.VITE_API_BASE_URL || "http://localhost:3000");
  return {
    plugins: [react()],
    server: {
      host: "0.0.0.0",
      port: 5173,
      proxy: {
        "/api": apiTarget,
        "/socket.io": { target: apiTarget, ws: true },
      },
    },
  };
});
