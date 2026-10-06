export interface ExerciseCatalogEntry {
  name: string;
  group: string;
  muscles: Record<string, number>;
}

export interface ExerciseCatalog {
  version: string;
  exercises: ExerciseCatalogEntry[];
}

export function parseExerciseCatalog(markdown: string): ExerciseCatalog;
