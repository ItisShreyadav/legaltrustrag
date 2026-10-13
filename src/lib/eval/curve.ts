/**
 * Coverage-vs-accuracy curves (gap 6): tables, CSV and a dependency-free SVG line chart.
 *
 * Sweep the confidence threshold t over 0.00..1.00 (step 0.05). An item is kept (not withheld)
 * at t when its confidence >= t and it did not fail a hard check; coverage = kept / all items,
 * accuracy = correct kept / kept.
 */
import type { CurvePoint, ScoredItem } from "./metrics";
import { areaUnderCurve, coverageCurve } from "./metrics";
import { mdTable, pct, toCsv } from "./io";
import { Rng } from "./rng";

export interface CurveSeries {
  name: string;
  points: CurvePoint[];
}

export function seriesFromItems(name: string, items: readonly ScoredItem[]): CurveSeries {
  return { name, points: coverageCurve(items) };
}

/** Synthetic scored items for exercising the curve code: one calibrated, one overconfident model. */
export function syntheticItems(kind: "calibrated" | "overconfident", n = 400, seed = "curve-synthetic"): ScoredItem[] {
  const rng = new Rng(`${seed}:${kind}`);
  return Array.from({ length: n }, () => {
    const confidence = Math.round((0.3 + 0.7 * Math.sqrt(rng.next())) * 1000) / 1000;
    const pCorrect = kind === "calibrated" ? confidence : 0.55 + 0.2 * (confidence - 0.3);
    return { confidence, correct: rng.next() < pCorrect };
  });
}

export function curveCsv(series: readonly CurveSeries[]): string {
  const rows = series.flatMap((s) =>
    s.points.map((p) => ({
      series: s.name,
      threshold: p.threshold.toFixed(2),
      coverage: p.coverage === null ? "" : p.coverage.toFixed(4),
      accuracy: p.accuracy === null ? "" : p.accuracy.toFixed(4),
      kept: p.kept,
      correct: p.correct,
      total: p.total,
    })),
  );
  return toCsv(["series", "threshold", "coverage", "accuracy", "kept", "correct", "total"], rows);
}

export function curveMarkdown(series: readonly CurveSeries[]): string {
  if (series.length === 0) return "_No scored findings available._";
  const header = ["threshold", ...series.flatMap((s) => [`${s.name} coverage`, `${s.name} accuracy`])];
  const rows = series[0].points.map((_, i) => [
    series[0].points[i].threshold.toFixed(2),
    ...series.flatMap((s) => [pct(s.points[i]?.coverage), pct(s.points[i]?.accuracy)]),
  ]);
  const auc = series.map((s) => `${s.name} ${pct(areaUnderCurve(s.points))}`).join(", ");
  const n = series.map((s) => `${s.name} n=${s.points[0]?.total ?? 0}`).join(", ");
  return `${mdTable(header, rows)}\n\nItems: ${n}. Mean accuracy over the swept coverage range (area under the curve / span): ${auc}.`;
}

// ---------------------------------------------------------------------------
// SVG
// ---------------------------------------------------------------------------

/** Categorical slots 1-4 (validated: light + dark, adjacent pairs). Marker shapes are the secondary encoding. */
const SLOTS = [
  { light: "#2a78d6", dark: "#3987e5", shape: "circle" },
  { light: "#eb6834", dark: "#d95926", shape: "square" },
  { light: "#1baf7a", dark: "#199e70", shape: "diamond" },
  { light: "#eda100", dark: "#c98500", shape: "triangle" },
] as const;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function marker(shape: string, x: number, y: number, cls: string): string {
  const r = 4.5;
  const common = `class="${cls}" stroke-width="2"`;
  if (shape === "square") return `<rect x="${(x - r).toFixed(1)}" y="${(y - r).toFixed(1)}" width="${2 * r}" height="${2 * r}" rx="1.5" ${common}/>`;
  if (shape === "diamond") {
    const d = r * 1.3;
    return `<path d="M${x.toFixed(1)} ${(y - d).toFixed(1)}L${(x + d).toFixed(1)} ${y.toFixed(1)}L${x.toFixed(1)} ${(y + d).toFixed(1)}L${(x - d).toFixed(1)} ${y.toFixed(1)}Z" ${common}/>`;
  }
  if (shape === "triangle") {
    const d = r * 1.25;
    return `<path d="M${x.toFixed(1)} ${(y - d).toFixed(1)}L${(x + d).toFixed(1)} ${(y + d * 0.8).toFixed(1)}L${(x - d).toFixed(1)} ${(y + d * 0.8).toFixed(1)}Z" ${common}/>`;
  }
  return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" ${common}/>`;
}

export interface SvgOptions {
  title?: string;
  subtitle?: string;
  width?: number;
  height?: number;
}

/** Accuracy (y) against coverage (x), one line per series, hover titles on every point. */
export function curveSvg(input: readonly CurveSeries[], opts: SvgOptions = {}): string {
  const series = input.slice(0, SLOTS.length);
  const W = opts.width ?? 760;
  const H = opts.height ?? 470;
  const m = { left: 64, right: 170, top: 92, bottom: 58 };
  const pw = W - m.left - m.right;
  const ph = H - m.top - m.bottom;
  const X = (v: number) => m.left + v * pw;
  const Y = (v: number) => m.top + (1 - v) * ph;
  const title = opts.title ?? "Coverage vs accuracy";
  const out: string[] = [];

  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t d" font-family="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif">`);
  out.push(`<title id="t">${esc(title)}</title>`);
  out.push(
    `<desc id="d">${esc(
      `Accuracy of kept findings against coverage as the confidence threshold rises from 0 to 1. ` +
        series.map((s) => `${s.name}: ${s.points.filter((p) => p.coverage !== null && p.accuracy !== null).map((p) => `t=${p.threshold.toFixed(2)} coverage ${pct(p.coverage)} accuracy ${pct(p.accuracy)}`).join("; ")}`).join(". "),
    )}</desc>`,
  );
  const vars = (mode: "light" | "dark") =>
    [
      mode === "light"
        ? "--surface:#fcfcfb;--ink:#0b0b0b;--ink2:#52514e;--muted:#7a7974;--grid:#e6e5e1;--axis:#c9c8c3;"
        : "--surface:#1a1a19;--ink:#f0efec;--ink2:#c3c2b7;--muted:#9a998f;--grid:#2e2e2c;--axis:#4a4a46;",
      ...series.map((_, i) => `--s${i + 1}:${SLOTS[i][mode]};`),
    ].join("");
  out.push(
    `<style>svg{${vars("light")}}@media (prefers-color-scheme: dark){svg{${vars("dark")}}}` +
      `.bg{fill:var(--surface)}.ink{fill:var(--ink)}.ink2{fill:var(--ink2)}.muted{fill:var(--muted)}.grid{stroke:var(--grid);stroke-width:1}.axis{stroke:var(--axis);stroke-width:1}` +
      series.map((_, i) => `.l${i + 1}{fill:none;stroke:var(--s${i + 1});stroke-width:2;stroke-linejoin:round;stroke-linecap:round}.m${i + 1}{fill:var(--s${i + 1});stroke:var(--surface)}`).join("") +
      `.pt:hover{stroke:var(--ink)}</style>`,
  );
  out.push(`<rect class="bg" x="0" y="0" width="${W}" height="${H}" rx="8"/>`);
  out.push(`<text class="ink" x="${m.left}" y="30" font-size="17" font-weight="600">${esc(title)}</text>`);
  if (opts.subtitle) out.push(`<text class="ink2" x="${m.left}" y="50" font-size="12.5">${esc(opts.subtitle)}</text>`);

  // Legend (always present for >= 2 series; identity never relies on color alone: shape + label).
  let lx = m.left;
  series.forEach((s, i) => {
    out.push(`<line class="l${i + 1}" x1="${lx}" y1="72" x2="${lx + 22}" y2="72"/>`);
    out.push(marker(SLOTS[i].shape, lx + 11, 72, `m${i + 1}`));
    out.push(`<text class="ink2" x="${lx + 30}" y="76" font-size="12.5">${esc(s.name)}</text>`);
    lx += 30 + s.name.length * 7 + 26;
  });

  // Grid + axes.
  for (let v = 0; v <= 1.0001; v += 0.2) {
    const gx = X(v);
    const gy = Y(v);
    out.push(`<line class="grid" x1="${m.left}" y1="${gy.toFixed(1)}" x2="${m.left + pw}" y2="${gy.toFixed(1)}"/>`);
    out.push(`<line class="grid" x1="${gx.toFixed(1)}" y1="${m.top}" x2="${gx.toFixed(1)}" y2="${m.top + ph}"/>`);
    out.push(`<text class="muted" x="${m.left - 8}" y="${(gy + 4).toFixed(1)}" font-size="11.5" text-anchor="end">${Math.round(v * 100)}%</text>`);
    out.push(`<text class="muted" x="${gx.toFixed(1)}" y="${m.top + ph + 18}" font-size="11.5" text-anchor="middle">${Math.round(v * 100)}%</text>`);
  }
  out.push(`<line class="axis" x1="${m.left}" y1="${m.top + ph}" x2="${m.left + pw}" y2="${m.top + ph}"/>`);
  out.push(`<text class="ink2" x="${m.left + pw / 2}" y="${H - 14}" font-size="12.5" text-anchor="middle">Coverage (share of findings kept)</text>`);
  out.push(`<text class="ink2" transform="translate(18 ${m.top + ph / 2}) rotate(-90)" font-size="12.5" text-anchor="middle">Accuracy of kept findings</text>`);

  // Lines + markers (deduplicated points; each carries a hover title).
  const ends: Array<{ i: number; y: number; x: number; label: string }> = [];
  series.forEach((s, i) => {
    const pts = s.points.filter((p) => p.coverage !== null && p.accuracy !== null && p.kept > 0);
    if (pts.length === 0) return;
    const sorted = [...pts].sort((a, b) => (a.coverage as number) - (b.coverage as number) || b.threshold - a.threshold);
    const d = sorted.map((p, k) => `${k ? "L" : "M"}${X(p.coverage as number).toFixed(1)} ${Y(p.accuracy as number).toFixed(1)}`).join("");
    out.push(`<path class="l${i + 1}" d="${d}"/>`);
    const seen = new Map<string, CurvePoint[]>();
    for (const p of pts) {
      const key = `${(p.coverage as number).toFixed(4)}:${(p.accuracy as number).toFixed(4)}`;
      seen.set(key, [...(seen.get(key) ?? []), p]);
    }
    for (const group of seen.values()) {
      const p = group[0];
      const ts = group.map((g) => g.threshold.toFixed(2));
      const tLabel = ts.length > 1 ? `t=${ts[ts.length - 1]}..${ts[0]}` : `t=${ts[0]}`;
      out.push(
        `<g class="pt">${marker(SLOTS[i].shape, X(p.coverage as number), Y(p.accuracy as number), `m${i + 1}`)}<title>${esc(
          `${s.name}, ${tLabel}: coverage ${pct(p.coverage)} (${p.kept}/${p.total}), accuracy ${pct(p.accuracy)} (${p.correct}/${p.kept})`,
        )}</title></g>`,
      );
    }
    const end = sorted[sorted.length - 1];
    ends.push({ i, x: X(end.coverage as number), y: Y(end.accuracy as number), label: `${s.name} ${pct(end.accuracy, 0)}` });
  });

  // Direct end labels only when they do not collide (otherwise legend + hover carry identity).
  const ys = ends.map((e) => e.y).sort((a, b) => a - b);
  const clear = ys.every((y, k) => k === 0 || y - ys[k - 1] >= 15);
  if (clear) {
    for (const e of ends) {
      out.push(`<line class="axis" x1="${(e.x + 7).toFixed(1)}" y1="${e.y.toFixed(1)}" x2="${(m.left + pw + 10).toFixed(1)}" y2="${e.y.toFixed(1)}"/>`);
      out.push(`<text class="ink2" x="${m.left + pw + 14}" y="${(e.y + 4).toFixed(1)}" font-size="12">${esc(e.label)}</text>`);
    }
  }
  out.push(`</svg>`);
  return out.join("\n");
}
