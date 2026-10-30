/** Normalises db.execute() results: PGlite returns { rows }, postgres.js returns an array. */
export function rows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] }).rows ?? []) as T[];
}
