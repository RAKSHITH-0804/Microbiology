import { Router } from 'express';
import { z } from 'zod';
import {
  requireAuth,
  requireModule,
  requireRequisitionBrowse,
  requireRequisitionEdit,
  requireRequisitionEntry,
  requireRevenueAccess,
} from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  createRequisition,
  getRequisition,
  getRequisitionTimeline,
  listPendingRequisitions,
  listRequisitions,
  searchRequisitionStatus,
  updatePayment,
  updateRequisition,
} from './requisition.controller';
import { updatePaymentSchema } from './payment';
import { createRequisitionSchema, listRequisitionsQuery, statusSearchQuery } from './requisition.schema';

const router = Router();

const idParams = z.object({ id: z.coerce.number().int().positive('Invalid requisition id') });

router.use(requireAuth);
router.get(
  '/',
  requireRequisitionBrowse('requisitions'),
  validate({ query: listRequisitionsQuery }),
  asyncHandler(listRequisitions),
);
router.get('/pending', requireRequisitionBrowse('pending_worklist'), asyncHandler(listPendingRequisitions));
router.get(
  '/status-search',
  requireModule('status_timeline'),
  validate({ query: statusSearchQuery }),
  asyncHandler(searchRequisitionStatus),
);
router.get('/:id', validate({ params: idParams }), asyncHandler(getRequisition));
router.get(
  '/:id/timeline',
  requireModule('status_timeline'),
  validate({ params: idParams }),
  asyncHandler(getRequisitionTimeline),
);
router.post(
  '/',
  requireRequisitionEntry,
  validate({ body: createRequisitionSchema }),
  asyncHandler(createRequisition),
);
// Edits are opened from either the worklist or the requisition directory.
router.put(
  '/:id',
  requireRequisitionEdit,
  validate({ params: idParams, body: createRequisitionSchema }),
  asyncHandler(updateRequisition),
);
router.patch(
  '/:id/payment',
  requireRevenueAccess,
  validate({ params: idParams, body: updatePaymentSchema }),
  asyncHandler(updatePayment),
);

export default router;
