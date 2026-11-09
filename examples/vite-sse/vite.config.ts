import react from "@vitejs/plugin-react";
import { defineConfig, type Connect, type Plugin } from "vite";

const frameHeader: Connect.NextHandleFunction = (request, response, next) => {
  if (request.url?.split("?")[0]?.endsWith("/opendil/frame.html"))
    response.setHeader(
      "Content-Security-Policy",
      "sandbox allow-scripts; frame-ancestors 'self'",
    );
  next();
};

// Sends the frame header from `vite` and `vite preview`.
function opendilFrameHeader(): Plugin {
  return {
    name: "opendil-frame-header",
    configureServer: (server) => void server.middlewares.use(frameHeader),
    configurePreviewServer: (server) =>
      void server.middlewares.use(frameHeader),
  };
}

export default defineConfig({
  plugins: [react(), opendilFrameHeader()],
  // Forward chat requests to the API server during development.
  // `vite preview` uses the same proxy.
  server: { host: "127.0.0.1", proxy: { "/api": "http://127.0.0.1:8787" } },
  preview: { host: "127.0.0.1" },
});
