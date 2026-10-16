import { PoolClient } from 'pg';
import { AppError } from '../middleware/errorHandler';

export const REPORT_LOCKED_MESSAGE = 'Verified reports are locked and cannot be modified';

/** True when the requisition is verified or has a verified report. */
export async function isRequisitionLocked(client: PoolClient, requisitionId: number, status: string) {
  if (status === 'VERIFIED') return true;
  const { rows } = await client.query<{ locked: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM general_reports WHERE requisition_id = $1 AND is_verified)
         OR EXISTS (SELECT 1 FROM antibiogram_reports WHERE requisition_id = $1 AND is_verified) AS locked`,
    [requisitionId],
  );
  return rows[0].locked;
}

/** Rejects any work on a cancelled requisition; it stays on record but is closed. */
export function assertNotCancelled(requisition: { lab_no: string; cancelled_at: Date | null }) {
  if (requisition.cancelled_at) {
    throw new AppError(400, `Requisition ${requisition.lab_no} is cancelled and can no longer be changed`);
  }
}
