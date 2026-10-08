import { z } from 'zod';

export const USER_ROLES = ['HOD', 'DOCTOR', 'LAB_TECH'] as const;

export const STAFF_TYPES = ['TEACHING', 'NON_TEACHING'] as const;

const optionalText = (max: number, label: string) =>
  z.string().trim().max(max, `${label} must be at most ${max} characters`).optional();

/**
 * Link the account to an existing staff member (`staff_id`) or register a newly
 * joined one (`staff_type` + `name` + `designation`) - exactly one of the two.
 */
export const createUserSchema = z
  .object({
    username: z
      .string()
      .trim()
      .min(3, 'Username must be at least 3 characters')
      .max(50, 'Username must be at most 50 characters')
      .regex(/^[A-Za-z0-9._-]+$/, 'Use only letters, numbers, dot, dash or underscore'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(72, 'Password must be at most 72 characters'),
    role: z.enum(USER_ROLES, { errorMap: () => ({ message: 'Select a role' }) }),
    staff_id: z.coerce.number({ invalid_type_error: 'Select a staff member' }).int().positive('Select a staff member').optional(),
    staff_type: z.enum(STAFF_TYPES, { errorMap: () => ({ message: 'Select the staff category' }) }).optional(),
    name: optionalText(150, 'Staff name'),
    designation: optionalText(150, 'Designation'),
  })
  .superRefine((v, ctx) => {
    const newStaff = v.staff_type !== undefined || !!v.name || !!v.designation;
    if (v.staff_id !== undefined && newStaff) {
      ctx.addIssue({ code: 'custom', path: ['staff_id'], message: 'Choose an existing staff member or enter new staff details, not both' });
      return;
    }
    if (v.staff_id !== undefined) return;
    if (!newStaff) {
      ctx.addIssue({ code: 'custom', path: ['staff_id'], message: 'Select a staff member or enter the new staff details' });
      return;
    }
    if (!v.staff_type) ctx.addIssue({ code: 'custom', path: ['staff_type'], message: 'Select the staff category' });
    if (!v.name || v.name.length < 2) ctx.addIssue({ code: 'custom', path: ['name'], message: 'Enter the staff name' });
    if (!v.designation || v.designation.length < 2) {
      ctx.addIssue({ code: 'custom', path: ['designation'], message: 'Enter the designation' });
    }
  });

export const userStatusSchema = z.object({
  is_active: z.boolean({ required_error: 'is_active is required', invalid_type_error: 'is_active must be true or false' }),
});

export const userIdParams = z.object({ id: z.coerce.number().int().positive('Invalid user id') });

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UserStatusInput = z.infer<typeof userStatusSchema>;
