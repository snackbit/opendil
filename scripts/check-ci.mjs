import { execFileSync } from "node:child_process";

const checks = [
  "build",
  "check",
  "test:e2e",
  "check:package",
  "check:rebuild",
  "check:site",
  "check:links",
  "check:examples",
];
for (const check of checks) {
  const started = performance.now();
  console.log(`Running ${check}`);
  execFileSync("npm", ["run", check], { stdio: "inherit" });
  console.log(
    `${check} passed in ${((performance.now() - started) / 1000).toFixed(1)}s`,
  );
}
execFileSync("git", ["diff", "--exit-code"], { stdio: "inherit" });
