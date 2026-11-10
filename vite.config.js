import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// En desarrollo, el servidor (/api) corre dentro de Vite: un solo comando, un solo puerto.
const servidorLocal = () => ({
  name: "servidor-local",
  async configureServer(server) {
    const { default: app } = await import("./server/app.js");
    server.middlewares.use((req, res, next) => (req.url.startsWith("/api") ? app(req, res, next) : next()));
  },
});

export default defineConfig({ plugins: [react(), servidorLocal()] });
