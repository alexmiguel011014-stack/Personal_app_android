import { getAI, getGenerativeModel, GoogleAIBackend, Schema } from "firebase/ai";
import { fetchAndActivate, getRemoteConfig, getValue } from "firebase/remote-config";
import { getFirebase, usingEmulators } from "./firebase";

// GOALS.md §25i — the site's one Gemini call, through Firebase AI Logic: the Gemini Developer API's
// free tier from the browser with NO API key in the page (the project's access is configured in the
// Firebase console, and every request carries an App Check token). That is why §23e's rule — no
// provider key ever reaches the browser — still holds. Field notes (checked 2026-09-30):
//   - Free models on the Spark plan today: gemini-3.8-flash, gemini-3.5-flash-lite
//     (https://firebase.google.com/docs/ai-logic/models). Ids rotate — Gemini 2.5 is retiring, and a
//     retired id answers 404 — so the id is ONE constant here, overridable without a deploy through
//     Remote Config (https://firebase.google.com/docs/ai-logic/change-model-name-remotely).
//   - App Check enforcement becomes mandatory for AI Logic on 2026-11-02; limited-use tokens (one per
//     request, 5-minute life) are the replay-protection option, so they are on whenever App Check is.
//   - The free tier's quota is per project and not published per model (see Google AI Studio's rate
//     limits page). A failure is shown plainly and the copy-and-paste tab is always the fallback.

/** The default model — change here, or set the Remote Config parameter below to override it live. */
export const GEMINI_DEFAULT_MODEL = "gemini-3.8-flash";
const MODEL_PARAMETER = "ficha_model_name";
const REMOTE_CONFIG_TIMEOUT_MS = 4000;

/** What a response must look like; domain/aiResponse.ts reads exactly this shape. */
const FICHA_SCHEMA = Schema.object({
  properties: {
    treinos: Schema.array({
      items: Schema.object({
        properties: {
          nome: Schema.string(),
          exercicios: Schema.array({
            items: Schema.object({
              properties: {
                nome: Schema.string(),
                series: Schema.integer(),
                reps: Schema.string(),
                ativacao: Schema.array({
                  items: Schema.object({ properties: { musculo: Schema.string(), coeficiente: Schema.number() } }),
                }),
              },
            }),
          }),
        },
      }),
    }),
  },
});

/**
 * The model to call: the Remote Config value when it can be fetched in a few seconds, else the
 * default. Never throws — Remote Config being unreachable must not stop a generation.
 */
export async function resolveModelName(): Promise<string> {
  try {
    const remoteConfig = getRemoteConfig(getFirebase().app);
    remoteConfig.settings.minimumFetchIntervalMillis = 3_600_000;
    remoteConfig.defaultConfig = { [MODEL_PARAMETER]: GEMINI_DEFAULT_MODEL };
    await Promise.race([
      fetchAndActivate(remoteConfig),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("remote config timeout")), REMOTE_CONFIG_TIMEOUT_MS),
      ),
    ]);
    return getValue(remoteConfig, MODEL_PARAMETER).asString().trim() || GEMINI_DEFAULT_MODEL;
  } catch {
    return GEMINI_DEFAULT_MODEL;
  }
}

/** A conversation with Gemini about one ficha: the SDK keeps the history, so a follow-up just sends. */
export interface FichaChat {
  /** Sends a message and returns the model's reply — JSON text matching the schema above. */
  send(message: string): Promise<string>;
}

/**
 * Starts a chat whose system instruction (the rules and the reference table — the context the trainer
 * wanted "always saved") is fixed for the whole conversation. Browser-only, like getFirebase().
 */
export async function startFichaChat(systemInstruction: string): Promise<FichaChat> {
  const ai = getAI(getFirebase().app, {
    backend: new GoogleAIBackend(),
    // App Check is initialised everywhere but the emulators (data/firebase.ts).
    useLimitedUseAppCheckTokens: !usingEmulators,
  });
  const model = getGenerativeModel(ai, {
    model: await resolveModelName(),
    systemInstruction,
    generationConfig: { responseMimeType: "application/json", responseSchema: FICHA_SCHEMA, temperature: 0.4 },
  });
  const chat = model.startChat();
  return {
    async send(message: string) {
      const result = await chat.sendMessage(message);
      return result.response.text();
    },
  };
}
