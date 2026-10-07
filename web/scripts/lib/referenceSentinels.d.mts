export interface Sentinels {
  phrases: string[];
  names: string[];
}

export interface LeakFound {
  phraseHits: number;
  nameHits: number;
}

export function normalizeForScan(text: string): string;
export function loadSentinels(): Sentinels;
export function findLeaks(text: string, sentinels: Sentinels): LeakFound;
export const MAX_NAMES_ELSEWHERE: number;
export function isLeak(found: LeakFound, options?: { allowNames?: number }): boolean;
