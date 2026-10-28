# MusMove Backend

Next.js API for the MusMove mobile application, backed by Neon PostgreSQL,
Drizzle ORM, and Neon Auth bearer tokens.

## Mobile API

Panduan berbahasa Indonesia untuk struktur database, penggunaan endpoint,
alur Neon Auth native, dan sync offline tersedia di
[`docs/mobile-integration.md`](docs/mobile-integration.md).

For the latest online-only mobile flow, use the
[direct feature API handoff](docs/frontend-follow-up-online-api.md). It supersedes
legacy sync instructions for new clients, without deleting the legacy API/data.

All API routes use `/api/v1`. Mobile signs in through the Next.js auth proxy,
not directly to Neon. See [the auth handoff](docs/frontend-follow-up-auth-proxy.md)
for `Authorization: Session` on auth endpoints. Private data routes require the
short-lived Neon JWT obtained through `GET /auth/token`:

```http
Authorization: Bearer <access-token>
Content-Type: application/json
```

The server derives account ownership only from the verified token. A client
must never send a `userId` to select ownership. Current endpoints are:

- `GET/PATCH /me` (account/setup snapshot; one atomic patch for profile, training and budget/area preferences)
- `POST /onboarding/complete` (final-only atomic setup; Bearer JWT, UUID `Idempotency-Key` and `baseVersions`)
- `GET /meta` (public implementation capabilities; not provider readiness)
- `POST /auth/sign-up/email` and `POST /auth/sign-in/email` (strict JSON; no Authorization)
- `GET /auth/get-session` and `GET /auth/token` (native encrypted session; Authorization: Session)
- `POST /auth/sign-out` (Authorization: Session; no body)
- `POST /auth/request-password-reset` (email only; server-owned callback)
- `GET /sync/bootstrap`
- `POST/GET/DELETE /sync/snapshots` (additive immutable paginated bootstrap v2)
- `POST /sync/push`
- `GET /sync/pull?cursor=...&limit=...`
- `POST /imports/demo`
- `GET /workouts?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `POST /workouts` (save once after finishing, including full performed snapshot and all set results; custom/recommended/manual)
- Manual workout may include `newExercises` (up to12, all referenced with matching exercise modes) in the same atomic submit; fresh responses return `{item, exercises}`. New free manual format omits top-level mode and sends exercise.mode / setLog.exerciseMode; the backend derives gym/calisthenics/mixed independently of profile. Program workouts stay single-mode. Requires migration0023 and upgraded readers; see [frontend contract](docs/frontend-follow-up-record-workout-free-mode.md). No separate exercise registration or progress API.
- `GET/DELETE /workouts/{id}` (history; no start/resume, per-set save or abort API)
- `GET/POST /programs/custom`; `GET/PATCH/DELETE /programs/custom/{id}`
- `GET/POST /exercises/custom`; `GET/PATCH/DELETE /exercises/custom/{id}`
- `GET /catalog/exercises` (public and versioned)
- `GET /catalog/equipment?q=dambel` (public equipment catalog/name aliases)
- `GET /equipment/exercises?equipmentIds=dumbbell,bench&mode=gym` (public equipment matches and missing tools)
- `POST /equipment/recognize` (private multipart photo; self-hosted SigLIP 2, candidates require confirmation)
- `GET /catalog/programs` (public template catalog)
- `GET /programs/recommendations` (private selection using saved preferences)
- `GET /catalog/meals?q=tempe&foodGroup=legumes&limit=50&offset=0` (public, paginated TKPI reference foods; demos hidden by default)
- `GET /catalog/places` (public Jakarta catalog, category/access filters and optional distance)
- `GET /places` (private `isFavorite` and `favoriteVersion`); `PUT/DELETE /places/{id}/favorite`
- `GET /nutrition/targets` (private, stored profile-versioned estimates)
- `GET /meals?date=YYYY-MM-DD&limit=50&offset=0` (private daily journal/summary)
- `POST /meals`; `GET/PATCH/DELETE /meals/{id}` (canonical journal/summary returned on writes)
- `GET/POST /social/drafts`; `GET/PATCH/DELETE /social/drafts/{id}` (private, never auto-published)
- `GET /dashboard?date=YYYY-MM-DD`; `GET /schedule?from=...&to=...`; `GET /statistics?from=...&to=...`
- `POST /account/deletion-requests`
- `GET /account/deletion-requests` (own lifecycle status while JWT remains valid)
- `GET/POST/DELETE /social/posts` (explicit text community publishing; feature flag)
- `POST /social/reports` (private moderation reports)

The web password-reset callback is `/auth/reset-password` outside `/api/v1`.
See [backend follow-up implementation and rollout](docs/backend-follow-up-result.md)
for the7-day deletion worker, operational credentials, moderation and limitations.

For the new final-only mobile setup flow, see
[the onboarding handoff](docs/frontend-follow-up-onboarding.md). Incomplete
answers stay in mobile memory; there is no backend draft/progress. This feature
reuses existing tables and needs no additional migration. The legacy sync
contract remains available. Direct resource CRUD and completed-only workout submission are now
implemented in source; see the online handoff for limits and rollout status.
The22 October multi-muscle extension requires migration0021 before deploying
the updated backend; `profile.focusAreas` replaces the singular focus as the
recommendation input while accepting legacy requests during transition.
All new mutations require a UUID `Idempotency-Key`; updates/deletes also require
base versions. No cloud deploy, production personal-data write, or mobile
SQLite/outbox deletion is performed by this change.

The sync contract is offline-first. `operationId` makes retries idempotent,
`baseVersion` detects concurrent edits, per-user sequence numbers order the
change stream, and signed cursors bind a position to its account. All `bigint`
versions and sequences are returned as decimal strings so Dart and JavaScript
clients do not lose precision. See [`docs/openapi.yaml`](docs/openapi.yaml) for
the transport contract.

Example push:

```json
{
  "schemaVersion": 1,
  "deviceId": "mobile-installation-id",
  "operations": [
    {
      "operationId": "d45ca67e-f881-4ec6-85d5-e18cf49fabca",
      "entityType": "profile",
      "entityId": "profile",
      "action": "upsert",
      "baseVersion": "0",
      "payload": {
        "displayName": "MusMover",
        "motivationEnabled": true,
        "setupCompleted": false
      }
    }
  ]
}
```

For one-per-user records, use stable IDs `profile`, `training_preferences`,
`user_preferences`, and `legacy_user_metadata`. Mutations for synchronized
entities must go through `/sync/push`; there are no parallel CRUD routes that
bypass versions, receipts, or the change log.

## Database

The reviewed migrations create 30 application tables after migration0016 for identities, profiles,
training preferences, programs, exercises, workouts, private user data,
synchronization state/change logs, idempotency receipts, and demo imports.

Before Vercel deployment, follow the [security audit and deployment checklist](docs/security-vercel.md).
Production uses shared PostgreSQL rate limits and refuses incomplete security
configuration. `vercel.json` blocks deployment until `npm run security:check`
passes; do not bypass it with owner credentials or placeholder secrets.

`equipment_catalog` contains 31 canonical tools and name aliases after migration0025. Exercise
links reuse existing `requirements` AND/OR groups; reference protection
prevents dangling keys. The private photo API validates/normalizes uploads
and calls a separate pinned SigLIP 2 Python service, without storing photos.
See the [equipment scan setup, API and limitations](docs/equipment-scan.md).

`place_catalog` contains 18 researched Jakarta places: 10 FIT HUB branches,
3 FTL branches, 2 local gyms with publisher-reported per-visit access, and
3 outdoor training locations. Addresses, coordinates, Maps links, access
models, sources and the research date are stored in Neon. Category
and access model are separate; an unknown day-pass flag is not false.
See the [places contract and research notes](docs/places.md). Existing mobile
demo favorites are preserved, not remapped to unrelated real-world locations.

The global exercise catalog is stored in `exercise_catalog` with 117 legacy seeded
entries across gym and calisthenics. Existing IDs are preserved within each
mode. The public API reads active records from Neon; catalog edits automatically
advance `catalogVersion` through a database trigger. Exercise requirements are
equipment keys; each inner array is one acceptable combination. The catalog
adds two explicitly timed forearm plank entries after migration0024 (119 total).
Migration0025 adds six named gym plate-loaded chest press entries (125 total)
and three angle-specific plate-loaded machines. Exact existing IDs or normalized
English labels are kept instead of overwritten or duplicated.
Readers must support nullable defaultReps plus trackingType/defaultDurationSeconds.
Workout result snapshots, timing provenance, external load volume and canonical
muscle targets are documented in the [result metrics contract](docs/frontend-follow-up-workout-result-metrics.md).
Workout calorie estimates were removed on27 October2026; new metrics version2
retain duration and muscles, without energy or extra activity/bodyweight inputs.
See the [frontend removal handoff](docs/frontend-follow-up-workout-without-calories.md).
Migration0024 must be present before the nullable/duration catalog is deployed;
coordinate older mobile readers before applying catalog changes.

Every exercise has explicitly reviewed, nonempty `movement_tags` for body-region
and movement restrictions. Database constraints reject missing, empty, null-item
or unknown tags. These are conservative product annotations, not medical clearance
or muscle-target labels. See [movement-tag definitions and full mapping](docs/exercise-movement-tags.md).

After migration0022, `workout_program_catalog` and `workout_program_exercises`
hold41 templates:29 new3–4-exercise variants plus the12 original templates,
which remain as compact alternatives/history references. Selection
uses saved training mode, equipment, canonical profile `focusAreas` (`full`
exclusively, or1–4 of `leg`, `chest`, `back`, `arm` with OR matching), and maximum
session duration. Missing preferences return409;
no matching template returns an empty list with `NO_MATCHING_PROGRAM`.
Prescriptions reference the catalog but use template-specific sets/reps.
Core templates use repetition-based dead bug/bird dog instead of timed planks.
Recommendations personalize prescriptions using the profile training level,
goal, age, bodyweight evidence, reported equipment height limits, mobility,
recovery and health context, optional exercise capability assessments and up
to 20 completed workouts from the last 30 days. Gender is stored independently
from the nutrition-formula sex field. See [personalization contract](docs/program-personalization.md)
for supported fields, defaults, load handling and scope.

Mobile should save setup/profile through the direct account APIs, call
`/programs/recommendations`, then keep workout progress local and submit the
performed `exerciseSnapshot` only after finishing via POST `/workouts`.
Recommendations include a bounded `weeklyPlan` and explicit `focusCoverage`
with balanced focus and recent-completion variant rotation. Beginner/intermediate
ceilings are3 sessions, advanced4, returning-after-a-break2, never higher than
the requested frequency. Missing trainingLevel is explicitly reported, not
persisted as an invented answer. Adding focus tags does not multiply volume.
Existing workout snapshots stay
independent of later catalog/profile edits.
This backend change does not yet switch the Flutter application to these routes.

`meal_catalog` stores 1,145 TKPI 2017 reference foods across 13 food groups,
with source codes/pages, 100 g edible portions, energy, protein, carbohydrates,
fat, fiber, sodium and available micronutrients. Source-derived/imputed values
stay labeled, missing values remain null, and flagged source outliers are
withheld for review. These are traceable reference values, not independently
lab-tested individual meals. The three existing mobile demo meals remain stored
but are hidden unless `includeDemo=true`; no history is deleted. See the
[food catalog coverage, verification and API](docs/food-catalog.md).

Migration `0018` adds internet-reference food price **estimates** with independent
pricing provenance: 1,125 priced reference foods and 20 deliberate non-retail/
sensitive exclusions. Numeric prices are per100g edible portion, not live offers;
see [food pricing and mobile display rules](docs/food-prices.md).
`meal_entries` supports portions, consumption timestamps, local
dates and immutable nutrition snapshots. `nutrition_estimates` stores input and
output snapshots per profile/formula version atomically on profile writes.
The v2 formula retains the mobile maintenance baseline and adds explicit goal
targets: bulk approximately +10% (cap 300 kcal), cut -15% (cap 500 kcal), and
maintenance unchanged. Protein is 2 g/kg for cut and 1.6 for bulk/maintenance.
These are starting product heuristics with review guards, not clinical targets.
Both baseline and final targets are stored; old v1 snapshots are preserved.
Demo nutrients are excluded from real daily
progress. See [meals/nutrition contract](docs/meals-nutrition.md) for payloads,
guards, sources, shared Dart/TypeScript fixtures and remaining scope.

Important database guarantees include account ownership foreign keys,
`bigint` versions and sequences, tombstones, one live scheduled program per
mode/weekday, and one live active workout per account.

Copy the environment template and add the restricted Neon pooled connection,
Neon Auth endpoint, and independent random signing/rate-limit secrets. Keep the
admin `DATABASE_URL_DIRECT` exclusively in ignored `.env.migrations.local` for
local migration tooling, or supply it via a secure migration-only CI job:

```bash
cp .env.example .env.local
npm run db:migrate
npm run db:backfill-nutrition
```

Runtime uses `DATABASE_URL`; migrations prefer `DATABASE_URL_DIRECT` and never
run on application startup. Only migration tooling explicitly loads
`.env.migrations.local`; Next.js does not load that filename. Do not copy this
file or its admin credential into Vercel. Use a non-owner runtime role.

## Local development

```bash
npm run dev
```

For the backend together with the local model service (after Python setup/model
download in the equipment-scan guide), use `npm run dev:vision`.

The public catalog is at
`http://localhost:3000/api/v1/catalog/exercises`. Private routes return `401`
until a valid Neon Auth bearer token is supplied.

## Verification

The default checks below are isolated/local and do not write production data.
Legacy `db:test-api`, `db:test-security`, `db:test-nutrition` and other Neon
integration commands require a separately approved test database; do not run
them against the configured production database. No staging is created here.

```bash
npm run lint
npm run typecheck
npm run db:test-schema
npm run test:follow-up
npm run test:onboarding
npm run test:online
npm run test:security
npm run test:programs
npm run test:movement-tags
npm run db:test-movement-tags
npm run test:nutrition
npm run test:places
npm run test:equipment
npm run test:vision
npm run test:vision-real # requires downloaded model; runs real CPU inference
npm run test:nutrition-dart # optional: Dart SDK and ../musmove required
npm run build -- --webpack
npm audit
```

`db:test-api` uses the configured Neon database, creates isolated synthetic
accounts, validates sync transactions/idempotency/conflicts/import, and removes
those accounts in a `finally` block.

The backend has PostgreSQL-backed shared rate limiting and a dedicated
non-owner runtime role for the configured database. Production still needs
deployment-level WAF/usage controls and real mobile login/refresh/write smoke
tests; see the security checklist and mobile integration guide.
# musmove-backend
