CREATE TYPE "public"."account_status" AS ENUM('active', 'suspended', 'deletion_requested', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."daily_activity" AS ENUM('light', 'moderate', 'vigorous');--> statement-breakpoint
CREATE TYPE "public"."formula_sex" AS ENUM('male', 'female');--> statement-breakpoint
CREATE TYPE "public"."program_source" AS ENUM('app', 'custom');--> statement-breakpoint
CREATE TYPE "public"."sync_operation" AS ENUM('upsert', 'delete');--> statement-breakpoint
CREATE TYPE "public"."training_mode" AS ENUM('gym', 'calisthenics');--> statement-breakpoint
CREATE TYPE "public"."workout_status" AS ENUM('active', 'completed', 'aborted');--> statement-breakpoint
CREATE TABLE "demo_imports" (
	"user_id" uuid NOT NULL,
	"import_id" uuid NOT NULL,
	"snapshot_hash" varchar(64) NOT NULL,
	"id_mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"receipt" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "demo_imports_user_id_import_id_pk" PRIMARY KEY("user_id","import_id"),
	CONSTRAINT "demo_imports_hash_format" CHECK ("demo_imports"."snapshot_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "operation_receipts" (
	"user_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"request_hash" varchar(64) NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operation_receipts_user_id_operation_id_pk" PRIMARY KEY("user_id","operation_id"),
	CONSTRAINT "operation_receipts_hash_format" CHECK ("operation_receipts"."request_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "sync_changes" (
	"user_id" uuid NOT NULL,
	"sequence" bigint NOT NULL,
	"entity_type" varchar(80) NOT NULL,
	"entity_id" varchar(255) NOT NULL,
	"entity_version" bigint NOT NULL,
	"operation" "sync_operation" NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_changes_user_id_sequence_pk" PRIMARY KEY("user_id","sequence"),
	CONSTRAINT "sync_changes_sequence_positive" CHECK ("sync_changes"."sequence" > 0),
	CONSTRAINT "sync_changes_version_positive" CHECK ("sync_changes"."entity_version" > 0),
	CONSTRAINT "sync_changes_entity_type_not_blank" CHECK (length(trim("sync_changes"."entity_type")) > 0),
	CONSTRAINT "sync_changes_entity_id_not_blank" CHECK (length(trim("sync_changes"."entity_id")) > 0),
	CONSTRAINT "sync_changes_upsert_payload" CHECK ("sync_changes"."operation" = 'delete' or "sync_changes"."payload" is not null)
);
--> statement-breakpoint
CREATE TABLE "sync_state" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"next_sequence" bigint DEFAULT 1 NOT NULL,
	"epoch" uuid DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_state_next_sequence_positive" CHECK ("sync_state"."next_sequence" > 0)
);
--> statement-breakpoint
CREATE TABLE "custom_programs" (
	"user_id" uuid NOT NULL,
	"id" varchar(255) NOT NULL,
	"mode" "training_mode" NOT NULL,
	"name" varchar(60) NOT NULL,
	"duration_minutes" smallint NOT NULL,
	"weekday" smallint,
	"exercise_prescriptions" jsonb NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "custom_programs_user_id_id_pk" PRIMARY KEY("user_id","id"),
	CONSTRAINT "custom_programs_id_not_blank" CHECK (length(trim("custom_programs"."id")) > 0),
	CONSTRAINT "custom_programs_name_not_blank" CHECK (length(trim("custom_programs"."name")) > 0),
	CONSTRAINT "custom_programs_duration_range" CHECK ("custom_programs"."duration_minutes" between 10 and 180),
	CONSTRAINT "custom_programs_weekday_range" CHECK ("custom_programs"."weekday" is null or "custom_programs"."weekday" between 1 and 7),
	CONSTRAINT "custom_programs_exercise_count" CHECK (jsonb_typeof("custom_programs"."exercise_prescriptions") = 'array'
        and jsonb_array_length("custom_programs"."exercise_prescriptions") between 1 and 12),
	CONSTRAINT "custom_programs_version_positive" CHECK ("custom_programs"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "legacy_user_metadata" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"joined_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "legacy_user_metadata_version_positive" CHECK ("legacy_user_metadata"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "meal_entries" (
	"user_id" uuid NOT NULL,
	"id" varchar(255) NOT NULL,
	"note" text,
	"menu_name" varchar(120),
	"sample_price_rupiah" integer,
	"snapshot" jsonb NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "meal_entries_user_id_id_pk" PRIMARY KEY("user_id","id"),
	CONSTRAINT "meal_entries_id_not_blank" CHECK (length(trim("meal_entries"."id")) > 0),
	CONSTRAINT "meal_entries_price_nonnegative" CHECK ("meal_entries"."sample_price_rupiah" is null or "meal_entries"."sample_price_rupiah" >= 0),
	CONSTRAINT "meal_entries_snapshot_object" CHECK (jsonb_typeof("meal_entries"."snapshot") = 'object'),
	CONSTRAINT "meal_entries_version_positive" CHECK ("meal_entries"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "place_favorites" (
	"user_id" uuid NOT NULL,
	"place_id" varchar(255) NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "place_favorites_user_id_place_id_pk" PRIMARY KEY("user_id","place_id"),
	CONSTRAINT "place_favorites_id_not_blank" CHECK (length(trim("place_favorites"."place_id")) > 0),
	CONSTRAINT "place_favorites_version_positive" CHECK ("place_favorites"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"display_name" varchar(80),
	"age_years" smallint,
	"weight_kg" numeric(6, 2),
	"height_cm" numeric(5, 2),
	"formula_sex" "formula_sex",
	"goal" varchar(50),
	"motivation_reason" varchar(80),
	"motivation_enabled" boolean DEFAULT true NOT NULL,
	"daily_activity" "daily_activity",
	"training_frequency" smallint,
	"focus" varchar(50),
	"program_source" "program_source",
	"session_minutes" smallint,
	"setup_completed" boolean DEFAULT false NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "profiles_age_range" CHECK ("profiles"."age_years" is null or "profiles"."age_years" between 1 and 150),
	CONSTRAINT "profiles_weight_positive" CHECK ("profiles"."weight_kg" is null or "profiles"."weight_kg" > 0),
	CONSTRAINT "profiles_height_positive" CHECK ("profiles"."height_cm" is null or "profiles"."height_cm" > 0),
	CONSTRAINT "profiles_frequency_range" CHECK ("profiles"."training_frequency" is null or "profiles"."training_frequency" between 1 and 7),
	CONSTRAINT "profiles_session_minutes_range" CHECK ("profiles"."session_minutes" is null or "profiles"."session_minutes" between 10 and 180),
	CONSTRAINT "profiles_version_positive" CHECK ("profiles"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "social_drafts" (
	"user_id" uuid NOT NULL,
	"id" varchar(255) NOT NULL,
	"body" text NOT NULL,
	"metadata" jsonb,
	"version" bigint DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "social_drafts_user_id_id_pk" PRIMARY KEY("user_id","id"),
	CONSTRAINT "social_drafts_id_not_blank" CHECK (length(trim("social_drafts"."id")) > 0),
	CONSTRAINT "social_drafts_body_length" CHECK (char_length(trim("social_drafts"."body")) between 1 and 2000),
	CONSTRAINT "social_drafts_version_positive" CHECK ("social_drafts"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "training_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"mode" "training_mode" NOT NULL,
	"equipment" text[] DEFAULT '{}'::text[] NOT NULL,
	"no_equipment" boolean DEFAULT false NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "training_preferences_equipment_choice" CHECK (("training_preferences"."no_equipment" and cardinality("training_preferences"."equipment") = 0)
        or (not "training_preferences"."no_equipment" and cardinality("training_preferences"."equipment") > 0)),
	CONSTRAINT "training_preferences_version_positive" CHECK ("training_preferences"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "user_exercises" (
	"user_id" uuid NOT NULL,
	"id" varchar(255) NOT NULL,
	"mode" "training_mode" NOT NULL,
	"name" varchar(80) NOT NULL,
	"default_sets" smallint NOT NULL,
	"default_reps" smallint NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "user_exercises_user_id_id_pk" PRIMARY KEY("user_id","id"),
	CONSTRAINT "user_exercises_id_not_blank" CHECK (length(trim("user_exercises"."id")) > 0),
	CONSTRAINT "user_exercises_name_not_blank" CHECK (length(trim("user_exercises"."name")) > 0),
	CONSTRAINT "user_exercises_sets_range" CHECK ("user_exercises"."default_sets" between 1 and 10),
	CONSTRAINT "user_exercises_reps_range" CHECK ("user_exercises"."default_reps" between 1 and 100),
	CONSTRAINT "user_exercises_version_positive" CHECK ("user_exercises"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"budget_rupiah" integer,
	"budget_is_manual" boolean DEFAULT false NOT NULL,
	"places_area" varchar(120),
	"version" bigint DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "user_preferences_budget_positive" CHECK ("user_preferences"."budget_rupiah" is null or "user_preferences"."budget_rupiah" > 0),
	CONSTRAINT "user_preferences_version_positive" CHECK ("user_preferences"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "workout_sessions" (
	"user_id" uuid NOT NULL,
	"id" varchar(255) NOT NULL,
	"plan_id" varchar(255) NOT NULL,
	"mode" "training_mode" NOT NULL,
	"status" "workout_status" DEFAULT 'active' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"recorded_on" date,
	"exercise_snapshot" jsonb NOT NULL,
	"set_log" jsonb NOT NULL,
	"legacy_metadata" jsonb,
	"version" bigint DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "workout_sessions_user_id_id_pk" PRIMARY KEY("user_id","id"),
	CONSTRAINT "workout_sessions_id_not_blank" CHECK (length(trim("workout_sessions"."id")) > 0),
	CONSTRAINT "workout_sessions_status_times" CHECK (("workout_sessions"."status" = 'active' and "workout_sessions"."finished_at" is null)
        or ("workout_sessions"."status" <> 'active' and "workout_sessions"."finished_at" is not null)),
	CONSTRAINT "workout_sessions_recorded_on_min" CHECK ("workout_sessions"."recorded_on" is null or "workout_sessions"."recorded_on" >= date '1900-01-01'),
	CONSTRAINT "workout_sessions_exercise_count" CHECK (jsonb_typeof("workout_sessions"."exercise_snapshot") = 'array'
        and jsonb_array_length("workout_sessions"."exercise_snapshot") between 1 and 12),
	CONSTRAINT "workout_sessions_set_log_array" CHECK (jsonb_typeof("workout_sessions"."set_log") = 'array'),
	CONSTRAINT "workout_sessions_version_positive" CHECK ("workout_sessions"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issuer" varchar(255) NOT NULL,
	"subject" varchar(255) NOT NULL,
	"status" "account_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_issuer_not_blank" CHECK (length(trim("users"."issuer")) > 0),
	CONSTRAINT "users_subject_not_blank" CHECK (length(trim("users"."subject")) > 0)
);
--> statement-breakpoint
ALTER TABLE "demo_imports" ADD CONSTRAINT "demo_imports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_receipts" ADD CONSTRAINT "operation_receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_changes" ADD CONSTRAINT "sync_changes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_state" ADD CONSTRAINT "sync_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_programs" ADD CONSTRAINT "custom_programs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legacy_user_metadata" ADD CONSTRAINT "legacy_user_metadata_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_entries" ADD CONSTRAINT "meal_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_favorites" ADD CONSTRAINT "place_favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_drafts" ADD CONSTRAINT "social_drafts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_preferences" ADD CONSTRAINT "training_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_exercises" ADD CONSTRAINT "user_exercises_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sync_changes_user_entity_idx" ON "sync_changes" USING btree ("user_id","entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_programs_live_schedule_uidx" ON "custom_programs" USING btree ("user_id","mode","weekday") WHERE "custom_programs"."weekday" is not null and "custom_programs"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "workout_sessions_one_live_active_uidx" ON "workout_sessions" USING btree ("user_id") WHERE "workout_sessions"."status" = 'active' and "workout_sessions"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "workout_sessions_user_recorded_on_idx" ON "workout_sessions" USING btree ("user_id","recorded_on");--> statement-breakpoint
CREATE INDEX "workout_sessions_user_finished_at_idx" ON "workout_sessions" USING btree ("user_id","finished_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_issuer_subject_uidx" ON "users" USING btree ("issuer","subject");