# web/ — Personal Tracker's web front

A Next.js (App Router) app that replaces the Kotlin/JS web build. The plan, and the reasons for
every decision below, are in [`GOALS.md` §23](../GOALS.md) — read that first.

## Styling (§23k)

Phase 1 was built and validated with no CSS at all (§23j passed 2026-09-28); the visual pass then
applied the trainer's ALLU template over the same component tree. The whole look is
`src/app/globals.css` — tokens, component classes (named as in the template) and defaults for bare
elements — with two shared frames in `src/app/_shared/`: `AppShell` (forest rail on a desktop; slim
top bar and bottom tab bar on a tablet or phone) for `/app` and `/aluno`, and `PublicShell` for the
landing, sign-in and invite pages. No CSS framework or component library: the template's CSS is
plain, and `package.json` still depends on `next`/`react`/`react-dom` only. Responsive behaviour is
in the stylesheet's media queries (>1050, 861–1050, ≤860, ≤600, ≤430px); a table with more than three
columns takes `className="stack"` and a `data-label` per cell so it becomes labelled rows on a phone.

## Routes

| URL | Directory | Who |
|---|---|---|
| `/` | `src/app/page.tsx` | Public landing (§23i) |
| `/entrar` | `src/app/entrar/` | Login, for anyone with an account (§23f) |
| `/convite?c=CODE` | `src/app/convite/` | A student's first visit: create an account, claim the invite (§23f) |
| `/app` | `src/app/app/` | Trainer (§23g) — "Hoje", Agenda, Alunos, Registros, Mensalidades |
| `/aluno` | `src/app/aluno/` | Student (§23h) — mobile-first |

`src/app/app/` is not a typo: the outer `app/` is the App Router directory, the inner one is the
`/app` URL segment. `/app` and `/aluno` have separate layouts on purpose — see §23's decisions —
and each guards itself (`RequireArea`): whoever belongs elsewhere is sent there.

**This is a static export** (`output: "export"`): no server exists in production, so no Server
Actions, route handlers, cookies, redirects or dynamic path segments — Next refuses them even in
`next dev`. That is why the invite link carries its code as `?c=` rather than in the path. All auth
and data run in the browser through the Firebase client SDK; `firestore.rules` is the security.

## Run and check

This project uses **npm** (there is a `package-lock.json`; don't mix in another package manager)
on **Node 24** (`engines` in `package.json`; Node 20 is end-of-life).

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # Vitest, pure domain logic in src/domain/
npm run lint
npm run build    # also type-checks everything and generates the route types for PageProps / LayoutProps
```

A bare `npx tsc --noEmit` on a fresh checkout fails with `Cannot find name 'LayoutProps'`: those
global types are generated. Run `npx next typegen` (or any `dev`/`build`) once first.

`src/domain/` holds the data model and every derivation the screens need — pure functions, no
Firestore, no clock (every "today" is an argument). Read the comments there before touching a
number on the dashboard: several of them encode findings about how the Kotlin app actually writes
data (one workout-log document per *exercise*, students split across two collections).

### Emulator tests (security rules + data layer)

```bash
npm run test:rules   # everything in rules/, against the local Firestore emulator
```

`rules/` holds what needs a real Firestore: the repo-root `firestore.rules` itself, and the data
layer (`src/data/`) reading and writing *through* those rules as a signed-in user — where the
model (`src/domain/`), the rules and the converters all have to agree for a write to land. Files
run one at a time (`--no-file-parallelism`): they share one emulator and each clears it.

### Running the app on fake data

Everything can be exercised without touching the real Firebase project:

```bash
npx firebase emulators:start --config ../firebase.json --project demo-personal-tracker --only auth,firestore
npm run seed:emulators                              # a trainer, a draft student and its invite
NEXT_PUBLIC_FIREBASE_EMULATORS=true npm run dev     # the app, pointed at the emulators
```

The seed prints the trainer's login and the invite link. Re-running it wipes both emulators first.

Needs **Java 21** (Firebase CLI 15 dropped older Javas for the emulators). If `java -version`
says something older, point `JAVA_HOME` and `PATH` at a JDK 21 for that command — on the main
dev machine, Gradle already provisioned one under `~/.gradle/jdks/`. The first run downloads the
Firestore emulator jar from Google. The project id is `demo-personal-tracker`: the `demo-`
prefix keeps the emulator from ever touching the real Firebase project.

`RULES_FILE=<path> npm run test:rules` runs the same suite against another rules file — for
example the version currently published, to see exactly which guarantees a candidate adds.
Because `assertFails` passes on *any* failure, that comparison is also what proves each test
actually discriminates.

## Deploy

`.github/workflows/web-deploy.yml` publishes this app to GitHub Pages
(`https://alexmiguel011014-stack.github.io/Personal_app_android/`) on every push to `main` or
`feature/kmp-web`: lint, unit tests, then `npm run build` with
`NEXT_PUBLIC_BASE_PATH=/Personal_app_android` — the Pages URL is a sub-path, and `next.config.ts`
turns that variable into `basePath` — and `out/` is the site. Next prefixes links and assets itself;
the two URLs built by hand (the prompt assets' `fetch`, the invite link) read the same variable.
To try that exact build locally, build with the variable set and serve `out/` under
`/Personal_app_android/` with a static server that serves a directory's `index.html`.

## Before writing route code

This is Next.js 16, and it differs from what most tutorials and AI models remember. See
[`AGENTS.md`](AGENTS.md) and the bundled docs in `node_modules/next/dist/docs/`. The two
conventions that bite first: `PageProps<'/route'>` / `LayoutProps<'/route'>` are global generated
helpers (no import), and a page's `params` is a Promise you must `await`.
