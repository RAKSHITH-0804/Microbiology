import type { PendingRequisition } from '@/types/requisition';

/** Specimen string locked to the requisition master (nature + optional site). */
export function inheritedSpecimen(r: Pick<PendingRequisition, 'sample_nature' | 'site_of_collection'>): string {
  return [r.sample_nature, r.site_of_collection && `(${r.site_of_collection})`].filter(Boolean).join(' ');
}

/** Investigation list locked to the requisition's selected tests. */
export function inheritedInvestigation(r: Pick<PendingRequisition, 'tests'>): string {
  return r.tests.map((t) => t.test_name).join(', ');
}
