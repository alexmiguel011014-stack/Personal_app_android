import { isKotlinBlank, kotlinTrim, toDoubleOrNull } from "./kotlin";

// GOALS.md §23g: a measurement — Firestore `biometrics/{id}`, mirroring BiometricEntity and
// FirestoreMappers. The numbers are Doubles on the phone. A whole number written from JavaScript
// lands in Firestore as an integer, and the phone still reads it: GitLive 2.7.0's decoder turns any
// Number into a Double (decoders.kt, `is Number -> value.toDouble()`, checked 2026-09-24).

export interface Biometric {
  id: string;
  trainerId: string;
  studentId: string;
  weight: number;
  /** Stored, never shown — the phone's later measurements carry 0 (see addBiometric). */
  height: number;
  /** 0 means not measured; the phone shows no body fat for it. */
  bodyFat: number;
  /** Epoch ms. */
  date: number;
}

const DECIMAL = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

/** 72.5 as "72,5 kg". */
export function formatKg(kg: number): string {
  return `${DECIMAL.format(kg)} kg`;
}

/** 18.2 as "18,2%"; 0 (not measured) as "—". */
export function formatBodyFat(percent: number): string {
  return percent > 0 ? `${DECIMAL.format(percent)}%` : "—";
}

// "72,5" or "72.5": the add-student form's parse (replace(",", ".") then toDoubleOrNull).
function parseDecimal(text: string): number | null {
  return toDoubleOrNull(kotlinTrim(text).replaceAll(",", "."));
}

/**
 * AddBiometricDialog's rule — a weight above zero, body fat optional — with two tightenings: a comma
 * decimal is accepted (the dialog silently refuses "72,5", though the add-student form takes it), and
 * a body fat that isn't a number from 0 to 100 is an error instead of a silent 0.
 */
export function parseMeasurement(
  weightText: string,
  bodyFatText: string,
): { weight: number; bodyFat: number } | { error: string } {
  const weight = parseDecimal(weightText);
  if (weight === null || weight <= 0) return { error: "Informe o peso em kg, maior que zero." };
  if (isKotlinBlank(bodyFatText)) return { weight, bodyFat: 0 };
  const bodyFat = parseDecimal(bodyFatText);
  if (bodyFat === null || bodyFat < 0 || bodyFat > 100) return { error: "% de gordura precisa ser um número de 0 a 100." };
  return { weight, bodyFat };
}
