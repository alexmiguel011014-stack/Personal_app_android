# web/ — Personal Tracker's web front

A Next.js (App Router) app that replaces the Kotlin/JS web build. The plan, and the reasons for
every decision below, are in [`GOALS.md` §23](../GOALS.md) — read that first.

## Phase 1 rule: no CSS at all

No stylesheet, no `className`, no inline `style` anywhere under `src/`. Every screen is built and
validated as bare HTML first; the visual pass is §23k and is blocked on the §23j validation gate.
This is deliberate, not unfinished: a stylesheet added now is how phase 1 quietly becomes phase 2.
It is also still real Next.js with the real component tree — phase 2 styles it, it does not
rewrite it.

## Routes

| URL | Directory | Who |
|---|---|---|
| `/` | `src/app/page.tsx` | Public landing (§23i) |
| `/app` | `src/app/app/` | Trainer (§23g) — dense, desktop-first |
| `/aluno` | `src/app/aluno/` | Student (§23h) — mobile-first |

`src/app/app/` is not a typo: the outer `app/` is the App Router directory, the inner one is the
`/app` URL segment. `/app` and `/aluno` have separate layouts on purpose — see §23's decisions.

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

`src/domain/` holds the data model and every derivation the screens need — pure functions, no
Firestore, no clock (every "today" is an argument). Read the comments there before touching a
number on the dashboard: several of them encode findings about how the Kotlin app actually writes
data (one workout-log document per *exercise*, students split across two collections).

### Security rules tests

```bash
npm run test:rules   # the repo-root firestore.rules against the local Firestore emulator
```

Needs **Java 21** (Firebase CLI 15 dropped older Javas for the emulators). If `java -version`
says something older, point `JAVA_HOME` and `PATH` at a JDK 21 for that command — on the main
dev machine, Gradle already provisioned one under `~/.gradle/jdks/`. The first run downloads the
Firestore emulator jar from Google. The project id is `demo-personal-tracker`: the `demo-`
prefix keeps the emulator from ever touching the real Firebase project.

`RULES_FILE=<path> npm run test:rules` runs the same suite against another rules file — for
example the version currently published, to see exactly which guarantees a candidate adds.
Because `assertFails` passes on *any* failure, that comparison is also what proves each test
actually discriminates.

## Before writing route code

This is Next.js 16, and it differs from what most tutorials and AI models remember. See
[`AGENTS.md`](AGENTS.md) and the bundled docs in `node_modules/next/dist/docs/`. The two
conventions that bite first: `PageProps<'/route'>` / `LayoutProps<'/route'>` are global generated
helpers (no import), and a page's `params` is a Promise you must `await`.
