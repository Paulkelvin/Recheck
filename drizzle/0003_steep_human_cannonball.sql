CREATE TYPE "public"."plan_preview_status" AS ENUM('not_attempted', 'processing', 'available', 'unavailable');--> statement-breakpoint
ALTER TABLE "land_reports" ADD COLUMN "plan_preview_status" "plan_preview_status" DEFAULT 'not_attempted' NOT NULL;--> statement-breakpoint
ALTER TABLE "land_reports" ADD COLUMN "plan_preview_reason" text;--> statement-breakpoint
ALTER TABLE "land_reports" ADD COLUMN "plan_preview_coordinates" jsonb;--> statement-breakpoint
ALTER TABLE "land_reports" ADD COLUMN "plan_preview_checked_at" timestamp with time zone;