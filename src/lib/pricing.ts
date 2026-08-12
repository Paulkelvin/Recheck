// Report price in kobo (Paystack's smallest unit). Override via env for
// launch pricing without a code change.
export const REPORT_PRICE_KOBO = Number(process.env.PAYSTACK_AMOUNT_KOBO ?? 1_500_000); // NGN 15,000 default
