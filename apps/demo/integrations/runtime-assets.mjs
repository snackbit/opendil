import { readFile } from "node:fs/promises";
/** Astro blocks cross-site modules in dev; the opaque frame needs this already-public build asset. */
export default function runtimeAssets() {
  let path = "/opendil/frame.js";
  let install = () => {};
  return {
    name: "opendil:public-runtime",
    hooks: {
      "astro:config:done": ({ config }) => {
        path = config.base.replace(/\/$/, "") + "/opendil/frame.js";
      },
      "astro:server:setup": ({ server }) => {
        install = () =>
          server.middlewares.stack.unshift({
            route: "",
            handle: async (request, response, next) => {
              if (
                (request.method !== "GET" && request.method !== "HEAD") ||
                request.url?.split("?")[0] !== path
              ) {
                next();
                return;
              }
              try {
                const bytes = await readFile(
                  new URL("../public/opendil/frame.js", import.meta.url),
                );
                response.writeHead(200, {
                  "Content-Type": "text/javascript",
                  "Content-Length": bytes.length,
                  "Cache-Control": "no-store",
                  "Cross-Origin-Resource-Policy": "cross-origin",
                });
                response.end(request.method === "HEAD" ? undefined : bytes);
              } catch {
                response
                  .writeHead(404)
                  .end(
                    "Runtime asset missing. Build OpenDIL and copy its assets first.",
                  );
              }
            },
          });
      },
      // Astro installs its fetch-metadata guard after setup hooks; serve this public file ahead of it.
      "astro:server:start": () => install(),
    },
  };
}
