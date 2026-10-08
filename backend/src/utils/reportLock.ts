import { PoolClient } from 'pg';
import { AppError } from '../middleware/errorHandler';

export const REPORT_LOCKED_MESSAGE = 'Verified reports are locked and cannot be modified';

/** Rejects any change to a requisition that is verified or has a verified report. */
export async function assertRequisitionUnlocked(client: PoolClient, requisitionId: number, status: string) {
  if (status === 'VERIFIED') throw new AppError(400, REPORT_LOCKED_MESSAGE);
  const { rows } = await client.query<{ locked: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM general_reports WHERE requisition_id = $1 AND is_verified)
         OR EXISTS (SELECT 1 FROM antibiogram_reports WHERE requisition_id = $1 AND is_verified) AS locked`,
    [requisitionId],
  );
  if (rows[0].locked) throw new AppError(400, REPORT_LOCKED_MESSAGE);
}
