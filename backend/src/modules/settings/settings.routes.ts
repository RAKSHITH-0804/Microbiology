import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { getSettings, getSystemInfo, updateSettings } from './settings.controller';
import { updateSettingsSchema } from './settings.schema';

const router = Router();

router.use(requireAuth);
// Everyone reads the settings: printouts use the letterhead, the requisition form the lab number prefix.
router.get('/', asyncHandler(getSettings));
router.patch('/', requireRole('HOD'), validate({ body: updateSettingsSchema }), asyncHandler(updateSettings));
router.get('/system', requireRole('HOD'), asyncHandler(getSystemInfo));

export default router;
