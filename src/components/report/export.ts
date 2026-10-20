import type { ReviewView } from "@/lib/review/types";
import type { TrustReport } from "@/lib/types";

/** Download the report as JSON; for a saved run also its id and every human review row (with reviewer and time). */
export function downloadReportJson(report: TrustReport, runId?: string, reviews?: readonly ReviewView[]): void {
  const payload = runId
    ? { ...report, runId, reviews: [...(reviews ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt)) }
    : report;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = report.generatedAt.replace(/[:.]/g, "-").slice(0, 19);
  a.href = url;
  a.download = `legaltrustrag-report-${stamp || "export"}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
