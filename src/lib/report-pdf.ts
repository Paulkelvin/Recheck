import { launchBrowser } from "./browser";
import {
  REPORT_TIERS,
  CHECK_LABELS,
  CHECK_ORDER,
  RESULT_LABELS,
  type ReportTier,
  type CheckType,
  type FindingResult,
} from "./report-tiers";

type ReportForPdf = {
  state: string;
  lga: string;
  planNumber: string | null;
  tier: ReportTier;
};

type FindingForPdf = {
  checkType: CheckType;
  result: FindingResult | null;
  notes: string | null;
};

const RESULT_COLORS: Record<FindingResult, string> = {
  pass: "#166534",
  fail: "#991b1b",
  flagged: "#92400e",
  inconclusive: "#3f3f46",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildReportHtml(report: ReportForPdf, findings: FindingForPdf[]): string {
  const findingsByType = new Map(findings.map((f) => [f.checkType, f]));
  const requiredCheckTypes = REPORT_TIERS[report.tier].checkTypes;
  const checksToShow = CHECK_ORDER.filter((type) => requiredCheckTypes.includes(type));

  const rows = checksToShow
    .map((type) => {
      const finding = findingsByType.get(type);
      const resultHtml = finding?.result
        ? `<span style="color:${RESULT_COLORS[finding.result]};font-weight:600;">${RESULT_LABELS[finding.result]}</span>`
        : "";
      const notesHtml = finding?.notes
        ? `<p style="margin:4px 0 0;color:#52525b;font-size:13px;">${escapeHtml(finding.notes)}</p>`
        : "";

      return `
        <div style="border:1px solid #e4e4e7;border-radius:8px;padding:12px 16px;margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;gap:12px;">
            <span style="font-weight:600;">${escapeHtml(CHECK_LABELS[type])}</span>
            ${resultHtml}
          </div>
          ${notesHtml}
        </div>
      `;
    })
    .join("");

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #18181b; padding: 32px; }
          h1 { font-size: 22px; margin-bottom: 4px; }
          .subtitle { color: #52525b; font-size: 14px; margin-bottom: 24px; }
        </style>
      </head>
      <body>
        <h1>Land Scam Check Report</h1>
        <p class="subtitle">
          ${escapeHtml(report.state)}, ${escapeHtml(report.lga)}
          ${report.planNumber ? ` — plan ${escapeHtml(report.planNumber)}` : ""}
          · ${REPORT_TIERS[report.tier].label}
        </p>
        ${rows}
      </body>
    </html>
  `;
}

export async function renderReportPdf(
  report: ReportForPdf,
  findings: FindingForPdf[],
): Promise<Buffer> {
  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();
    await page.setContent(buildReportHtml(report, findings), { waitUntil: "load" });
    const pdf = await page.pdf({ format: "A4", printBackground: true, margin: { top: "20px", bottom: "20px" } });
    return pdf;
  } finally {
    await browser.close();
  }
}
