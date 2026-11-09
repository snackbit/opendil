import { afterEach, describe, expect, it, vi } from "vitest";
import { readChatRequest as readSse } from "../../../examples/vite-sse/server/request";
import { readChatRequest as readSdk } from "../../../examples/next-ai-sdk/app/api/chat/request";
import { POST } from "../../../examples/vite-sse/server/chat";

const sse = { role: "user", content: "Make a calculator" };
const sdk = {
  id: "a",
  role: "user",
  parts: [{ type: "text", text: "Make a calculator" }],
};
function request(
  body: unknown,
  url = "http://127.0.0.1/api/chat",
  headers: Record<string, string> = {},
) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
for (const [name, read, valid] of [
  ["SSE", readSse, sse],
  ["AI SDK", readSdk, sdk],
] as const) {
  describe(`${name} local chat boundary`, () => {
    it("refuses production and unspecified environments before reading input", async () => {
      for (const environment of ["production", undefined]) {
        vi.stubEnv("NODE_ENV", environment);
        const req = request({ messages: [valid] });
        expect(await read(req)).toMatchObject({ status: 403 });
        expect(req.bodyUsed).toBe(false);
      }
    });
    it("accepts only local development requests and validates message roles", async () => {
      vi.stubEnv("NODE_ENV", "development");
      expect(
        await read(
          request({ messages: [valid] }, "http://localhost/api/chat", {
            origin: "http://localhost:5173",
          }),
        ),
      ).toEqual([valid]);
      for (const origin of ["https://attacker.invalid", "null", "not a URL"])
        expect(
          await read(request({ messages: [valid] }, undefined, { origin })),
        ).toMatchObject({ status: 403 });
      expect(
        await read(
          request({ messages: [valid] }, "http://public.invalid/api/chat"),
        ),
      ).toMatchObject({ status: 403 });
      expect(
        await read(
          request({ messages: [valid] }, undefined, {
            "sec-fetch-site": "cross-site",
          }),
        ),
      ).toMatchObject({ status: 403 });
      for (const role of ["system", "developer", "tool"])
        expect(
          await read(request({ messages: [{ ...valid, role }] })),
        ).toMatchObject({ status: 400 });
      for (const messages of [null, [], Array(41).fill(valid), [null]])
        expect(await read(request({ messages }))).toMatchObject({
          status: 400,
        });
      expect(await read(request(null))).toMatchObject({ status: 400 });
    });
    it("bounds actual body bytes and handles malformed JSON and content types", async () => {
      vi.stubEnv("NODE_ENV", "development");
      expect(
        await read(
          request(
            { messages: [valid], padding: "x".repeat(65536) },
            undefined,
            { "content-length": "1" },
          ),
        ),
      ).toMatchObject({ status: 400 });
      expect(
        await read(
          request({ messages: [valid] }, undefined, {
            "content-type": "text/plain",
          }),
        ),
      ).toMatchObject({ status: 400 });
      expect(
        await read(
          new Request("http://localhost/api/chat", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{",
          }),
        ),
      ).toMatchObject({ status: 400 });
      expect(await read(request({ messages: [valid] }))).toEqual([valid]);
      expect(
        await read(
          new Request("http://localhost/api/chat", {
            method: "POST",
            headers: { "content-type": "application/json" },
          }),
        ),
      ).toMatchObject({ status: 400 });
    });
  });
}
it("accepts SDK step markers while rejecting files, tools, and oversized text", async () => {
  vi.stubEnv("NODE_ENV", "development");
  expect(
    await readSdk(
      request({
        messages: [{ ...sdk, parts: [{ type: "step-start" }, ...sdk.parts] }],
      }),
    ),
  ).toEqual([sdk]);
  for (const part of [
    null,
    { type: "file", url: "https://attacker.invalid" },
    { type: "tool-call" },
    { type: "text", text: 42 },
    { type: "text", text: "x".repeat(16001) },
  ])
    expect(
      await readSdk(request({ messages: [{ ...sdk, parts: [part] }] })),
    ).toMatchObject({ status: 400 });
  for (const invalid of [
    { ...sdk, id: null },
    { ...sdk, id: "" },
    { ...sdk, id: "x".repeat(129) },
    { ...sdk, parts: null },
    { ...sdk, parts: [] },
    { ...sdk, parts: Array(41).fill(sdk.parts[0]) },
    { ...sdk, parts: [{ type: "step-start" }] },
  ])
    expect(await readSdk(request({ messages: [invalid] }))).toMatchObject({
      status: 400,
    });
  expect(
    await readSse(request({ messages: [{ ...sse, content: 42 }] })),
  ).toMatchObject({ status: 400 });
  expect(
    await readSse(
      request({ messages: [{ ...sse, content: "x".repeat(16001) }] }),
    ),
  ).toMatchObject({ status: 400 });
});
it("rejects at the SSE route before contacting a provider, and forwards validated roles only", async () => {
  vi.stubEnv("NODE_ENV", "production");
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response("data: [DONE]\n\n"));
  expect(await POST(request({ messages: [sse] }))).toMatchObject({
    status: 403,
  });
  vi.stubEnv("NODE_ENV", "development");
  expect(
    await POST(request({ messages: [{ ...sse, role: "system" }] })),
  ).toMatchObject({ status: 400 });
  expect(fetch).not.toHaveBeenCalled();
  const response = await POST(request({ messages: [sse] }));
  await response.text();
  expect(fetch).toHaveBeenCalledOnce();
  expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toMatchObject({
    messages: [{ role: "system" }, sse],
  });
});
