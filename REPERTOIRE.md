# REPERTOIRE.md — Personal Tracker (Android)

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
