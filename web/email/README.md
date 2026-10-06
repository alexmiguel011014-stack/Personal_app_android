# Firebase Authentication e-mails — the text pasted into the console (GOALS.md §32)

Firebase sends the verification, password-reset and e-mail-change mails itself, from its own sender. The
console (Authentication → Templates) has **no versioning**, so this folder is the record: each `.html` here
is the exact message body pasted there. Change it here first, then paste.

| File | Console template | Subject | Sender name |
|---|---|---|---|
| `verify-email.html` | Email address verification | `Confirme seu e-mail no %APP_NAME%` | `ALLU personal` |
| `reset-password.html` | Password reset | `Redefina sua senha do %APP_NAME%` | `ALLU personal` |
| `change-email.html` | The template `verifyBeforeUpdateEmail` uses (§29) — **find out which one in the console first** | `Confirme seu novo e-mail no %APP_NAME%` | `ALLU personal` |

Reply-to: an address the owner reads, chosen in the console. It is deliberately **not** written here (the
repository may be public).

## Rules these files follow (`web/src/domain/authEmailTemplates.test.ts` enforces them)

- One self-contained fragment, table layout, **inline styles only**; no `<img>`, `<style>`, `<script>`, `<link>`,
  remote font or literal `http(s)://` address — only Firebase placeholders.
- Colours are the tokens in `web/src/app/globals.css` `:root` (direction B "Energia"): ink band `#12161c`, orange
  `#c2410c` button with white text, `#fb923c` full stop on the dark band, paper `#faf9f7`.
- Placeholders in use: `%LINK%` (button href **and** the visible fallback line), `%APP_NAME%` (the project's
  *Public-facing name*, `ALLU personal`), `%EMAIL%`. **No `%DISPLAY_NAME%`** — these accounts have no Auth display
  name, it would greet "Olá ,". `%NEW_EMAIL%` is not used until it is confirmed to be filled in the e-mail-change
  mail (GOALS.md §32c); when it is, record "`%NEW_EMAIL%` confirmed" here and the test allows it in
  `change-email.html` only.
- No link-expiry number in the copy until it has been read from the docs or the console.

## Paste steps (owner, Firebase console — GOALS.md §32g)

1. Project settings → General → **Public-facing name** = `ALLU personal`.
2. Authentication → Templates → pick the template → language **Português (Brasil)** → set sender name, reply-to,
   subject and paste the file's HTML as the message. Do the same for the default/English variant so a client that
   does not set `languageCode` (Android's reset mail) is not left stock.
3. Leave the **action URL** as Firebase's default until `/acao/` is live on the site (see `web/README.md`), then
   switch it one template at a time: verification, then e-mail change, then password reset last.
4. If the editor turns out to accept plain text only, write a short `.txt` sibling for that template instead
   (heading line, one sentence, `%LINK%`, the ignore line) and paste that.
