ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "machines" ADD COLUMN "download_token_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "machines" ADD COLUMN "download_token_last_rotated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "google_id" varchar(255);--> statement-breakpoint
ALTER TABLE "machines" ADD CONSTRAINT "machines_download_token_hash_unique" UNIQUE("download_token_hash");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_google_id_unique" UNIQUE("google_id");