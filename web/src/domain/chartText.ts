import type { Delta } from "./series";

// GOALS.md §37b — the words that make a chart readable without seeing it. The charts are `role="img"`, so this sentence is
// all a screen reader gets: it states the series, the trend and the extremes, never just "gráfico".

/** "+2 vs. 7 dias antes", "−3 vs. 7 dias antes", "Sem mudança vs. 7 dias antes". `unit` follows the number ("pp" for points). */
export function deltaText(change: Delta, reference: string, unit = ""): string {
  if (change.direction === "same") return `Sem mudança vs. ${reference}`;
  const sign = change.direction === "up" ? "+" : "−";
  return `${sign}${change.value}${unit} vs. ${reference}`;
}

export type Trend = "subindo" | "caindo" | "estável";

/** Compares the average of the second half with the first; a flat or near-flat series is "estável". */
export function trendOf(values: readonly number[]): Trend {
  if (values.length < 2) return "estável";
  const half = Math.floor(values.length / 2);
  const mean = (list: readonly number[]) => list.reduce((sum, value) => sum + value, 0) / list.length;
  const before = mean(values.slice(0, half));
  const after = mean(values.slice(values.length - half));
  const tolerance = Math.max(Math.abs(before), Math.abs(after)) * 0.1;
  if (after - before > tolerance) return "subindo";
  if (before - after > tolerance) return "caindo";
  return "estável";
}

export interface ChartPoint {
  label: string;
  value: number;
}

/** "Treinos por semana: 12/09 2; 19/09 3; … Maior valor: 5 em 03/10." */
export function barChartLabel(title: string, points: readonly ChartPoint[], format: (value: number) => string = String): string {
  if (points.length === 0) return `${title}: sem dados.`;
  const peak = points.reduce((best, point) => (point.value > best.value ? point : best), points[0]);
  const list = points.map((point) => `${point.label} ${format(point.value)}`).join("; ");
  return peak.value === 0 ? `${title}: ${list}. Nenhum registro no período.` : `${title}: ${list}. Maior valor: ${format(peak.value)} em ${peak.label}.`;
}

/** "Treinos por semana: subindo, de 2 a 5 (mínimo 1, máximo 5)." */
export function sparklineLabel(title: string, values: readonly number[], format: (value: number) => string = String): string {
  if (values.length === 0) return `${title}: sem dados.`;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return `${title}: ${trendOf(values)}, de ${format(values[0])} a ${format(values[values.length - 1])} (mínimo ${format(min)}, máximo ${format(max)}).`;
}

/**
 * The sentence of a line chart (GOALS.md §38f): the series, its trend, first, last and best — "Carga máxima de Supino: subindo,
 * de 31 kg (12/10) a 35 kg (14/10); melhor 35 kg em 14/10; 3 registros." `best` is the highest value; `format` writes a value.
 */
export function lineChartLabel(title: string, points: readonly ChartPoint[], format: (value: number) => string = String): string {
  if (points.length === 0) return `${title}: sem dados.`;
  const first = points[0];
  const last = points[points.length - 1];
  const best = points.reduce((top, point) => (point.value > top.value ? point : top), points[0]);
  const count = `${points.length} ${points.length === 1 ? "registro" : "registros"}`;
  if (points.length === 1) return `${title}: ${format(first.value)} em ${first.label}; ${count}.`;
  const trend = trendOf(points.map((point) => point.value));
  return `${title}: ${trend}, de ${format(first.value)} (${first.label}) a ${format(last.value)} (${last.label}); melhor ${format(best.value)} em ${best.label}; ${count}.`;
}

export interface PlotPoint {
  x: number;
  y: number;
}

/**
 * Where a line chart's points go in a `width` × `height` box: the first at the left and the last at the right, `padX`/`padY`
 * kept clear; a flat series runs through the middle. Equal spacing, not time spacing (the dates are labelled).
 */
export function linePlot(values: readonly number[], width = 320, height = 120, padX = 8, padY = 10): PlotPoint[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const range = Math.max(...values) - min;
  const x = (index: number) => (values.length === 1 ? width / 2 : padX + (index / (values.length - 1)) * (width - 2 * padX));
  const y = (value: number) => (range === 0 ? height / 2 : height - padY - ((value - min) / range) * (height - 2 * padY));
  return values.map((value, index) => ({ x: round(x(index)), y: round(y(value)) }));
}

/** "R$ 150,00 de R$ 270,00 (56%)". The caller formats the amounts. */
export function progressLabel(part: number, total: number, format: (value: number) => string): string {
  if (total <= 0) return `${format(part)} de ${format(total)}`;
  return `${format(part)} de ${format(total)} (${Math.round(Math.min(1, part / total) * 100)}%)`;
}

export function progressRatio(part: number, total: number): number {
  return total <= 0 ? 0 : Math.max(0, Math.min(1, part / total));
}

/** "Mensalidades da plataforma: Em atraso 2, Em teste 1, Em dia 1." */
export function stackedBarLabel(title: string, segments: readonly { name: string; count: number }[]): string {
  const total = segments.reduce((sum, segment) => sum + segment.count, 0);
  if (total === 0) return `${title}: nenhum personal.`;
  return `${title}: ${segments.map((segment) => `${segment.name} ${segment.count}`).join(", ")}.`;
}

/** The polyline of a sparkline in a 100 × `height` box: first point at the left, last at the right, `pad` kept clear above and below. */
export function sparkPoints(values: readonly number[], height = 28, pad = 2): string {
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const range = Math.max(...values) - min;
  const y = (value: number) => (range === 0 ? height / 2 : height - pad - ((value - min) / range) * (height - 2 * pad));
  const x = (index: number) => (values.length === 1 ? 50 : (index / (values.length - 1)) * 100);
  return values.map((value, index) => `${round(x(index))},${round(y(value))}`).join(" ");
}

const round = (value: number) => Math.round(value * 100) / 100;

/** A bar's visible value for a money series, without the symbol (the chart's title says "R$"): "150", "1,3 mil". */
export function compactReais(cents: number): string {
  const reais = Math.round(cents / 100);
  return reais >= 1000 ? `${(reais / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : String(reais);
}
