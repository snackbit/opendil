# Contributing

## Repository layout

| Path               | Contents                                                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `packages/opendil` | The published package `@snackbit/opendil`: React renderer, parser, runtime, stock components, styles, and the `opendil` CLI |
| `spec/`            | The agent spec (`genui.agent.md`, `genui.agent.full.md`, `genui.examples.md`), shipped verbatim in the package              |
| `apps/site`        | The website, docs, and playground: Next.js 16 and Fumadocs. Docs pages live in `apps/site/content/docs`                     |
| `examples/`        | Standalone example apps that consume the package                                                                            |
| `tests/unit`       | Vitest unit tests                                                                                                           |
| `tests/e2e`        | Playwright browser tests against the site                                                                                   |
| `scripts/`         | Repository checks and capture scripts                                                                                       |

Good starting points in the package source (`packages/opendil/src/dil`): `dil-renderer.tsx` for the public React contract, `parser/` for incremental parsing, `runtime/` for state and expressions, `isolation/` for the iframe and QuickJS worker, `view/` for virtualization and streaming presentation, and `widgets/` for stock components.

## Setup

Use Node 24 and npm.

`npm ci` installs the tracked `.githooks/pre-commit` hook for this checkout.
If dependencies were installed with `--ignore-scripts`, run `npm run hooks:install`.
Stage all tracked edits before committing. Every commit runs `npm run ci:local`,
the same build, quality, browser, package, rebuild, site, links, and example checks
as GitHub CI. Install Chromium with the setup command below before the first commit.

```sh
npm ci
npm run build
npx playwright install chromium
npm run dev
```

`npm run dev` builds the package and starts the site's development server. The site imports the package through its exports, so rebuild the package (`npm run build:package`) after library changes.

## Checks

Run these before handing off a change:

| Command                  | What it checks                                                                 |
| ------------------------ | ------------------------------------------------------------------------------ |
| `npm run check`          | Formatting, lint, repository structure, types, and unit tests with coverage    |
| `npm run test:e2e`       | Browser tests against the production site; run `npm run build` first           |
| `npm run check:package`  | Packs the package and tests the tarball in a separate consumer                 |
| `npm run check:rebuild`  | Live dev-server imports stay available while the package output is republished |
| `npm run check:links`    | Links in the docs content resolve to pages, anchors, or files                  |
| `npm run check:examples` | The example apps in `examples/` build against the current package              |

Use focused runs while iterating, such as `npx vitest run tests/unit/parser.test.ts` or `npx playwright test tests/e2e/smoke.spec.ts`.

Package builds stage all JavaScript, CSS, runtime assets, and declarations before replacing complete output files, so an active dev server keeps working through a rebuild. The asset-copy CLI uses the same atomic replacement. Old hashed chunks stay available to pages that loaded the previous build. Packing is the exception: `prepack` and `npm run check:package` delete every `dist` file the last build did not write, so do not pack while a dev page still uses an older build. Unit tests load the QuickJS worker from `dist/test/vm.js`, which is never packed. Run `npm run check:rebuild` after build-system changes.

## Agent spec checks

The package ships `spec/*.md` verbatim as the `agent-spec` entry and Markdown exports, so keep maintainer notes out of those files. Run `npm run build:package` before `npm run check:agent-spec`.

The check reads the stock renderer's component dispatch through the TypeScript AST and compares the consumed property names with the spec files. Missing, invented, and duplicate component or property definitions fail. Every executable `dil` fence in the spec files goes through the real parser, whole and character by character, and its declarations and expressions run in the built QuickJS worker. When property reads move into another helper, update the widget-owner mappings the extractor follows.

To check a model response, set `GENUI_RESPONSE_FILE` to its path. The response then goes through the parser, component, property-name, composition, and expression checks. This does not call a model, score visual quality, or verify facts, and a passing check is not a type schema: types, defaults, and nested content shapes still need source review and behavior tests.

## Changesets

Add a changeset with `npm run changeset` for public behavior or API changes. Describe what changes for a consumer. Keep refactoring, docs, and tests close to the behavior they explain.

## Release setup

Complete these steps in order before the first push to `main`:

1. Create a GitHub App installed only on this repository with Contents and Pull requests read/write permissions. Configure its client ID as the repository variable `RELEASE_APP_CLIENT_ID` and its private key as the secret `RELEASE_APP_PRIVATE_KEY`. Its short-lived token lets Changesets open and update the release PR and lets the normal PR CI run. The workflow does not use this token for npm authentication.
2. Create the `npm` GitHub environment, restrict it to `main`, and require maintainer approval. Enable Dependabot alerts, secret scanning with push protection, and private vulnerability reporting.
3. npm configures trusted publishing only for an existing package. Bootstrap `@snackbit/opendil` with a placeholder: in an empty directory, add a `package.json` with the package name, version `0.0.0`, license, repository, and a one-line description, plus a README that points to this repository. Run `npm publish --access public` with two-factor authentication. Do not store an npm token in Actions.
4. Configure the trusted publisher with `npm trust github @snackbit/opendil --file release.yml --repo snackbit/opendil --env npm --allow-publish` (npm 11.10 or newer) or the equivalent package settings on npmjs.com. A new configuration must complete its first publish within two days. See the [npm trusted publishing documentation](https://docs.npmjs.com/trusted-publishers/).
5. Push `main`. After the `npm` environment approval, the release workflow publishes the current version with provenance and creates its GitHub release. Then run `npm deprecate @snackbit/opendil@0.0.0 "Placeholder; install 0.1.0 or later"` and set the package to require two-factor authentication and disallow tokens.
6. Protect `main` with PR review and the CI checks, and disable force pushes.

Changesets opens a version/changelog PR after changesets land on `main`. Once that PR is reviewed, checked, and merged, the release workflow builds and validates the version, packs it once, and publishes that tarball through npm OIDC with provenance. Pushes whose package version is already on npm skip verification and publishing. Only the protected publish job receives OIDC permission. GitHub releases point to the published package version. Versions are immutable; fix a bad release in a new patch rather than overwriting it.

The package build copies the root `README.md`, `LICENSE`, and `THIRD_PARTY_NOTICES.md` into `packages/opendil`, so the root README is also the npm page. Use absolute links in it.

## Website deployment

Vercel builds the site with the settings in `vercel.json`. Import the repository with the Vercel Git integration and keep the root directory at the repository root. Use `main` as the production branch, add `opendil.com` as the production domain, and redirect `www.opendil.com` to it. Pull requests get preview deployments.

Canonical URLs use `SITE_URL` when it is set, then Vercel's production domain, then `https://opendil.com`. `SITE_BASE_PATH` builds the site under a subpath, as `npm run check:site` does.
