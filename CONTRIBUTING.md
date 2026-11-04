# Contributing

Use Node 24 and npm. Install with `npm ci`, build with `npm run build`, and run `npm run check`. Install Chromium with `npx playwright install chromium` before `npm run test:e2e`. Run `npm run check:package` to test the packed artifact in a separate consumer.

The demo uses package exports, so rebuild the package after library edits. `npm run dev` starts the demo; `npm run preview -w @opendil/demo` serves its production build on port 3100. `npm run capture` uses that production server to refresh screenshots and print benchmark measurements. `npm run capture:readme` records the README animation from the same server and needs `ffmpeg`.

Add a changeset with `npm run changeset` for public behavior or API changes. Describe what changes for a consumer. Keep refactoring, docs, and tests close to the behavior they explain.

Package builds stage all JavaScript, CSS, runtime assets, and declarations before replacing complete output files. Existing exports remain available to an active Vite server throughout a rebuild. The asset-copy CLI uses the same atomic file replacement. Old hashed chunks remain available to pages that loaded the previous build. Packing is the exception: `prepack` and `npm run check:package` delete every `dist` file the last build did not write, so do not pack while a dev page still uses an older build. Unit tests load the QuickJS worker from `dist/test/vm.js`, which is never packed.

Run `npm run check:rebuild` after build-system changes. It owns a temporary Astro development server on port 5179, rebuilds while a browser is open, checks export and runtime-asset availability, and shuts the server down. `npm run check:site` builds the production site under the `/opendil/` subpath and checks documentation search and live examples there, which catches root-relative links.

## Agent specification checks

The package ships `spec/*.md` verbatim as the `agent-spec` entry and Markdown exports, so keep maintainer notes out of those files. Run `npm run build:package` before `npm run check:agent-spec`.

The check reads the stock renderer dispatch and delegated widget owners through the TypeScript AST, extracts consumed property names, and compares that inventory with both references. Shared layout/SVG props and icon/SVG allowlists are checked separately. Missing, invented, and duplicate component or property definitions fail. Signatures are derived from source in memory; there is no generated inventory to keep in sync. The extractor follows explicit widget-owner mappings and shared attribute readers, so update those mappings when property reads move into another helper or use indirect keys.

Every executable `dil` fence in the three specification files goes through the real parser, and its declarations and expressions run in the built QuickJS worker. Example names include the source file, opening-fence line, and nearest heading. The check compares whole-source parsing with character-by-character incremental parsing, verifies known composition contracts, and requires searchable catalog coverage of all stock components, allowed SVG elements, and the representative generation tasks. Browser tests exercise the interactive recipes and the source-copy workflow.

To check a model response, set `GENUI_RESPONSE_FILE` to its local path when running the command. The response then goes through the parser, component, property-name, composition, and expression checks. This does not call a model, score visual quality, prove supplied facts, or explore every interaction. The eight `Task:` recipes in the full reference make a small evaluation set; inspect the initial output and the next user interaction.

A passing check is not a type schema: types, enums, defaults, nested content shapes, and CSS semantics still need source review and behavior tests, and it does not prove every handler path safe or validate a custom host contract.

## Release setup

Complete these steps in order before the first push to `main`:

1. Create a GitHub App installed only on this repository with Contents and Pull requests read/write permissions. Configure its client ID as the repository variable `RELEASE_APP_CLIENT_ID` and its private key as the secret `RELEASE_APP_PRIVATE_KEY`. Its short-lived token lets Changesets open and update the release PR and lets the normal PR CI run. The workflow does not use this token for npm authentication.
2. Create the `npm` GitHub environment, restrict it to `main`, and require maintainer approval. Enable Dependabot alerts, secret scanning with push protection, and private vulnerability reporting.
3. npm configures trusted publishing only for an existing package. Bootstrap `@snackbit/opendil` with a placeholder: in an empty directory, add a `package.json` with the package name, version `0.0.0`, license, repository, and a one-line description, plus a README that points to this repository. Run `npm publish --access public` with two-factor authentication. Do not store an npm token in Actions.
4. Configure the trusted publisher with `npm trust github @snackbit/opendil --file release.yml --repo snackbit/opendil --env npm --allow-publish` (npm 11.10 or newer) or the equivalent package settings on npmjs.com. A new configuration must complete its first publish within two days. See the [npm trusted publishing documentation](https://docs.npmjs.com/trusted-publishers/).
5. Push `main`. After the `npm` environment approval, the release workflow publishes the current version with provenance and creates its GitHub release. Then run `npm deprecate @snackbit/opendil@0.0.0 "Placeholder; install 0.1.0 or later"` and set the package to require two-factor authentication and disallow tokens.
6. Protect `main` with PR review and the CI checks, and disable force pushes.

Changesets opens a version/changelog PR after changesets land on `main`. Once that PR is reviewed, checked, and merged, the release workflow builds and validates the version, packs it once, and publishes that tarball through npm OIDC with provenance. Pushes whose package version is already on npm skip verification and publishing. Only the protected publish job receives OIDC permission. GitHub releases point to the published package version. Versions are immutable; fix a bad release in a new patch rather than overwriting it.

## Website deployment

Vercel builds the site with the settings in `vercel.json`: `npm ci`, `npm run build`, and static output from `apps/demo/dist` at the domain root. Vercel also answers `/demo/` and `/docs/` with HTTP redirects, because Astro's static fallback pages wait two seconds before redirecting. Import the repository with the Vercel Git integration and keep the root directory at the repository root. Use `main` as the production branch, add `opendil.com` as the production domain, and redirect `www.opendil.com` to it. Pull requests get preview deployments.

Canonical URLs and the sitemap use `SITE_URL` when it is set, then Vercel's production domain, then `https://opendil.com`. `SITE_BASE_PATH` builds the site under a subpath, as `npm run check:site` does.
