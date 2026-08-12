CREATE TYPE "public"."finding_check_type" AS ENUM('plan_authenticity', 'overlap', 'acquisition', 'dispute', 'size', 'encumbrance');--> statement-breakpoint
CREATE TYPE "public"."finding_result" AS ENUM('pass', 'fail', 'flagged', 'inconclusive');--> statement-breakpoint
CREATE TYPE "public"."land_report_status" AS ENUM('submitted', 'under_review', 'surveyor_assigned', 'ready');--> statement-breakpoint
CREATE TYPE "public"."listing_status" AS ENUM('active', 'pending');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('unpaid', 'paid', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."surveyor_check_method" AS ENUM('automated', 'manual');--> statement-breakpoint
CREATE TYPE "public"."surveyor_check_status" AS ENUM('registered', 'not_found', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('buyer', 'surveyor', 'admin');--> statement-breakpoint
CREATE TABLE "land_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "land_report_status" DEFAULT 'submitted' NOT NULL,
	"state" text NOT NULL,
	"lga" text NOT NULL,
	"address" text,
	"plan_number" text,
	"seller_name" text,
	"uploaded_docs" text[] DEFAULT '{}' NOT NULL,
	"payment_status" "payment_status" DEFAULT 'unpaid' NOT NULL,
	"amount_paid" numeric(12, 2),
	"assigned_surveyor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"land_report_id" uuid NOT NULL,
	"check_type" "finding_check_type" NOT NULL,
	"result" "finding_result",
	"notes" text,
	"evidence_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "surveyor_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"surveyor_name" text NOT NULL,
	"reg_number" text,
	"status" "surveyor_check_status",
	"checked_at" timestamp with time zone,
	"method" "surveyor_check_method" DEFAULT 'manual' NOT NULL,
	"raw_result" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "surveyor_scan_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"surveyor_check_id" uuid NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"success" boolean NOT NULL,
	"error_message" text,
	"screenshot_url" text
);
--> statement-breakpoint
CREATE TABLE "surveyors_directory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"reg_number" text NOT NULL,
	"firm_name" text,
	"state" text NOT NULL,
	"city" text,
	"phone" text,
	"email" text,
	"surcon_verified" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone,
	"listing_status" "listing_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"password_hash" text,
	"role" "user_role" DEFAULT 'buyer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "land_reports" ADD CONSTRAINT "land_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "land_reports" ADD CONSTRAINT "land_reports_assigned_surveyor_id_users_id_fk" FOREIGN KEY ("assigned_surveyor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_findings" ADD CONSTRAINT "report_findings_land_report_id_land_reports_id_fk" FOREIGN KEY ("land_report_id") REFERENCES "public"."land_reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surveyor_scan_log" ADD CONSTRAINT "surveyor_scan_log_surveyor_check_id_surveyor_checks_id_fk" FOREIGN KEY ("surveyor_check_id") REFERENCES "public"."surveyor_checks"("id") ON DELETE no action ON UPDATE no action;