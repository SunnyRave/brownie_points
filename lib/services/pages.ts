import { getPage } from './content';
import type { ABOUT, LAB, SOLUTIONS, TECHNOLOGY } from '@/scripts/azentio-catalogue';

/** Typed accessors for CMS page rows whose structured sections live in `content.meta`. */
export async function pageMeta<T>(slug: string) {
  const row = await getPage(null, slug);
  return { row, meta: row.meta as unknown as T };
}
export type SolutionsMeta = { areas: typeof SOLUTIONS };
export type AboutMeta = typeof ABOUT;
export type LabMeta = typeof LAB;
export type TechnologyMeta = typeof TECHNOLOGY;
