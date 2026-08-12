CREATE TYPE "public"."report_tier" AS ENUM('quick', 'full');--> statement-breakpoint
ALTER TABLE "land_reports" ADD COLUMN "tier" "report_tier" DEFAULT 'full' NOT NULL;