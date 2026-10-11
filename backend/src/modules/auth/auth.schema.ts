import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().trim().min(1, 'Username is required').max(50),
  password: z.string().min(1, 'Password is required').max(128),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password').max(128),
    newPassword: z
      .string()
      .min(6, 'New password must be at least 6 characters')
      .max(72, 'New password must be at most 72 characters'),
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    path: ['newPassword'],
    message: 'New password must be different from the current one',
  });

/** Username, or the numeric staff ID the account is linked to. */
export const forgotPasswordSchema = z.object({
  username: z.string().trim().min(1, 'Enter your username or staff ID').max(50),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
