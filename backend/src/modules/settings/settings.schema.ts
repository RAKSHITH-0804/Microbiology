import { z } from 'zod';

const letterheadLine = (n: number) =>
  z
    .string()
    .trim()
    .min(1, `Letterhead line ${n} cannot be empty`)
    .max(120, `Letterhead line ${n} must be at most 120 characters`);

export const printDefaultsSchema = z.object({
  auto_print_after_save: z.boolean(),
  show_end_of_report: z.boolean(),
});

export const updateSettingsSchema = z
  .object({
    letterhead_line1: letterheadLine(1),
    letterhead_line2: letterheadLine(2),
    letterhead_line3: letterheadLine(3),
    lab_no_prefix: z
      .string()
      .trim()
      .max(20, 'Lab number prefix must be at most 20 characters')
      .regex(/^[A-Za-z0-9/_.-]*$/, 'Use only letters, numbers and - / _ . (YYYY is replaced by the year)'),
    print_defaults: printDefaultsSchema,
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

export type SystemSettings = Required<z.infer<typeof updateSettingsSchema>>;
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
