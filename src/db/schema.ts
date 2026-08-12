import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  numeric,
  jsonb,
  pgEnum,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["buyer", "surveyor", "admin"]);

export const surveyorCheckStatusEnum = pgEnum("surveyor_check_status", [
  "registered",
  "not_found",
  "suspended",
]);

export const surveyorCheckMethodEnum = pgEnum("surveyor_check_method", [
  "automated",
  "manual",
]);

export const landReportStatusEnum = pgEnum("land_report_status", [
  "submitted",
  "under_review",
  "surveyor_assigned",
  "ready",
]);

export const reportTierEnum = pgEnum("report_tier", ["quick", "full"]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "unpaid",
  "paid",
  "refunded",
]);

export const findingCheckTypeEnum = pgEnum("finding_check_type", [
  "plan_authenticity",
  "overlap",
  "acquisition",
  "dispute",
  "size",
  "encumbrance",
]);

export const findingResultEnum = pgEnum("finding_result", [
  "pass",
  "fail",
  "flagged",
  "inconclusive",
]);

export const listingStatusEnum = pgEnum("listing_status", ["active", "pending"]);

// Free, pre-payment map preview built from the uploaded plan's beacon
// coordinates -- see src/lib/plan-ocr.ts. "unavailable" means the automatic
// read failed one of its plausibility checks, not that anything is wrong
// with the report itself.
export const planPreviewStatusEnum = pgEnum("plan_preview_status", [
  "not_attempted",
  "processing",
  "available",
  "unavailable",
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  passwordHash: text("password_hash"),
  role: userRoleEnum("role").notNull().default("buyer"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const surveyorChecks = pgTable("surveyor_checks", {
  id: uuid("id").primaryKey().defaultRandom(),
  surveyorName: text("surveyor_name").notNull(),
  regNumber: text("reg_number"),
  status: surveyorCheckStatusEnum("status"),
  checkedAt: timestamp("checked_at", { withTimezone: true }),
  method: surveyorCheckMethodEnum("method").notNull().default("manual"),
  rawResult: text("raw_result"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const landReports = pgTable("land_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  status: landReportStatusEnum("status").notNull().default("submitted"),
  tier: reportTierEnum("tier").notNull().default("full"),
  state: text("state").notNull(),
  lga: text("lga").notNull(),
  address: text("address"),
  planNumber: text("plan_number"),
  sellerName: text("seller_name"),
  uploadedDocs: text("uploaded_docs").array().notNull().default([]),
  paymentStatus: paymentStatusEnum("payment_status").notNull().default("unpaid"),
  amountPaid: numeric("amount_paid", { precision: 12, scale: 2 }),
  assignedSurveyorId: uuid("assigned_surveyor_id").references(() => users.id),
  previousReportId: uuid("previous_report_id").references((): AnyPgColumn => landReports.id),
  planPreviewStatus: planPreviewStatusEnum("plan_preview_status").notNull().default("not_attempted"),
  planPreviewReason: text("plan_preview_reason"),
  // Free-text caveat shown alongside the preview -- e.g. the plan says it's
  // in a different state than the buyer typed. Informational, never a
  // reason to withhold the preview.
  planPreviewNote: text("plan_preview_note"),
  planPreviewCoordinates: jsonb("plan_preview_coordinates").$type<{ lat: number; lng: number }[]>(),
  planPreviewCheckedAt: timestamp("plan_preview_checked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reportFindings = pgTable("report_findings", {
  id: uuid("id").primaryKey().defaultRandom(),
  landReportId: uuid("land_report_id")
    .notNull()
    .references(() => landReports.id),
  checkType: findingCheckTypeEnum("check_type").notNull(),
  result: findingResultEnum("result"),
  notes: text("notes"),
  evidenceUrl: text("evidence_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const surveyorsDirectory = pgTable("surveyors_directory", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  regNumber: text("reg_number").notNull(),
  firmName: text("firm_name"),
  state: text("state").notNull(),
  city: text("city"),
  phone: text("phone"),
  email: text("email"),
  surconVerified: boolean("surcon_verified").notNull().default(false),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  listingStatus: listingStatusEnum("listing_status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const surveyorScanLog = pgTable("surveyor_scan_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  surveyorCheckId: uuid("surveyor_check_id")
    .notNull()
    .references(() => surveyorChecks.id),
  runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
  success: boolean("success").notNull(),
  errorMessage: text("error_message"),
  screenshotUrl: text("screenshot_url"),
});
