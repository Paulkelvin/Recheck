export type ReportTier = "quick" | "full";

export type CheckType =
  | "plan_authenticity"
  | "overlap"
  | "acquisition"
  | "dispute"
  | "size"
  | "encumbrance";

// What each tier actually covers, and what it costs (kobo, Paystack's
// smallest unit). Prices are env-overridable so launch pricing doesn't need
// a code change.
export const REPORT_TIERS: Record<
  ReportTier,
  { label: string; description: string; checkTypes: CheckType[]; priceKobo: number }
> = {
  quick: {
    label: "Quick Check",
    description: "Fast desk-based cross-check against the surveyor's basemap.",
    checkTypes: ["plan_authenticity", "size"],
    priceKobo: Number(process.env.PAYSTACK_QUICK_AMOUNT_KOBO ?? 500_000), // NGN 5,000 default
  },
  full: {
    label: "Full Report",
    description:
      "Everything in Quick Check, plus double-selling, government acquisition, dispute, and encumbrance checks.",
    checkTypes: ["plan_authenticity", "overlap", "acquisition", "dispute", "size", "encumbrance"],
    priceKobo: Number(process.env.PAYSTACK_FULL_AMOUNT_KOBO ?? 1_500_000), // NGN 15,000 default
  },
};

export function isReportTier(value: unknown): value is ReportTier {
  return value === "quick" || value === "full";
}

// Land status changes over time -- a plot verified clean months ago could
// be sold again since. Re-checks get a discount off the normal tier price.
export const RECHECK_DISCOUNT_PERCENT = Number(process.env.RECHECK_DISCOUNT_PERCENT ?? 30);

export function priceForReport(tier: ReportTier, isRecheck: boolean): number {
  const base = REPORT_TIERS[tier].priceKobo;
  if (!isRecheck) return base;
  return Math.round(base * (1 - RECHECK_DISCOUNT_PERCENT / 100));
}

export const CHECK_LABELS: Record<CheckType, string> = {
  plan_authenticity: "Is this survey plan real?",
  overlap: "Has this land been sold to someone else?",
  acquisition: "Can the government take this land back?",
  dispute: "Is anyone else claiming this land?",
  size: "Am I getting the size I'm paying for?",
  encumbrance: "Does this land have hidden debt or court cases?",
};

export const CHECK_DESCRIPTIONS: Record<CheckType, string> = {
  plan_authenticity: "We confirm the survey plan matches official records, not a forged copy.",
  overlap: "We check the plan hasn't already been sold or allocated to someone else.",
  acquisition: "We check if the government has already acquired or earmarked this land.",
  dispute: "We check for family, community, or ownership disputes tied to the land.",
  size: "We confirm the plot boundaries match what you're actually paying for.",
  encumbrance: "We check for hidden loans, liens, or court cases tied to the land.",
};

// Fixed display order regardless of what order findings were saved in.
export const CHECK_ORDER: CheckType[] = [
  "plan_authenticity",
  "overlap",
  "acquisition",
  "dispute",
  "size",
  "encumbrance",
];

export type FindingResult = "pass" | "fail" | "flagged" | "inconclusive";

export const RESULT_LABELS: Record<FindingResult, string> = {
  pass: "Looks good",
  fail: "Problem found",
  flagged: "Needs your attention",
  inconclusive: "Couldn't confirm",
};
