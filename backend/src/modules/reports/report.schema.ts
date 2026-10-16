import { z } from 'zod';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be at most ${max} characters`)
    .nullish()
    .transform((v) => (v ? v : null));

const staffId = (label: string) =>
  z.coerce.number({ invalid_type_error: `Select ${label}` }).int().positive(`Select ${label}`);

const reportBase = {
  requisition_id: z.coerce.number().int().positive('Invalid requisition'),
  prepared_by: staffId('the technician who prepared the report'),
  reported_by: staffId('the reporting doctor'),
};

export const generalReportSchema = z.object({
  ...reportBase,
  specimen: optionalText(150),
  investigation_done: optionalText(255),
  report_findings: z.string().trim().min(1, 'Enter the report findings').max(10000),
});

export const SENSITIVITY_RESULTS = ['S', 'R', 'MS'] as const;

export const antibiogramReportSchema = z.object({
  ...reportBase,
  organism_isolated: z.string().trim().min(1, 'Select the organism isolated').max(200),
  grams_stain_remark: optionalText(2000),
  results: z
    .array(
      z.object({
        antibiotic_name: z.string().trim().min(1).max(150),
        sensitivity_result: z.enum(SENSITIVITY_RESULTS, { errorMap: () => ({ message: 'Result must be S, R or MS' }) }),
      }),
    )
    .min(1, 'Mark at least one antibiotic as S, R or MS')
    .max(150)
    .refine(
      (rows) => new Set(rows.map((r) => r.antibiotic_name.toLowerCase())).size === rows.length,
      'Each antibiotic can appear only once',
    ),
});

export const REPORT_TYPES = ['general', 'antibiogram'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const verifyReportParams = z.object({
  type: z.enum(REPORT_TYPES, { errorMap: () => ({ message: 'Report type must be general or antibiogram' }) }),
  id: z.coerce.number().int().positive('Invalid report id'),
});
export type VerifyReportParams = z.infer<typeof verifyReportParams>;

export const REASON_MIN = 10;

/** A written reason for actions that undo or override earlier work. */
export const reasonText = (what: string) =>
  z
    .string({ required_error: `Enter the reason for ${what}` })
    .trim()
    .min(REASON_MIN, `Enter the reason for ${what} (at least ${REASON_MIN} characters)`)
    .max(500, 'Must be at most 500 characters');

export const revokeVerificationSchema = z.object({ reason: reasonText('revoking verification') });
export type RevokeVerificationInput = z.infer<typeof revokeVerificationSchema>;

export const printLogParams = z.object({
  type: verifyReportParams.shape.type,
  requisitionId: z.coerce.number().int().positive('Invalid requisition id'),
});
export type PrintLogParams = z.infer<typeof printLogParams>;

export const listReportsQuery = z.object({
  search: z.string().trim().max(100).optional(),
  type: z.enum(REPORT_TYPES, { errorMap: () => ({ message: 'Report type must be general or antibiogram' }) }).optional(),
  isVerified: z
    .enum(['true', 'false'], { errorMap: () => ({ message: 'isVerified must be true or false' }) })
    .transform((v) => v === 'true')
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type ListReportsQuery = z.infer<typeof listReportsQuery>;

export type GeneralReportInput = z.infer<typeof generalReportSchema>;
export type AntibiogramReportInput = z.infer<typeof antibiogramReportSchema>;
