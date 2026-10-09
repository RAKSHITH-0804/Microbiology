import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRevenueAccess } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  createRequisition,
  getRequisition,
  listPendingRequisitions,
  listRequisitions,
  updatePayment,
  updateRequisition,
} from './requisition.controller';
import { updatePaymentSchema } from './payment';
import { createRequisitionSchema, listRequisitionsQuery } from './requisition.schema';

const router = Router();

const idParams = z.object({ id: z.coerce.number().int().positive('Invalid requisition id') });

router.use(requireAuth);
router.get('/', validate({ query: listRequisitionsQuery }), asyncHandler(listRequisitions));
router.get('/pending', asyncHandler(listPendingRequisitions));
router.get('/:id', validate({ params: idParams }), asyncHandler(getRequisition));
router.post('/', validate({ body: createRequisitionSchema }), asyncHandler(createRequisition));
router.put('/:id', validate({ params: idParams, body: createRequisitionSchema }), asyncHandler(updateRequisition));
router.patch('/:id/payment', requireRevenueAccess, validate({ params: idParams, body: updatePaymentSchema }), asyncHandler(updatePayment));

export default router;
