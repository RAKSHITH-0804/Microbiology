import { Router } from 'express';
import { requireAuth, requireSuperAdmin } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { getPermissionMatrix, updatePermission } from './permission.controller';
import { permissionUserParams, updatePermissionSchema } from './permission.schema';

const router = Router();

router.use(requireAuth, requireSuperAdmin);
router.get('/', asyncHandler(getPermissionMatrix));
router.put('/:userId', validate({ params: permissionUserParams, body: updatePermissionSchema }), asyncHandler(updatePermission));

export default router;
