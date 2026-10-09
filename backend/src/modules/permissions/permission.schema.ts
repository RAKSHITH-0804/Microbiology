import { z } from 'zod';
import { MODULE_KEYS } from './permission.modules';

export const permissionUserParams = z.object({ userId: z.coerce.number().int().positive('Invalid user id') });

export const updatePermissionSchema = z.object({
  module_key: z.enum(MODULE_KEYS, { errorMap: () => ({ message: 'Unknown module' }) }),
  is_enabled: z.boolean({ required_error: 'is_enabled is required', invalid_type_error: 'is_enabled must be true or false' }),
});
export type UpdatePermissionInput = z.infer<typeof updatePermissionSchema>;
