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

## Fichas: a named set of treinos (GOALS.md §25, §34)

A **ficha** is a named set of treinos; a student keeps at most **two** (saving a third deletes the oldest, after a
confirmation). The student page shows one simple card per ficha (name, "Modificada em", Editar, Excluir). The editor
(`/app/fichas/editar?aluno=<id>[&ficha=<id>]`) is one screen for creating and editing: the **Prompt de formatação de
ficha** card (copy it into your own AI together with your request), the **Importador Inteligente** (paste the AI's
answer; each "Treino A / B / C…" becomes a treino below — markdown, bullets, code fences and chatter are tolerated, a
spreadsheet paste works too), then the ficha's name and its treinos. **Salvar ficha** writes everything in one batch.
The site calls no AI; the in-site Gemini tab was removed (§34).

Data: `workouts/{id}.ficha = { id, name, createdAt, updatedAt, order }` groups treinos into a ficha (web-only, the
phone ignores it; no rules change). Treinos that predate it read as one "Ficha atual". See `src/domain/fichas.ts`.

Web-only file: `prompt/ficha_prompt_format.md` (the formatting prompt), copied to `public/prompt/` by
`scripts/copy-prompt-assets.mjs` — which also **deletes** any older copy of the reference, the phone's template or
the retired single/multi/Gemini templates from there. It carries no student data and not the trainer's exercise
reference (see the next section).

## The trainer's exercise reference stays hidden (GOALS.md §33)

The reference behind each exercise's muscles is **never** a public file, never in the JS bundle, never in a
prompt, never named on screen. The prompts ask the AI for exercise names plus sets × reps only; the site fills
in the muscles by name and computes the per-muscle volume itself.

- **Where it lives:** one Firestore document, `appData/exerciseCatalog` (`firestore.rules` v6: an approved,
  active trainer or the ADM may `get` it; nobody can list the collection; only the ADM writes it). The editor
  reads it through `src/data/exerciseCatalog.ts` — kept in memory only and dropped at sign-out.
- **Publishing / updating it (owner-run):** `npm run catalog:publish` writes it to the **local emulators**
  (account `admin@teste.dev`); `npm run catalog:publish -- --production` writes to the real project after you
  type its id, signing in with your ADM e-mail and password (typed hidden, never stored or printed). The source
  is the Android asset unless `CATALOG_SOURCE=<path>` points at a private copy; an unchanged source writes
  nothing. The emulator seed (`npm run seed:emulators`) writes the same document.
- **Guards:** `src/domain/referenceLeak.test.ts` (prompts, copy and editor sources), `npm run check:leak` (run
  it after `npm run build`; also a step in `web-ci.yml` and, before the Pages upload, in `web-deploy.yml`) and
  `npm run e2e:ficha-privacy`. The sentinels are **derived from the source at run time** (nothing from the
  reference is written in this repository's tests); with no source they **fail** instead of passing.
  `LEAK_SENTINELS_FILE=<json {phrases,names}>` replaces the source when it has moved out of the checkout, and
  `LEAK_EXTRA_PHRASES='a|b'` adds phrases — put the reference's original file name there; it is deliberately not
  written in any tracked file.
- **Rules for contributors:** never put rows, the ruler or the document's wording or file name in a tracked
  file, comment, doc or test fixture (tests use synthetic exercises; parser fixtures may use common exercise
  *names* in the phone's `Nome SxR` format, never coefficients or prose); never put the reference under
  `public/`; every sentence about the exercise data lives in `src/domain/editorCopy.ts` so the leak test reads it.
- **What a static site cannot hide:** a signed-in trainer's own DevTools, and the per-muscle totals and a few
  "Quis dizer…?" names the review computes. Only a server (a Cloud Function, which needs Blaze) would close that —
  an owner decision, with the public repository and the Android asset (GOALS.md §33i).
- **Rollout order (owner):** open the PR → publish rules v6 (diff `v5` → `v6` first) → `npm run catalog:publish --
  --production` → merge (the deploy replaces the public files) → check `curl -I` on the two old `/prompt/` URLs
  (404) and a trainer's new-ficha screen. GOALS.md §33h has the whole checklist and the rollback.

**The Gemini tab is gone (GOALS.md §34).** Nothing in the code calls Firebase AI Logic or reads the Remote Config
parameter `ficha_model_name` any more, so the console's **AI Logic** / **Gemini Developer API** switches and that
parameter can be turned off or deleted (owner decision; App Check stays — Firestore uses it).

## Confirmed e-mail for new students (GOALS.md §27) — console steps

The rules refuse an invite claim from an address that was not confirmed, and `/convite` sends the link.
Two things only the project owner can do, in the Firebase console:

1. **Publish `firestore.rules`** (diff it against what is live first). Until then nothing is enforced —
   the page already asks for the confirmation, but the rules don't check it.
2. **Authentication → Templates → Email address verification**: the branded text, sender name and the
   action URL are set as described in *Branded Firebase e-mails (GOALS.md §32)* below. The site asks for
   Portuguese on every mail (`auth.languageCode = "pt-BR"`); the template's language setting is the fallback.

Check once that **Authentication → Settings → Authorized domains** lists
`alexmiguel011014-stack.github.io` (the link's "Continuar" goes back there; sign-in already needs it). The
mail comes from Firebase's own sender and can land in spam — the page tells the student to look there.

## Branded Firebase e-mails (GOALS.md §32) — console steps

Firebase sends the verification, password-reset and e-mail-change mails itself; the repo carries the text it
should say (`email/`, with its own README: files, subjects, rules) and the page their link opens (`/acao/`).
The console has no versioning, so everything below is the owner's, **in this order** — the action URL must
not point at `/acao/` before the page is live, because it is the only way back in for a trainer who forgot the
password:

1. Merge and deploy; open `<site>/acao/` live — it must load and say "Link inválido".
2. Project settings → General → **Public-facing name** = `ALLU personal` (it is `%APP_NAME%` in every mail).
3. Authentication → Templates → each template, language **Português (Brasil)** (and the default variant, for
   clients that send no `languageCode`, such as Android's reset): sender name, reply-to (an address you read —
   not committed here), subject and the HTML from `email/`. Send yourself one of each and read it in Gmail.
4. Set each template's **action URL** to `<site>/acao/` (on Pages: `https://alexmiguel011014-stack.github.io/Personal_app_android/acao/`),
   **one template at a time — verification, then e-mail change, then password reset last** — proving each with
   a real mail before the next. Authentication → Settings → Authorized domains must list the site's host.
5. Rollback: clear the custom action URL (or reset the template) in the console. Links already sent keep
   working — the one-time code is the same under either handler.

What the free plan cannot do: a sender address on your own domain (needs a domain and DNS records), a logo
image or web font in the mail, a layout beyond what the template editor keeps (GOALS.md §32h).

## Routes

| URL | Directory | Who |
|---|---|---|
| `/acao?mode=…&oobCode=…` | `src/app/acao/` | Anyone with a Firebase e-mail link: confirms the e-mail, sets a password, confirms an e-mail change (§32); `continueUrl` is followed only inside the site |
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
| `/admin/planos` | `src/app/admin/planos/` | ADM — default platform plans and trial terms (§30) |
| `/admin/conta` | `src/app/admin/conta/` | ADM — own profile, avatar, contact phone, e-mail and password (§29) |
| `/app/conta` | `src/app/app/conta/` | Trainer — own profile and sign-in settings (§29) |
| `/aluno/conta` | `src/app/aluno/conta/` | Student — own profile and sign-in settings (§29) |

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

Account avatars use authenticated Storage reads at `account-avatars/{uid}/profile`, with JPEG, PNG
or WebP up to 2 MiB and initials as fallback. Phone is optional, unverified contact information.
E-mail changes require Firebase confirmation and password changes reauthenticate the current user.
The Storage emulator is configured on port 9199. Production bucket/plan/App Check setup and
publishing reviewed rules remain owner-run manual steps; the code does not enable billing or
publish Firebase configuration.

Platform billing is separate from trainers' own student payment records. `/admin/planos` stores
ADM-managed defaults; the trainer detail manages that trainer's terms, trial, invoices/payments,
extensions, and manual invite resolution by code. It intentionally does not list raw invite docs or
show an exact active-code count in the ADM view because invite docs contain student contact and
health fields. The trainer sees their own active-code count and limit. New Web invite codes have no
expiry and trainers cancel them manually; unresolved legacy codes without `expiresAt` stay active,
while legacy numeric expiry continues to work. The cooperative site flow counts active codes from
other clients, but the limit does not constrain Android/iOS creation or direct Firestore writes
outside that flow. A privacy-safe ADM count and any trusted backend enforcement remain open work;
do not describe the current counter as global. See `../GOALS.md` §30.

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

The suite also starts the Functions emulator (the platform-billing callable). On a cold machine its
default 10 s load timeout can expire and fail the `platformFlows` callable tests with `not-found`;
set `FUNCTIONS_DISCOVERY_TIMEOUT=60` (CI does) and run it again.

### Browser tests (`e2e/`)

Scripted passes over the real screens, in headless Chrome, against the emulators — what the unit and
rules tests cannot see (focus, labels, 390 px, a link opened from an e-mail, the lock screen). They
need `npm run dev:local` running (emulators + site, Windows) and Chrome (`CHROME_PATH` overrides the
default location); each run re-seeds the emulators first. No dependencies: a small CDP client in
`e2e/lib.mjs`, with the emulators' REST endpoints used to check what the page claims (Auth, Firestore, Storage).

```bash
npm run e2e:account -- trainer          # or: student, admin;  add "mobile" for 390 px   (GOALS.md §29)
npm run e2e:billing                     # trial cap, overdue lock, extension, payment   (GOALS.md §30)
npm run e2e:admin-focus                 # keyboard focus after every ADM action button  (GOALS.md §29e)
npm run e2e:ficha-privacy [-- mobile]   # the exercise reference stays out of sight       (GOALS.md §33g)
npm run e2e:fichas [-- mobile]          # fichas as cards: create, third, edit, delete, student  (GOALS.md §34)
```

Local-only artefact worth knowing: the emulators speak HTTP/1.1, so a single Chrome profile that
reloads many pages in a row can wait tens of seconds for Firestore's first answer (open connections
from earlier pages exhaust the six-per-origin limit). The scripts therefore use a fresh browser where
it matters, or navigate through the app's own router (`window.next.router.push`, as `e2e/fichas.mjs` does);
production talks HTTP/2 and the site navigates without reloading, so this is not a site defect.

### Running the app on fake data

On Windows, `npm run dev:local` does all of the steps below in one go (emulators, seed, site) and
stops the emulators on Ctrl+C — no publishing to GitHub or Firebase is needed to try the site, and
nothing real is touched. The manual steps:

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

The page the e-mail links open (`/acao/`, GOALS.md §32) can be exercised the same way: this prints its
address for the newest code the emulator holds for an address (`verify` is the default; `reset`,
`change` and `recover` are the others; `SITE=http://localhost:3001` if the dev server is not on 3000):

```bash
node scripts/action-link.mjs maria@gmail.com reset
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
