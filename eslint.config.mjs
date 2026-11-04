import base from "@opendil/eslint-config";
import next from "@next/eslint-plugin-next";
export default [
  ...base,
  { ignores: ["**/.next-*/**", "**/.source/**"] },
  {
    files: ["apps/site/**/*.{ts,tsx,mjs}"],
    plugins: { "@next/next": next },
    settings: { next: { rootDir: "apps/site" } },
    rules: {
      ...next.configs.recommended.rules,
      ...next.configs["core-web-vitals"].rules,
    },
  },
];
