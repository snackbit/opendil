import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import starlight from "@astrojs/starlight";
import tailwind from "@tailwindcss/postcss";
import runtimeAssets from "./integrations/runtime-assets.mjs";
const vercelProduction = process.env.VERCEL_PROJECT_PRODUCTION_URL;
export default defineConfig({
  // Canonical URLs and the sitemap name the production domain, also on preview deployments.
  site:
    process.env.SITE_URL ??
    (vercelProduction ? "https://" + vercelProduction : "https://opendil.com"),
  base: process.env.SITE_BASE_PATH ?? "/",
  trailingSlash: "always",
  integrations: [
    runtimeAssets(),
    react(),
    starlight({
      title: "OpenDIL",
      favicon: "/favicon.svg",
      customCss: ["./src/site/styles/docs.css"],
      components: {
        Header: "./src/site/components/docs-header.astro",
        ThemeProvider: "./src/site/components/theme-provider.astro",
        ThemeSelect: "./src/site/components/theme-select.astro",
      },
      sidebar: [
        {
          label: "Start here",
          items: [
            { label: "Getting started", slug: "docs/getting-started" },
            { label: "Streaming", slug: "docs/streaming" },
            { label: "DIL language", slug: "docs/language" },
          ],
        },
        {
          label: "Reference",
          items: [
            { label: "Renderer API", slug: "docs/renderer" },
            { label: "Isolation", slug: "docs/isolation" },
            { label: "React UI exports", slug: "docs/ui" },
          ],
        },
        {
          label: "Components",
          items: [{ autogenerate: { directory: "docs/components" } }],
        },
        {
          label: "Customization",
          items: [{ autogenerate: { directory: "docs/customization" } }],
        },
      ],
      expressiveCode: {
        themes: ["github-light", "github-dark"],
        styleOverrides: {
          codeFontFamily: "var(--od-font-code)",
          codeFontSize: "13px",
          borderRadius: "8px",
        },
      },
      editLink: {
        baseUrl: "https://github.com/snackbit/opendil/edit/main/apps/demo/",
      },
    }),
  ],
  vite: {
    server: { strictPort: true },
    css: { postcss: { plugins: [tailwind()] } },
    build: { target: "es2022" },
  },
});
