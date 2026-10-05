# Web security and Cloudflare Pages readiness

Status checked 2026-10-02 from the local Web worktree and official platform documentation. No Firebase or Cloudflare console was accessed, and no external configuration was changed.

## Hosting fit

The Web app already uses Next static export. Cloudflare Pages supports static Next.js exports with build output out; for this repository the project root is web, the build command is npm run build, and the output directory is out. Leave NEXT_PUBLIC_BASE_PATH unset for a root-hosted Pages site; the GitHub Pages workflow currently builds under /Personal_app_android.

Cloudflare's GitHub App can be restricted to selected repositories. A private source repository can therefore feed a public static site, subject to the owner authorizing that repository. The built JavaScript and any data delivered to a browser remain copyable; private source does not make the website private.

Current official Pages limits include one concurrent build, 500 builds per month, 20,000 files per site, and 25 MiB per asset on Free. Static asset requests are free and unlimited; Pages Functions use Workers quotas. Firebase Auth, Firestore, Storage, AI Logic, and Firebase Functions retain their own configuration and billing.

GitHub Pages on GitHub Free requires a public source repository. Eligible paid GitHub plans allow a private source repository, while the published site is still public by default. The owner can compare that option without changing the repository's visibility.

## Data boundary findings

- A browser bundle and the information shown or returned to a browser can be copied. The security boundary for student data is Firebase authorization, not hiding routes or minifying JavaScript.
- The current invite lookup rule permits an authenticated client that knows a code to read the entire invite document. Invite documents carry contact and health/training profile fields. The Web claim flow reads them directly, and the existing Android/iOS contract also uses direct invite reads. Firestore rules cannot redact selected fields from a readable document.
- ADM access currently allows whole users/{uid} documents so the Web/native administration paths can load their records. The owner has stated ADM will be a single account for now. Tightening this safely still requires a data projection and client migration; changing rules alone risks breaking existing flows.
- The Web invitation-cap flow is not a global database invariant unless all writes are moved behind trusted server code. Other clients or direct writes must remain outside the guarantee until that migration is approved.

These are documented risks, not claims of a completed production security fix. Closing the invite and broad-ADM read risks needs an explicit compatibility decision and coordinated migration. No Android/iOS source was changed.

## Dependency audit (2026-10-05, supersedes the 2026-10-02 note)

- `web` (what ships): `npm audit --omit=dev` went from 4 high to **0**. The findings were `@grpc/grpc-js@1.9.16`
  pulled in by `@firebase/firestore`; `package.json` now has `overrides: { "@grpc/grpc-js": "^1.14.5" }`. The browser
  build never loads `grpc-js` (it is the Node transport), but the emulator suites do, and they pass on 1.14.5.
- `web` dev tooling: overrides for `basic-ftp`, `uuid` and `@opentelemetry/core` (firebase-tools' transitive
  dependencies) cleared those. **7 high remain**, all one chain — `braces` (stack-exhaustion DoS on deeply nested
  patterns) via `micromatch`, `fast-glob`, `chokidar`, `firebase-tools` and `eslint-config-next`. `braces@3.0.3` is the
  latest release and the advisory covers `<=3.0.3`, so there is no patched version to install; `npm audit fix --force`
  only proposes downgrading `firebase-tools`/`eslint-config-next`, which is not a fix. These run on a developer machine
  or CI against our own source files, are not part of `web/out`, and are not reachable from the site. Recheck after
  the next `braces` release.
- `functions`: `firebase-admin` 13 -> 14.5 and `firebase-functions` 6 -> 7.4 (the 14.x peer range needs 7.x), plus
  `overrides: { "uuid": "^11.1.1" }` (the first patched line that still ships a CommonJS build, which the Cloud
  Functions runtime loads). `npm audit`: 8 moderate -> **0**. The callable passes the emulator suite on the new
  versions; it has not been deployed.

## Local header preparation

public/_headers is copied into a static export and applies to Cloudflare Pages static responses. The file sets standard response headers plus an initial Content-Security-Policy-Report-Only policy. Report-only does not block requests; inspect browser console/network violations on an isolated preview, refine the allowed Firebase/Google hosts, then request owner review before enforcing any CSP. The header file does not protect Firebase data and does not apply to generated Pages Functions responses.

## Owner-controlled rollout gates

1. Review the exact Web/rules/Functions diff and emulator evidence.
2. Confirm Firebase production Rules, Storage, App Check, AI Logic, Auth domains/templates, and any required indexes in their consoles. Do not enable Blaze or publish Functions/Rules from this local preparation.
3. If Cloudflare is selected, authorize the GitHub App for this repository only, build a staging/isolated preview, and prove production Firebase data is not reachable from it.
4. Review the preview headers and all three role flows before connecting a production branch or custom domain. Preserve the existing GitHub Pages workflow as the rollback path; do not change DNS until the owner explicitly approves the cutover.

## Official references

- Cloudflare Pages static Next.js deployment: https://developers.cloudflare.com/pages/framework-guides/nextjs/deploy-a-static-nextjs-site/
- Cloudflare Pages GitHub integration and repository scoping: https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/
- Cloudflare Pages headers: https://developers.cloudflare.com/pages/configuration/headers/
- Cloudflare Pages limits: https://developers.cloudflare.com/pages/platform/limits/
- Cloudflare Pages static request pricing: https://developers.cloudflare.com/pages/functions/pricing/
- GitHub Pages plan and repository visibility: https://docs.github.com/en/pages/getting-started-with-github-pages
- Firestore fields and security rules: https://firebase.google.com/docs/firestore/security/rules-fields
## Choices required before closing the data-exposure findings

1. **Keep the existing invite contract:** Android/iOS continue working, but a signed-in client with a known code can still fetch a legacy invite's entire document. Document this as accepted residual risk only if the owner explicitly chooses that trade-off.
2. **Web-only migration:** new Web invites and claims can move behind a callable and stop adding profile fields to new Web-created documents. This does not close access to existing invite documents or documents written by old/native clients.
3. **Full invite closure:** move profile snapshots to server-only data; migrate Web plus both native invite producers/claimers to a callable; backfill or redact outstanding invites; retain compatibility for old installed client versions until they are retired; then deny direct client reads of raw invite data. The callable needs authenticated ownership checks, App Check, rate limits, validation and atomic consume.
4. **ADM directory:** keeping one owner ADM is the current product decision, but the rule still grants that role whole user documents. A narrower directory requires a safe trainer projection/aggregate endpoint and migration of both Web and native ADM reads before broad access can be removed.

The user has asked that Android/iOS remain unchanged for this execution. Until the owner later authorizes a client migration or explicitly accepts the documented residual risk, do not tighten these rules in a way that breaks the existing clients. Callable requests automatically carry Firebase Auth and, when configured, App Check tokens; deployment and enforcement are separate owner-controlled steps.

- Firebase callable functions and App Check: https://firebase.google.com/docs/functions/callable
- @grpc/grpc-js authorization advisory: https://github.com/grpc/grpc-node/security/advisories/GHSA-m9gg-hp2v-232j
- @grpc/grpc-js server error-message advisory: https://github.com/grpc/grpc-node/security/advisories/GHSA-f596-whhp-79r4