import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// En tu compu, /api se redirige al servidor local (npm run server)
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://localhost:3001" } },
});
