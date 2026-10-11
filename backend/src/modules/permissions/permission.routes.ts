import { Router } from 'express';
import { requireAuth, requireSuperAdmin } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  getPermissionMatrix,
  setAllPermissions,
  setAllPermissionsForEveryone,
  updatePermission,
} from './permission.controller';
import { bulkPermissionSchema, permissionUserParams, updatePermissionSchema } from './permission.schema';

const router = Router();

router.use(requireAuth, requireSuperAdmin);
router.get('/', asyncHandler(getPermissionMatrix));
// Registered before "/:userId" so "all" is not read as a user id.
router.put('/all', validate({ body: bulkPermissionSchema }), asyncHandler(setAllPermissionsForEveryone));
router.put('/:userId', validate({ params: permissionUserParams, body: updatePermissionSchema }), asyncHandler(updatePermission));
router.put(
  '/:userId/all',
  validate({ params: permissionUserParams, body: bulkPermissionSchema }),
  asyncHandler(setAllPermissions),
);

export default router;
