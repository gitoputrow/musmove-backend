# Program personalization v3: balanced focus and richer templates

26 October2026 measurement extension (migration0024): duration prescriptions use
null reps plus targetDurationSeconds. Explicit time assessments use trackingType
duration, null maxReps and maxDurationSeconds0–3600; zero blocks the movement.
Without assessment, timed targets are capped at20s, at most10s when returning/tired,
and never above the curated target. This is a product ceiling, not medical
clearance. Existing41 templates stay unchanged; a timed program requires an
explicitly configured time target. Estimate session planning time with target
seconds, never fake repetitions; performed hold seconds are not actual session
elapsed time. See [result metrics/rollout](frontend-follow-up-workout-result-metrics.md).

`GET /api/v1/programs/recommendations` uses the authenticated account's saved
profile and training preferences, the database template/exercise catalogs,
and recent owned, non-deleted completed workouts. It never modifies workouts
or their snapshots. Mobile saves initial setup through onboarding/complete and
subsequent changes through PATCH /me; do not additionally sync-push those writes.
Legacy sync remains supported for existing clients.

## Profile contract

The existing profile sync payload accepts these additional optional fields:

```json
{
  "ageYears": 28,
  "goal": "bulk",
  "focusAreas": ["chest", "back"],
  "sessionMinutes": 30,
  "trainingFrequency": 3,
  "formulaSex": "female",
  "gender": "female",
  "weightKg": 65,
  "heightCm": 165,
  "trainingContext": {
    "healthStatus": "no_known_restrictions",
    "pregnancyStatus": "not_pregnant",
    "painAreas": [],
    "mobilityLimitations": [],
    "balanceConfidence": "stable",
    "recoveryStatus": "recovered",
    "trainingBreakWeeks": 0,
    "equipmentHeightLimits": []
  },
  "trainingLevel": "beginner",
  "exerciseCapabilities": [
    {"exerciseId": "pushup", "mode": "calisthenics", "maxReps": 4, "weightKg": null, "bodyweightKg": 65},
    {"exerciseId": "knee_pushup", "mode": "calisthenics", "maxReps": 10, "weightKg": null, "bodyweightKg": 65}
  ],
  "excludedExerciseIds": ["diamond"]
}
```

`maxReps` is a self-reported current capability at the specified load; zero
means unable to perform that exercise. It does not ask users to undertake a
maximal effort test. Capability IDs are scoped to the specified mode. An
unknown/non-catalog assessment cannot affect a recommendation. Optional new
fields are preserved when an older client omits them during profile updates;
send `null` to clear them explicitly. They round-trip in bootstrap.
`trainingContext` supports partial updates: omitted properties retain their
saved values. Use an empty list to clear pain/limitations/equipment ranges,
`null` to clear nullable properties, or `trainingContext: null` to clear the
whole object. The resolved object is published in sync pull and conflict
payloads as well as the database. Other existing profile fields retain their
original full-replacement semantics; send age/goal/etc. on each legacy upsert.
focusAreas is an exception: omit both focus fields to preserve it. PATCH /me
always preserves omitted fields.

## Multi-muscle focus (22 October 2026)

`profiles.focus_areas` is the canonical text array. Migration0021 backfills a
known legacy focus into a singleton; unknown/empty values become [] without
guessing. It does not change profile versions/timestamps, sync logs, receipts,
nutrition or workout snapshots. No absent profile is created. A compatibility
trigger bridges old server versions writing only the string during rollout.

Supported values: full, leg, chest, back, arm, in that fixed response order.
Accept1–4 specific areas or ["full"] exclusively; reject duplicates, unknown
values, non-strings and null. Source app requires nonempty selection; custom
may omit during onboarding or explicitly clear with []. PATCH merges source
and selection before validating. Unrelated edits of a legacy completed profile
with missing focus do not reset onboarding or require re-onboarding.

Legacy focus requests remain valid: a known string replaces the selection with
that singleton; null clears only where the online source rules permit it.
Requests containing both fields must agree as one singleton or null/[]; a
multi-select request should send focusAreas alone. Responses expose the legacy
string only for a singleton and otherwise null. Old clients cannot fully display
multi-select. Old successful receipts replay unchanged and may lack the array.
Current GET /me always projects the canonical array; invalid old values yield []
and recommendations return409 PREFERENCES_REQUIRED, not full-body fallback.

Candidate selection is OR across the canonical areas, retaining mode and all
existing personalization/ability/equipment/duration guards. Each catalog program
can keep its single focus tag. The response interleaves filtered unique programs
by recent focus usage, with canonical order only breaking ties. `weeklyPlan` references at most the effective
weekly-session count, without duplicate program IDs or changed prescriptions.
It is a suggestion, not a persisted calendar. Fewer candidates can mean fewer
suggested slots. More selected areas do not increase training days or volume.

`focusCoverage` reports requested/available/unavailable/scheduled/unscheduled
arrays and unfilledSessions. Unavailable means no candidate after all filters;
unscheduled additionally includes available areas beyond the session cap.
Coverage refers to catalog tags, not proof of physiological muscle coverage.
The canonical ordering breaks ties, not user priority. Empty candidates keep
their existing reason (including safety gates) and never silently change focus.
Focus choices do not multiply calorie/protein requirements. See the
[complete frontend handoff](frontend-follow-up-online-api.md#multi-pilih-target-otot-22-oktober-2026).

## User data used by the recommendation

| Data | Effect |
| --- | --- |
| Age | Adult scope; at 65+ recommend a balance component and default to supported movements if balance confidence is not reported as stable. Use at most 2 sets for exercises without specific ability/performance evidence and at least 90 seconds rest. |
| Gender | Store `male`, `female`, `non_binary`, `self_described`, or `prefer_not_to_say` independently of `formulaSex`. Report context/disclosure assumptions; do not infer strength or pregnancy from identity. |
| Weight | Compare current weight with `bodyweightKg` captured in calisthenics assessments. Beyond a 5% change, request reassessment by skipping that stale assessment's exercise and trying a regression. The same freshness filter applies when a workout explicitly supplies `legacyMetadata.bodyweightKg`. Without baseline weights, no change can be inferred. |
| Height | Compare height with reported manufacturer/user-verified `equipmentHeightLimits`. Remove tools outside that range, or where a supplied range cannot be checked because height is missing. No ranges are invented from height alone. |
| Pain areas | Filter reviewed exercise movement tags for shoulder, elbow, wrist, back, hip, knee, ankle. This is conservative exclusion, not treatment or diagnosis. |
| Mobility limitations | Exclude movements tagged `floor_transfer`, `overhead_reach` or `deep_knee_bend`. |
| Balance confidence | `needs_support` selects supported variations where available. Requires a reported `chair` for supported squat/lunge variations. |
| Recovery | `tired` reduces sets by one (minimum 1), caps reps at 8, adds 30 seconds rest. `very_tired` returns no automatic program. |
| Training break | A reported break of at least 4 weeks caps sets and suggested frequency at 2, reps at 8, and rest at a minimum of 90 seconds. Update this field when returning to regular training. |
| Health status | `needs_professional_guidance` returns no automatic program. Missing/undisclosed context is reported as an assumption; it is not medical clearance. |
| Pregnancy/postpartum | Explicit `pregnant` or `postpartum` returns no automatic program because this catalog has no reviewed specialized templates. Applies regardless of gender/sex values. |

The age, rest, break, workload and 5% freshness rules are conservative product
heuristics. They have not been clinically validated. The 65+ balance component
follows [CDC older-adult guidance](https://www.cdc.gov/physical-activity-basics/guidelines/older-adults.html).
Specialized pregnancy templates remain outside this catalog; general activity
guidance does not validate these resistance templates for pregnancy (see
[CDC pregnancy guidance](https://www.cdc.gov/physicalactivity/basics/pdfs/pa-pregnant-and-postpartum-women-508.pdf)).

Example equipment size limit (only send verified equipment specifications):

```json
{"equipment": "chest_press_machine", "minHeightCm": 150, "maxHeightCm": 200}
```

These example numbers are illustrative, not real manufacturer specifications.
They only affect a program that uses that equipment. Most existing templates
use dumbbells/bodyweight and may not require an equipment size check.

## Selection and prescriptions

- Select templates by mode and OR across focusAreas, adapt exercises, then check equipment
  and estimated duration. A template is omitted if any exercise cannot be
  adapted; the response explains why in `rejectedPrograms`.
- `trainingLevel`: beginner (2 sets), intermediate (3), advanced (3, or 4 for
  muscle growth). Missing level defaults to beginner with an assumption code.
- `bulk`/`muscle` map to muscle growth (10 target reps, 90 seconds rest).
  `cut`/`fat` map to fat-loss support (10 reps, 60 seconds rest); this is a
  resistance-training component, not a complete weight-loss prescription.
  `fit`/`maintain` use 8 reps/60 seconds; `strength` uses 6/120;
  `endurance` uses 12/60. Missing/unsupported goals fall back to general
  fitness and are reported as assumptions.
- Reps never exceed 80% of a reported capability, rounded down. Below 3 reps,
  try a supported regression or omit the template. Defaults are capped at
  8 reps for beginners with no exercise-specific evidence.
- Beginner push-up/diamond targets without evidence use wall push-ups.
  Knee push-ups can be selected when assessed. Pull-ups can regress to
  band-assisted pull-ups only with both a bar and resistance band. An explicit
  zero capability or excluded exercise takes precedence over experience.
- For historical evidence, use the latest complete set log at one consistent
  load for that exercise/mode, drawn from up to 20 completed sessions in the
  last 30 days. Incomplete, aborted, deleted, future-dated and mixed-load
  sessions are not evidence. Reps are capped at previously completed reps.
  A supplied assessment takes priority for weight; history only further caps
  reps if its weight matches the assessment.
- Loads never increase automatically. Reuse a confirmed historical or reported
  load; return `targetWeightKg: null` when no such data exists. Sex, body weight,
  height, and BMI are not used to invent a lifting load.
- Frequency is returned as `suggestedWeeklySessions`, capped at 3/3/4 for
  beginner/intermediate/advanced. This is a planning default, not a calendar
  or a guarantee that every muscle group is trained sufficiently each week.
- Estimated duration includes a 5-minute warmup, 3 seconds per repetition,
  30 seconds setup per exercise, and prescribed inter-set rest. This is a
  transparent estimate, not a measured workout duration.

These exact defaults and thresholds are product heuristics, not a validated
clinical model. The general approach follows individualized goals, gradual
training and avoiding unnecessary failure-based prescriptions described by
[ACSM's 2026 guidance](https://acsm.org/resistance-training-guidelines-update-2026/)
and the [Physical Activity Guidelines](https://www.cdc.gov/physical-activity/media/pdfs/Physical_Activity_Guidelines_2nd_edition.pdf).

## Balanced planning and explicit level inputs (23 October 2026)

An omitted trainingLevel remains null in the account; it is not rewritten to
beginner and never inferred from sex, body size or frequency. The existing
onboarding/PATCH field already persists an explicit user choice. New clients
should collect it. Recommendations now report trainingLevelSource (PROFILE or
CONSERVATIVE_DEFAULT), missingProfileFields, frequencyCap and frequencyPolicy.
Existing clients may omit the field without being locked out of completed setup.

The v3 beginner ceiling permits up to3 requested sessions, retaining conservative
sets/reps/unknown loads. Intermediate remains3, advanced4; a4+-week training
break still caps frequency at2. The historical [2009 ACSM position stand](https://pubmed.ncbi.nlm.nih.gov/19204579/)
described2–3 days for novices, not a universal maximum of2. The updated
[2026 ACSM guidance](https://acsm.org/resistance-training-guidelines-update-2026/)
emphasizes individualized, sustainable training. Our precise ceilings are product
rules, not individualized medical clearance or a claim that this split meets all
major-muscle training-frequency recommendations.

Migration0022 adds29 templates (41 total), each new template containing3–4
exercises from the existing catalog. Gym variations cover dumbbells, machines,
barbells/cables; calisthenics variations include supported and equipped options.
Some templates include core/accessory work; not every exercise must target the
primary catalog focus. All12 old templates/IDs remain as compact alternatives
or valid history references. Personalization still filters every exercise, and
estimated duration must fit the user budget; it does not fill all45 minutes by
inventing load or increasing sets. Migration changes no private account data.

`recommendationTier` is standard when the personalized session has at least3
total exercises, compact otherwise. Standard candidates precede compact fallbacks;
this label does not mean physiological completeness or clinical approval.

Within the bounded weeklyPlan, select each available focus before repeating a
tag. Among tied focuses, prefer fewer recent completions, then older/no completion,
then canonical order. Within a focus, prefer standard sessions, then less-used,
less-recent variants, then ID. Counts use at most20 owned, nondeleted, completed
sessions from the past30 days with matching mode; only explicit recommended
source and a known public catalog ID provide rotation credit. An inactive/filtered
historical variant still provides focus credit through its original catalog tag.
Manual/custom and ambiguous legacy provenance cannot impersonate public-program
completion. Existing load/ability evidence still follows its separate stricter rules.

The planner is deterministic for identical data. Reopening the screen does not
randomize it. After final workout submission, invalidate recommendations in memory
and fetch on the next relevant screen access, not a new startup/polling timer.
If focuses exceed slots, unscheduled remains explicit; later reported completions
rotate priorities instead of perpetually excluding back/arms. It does not combine
entire programs, add training days, repeat program IDs or fabricate unavailable
exercises. weeklyPlan remains an unpersisted next-up-to-N suggestion, not a fixed
calendar week or a quota subtracting already completed workouts.

## Profile context and limits

`formulaSex` remains the sex field for nutrition formulas; `gender` is a
separate optional identity field. Their values alone never reduce/increase
loads. Age, body dimensions and functional context influence the concrete
rules above. Nutrition estimates and BMI-based diagnosis are outside this API.

Age is used to enforce this catalog's adult scope: missing age returns
`AGE_REQUIRED` and under-18 profiles return `ADULT_PROGRAMS_ONLY`, with no
programs. Older adults with reported stable balance and demonstrated ability
can retain their exercises/volume. The algorithm does not diagnose conditions,
prescribe rehabilitation or certify that a program is safe. Catalog entries
without reviewed movement tags cannot bypass explicit movement restrictions.
All 117 current catalog exercises now have required nonempty annotations; see
[definitions, sources and the complete mapping](exercise-movement-tags.md).
Legacy/malformed inputs with empty, duplicate or unknown tags are also rejected
when applying explicit restrictions, rather than treating them as unrestricted.
The balance component is a reminder; this API does not provide a complete
balance/aerobic program.

The response includes `personalization.algorithmVersion` (`"3"`), effective goal and
level, assumptions, requested/suggested frequency, load policy, and per-program
adjustments showing substitutions and evidence source. No matching program
returns `NO_MATCHING_PROGRAM`. Context gates additionally return
`PROFESSIONAL_GUIDANCE_REQUIRED`, `SPECIALIZED_PROGRAM_REQUIRED`, or
`RECOVERY_REQUIRED`. Context adjustments, blocked equipment, assumptions and
gender/bodyweight handling policies are returned for the client to explain.
Missing mode/valid focusAreas/duration returns HTTP409 PREFERENCES_REQUIRED.
Multi-select requires migration0021 and multiMuscleFocus capability. Version3
additionally requires catalog migration0022 and deployed source advertising
balancedWorkoutRecommendations. Local implementation is not proof of deployed
support; check capabilities operationally, not on every mobile startup. Current
rollout/verification details are in the
[recommendation follow-up](backend-workout-recommendations-follow-up.md).
Flutter changes are outside this backend task.
