-- Migration: Add download token fields to machines table
-- Purpose: Enable secure, tokenized whitelist delivery per machine

ALTER TABLE "machines" ADD COLUMN "download_token_hash" varchar(64);
ALTER TABLE "machines" ADD COLUMN "download_token_last_rotated_at" timestamp with time zone;

-- Create unique index for fast token hash lookups
CREATE UNIQUE INDEX IF NOT EXISTS "machines_download_token_hash_unique" ON "machines" ("download_token_hash");
