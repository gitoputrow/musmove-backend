-- REVIEW/MANUAL SETUP ONLY. NOT run by migrations or builds.
-- First create a dedicated LOGIN role named musmove_runtime using SQL as admin,
-- not Neon's role-management UI/API/CLI (those grant neon_superuser membership).
-- CREATE ROLE musmove_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
-- Set its generated password securely (e.g. interactive psql \password).
-- Store the resulting URL only in Vercel Sensitive env variables.
-- Do not use an owner, neon_superuser member, CREATEROLE or BYPASSRLS role.
-- Run as the migration/admin role on the production branch, not the app.
BEGIN;
GRANT USAGE ON SCHEMA public TO musmove_runtime;
REVOKE CREATE ON SCHEMA public FROM musmove_runtime;
GRANT SELECT ON TABLE
  catalog_state, exercise_catalog, equipment_catalog, place_catalog, meal_catalog,
  workout_program_catalog, workout_program_exercises TO musmove_runtime;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE
  catalog_state, exercise_catalog, equipment_catalog, place_catalog, meal_catalog,
  workout_program_catalog, workout_program_exercises FROM musmove_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  users, profiles, training_preferences, custom_programs, user_exercises,
  workout_sessions, user_preferences, place_favorites, meal_entries, social_drafts,
  legacy_user_metadata, sync_state, sync_changes, operation_receipts, demo_imports,
  nutrition_estimates, api_rate_limits TO musmove_runtime;
-- No ALTER DEFAULT PRIVILEGES blanket grant: review each new table explicitly.
COMMIT;
