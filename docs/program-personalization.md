# Program personalization v2

`GET /api/v1/programs/recommendations` uses the authenticated account's saved
profile and training preferences, the database template/exercise catalogs,
and recent owned, non-deleted completed workouts. It never modifies workouts
or their snapshots. Mobile must send profile fields through sync push first.

## Profile contract

The existing profile sync payload accepts these additional optional fields:

```json
{
  "ageYears": 28,
  "goal": "bulk",
  "focus": "chest",
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
original full-replacement semantics; send age/goal/focus/etc. on each upsert.

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

- Select templates by mode and focus, adapt exercises, then check equipment
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
- Frequency is returned as `suggestedWeeklySessions`, capped at 2/3/4 for
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

The response includes `personalization.algorithmVersion` (`"2"`), effective goal and
level, assumptions, requested/suggested frequency, load policy, and per-program
adjustments showing substitutions and evidence source. No matching program
returns `NO_MATCHING_PROGRAM`. Context gates additionally return
`PROFESSIONAL_GUIDANCE_REQUIRED`, `SPECIALIZED_PROGRAM_REQUIRED`, or
`RECOVERY_REQUIRED`. Context adjustments, blocked equipment, assumptions and
gender/bodyweight handling policies are returned for the client to explain.
Missing mode/focus/duration returns HTTP 409.
This implementation is backend-only; Flutter still needs fields for ability
assessment and to call this endpoint.
