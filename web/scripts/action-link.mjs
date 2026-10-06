// GOALS.md §32e: prints the /acao/ address a Firebase e-mail link would open, for the newest code the local
// Auth emulator holds for an address. The emulator sends no mail and its own `oobLink` points at its own
// action page, so this builds the one that exercises OUR page (the console's action URL, in production).
//
//   node scripts/action-link.mjs maria@teste.dev             # verification link (default)
//   node scripts/action-link.mjs maria@teste.dev reset       # password reset
//   node scripts/action-link.mjs maria@teste.dev change      # e-mail change (verifyBeforeUpdateEmail)
//   node scripts/action-link.mjs maria@teste.dev recover     # revert an e-mail change
//
// SITE overrides the origin (default http://localhost:3000; add NEXT_PUBLIC_BASE_PATH's value after it when
// the dev server runs under the Pages sub-path). Only ever talks to the emulator (127.0.0.1:9099, demo project).

const PROJECT_ID = "demo-personal-tracker";
const AUTH = "http://127.0.0.1:9099";
const SITE = (process.env.SITE ?? "http://localhost:3000").replace(/\/+$/, "");

const KINDS = {
  verify: { requestType: "VERIFY_EMAIL", mode: "verifyEmail" },
  reset: { requestType: "PASSWORD_RESET", mode: "resetPassword" },
  change: { requestType: "VERIFY_AND_CHANGE_EMAIL", mode: "verifyAndChangeEmail" },
  recover: { requestType: "RECOVER_EMAIL", mode: "recoverEmail" },
};

const email = process.argv[2]?.trim().toLowerCase();
const kind = KINDS[process.argv[3] ?? "verify"];
if (!email || !kind) {
  console.error("Usage: node scripts/action-link.mjs <email> [verify|reset|change|recover]");
  process.exit(1);
}

const listed = await fetch(`${AUTH}/emulator/v1/projects/${PROJECT_ID}/oobCodes`);
if (!listed.ok) throw new Error(`Couldn't read the emulator's codes: ${listed.status} — is the Auth emulator running?`);
const { oobCodes = [] } = await listed.json();
const code = oobCodes.filter((c) => c.requestType === kind.requestType && c.email?.toLowerCase() === email).at(-1);
if (!code) {
  console.error(`No ${kind.requestType} code was issued for ${email} yet.`);
  process.exit(1);
}

const link = new URLSearchParams({ mode: kind.mode, oobCode: code.oobCode, apiKey: "demo", lang: "pt-BR" });
// The continue URL the page asked for travels inside the emulator's own link; carry it over like Firebase does.
const continueUrl = code.oobLink ? new URL(code.oobLink).searchParams.get("continueUrl") : null;
if (continueUrl) link.set("continueUrl", continueUrl);
console.log(`${SITE}/acao/?${link.toString()}`);
