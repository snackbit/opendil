import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { chromium, expect } from "@playwright/test";
const exec = promisify(execFile);
const base = "http://127.0.0.1:5179";
const server = spawn(
  process.execPath,
  [
    resolve("node_modules/astro/bin/astro.mjs"),
    "dev",
    "--ignore-lock",
    "--host",
    "127.0.0.1",
    "--port",
    "5179",
  ],
  { cwd: resolve("apps/demo"), stdio: "pipe" },
);
let diagnostics = "";
server.stdout.on("data", (data) => {
  diagnostics = (diagnostics + data).slice(-4000);
});
server.stderr.on("data", (data) => {
  diagnostics = (diagnostics + data).slice(-4000);
});
let browser;
let timer;
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      ready = (await fetch(base)).ok;
    } catch {
      /* The owned dev server is starting. */
    }
    if (ready) break;
    await new Promise((done) => setTimeout(done, 100));
  }
  if (!ready)
    throw new Error("Development server did not start: " + diagnostics);
  const crossSite = {
    "Sec-Fetch-Site": "cross-site",
    "Sec-Fetch-Mode": "no-cors",
  };
  if (!(await fetch(base + "/opendil/frame.js", { headers: crossSite })).ok)
    throw new Error(
      "The opaque frame cannot load its public runtime in development.",
    );
  if (
    (await fetch(base + "/src/demo-renderer.tsx", { headers: crossSite }))
      .status !== 403
  )
    throw new Error("Private dev modules must retain cross-site protection.");
  browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  const frameRequests = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith("/frame.js"))
      frameRequests.push(request.url());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base + "/demo/showcase/");
  await expect(
    page.locator('[data-dil-mode="shadow"] [data-complete="true"]'),
  ).toBeAttached();
  const samples = [];
  const files = ["index.js", "ui.js", "styles.css"];
  timer = setInterval(() => {
    for (const file of files)
      samples.push(
        fetch(base + "/@fs" + resolve("packages/opendil/dist", file)).then(
          (response) => {
            if (!response.ok)
              throw new Error(
                "Rebuild interrupted a public export: " +
                  file +
                  " HTTP " +
                  response.status,
              );
          },
        ),
      );
  }, 50);
  await exec("npm", ["run", "build"], { maxBuffer: 8 * 1024 * 1024 });
  clearInterval(timer);
  await Promise.all(samples);
  await expect(
    page.locator('[data-dil-mode="shadow"] [data-complete="true"]'),
  ).toBeAttached();
  await expect(
    page.locator('[data-dil-mode="shadow"]').getByRole("heading", {
      name: "Interactive workspace",
      exact: true,
    }),
  ).toBeVisible();
  if (errors.length) throw new Error(errors.join("\n"));
  if (frameRequests.length)
    throw new Error(
      "Default demo requested iframe runtime: " + frameRequests.join(", "),
    );
  console.log(
    "Live Vite rebuild passed: " +
      samples.length +
      " export requests; no missing assets or blank page.",
  );
} finally {
  clearInterval(timer);
  await browser?.close();
  server.kill();
}
