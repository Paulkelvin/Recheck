import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  numeric,
  pgEnum,
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
  state: text("state").notNull(),
  lga: text("lga").notNull(),
  address: text("address"),
  planNumber: text("plan_number"),
  sellerName: text("seller_name"),
  uploadedDocs: text("uploaded_docs").array().notNull().default([]),
  paymentStatus: paymentStatusEnum("payment_status").notNull().default("unpaid"),
  amountPaid: numeric("amount_paid", { precision: 12, scale: 2 }),
  assignedSurveyorId: uuid("assigned_surveyor_id").references(() => users.id),
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
