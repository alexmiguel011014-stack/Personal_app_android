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

## Fichas: several treinos at once, and the Gemini tab (GOALS.md §25)

The ficha editor (`/app/fichas/editar`, new fichas) takes **one answer with several treinos** and makes
one ficha of each: paste an AI's reply that has "Treino A / B / C…" (markdown, bullets, code fences and
chatter are tolerated; a spreadsheet paste works too) and a review screen shows what was found before
**Salvar N fichas** writes them in one batch. Two ways of asking the AI sit in tabs: **Outra IA** (copy the
prompt, paste the answer) and **Gemini** (generated here, same review screen).

Web-only files: `prompt/ficha_prompt_multi.md` (the copy-and-paste prompt) and
`prompt/ficha_system_gemini.md` (the Gemini system instruction), copied to `public/prompt/` by
`scripts/copy-prompt-assets.mjs` next to the shared Android assets; the reference table
(`hypertrophy_volume_reference.md`) stays single-sourced in `app/src/main/assets/`.

**Making the Gemini tab work for real needs the Firebase console** (nothing here can do it from code):

1. Build → **AI Logic** → make sure the **Gemini Developer API** is enabled (the "Firebase AI Logic API" and
   "Gemini Developer API" must both be on, or calls fail with 403 `api-not-enabled`).
2. **App Check** → APIs → enforce it for **Firebase AI Logic** (mandatory for AI Logic from 2026-11-02 anyway).
   The site already initialises App Check with reCAPTCHA Enterprise; for `localhost` use a debug token
   (`self.FIREBASE_APPCHECK_DEBUG_TOKEN = true`, then register the token the console prints).
3. If the web API key has *API restrictions*, `firebasevertexai.googleapis.com` must be on the list.
4. Optional: a **Remote Config** parameter `ficha_model_name` (e.g. `gemini-3.8-flash`) switches the model
   without a deploy — Google retires model ids (a retired one answers 404). The default lives in
   `src/data/gemini.ts` (`GEMINI_DEFAULT_MODEL`); the Spark-plan free list is at
   <https://firebase.google.com/docs/ai-logic/models>.
5. Free-tier limits are per project and not published per model: read them in Google AI Studio
   (<https://aistudio.google.com/rate-limit>). On the free tier Google may use the content to improve its
   products, which is why the student's name and medical notes are not sent unless the trainer ticks the box.

The `npm test` suite covers the pure parts (splitting, request building, response mapping, error messages);
the network call is not tested in CI — try it on the deployed site after steps 1–2.

## Confirmed e-mail for new students (GOALS.md §27) — console steps

The rules refuse an invite claim from an address that was not confirmed, and `/convite` sends the link.
Two things only the project owner can do, in the Firebase console:

1. **Publish `firestore.rules`** (diff it against what is live first). Until then nothing is enforced —
   the page already asks for the confirmation, but the rules don't check it.
2. **Authentication → Templates → Email address verification**: sender name **ALLU personal**, and look at
   the text. The site asks for Portuguese on every mail (`auth.languageCode = "pt-BR"`); the template's
   language setting is the fallback.

Check once that **Authentication → Settings → Authorized domains** lists
`alexmiguel011014-stack.github.io` (the link's "Continuar" goes back there; sign-in already needs it). The
mail comes from Firebase's own sender and can land in spam — the page tells the student to look there.

## Routes

| URL | Directory | Who |
|---|---|---|
| `/` | `src/app/page.tsx` | Public landing (§23i) |
| `/entrar` | `src/app/entrar/` | Login, for anyone with an account (§23f) |
| `/convite?c=CODE` | `src/app/convite/` | A student's first visit: create an account, confirm the e-mail (GOALS.md §27), claim the invite (§23f) |
| `/app` | `src/app/app/` | Trainer (§23g) — "Hoje", Agenda, Alunos, Registros, Mensalidades |
| `/aluno` | `src/app/aluno/` | Student (§23h) — mobile-first |
| `/admin` | `src/app/admin/` | ADM (§26g) — Visão geral |
| `/admin/personais` | `src/app/admin/personais/` | ADM — directory, CSV export and trainer detail/create links |
| `/admin/personais/detalhe?id=UID` | `src/app/admin/personais/detalhe/` | ADM — one trainer's aggregate stats, activity and audit history; status controls |
| `/admin/personais/novo` | `src/app/admin/personais/novo/` | ADM — create a trainer account and send its password-reset link |
| `/admin/solicitacoes` | `src/app/admin/solicitacoes/` | ADM — approve or reject trainer requests |
| `/admin/conta` | `src/app/admin/conta/` | ADM — own account and password-reset link |

`src/app/app/` is not a typo: the outer `app/` is the App Router directory, the inner one is the
`/app` URL segment. `/app` and `/aluno` have separate layouts on purpose — see §23's decisions —
and each guards itself (`RequireArea`): whoever belongs elsewhere is sent there. `/admin` has its
own guard and shell with Visão geral, Personais, Solicitações and Minha conta; `destinationFor`
sends ADM to `/admin`, including when they open `/app`.

### First ADM account (manual Firebase console setup; GOALS.md §26b)

The first administrator cannot be created from the site. In Firebase Console:

1. Authentication → Users → **Add user**. Use an e-mail you control that is not already used by a
   personal or student, and a long unique password. Copy the resulting User UID.
2. Firestore Database → Data → collection `users` → **Add document**. Set the document ID to that
   exact UID and add `role` (string) `ADM`, `name` (string), `email` (string, same address), and
   `createdAt` (number, current Unix time in milliseconds). Do not add `trainerId`.
3. Sign in at `/entrar`; the ADM should land on `/admin`. Use “Esqueci minha senha” once to verify
   account recovery, then create a second ADM the same way with another e-mail you control.

The admin pages read trainer profiles and aggregate stats/activity/audit; they use count-only
queries for linked students and do not read student documents. Firestore rules still technically
allow an ADM to read any `users` document. Trainer suspension is a rules-enforced status flag: it
does not disable Firebase Auth or remove linked students' access, and self-updates cannot clear the
flag. Creating a trainer uses a secondary Auth app to preserve the ADM session; in emulator mode
that secondary Auth instance connects to the Auth emulator. See `../GOALS.md` §26 and
`../CLAUDE.md` for the data model and caveats.

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

A new student must confirm their e-mail before the invite is claimed (GOALS.md §27). The emulator sends
no mail; it keeps the links, and this opens the newest one sent to an address:

```bash
node scripts/verify-email.mjs maria@gmail.com    # then "Já confirmei" on the invite page
```

The seeded students were created without confirming, on purpose: they are the accounts that existed
before §27 and must keep working.

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
