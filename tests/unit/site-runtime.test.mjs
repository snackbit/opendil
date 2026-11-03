import { afterEach, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import runtimeAssets from "../../apps/demo/integrations/runtime-assets.mjs";
vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));
afterEach(() => vi.resetAllMocks());
it("serves only the public runtime path and preserves the rest of the dev middleware chain", async () => {
  const integration = runtimeAssets(),
    stack = [];
  integration.hooks["astro:config:done"]({ config: { base: "/project/" } });
  integration.hooks["astro:server:setup"]({
    server: { middlewares: { stack } },
  });
  expect(stack).toHaveLength(0);
  integration.hooks["astro:server:start"]();
  const handler = stack[0].handle;
  const next = vi.fn(),
    response = { writeHead: vi.fn(), end: vi.fn() };
  response.writeHead.mockReturnValue(response);
  for (const request of [
    { method: "POST", url: "/project/opendil/frame.js" },
    { method: "GET", url: "/src/private.ts" },
    { method: "GET" },
  ])
    await handler(request, response, next);
  expect(next).toHaveBeenCalledTimes(3);
  expect(readFile).not.toHaveBeenCalled();
  vi.mocked(readFile).mockResolvedValue(Buffer.from("public runtime"));
  await handler(
    { method: "GET", url: "/project/opendil/frame.js?v=1" },
    response,
    next,
  );
  expect(response.writeHead).toHaveBeenLastCalledWith(
    200,
    expect.objectContaining({
      "Content-Type": "text/javascript",
      "Cross-Origin-Resource-Policy": "cross-origin",
    }),
  );
  expect(response.end).toHaveBeenLastCalledWith(Buffer.from("public runtime"));
  await handler(
    { method: "HEAD", url: "/project/opendil/frame.js" },
    response,
    next,
  );
  expect(response.end).toHaveBeenLastCalledWith(undefined);
  vi.mocked(readFile).mockRejectedValue(new Error("Missing file"));
  await handler(
    { method: "GET", url: "/project/opendil/frame.js" },
    response,
    next,
  );
  expect(response.writeHead).toHaveBeenLastCalledWith(404);
});
