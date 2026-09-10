import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  // Where the dev server forwards the API and the socket. A local Sowel by default;
  // `SOWEL_TARGET=http://localhost:8080` points it at the showroom stack instead,
  // which is the only way to develop against a house that is actually living.
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.SOWEL_TARGET || "http://localhost:3000";

  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        "/api": { target, ws: true, changeOrigin: true },
        "/ws": { target, ws: true, changeOrigin: true },
      },
    },
  };
});
