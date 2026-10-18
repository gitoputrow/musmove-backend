CREATE TABLE sync_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  epoch uuid NOT NULL, sequence bigint NOT NULL, total integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
  CONSTRAINT sync_snapshots_budget CHECK (total BETWEEN 0 AND 20000 AND sequence >= 0)
);
--> statement-breakpoint
CREATE INDEX sync_snapshots_user_expiry_idx ON sync_snapshots(user_id, expires_at);
--> statement-breakpoint
CREATE TABLE sync_snapshot_items (
  snapshot_id uuid NOT NULL REFERENCES sync_snapshots(id) ON DELETE CASCADE,
  position integer NOT NULL, entity_type varchar(80) NOT NULL, entity_id varchar(255) NOT NULL,
  version bigint NOT NULL, updated_at timestamptz NOT NULL, payload jsonb NOT NULL,
  PRIMARY KEY(snapshot_id, position), CONSTRAINT sync_snapshot_item_position CHECK (position > 0 AND version > 0)
);
--> statement-breakpoint
CREATE TABLE account_deletion_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  status varchar(30) NOT NULL DEFAULT 'waiting', requested_at timestamptz NOT NULL DEFAULT now(),
  delete_after timestamptz NOT NULL, provider_deleted_at timestamptz, completed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0, last_error_code varchar(80), retry_at timestamptz,
  CONSTRAINT account_deletion_job_status CHECK (status IN ('waiting','provider_pending','failed','completed') AND attempts >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX account_deletion_jobs_user_unique ON account_deletion_jobs(user_id);
--> statement-breakpoint
CREATE INDEX account_deletion_jobs_due_idx ON account_deletion_jobs(delete_after,retry_at);
--> statement-breakpoint
CREATE TABLE revoked_identities (identity_hash varchar(64) PRIMARY KEY, expires_at timestamptz NOT NULL,
  CONSTRAINT revoked_identity_hash_format CHECK (identity_hash ~ '^[0-9a-f]{64}$'));
--> statement-breakpoint
CREATE INDEX revoked_identities_expiry_idx ON revoked_identities(expires_at);
--> statement-breakpoint
CREATE TABLE social_posts (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_label varchar(80) NOT NULL, body text NOT NULL, request_hash varchar(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz,
  moderation_status varchar(20) NOT NULL DEFAULT 'visible',
  CONSTRAINT social_posts_content CHECK (length(trim(body)) BETWEEN 1 AND 2000 AND length(trim(author_label)) BETWEEN 1 AND 80),
  CONSTRAINT social_posts_moderation CHECK (moderation_status IN ('visible','hidden'))
);
--> statement-breakpoint
CREATE INDEX social_posts_feed_idx ON social_posts(created_at, id);
--> statement-breakpoint
CREATE TABLE social_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), post_id uuid NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason varchar(30) NOT NULL, details text, status varchar(20) NOT NULL DEFAULT 'open', created_at timestamptz NOT NULL DEFAULT now(),
  resolution varchar(20), resolved_at timestamptz, moderator_ref varchar(80),
  CONSTRAINT social_report_reason CHECK (reason IN ('spam','harassment','unsafe_content','privacy','other')),
  CONSTRAINT social_report_status CHECK (status IN ('open','resolved')),
  CONSTRAINT social_report_details CHECK (details IS NULL OR length(details) <= 1000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX social_reports_post_reporter_unique ON social_reports(post_id, reporter_id);
--> statement-breakpoint
-- Existing requests have no dedicated request date. Never purge immediately.
INSERT INTO account_deletion_jobs(user_id,delete_after)
SELECT id, greatest(updated_at + interval '7 days', now() + interval '7 days')
FROM users WHERE status='deletion_requested';
