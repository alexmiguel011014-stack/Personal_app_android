import type { ExerciseCatalog } from "../build-exercise-catalog.mjs";

export function catalogSourcePath(): string;
export function catalogSourceExists(): boolean;
export function readCatalogSource(): { path: string; markdown: string };
export function buildCatalog(): ExerciseCatalog;
