CREATE TABLE api_rate_limits (
  bucket_key varchar(64) PRIMARY KEY CONSTRAINT api_rate_limits_key CHECK (bucket_key ~ '^[0-9a-f]{64}$'),
  requests integer NOT NULL CONSTRAINT api_rate_limits_requests CHECK (requests > 0),
  reset_at timestamptz NOT NULL
);
--> statement-breakpoint
CREATE INDEX api_rate_limits_expiry_idx ON api_rate_limits (reset_at);
