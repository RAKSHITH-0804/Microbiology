import { useCallback, useEffect, useState } from 'react';
import { getErrorMessage } from '@/lib/api';
import type { MasterStaff, RequisitionDetail } from '@/types/report';
import { fetchRequisition, fetchStaff } from './api';

interface ReportData<T> {
  requisition: RequisitionDetail;
  staff: MasterStaff[];
  extra: T;
}

/**
 * Loads the requisition, staff list and page-specific masters for a report page.
 * `loadExtra` must be a stable reference (e.g. a module-level function).
 */
export function useReportData<T>(requisitionId: number, loadExtra: () => Promise<T>) {
  const [data, setData] = useState<ReportData<T> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!Number.isInteger(requisitionId) || requisitionId <= 0) {
      setError('Invalid requisition link');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [requisition, staff, extra] = await Promise.all([fetchRequisition(requisitionId), fetchStaff(), loadExtra()]);
      setData({ requisition, staff, extra });
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load the requisition'));
    } finally {
      setLoading(false);
    }
  }, [requisitionId, loadExtra]);

  useEffect(() => {
    load();
  }, [load]);

  const updateRequisition = useCallback((update: (r: RequisitionDetail) => RequisitionDetail) => {
    setData((prev) => (prev ? { ...prev, requisition: update(prev.requisition) } : prev));
  }, []);

  return { data, loading, error, reload: load, updateRequisition };
}
