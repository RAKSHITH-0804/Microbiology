import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { listFindingTemplates, listStaff, listTestCatalog } from './master.controller';
import { registerMasterCrud } from './master.crud';

const router = Router();

router.use(requireAuth);
router.get('/test-catalog', asyncHandler(listTestCatalog));
router.get('/staff', asyncHandler(listStaff));
router.get('/findings', asyncHandler(listFindingTemplates));
// organisms, antibiotics, samples, templates: GET for everyone, writes for the HOD.
registerMasterCrud(router);

export default router;
