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

This project uses **npm** (there is a `package-lock.json`; don't mix in another package manager).

```bash
npm install
npm run dev      # http://localhost:3000
npm run lint
npm run build    # also generates the route types used by PageProps / LayoutProps
```

## Before writing route code

This is Next.js 16, and it differs from what most tutorials and AI models remember. See
[`AGENTS.md`](AGENTS.md) and the bundled docs in `node_modules/next/dist/docs/`. The two
conventions that bite first: `PageProps<'/route'>` / `LayoutProps<'/route'>` are global generated
helpers (no import), and a page's `params` is a Promise you must `await`.
