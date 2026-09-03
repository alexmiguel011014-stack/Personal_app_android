# REPERTOIRE.md — Personal Tracker (Android)

This file accumulates domain research across separate `/repertoire` passes for this project, each
scoped to whatever `/newgoal` question triggered it. Sections 1–2 (below) cover the "effective
volume budgeting" ficha feature. Sections 3–4 cover a later, unrelated question: how to actually
ship this app on iOS as well as Android — see that section's own scope note.

Domain research feeding the `/newgoal` pass on the "effective volume budgeting" ficha feature
(2026-08-19). Scope: given the app's existing `hypertrophy_volume_reference.md` (a 0–1.0
per-exercise, per-muscle activation-coefficient table sourced from a PDF the user supplied
earlier, itself citing Schoenfeld/Kubo/Plotkin), how should a stated weekly volume target per
muscle (e.g. "12 séries de costas por semana") be converted into an *effective/adjusted* volume
that correctly discounts partial-activation exercises — and how should that be shown on a ficha.
Two lenses judged to apply (confirmed with the user before researching): scientific/evidence base
and competitive/market landscape. Regulatory/legal, cultural/social, and media/discourse lenses
were judged not to apply — this is a narrow technical/UX question, not a new domain surface for
the app.

---

## 1. Scientific/evidence base

**The core question — is a linear multiplier (sets × coefficient = effective sets) the right
model, or something more nuanced? — has a direct, recent, high-quality answer: yes, linear
fractional counting is not just plausible, it's the empirically best-supported method.**

A 2025 dose-response meta-regression in *Sports Medicine* ("The Resistance Training Dose-Response:
Meta-Regressions Exploring the Effects of Weekly Volume and Frequency on Muscle Hypertrophy and
Strength Gain", DOI `10.1007/s40279-025-02344-w`) directly tested multiple ways of counting a set's
contribution toward a muscle's weekly volume across the pooled trial literature:
- **Total counting**: every set counts as a full set (coefficient always 1), regardless of how
  directly it targets the muscle.
- **Direct-only counting**: only sets that directly/primarily target the muscle count at all
  (indirect/secondary sets count as 0).
- **Fractional counting**: indirect/secondary sets count at a fractional weight (the paper's
  own scheme: **1.0 for a genuinely direct/total set, 0.5 for a "fractional" indirect set, 0 for
  sets judged unrelated**) — i.e. exactly the same *shape* of model this app's existing table
  already uses, just with fewer discrete tiers (the app's table uses 1.0/0.75/0.5/0.25/0, a finer
  gradient over the same idea).
- **Result: the fractional quantification method showed the strongest evidence in the
  meta-regression models** — it explained the dose-response relationship better than either
  "count everything the same" or "ignore indirect work entirely". Around the average training
  volumes reported across the pooled studies, each additional *fractional* weekly set was
  associated with roughly **+0.24% muscle size** — with a clearly diminishing-returns shape (the
  first few fractional sets past the minimum threshold matter most; each further set buys less).
  About **4 fractional weekly sets** were enough to exceed the smallest detectable real-world
  hypertrophy effect (~2.05%).
- Concretely, per the same source: a set of lat pulldowns does real, measurable work on the
  biceps (elbow flexors) — in some contexts similar in magnitude to a dedicated curl — while a
  set of rows contributes to the biceps but less than a focused isolation set. This is exactly the
  kind of distinction the app's existing table already encodes per-exercise.

**Conclusion for the app: the planned "effective volume = Σ(sets × coefficient)" calculation is
directly validated by the strongest current dose-response evidence, not an invented heuristic.**
No need to reach for a more complex/non-linear per-exercise model — the non-linearity that matters
(diminishing returns as *total* effective volume climbs) belongs at the muscle-group total level,
not inside the per-set coefficient itself. This is exactly what the MEV/MAV/MRV framework (below)
already provides.

**Volume landmarks (MEV/MAV/MRV) — the right frame for showing diminishing returns and a safe
range, not just a raw number.** Popularized by Dr. Mike Israetel and Renaissance Periodization,
now standard vocabulary in evidence-based hypertrophy coaching:
- **MEV (Minimum Effective Volume)** — the fewest weekly sets that still produce measurable
  growth (commonly ~4–8 sets/week for an intermediate, muscle-group dependent).
- **MAV (Maximum Adaptive Volume)** — the "sweet spot" range delivering most of the practical
  gain per unit effort (commonly ~12–20 sets/week for an intermediate, muscle-group dependent).
- **MRV (Maximum Recoverable Volume)** — the ceiling past which fatigue/recovery cost outpaces
  further adaptation for that person, that muscle, that week.
- These landmarks are explicitly **individual** — genetics, training age, recovery capacity,
  sleep, stress, and nutrition all shift them for a given person. Generic numeric defaults (the
  ranges above) are a reasonable starting anchor, not a claim of precision for any one student.

**RIR (reps-in-reserve) interaction — the app's existing RIR step-adjustment is well-supported,
no change needed.** A 2024 meta-regression series (PubMed `38970765`) and a 2024 controlled trial
(*Journal of Sports Sciences*, `10.1080/02640414.2024.2321021`) both point the same direction:
hypertrophy stays comparable across roughly 0–4 RIR, with some evidence of a peak around 0–3 RIR
rather than a strictly monotonic "closer to failure is always better" relationship, and a clear
fall-off once sets are terminated much beyond ~4–5 RIR short of failure. This matches — and
validates — the existing table's own RIR rule (full value at 0–2 RIR, secondaries −0.25 at 3–4
RIR, half-or-zero at 5+ RIR) almost exactly. **Treat RIR as a separate multiplier/gate applied
after the base activation coefficient, not folded into it** — the two axes (which muscle, how
close to failure) are independently supported and the app's table already keeps them separate
(a distinct "Ajustes por RIR" section applied on top of the per-exercise scores), which is the
right structure per this research, not something to redesign.

**Sources consulted:**
- [The Resistance Training Dose-Response: Meta-Regressions Exploring the Effects of Weekly Volume and Frequency on Muscle Hypertrophy and Strength Gain (SportRxiv preprint / Sports Medicine, DOI 10.1007/s40279-025-02344-w)](https://sportrxiv.org/index.php/server/preprint/view/460)
- [Training Volume Landmarks for Muscle Growth – RP Strength](https://rpstrength.com/blogs/articles/training-volume-landmarks-muscle-growth)
- [Exploring the Dose-Response Relationship Between Estimated Resistance Training Proximity to Failure, Strength Gain, and Muscle Hypertrophy: A Series of Meta-Regressions (PubMed 38970765)](https://pubmed.ncbi.nlm.nih.gov/38970765/)
- [Similar muscle hypertrophy following eight weeks of resistance training to momentary muscular failure or with repetitions-in-reserve in resistance-trained individuals (Journal of Sports Sciences, DOI 10.1080/02640414.2024.2321021)](https://www.tandfonline.com/doi/full/10.1080/02640414.2024.2321021)

---

## 2. Competitive/market landscape

**How established apps actually surface "which muscles are getting how much volume" — the UX
precedent for this feature:**

- **Hevy** — "Muscle distribution (Body)" view: a front/back body diagram plus a per-muscle set
  count, reachable from Advanced Statistics ("Set count per muscle group"). Volume is shown as a
  simple count overlaid on anatomy, not a dense table — the diagram *is* the primary UI, numbers
  are secondary/on-tap detail.
- **Boostcamp** — a weekly per-muscle volume heatmap (Pro tier) on front/back body diagrams, with
  7-day/30-day/90-day/yearly toggles, explicitly framed as "which muscle groups are you targeting,
  which are neglected" — i.e. the product framing is *balance/coverage*, not just raw totals.
- **RP Hypertrophy app** — the most directly comparable precedent: tracks MV/MEV/MAV/MRV
  *per muscle group* (not just a single global number), and auto-adjusts week-to-week based on
  logged performance/recovery feedback, explicitly built around the same volume-landmark
  vocabulary the scientific lens above validates.

**Pattern across all three: nobody shows a bare "effective volume" number as the primary UI.**
The number always sits inside a **range/context** (a landmark band, a heatmap intensity, a
before/after comparison) — a raw "9.25 effective sets" is meaningless to a trainer without knowing
whether that's low, ideal, or excessive for that muscle that week. **Implication for this app's
ficha feature:** whatever surfaces the effective-volume calculation should show it against the
MEV–MAV–MRV band (even generic defaults, editable/overridable per student), not as an isolated
number — closer to Hevy/Boostcamp's "how full is this bucket" framing than a spreadsheet cell.

**Sources consulted:**
- [Track Your Sets Per Muscle Group Per Week – Hevy App](https://www.hevyapp.com/features/sets-per-muscle-group-per-week/)
- [How to Use the Muscle Distribution Chart – Hevy App](https://www.hevyapp.com/features/training-chart/)
- [Boostcamp: Workout Programs – Health & Fitness App](https://www.boostcamp.app/)
- [RP Hypertrophy App Alternatives for Evidence-Based Training (2026) – Mesostrength](https://mesostrength.com/blog/rp-hypertrophy-alternatives)
- [RP Hypertrophy – Apps on Google Play](https://play.google.com/store/apps/details?id=com.rp.hypertrophy&hl=en_US)

---

# Part 2 — Cross-platform (Android + iOS) distribution research (2026-08-21, via `/newgoal /repertoire`)

Scope: the app is 100% native Android (Kotlin/Jetpack Compose) today, distributed by handing
trainers a signed APK directly (no Play Store, see GOALS.md §11). The user needs it to also run on
iOS, and — this is the load-bearing constraint — **cannot pay to publish on the Apple App Store**
and wants an iOS install path as close as possible to "just hand someone a file" (today's Android
model). Two lenses judged to apply (confirmed with the user before researching): **regulatory/legal**
(what Apple's rules and current antitrust-driven exceptions actually allow, for free or not) and
**competitive/market landscape** (how other small/indie teams actually solve "one codebase, both
platforms" today, and what it would take to move this specific app's stack). Scientific and
cultural/media lenses don't apply — this is a distribution/engineering question, not a claims- or
audience-sensitive one.

## 3. Regulatory/legal — what's actually allowed on iOS, and what it costs

**There is no zero-cost equivalent of "sideload an APK" on iOS, anywhere, even after 2026's
regulatory changes.** Every real path to getting this app onto an iPhone requires either an
ongoing Apple Developer Program membership (**US $99/year**, no free tier, no revenue-based
waiver for the base membership itself) or accepting severe, non-professional limitations:

- **Classic free-Apple-ID sideloading (AltStore / SideStore)** — genuinely $0, works in Brazil and
  everywhere else (not region-locked), but capped at **3 apps installed at once** and each app
  **expires every 7 days**, requiring reconnection to a computer (AltStore, via AltServer on the
  same Wi-Fi) or a paired on-device VPN refresh trick (SideStore, no computer needed after initial
  setup). This is a real, currently-used method — but it's built for hobbyists sideloading tweaks
  for themselves, not for handing a working app to real trainer/student clients who'd need to
  reconnect their phone to *someone's* computer weekly or the app silently stops opening. Not
  practical as this app's actual distribution channel.
- **TestFlight** — Apple's own beta-distribution tool, the obvious "just get it on real people's
  phones without the full App Store" option — **still requires the paid $99/year Developer
  Program membership**, for both internal and external testers. Once paid, it's generous (up to
  10,000 external testers, no per-tester cost), but the $99/year gate is unavoidable, and builds
  expire ~90 days after upload and need reuploading.
- **Alternative app marketplaces (the EU/Japan/South Korea/Brazil antitrust route)** — as of a
  December 2025 CADE (Brazil's antitrust regulator) settlement, Apple now allows alternative app
  marketplaces in Brazil too, not just the EU — rolling out with iOS 26.5 (mid-2026), with all
  Developer Program members required to accept new license terms by **6 July 2026**. This sounds
  like exactly what's needed, but it doesn't remove the cost floor:
  1. **Apps distributed through an alternative marketplace must still be notarized by Apple**,
     which requires active Apple Developer Program membership (the same $99/year) — notarization
     isn't an App-Store-only requirement, it applies to every iOS distribution channel.
  2. **In Brazil specifically, true website-hosted sideloading (an .ipa file, downloaded and
     installed directly, no marketplace) remains restricted** — unlike the EU, where both
     marketplace distribution *and* direct-from-website installs are allowed, Brazil's settlement
     only opened the *marketplace* route. The app would still need to go through an authorized
     third-party marketplace, not just be posted as a downloadable file.
  3. **Running your own alternative marketplace is not realistic for a small project** — Apple's
     eligibility bar (as of the same rollout) requires meeting at least one of: a moderate
     financial-stability score from Dun & Bradstreet, being publicly traded, having venture
     funding from an established firm, a completed financial audit, being a government/education/
     nonprofit entity approved for a fee waiver, a **US $1,000,000 standby letter of credit**, or
     **1,000,000+ first annual installs worldwide**. This app would instead need an *existing*
     marketplace operator to accept it as a listed app — itself still gated on the $99/year
     notarization requirement per app.
- **Net conclusion**: **$99/year is effectively the real floor for any usable, professional iOS
  distribution of this app** — whether via TestFlight, a future alternative marketplace, or the
  App Store itself. The only genuinely free routes (AltStore/SideStore) are structurally
  incompatible with "give this to real trainers and their students" because of the 3-app cap and
  weekly re-signing requirement. This directly updates what was told to the user earlier in this
  session (framed as "can't sideload for free on iOS at all," without having checked the 2026
  Brazil/EU regulatory changes) — the regulatory door *did* open in 2026, but it doesn't reach
  zero cost, which is the actual constraint the user named.

**Sources consulted:**
- [Apple Developer Program – Membership Details](https://developer.apple.com/programs/whats-included/)
- [iOS Distribution Guide 2026: TestFlight, App Store & Enterprise](https://foresightmobile.com/blog/ios-app-distribution-guide-2026)
- [Changes for apps in the European Union – Apple Developer Support](https://developer.apple.com/support/apps-in-the-eu)
- [Getting started as an alternative app marketplace in the European Union – Apple Developer Support](https://developer.apple.com/support/alternative-app-marketplace-in-the-eu)
- [About alternative app distribution – Apple Support](https://support.apple.com/en-us/118110)
- [Changes to iOS in Brazil – Apple Developer Support](https://developer.apple.com/support/app-distribution-in-brazil/)
- [Apple announces changes to iOS in Brazil – Apple Newsroom](https://www.apple.com/newsroom/2026/06/apple-announces-changes-to-ios-in-brazil/)
- [Apple agrees to third-party App Store alternatives in Brazil – AppleInsider](https://appleinsider.com/articles/25/12/23/apple-agrees-to-third-party-app-store-alternatives-in-brazil)
- [Every Free Way to Sideload iPhone Apps in 2026, Ranked by Ease](https://builds.io/blog/technologies/ios-technologies/free-sideloading-tools-iphone-ranked/)
- [AltStore vs SideStore vs LiveContainer - Which to Use in 2026](https://builds.io/blog/technologies/ios-technologies/altstore-vs-sidestore-vs-livecontainer/)

## 4. Competitive/market landscape — how small teams actually get one codebase onto both platforms

**This app's specific starting point matters**: it's not greenfield — it's an existing, working
Kotlin + Jetpack Compose + Room + Hilt + Firebase Android app. That rules out treating "which
cross-platform framework" as a from-scratch choice; the real question is which path reuses the
most of what already exists.

- **Kotlin Multiplatform (KMP) + Compose Multiplatform — the closest fit to this codebase.**
  Compose Multiplatform reached **stable, production-ready status for iOS in Compose Multiplatform
  1.8.0 (May 2025)**, and by 2026 is reportedly running in production at real scale (JetBrains
  cites Netflix, McDonald's, Cash App, Quizlet among adopters). Migration reports from teams doing
  exactly this (existing Jetpack Compose Android app → Compose Multiplatform) describe it as
  comparatively low-friction: "almost every single Composable simply worked," with the real
  migration work concentrated in Android-specific pieces — resource access (no generated `R`
  class in common code), navigation/ViewModel/permissions APIs that need platform-aware handling,
  and anything that directly touched Android SDK classes. **The one real gap for this specific
  app: Firebase has no official Google-shipped Kotlin Multiplatform SDK.** The community-built
  **GitLive `firebase-kotlin-sdk`** (`GitLiveApp/firebase-kotlin-sdk`) is the established option —
  a Kotlin-first wrapper covering Firestore/Auth/etc. across Android, iOS, JS, and desktop targets,
  actively maintained, used in production by other teams. A newer alternative (`KFire`) exists but
  is still in beta as of mid-2026 — GitLive is the safer choice today given this app's real
  reliance on Firestore listeners, transactions (`AuthRepository.claimInvite`), and Auth. Net: this
  path reuses the existing Kotlin domain/data layer (repositories, ViewModels, Room→SQLDelight or
  a KMP-friendly local store) and most Compose UI code directly, at the cost of swapping the
  Firebase Android SDK calls for GitLive's equivalents and handling a handful of Android-only
  touchpoints (Crashlytics, App Check's `DebugAppCheckProviderFactory`/Play Integrity, DataStore)
  per-platform.
- **Flutter — a full rewrite, not a migration.** Mature, single codebase, strong Firebase support
  (Google's own FlutterFire plugins are official and well-maintained, unlike KMP's community-only
  situation) — but the entire UI and business logic would be rewritten in Dart from zero, since
  none of the existing Kotlin/Compose code transfers. Best UI consistency across platforms of the
  three options, worst reuse of what already exists.
- **React Native — also a full rewrite**, JS/TypeScript instead of Dart, larger but more uneven
  package ecosystem (native-module quality varies), Expo has made the tooling near-turnkey in
  2026. Same fundamental tradeoff as Flutter for this project: better long-term two-platform
  velocity, zero reuse of the current codebase.
- **Fully separate native iOS app (Swift/SwiftUI)** — maximum quality/platform-native feel,
  maximum effort: a second codebase maintained forever in parallel, sharing nothing but the
  Firebase backend/schema. Not proportionate for a small trainer-client app maintained by one
  person.

**Pattern across how small/indie teams actually choose here**: teams starting from an *existing*
native Android app that need iOS too consistently reach for KMP/Compose Multiplatform specifically
*because* it reuses their investment, accepting Firebase's multiplatform story being
community-maintained rather than official as the main real cost — matching this app's exact
situation. Teams starting from scratch, with no existing codebase to protect, more often pick
Flutter for its more mature single-codebase tooling and official Firebase support. This app is
squarely in the first category, not the second.

**Sources consulted:**
- [Compose Multiplatform 1.8.0 Released: Compose Multiplatform for iOS Is Stable and Production-Ready – JetBrains Blog](https://blog.jetbrains.com/kotlin/2025/05/compose-multiplatform-1-8-0-released-compose-multiplatform-for-ios-is-stable-and-production-ready/)
- [Migrating a Jetpack Compose app to Kotlin Multiplatform – Kotlin Multiplatform Documentation](https://kotlinlang.org/docs/multiplatform/migrate-from-android.html)
- [Jetpack Compose to Compose Multiplatform: Transition Guide – Touchlab](https://touchlab.co/compose-multiplatform-transition-guide)
- [GitHub – GitLiveApp/firebase-kotlin-sdk: A Kotlin-first SDK for Firebase](https://github.com/GitLiveApp/firebase-kotlin-sdk)
- [Using Firebase with Kotlin Multiplatform in 2026: The Complete Guide](https://medium.com/@riadmahi/using-firebase-with-kotlin-multiplatform-in-2026-the-complete-guide-43a30042155c)
- [Is Kotlin Multiplatform production ready in 2026?](https://www.kmpship.app/blog/is-kotlin-multiplatform-production-ready-2026)
- [Flutter vs. React Native: Which is Better in 2026? – Scaler](https://www.scaler.com/blog/flutter-vs-react-native/)
- [Flutter vs React Native (2026): The Honest Comparison from 30+ Production Apps](https://www.instabizweb.com/blogs/flutter-vs-react-native-2026)

---

# Part 3 — AI workout-generation API options (2026-09-03, via `/repertoire`)

Scope: this app's `GenerativeAiService` dispatches to one of four BYO-key providers
(`AiProvider`: Gemini via Firebase AI Logic, OpenAI, DeepSeek, Claude — see `CLAUDE.md`) for
generating a workout ficha from a student's profile. The user asked which APIs for this are
currently the best/free, and if none are free, the cheapest — with each provider's status
actively confirmed against its own current docs, not assumed from training data (pricing and
free-tier terms change often enough that stale knowledge here would be actively misleading).
Lens judged to apply, confirmed with the user before researching: **competitive/landscape**
(what exists, at what price, does it still work), with a light **media/discourse** touch (recent
pricing changes) and a light **regulatory/legal** touch (usage-restriction fine print). Scientific
and cultural lenses don't apply — this is a vendor/pricing survey, not a claims- or
audience-sensitive question.

## 5. Status of the four already-integrated providers — verified against each vendor's current docs

| Provider | Free tier? | Confirmed via | Cheapest paid model (per 1M tokens, in/out) |
|---|---|---|---|
| **Gemini** (Flash) | **Yes, still free** — confirmed on Google's own pricing page: Flash shows "Free of charge" for both input and output under the free-tier column | [ai.google.dev/gemini-api/docs/pricing](https://ai.google.dev/gemini-api/docs/pricing) | n/a (free tier sufficient for this use case) |
| **OpenAI** | **No free tier** — nothing found on OpenAI's own site or any 2026 pricing roundup describing an ongoing free allowance, only paid usage | multiple 2026 pricing roundups (below); OpenAI's own pricing page returned 403 to automated fetch, so cross-checked against several independent trackers instead | **gpt-5-nano: $0.05 in / $0.40 out** — the single cheapest model of all four providers |
| **DeepSeek** | **No free tier currently** — DeepSeek's own API docs list no complimentary allowance for new accounts (only a time-limited signup credit some trackers still mention, not a standing free tier) | [api-docs.deepseek.com/quick_start/pricing](https://api-docs.deepseek.com/quick_start/pricing) | deepseek-v4-pro: $0.66 in / $1.98 out (off-peak), $1.32 in / $3.96 out (peak) — still cheap, just not free |
| **Claude** | **No free tier** — same as OpenAI, paid-only | [finout.io/blog/anthropic-api-pricing](https://www.finout.io/blog/anthropic-api-pricing) and other 2026 trackers | Haiku 4.5: **$1.00 in / $5.00 out** — the most expensive of the four, by a wide margin (20× GPT-5-nano's input price) |

**Net: Gemini is correctly the free option among the four already integrated, and that's still
true today** — nothing broken or deprecated here, the existing default is sound. Of the three paid
ones, **OpenAI's gpt-5-nano is now the cheapest by far** (DeepSeek was likely cheaper when it was
first integrated into this app; that's no longer the case — GPT-5-nano's July 2026 price cuts
moved it ahead). Claude Haiku remains the most expensive of the four for this
generate-one-ficha-at-a-time workload.

## 6. Free/cheap alternatives worth knowing about, not currently integrated

Surveyed the broader free-LLM-API landscape (2026) beyond the four already in the app, filtering
for providers that plausibly support a JSON-generation workload (this app needs structured
output, not chat):

- **Groq — the strongest free candidate not yet integrated.** Confirmed via Groq's own docs:
  genuinely free, **no credit card required to sign up**, and **structured JSON output is
  supported and enabled by default** on its newer models (e.g. `moonshotai/kimi-k2-instruct`) via
  a `json_schema` response format — exactly the shape this app's `tryParseWorkouts()` JSON
  extraction needs, arguably better-suited than free-text parsing since Groq's structured mode
  can enforce the schema directly instead of relying on regex-extracting a `{...}` block from
  prose. Runs on Groq's own LPU hardware, reported around 320 tokens/second — much faster
  round-trip than any of the four current providers. Free-tier limits (~30 requests/min, ~1,000/day
  on Llama 3.3 70B per third-party trackers, Groq's own docs don't publish exact numbers outside a
  logged-in dashboard) are comfortably above what one trainer generating fichas needs.
- **Mistral** — free tier reported around 1B tokens/month across Small/Large/Codestral, no card
  required per third-party trackers; one source notes the full free quota requires opting into
  data-training use (an "Experiment tier" condition) — a real tradeoff to weigh against Gemini's
  own similar opt-out-by-region caveat below, not a reason to avoid Mistral outright.
- **OpenRouter** — an aggregator, not its own model: routes to ~20+ free models (including some
  DeepSeek and Llama variants) through one API key, free tier around 20 requests/min / 50 requests/
  day (or 1,000/day after a one-time $10 top-up unlocks the higher free limit) per its own blog
  post. Useful mainly as a single integration point if the app ever wanted to expose more than
  four provider choices without adding a new SDK per provider.
- **Cerebras / Cloudflare Workers AI / GitHub Models / Hugging Face / NVIDIA NIM** — all have some
  free allowance per the same survey, but each has a caveat that makes it a weaker fit than Groq
  for this specific use case: Cloudflare's context windows are small (2K–8K tokens, likely too
  small for a full student-profile-plus-volume-table prompt), Cohere's free tier is explicitly
  **"strictly non-commercial use only"** (this app is used by a paying/working trainer, even at
  small scale — that caveat likely disqualifies it, worth being deliberate about rather than
  reaching for the biggest free-token number without reading the terms), and the rest are less
  well-documented / more oriented at coding-assistant workloads than general JSON generation.

**Recommendation, if this ever gets revisited**: Groq is the one genuinely worth adding as a
fifth `AiProvider` option — free, fast, structured-output-native, no non-commercial restriction
found. Not implemented here; per `/repertoire`'s own scope this is a finding for `/newgoal` or a
separate explicit ask to act on, not something this pass changes.

## 7. Regulatory/legal note — data usage terms worth knowing, not a blocker

Google's own Gemini API pricing page states prompts on the **free** tier are used to improve
Google's models **unless the caller is in the EU, UK, or EEA** — Brazil isn't in that carve-out,
so free-tier Gemini calls from this app (student names, biometric data, training profiles) are
currently eligible to be used for Google's model training unless a trainer switches to a paid
Gemini tier or a different provider. This isn't new risk introduced by this research — it's how
the already-shipped default has worked since Gemini was first integrated — but it's the kind of
fact worth having on record given the app's own `store-listing/listing-copy.md` privacy section
already promises data protection to end users. Worth a deliberate decision (accept it, default to
a paid-tier/non-training provider, or add a disclosure), not an oversight to silently carry
forward.

**Sources consulted:**
- [Free LLM API in 2026: 13 Options Ranked and Compared — OpenRouter Blog](https://openrouter.ai/blog/tutorials/free-llm-apis-compared/)
- [Gemini Developer API Pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini API Rate Limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- [DeepSeek API Pricing](https://api-docs.deepseek.com/quick_start/pricing)
- [OpenAI API pricing in 2026: every model after the July price cuts – CloudZero](https://www.cloudzero.com/blog/openai-pricing/)
- [$0.15 to $15/M Tokens — OpenAI API Pricing 2026 – ValueAdd VC](https://valueaddvc.com/blog/openai-api-pricing-2026-gpt-4o-o3-and-gpt-5-cost-breakdown-for-developers)
- [Anthropic API Pricing in 2026 – Finout](https://www.finout.io/blog/anthropic-api-pricing)
- [Groq Rate Limits Documentation](https://console.groq.com/docs/rate-limits)
- [Groq Structured Outputs Documentation](https://console.groq.com/docs/structured-outputs)
- [Best Free LLM APIs in 2026 — Compare Free Inference Tiers, Rate Limits & Limits](https://agentdeals.dev/free-llm-apis)
