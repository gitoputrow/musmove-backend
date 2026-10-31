-- Preserve historical duration values; new custom programs no longer require one.
ALTER TABLE custom_programs ALTER COLUMN duration_minutes DROP NOT NULL;
