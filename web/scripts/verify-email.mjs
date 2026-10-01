// GOALS.md §27i: confirms an address on the local Auth emulator, as if its owner had opened the link
// in the verification mail. The emulator sends no mail — it keeps the codes — so this takes the newest
// verification code sent to that address and applies it, exactly what the link would do.
//
//   node scripts/verify-email.mjs maria@teste.dev
//
// Only ever talks to the emulator (127.0.0.1:9099, demo project). Afterwards, "Já confirmei" on the
// invite page picks the confirmation up.

const PROJECT_ID = "demo-personal-tracker";
const AUTH = "http://127.0.0.1:9099";

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("Usage: node scripts/verify-email.mjs <email>");
  process.exit(1);
}

const listed = await fetch(`${AUTH}/emulator/v1/projects/${PROJECT_ID}/oobCodes`);
if (!listed.ok) throw new Error(`Couldn't read the emulator's codes: ${listed.status} — is the Auth emulator running?`);
const { oobCodes = [] } = await listed.json();
const code = oobCodes.filter((c) => c.requestType === "VERIFY_EMAIL" && c.email?.toLowerCase() === email).at(-1);
if (!code) {
  console.error(`No verification link was sent to ${email} yet.`);
  process.exit(1);
}

const applied = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:update?key=demo`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ oobCode: code.oobCode }),
});
const body = await applied.json();
if (!applied.ok) throw new Error(`Couldn't confirm ${email}: ${JSON.stringify(body)}`);
console.log(`${email} confirmed (emailVerified: ${body.emailVerified}).`);
