import { expect, test } from "@playwright/test";

/** MDX contract components; none may survive into a page's Markdown twin. */
const contractComponents =
  /<\/?(Tabs|Tab|Steps|Step|Callout|Cards|Card|LiveExample|ComponentProps|SpecExcerpt|CustomizationPlayground|SourceDisclosure|SpecDocument)\b/;

/** Markdown outside fenced and inline code, where JSX would be a conversion leak. */
const prose = (markdown: string) =>
  markdown.replace(/^```[^\n]*\n[\s\S]*?^```/gm, "").replace(/`[^`\n]*`/g, "");

test("the runtime frame is sandboxed and only this site may embed it", async ({
  request,
}) => {
  const response = await request.get("opendil/frame.html");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toMatch(/^text\/html/);
  expect(response.headers()["content-security-policy"]).toBe(
    "sandbox allow-scripts; frame-ancestors 'self'",
  );
});

test("the opaque-origin frame can load the runtime script", async ({
  request,
}) => {
  // A sandboxed frame has an opaque origin, so its script request is cross-site.
  const response = await request.get("opendil/frame.js", {
    headers: {
      Origin: "null",
      "Sec-Fetch-Site": "cross-site",
      "Sec-Fetch-Mode": "no-cors",
      "Sec-Fetch-Dest": "script",
    },
  });
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toMatch(/javascript/);
});

test("docs pages have Markdown twins served as text/markdown without JSX", async ({
  request,
}) => {
  for (const [path, title] of [
    ["docs/getting-started.md", "Quickstart"],
    ["docs/chat-integration.md", "Add OpenDIL to your chat app"],
    ["docs/components/inputs.md", "Inputs"],
    ["docs/agent-spec/full.md", undefined],
  ] as const) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect(response.headers()["content-type"], path).toMatch(
      /^text\/markdown; charset=utf-8/,
    );
    const markdown = await response.text();
    expect(markdown, path).toMatch(new RegExp(`^# ${title ?? "\\S"}`));
    expect(prose(markdown), path).not.toMatch(contractComponents);
  }
});

test("generated attribute tables reach the Markdown twin", async ({
  request,
}) => {
  const markdown = await (
    await request.get("docs/components/inputs.md")
  ).text();
  // The checkbox table is generated from spec/genui.agent.full.md at build time.
  expect(markdown).toMatch(/^\|.*lineThrough.*\|$/m);
});

test("HTML pages keep their HTML content type", async ({ request }) => {
  for (const path of ["./", "docs/", "docs/getting-started/", "demo/form/"]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect(response.headers()["content-type"], path).toMatch(/^text\/html/);
  }
});
