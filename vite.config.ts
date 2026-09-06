import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // A local Sowel instance; the showroom's proxy plays this role in production.
    proxy: {
      "/api": { target: "http://localhost:3000", ws: true },
    },
  },
});
