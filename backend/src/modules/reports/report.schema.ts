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
export const CULTURE_STATUSES = ['NO_GROWTH', 'GROWTH'] as const;

const sensitivityRow = z.object({
  antibiotic_name: z.string().trim().min(1).max(150),
  sensitivity_result: z.enum(SENSITIVITY_RESULTS, { errorMap: () => ({ message: 'Result must be S, R or MS' }) }),
});

const organismBlock = z.object({
  organism_name: z.string().trim().min(1, 'Select the organism isolated').max(200),
  results: z
    .array(sensitivityRow)
    .min(1, 'Mark at least one antibiotic as S, R or MS')
    .max(150)
    .refine(
      (rows) => new Set(rows.map((r) => r.antibiotic_name.toLowerCase())).size === rows.length,
      'Each antibiotic can appear only once per organism',
    ),
});

/** Empty string / null / missing → null; otherwise a positive staff id. */
const optionalStaffId = z.preprocess((v) => {
  if (v === '' || v === undefined || v === null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}, z.number().int().positive().nullable());

/**
 * Culture & sensitivity payload.
 * Accepts the multi-organism shape, and still accepts the legacy single-organism
 * `{ organism_isolated, results }` body by normalising it in a preprocess step.
 * Signatories are required for GROWTH; optional for NO_GROWTH (auto-cleared on save).
 */
export const antibiogramReportSchema = z.preprocess(
  (raw) => {
    if (!raw || typeof raw !== 'object') return raw;
    const body = raw as Record<string, unknown>;
    if (body.culture_status) return body;
    // Legacy clients: one organism_isolated + flat results → GROWTH with one block.
    if (typeof body.organism_isolated === 'string') {
      return {
        ...body,
        culture_status: 'GROWTH',
        culture_text: null,
        organisms: [
          {
            organism_name: body.organism_isolated,
            results: Array.isArray(body.results) ? body.results : [],
          },
        ],
      };
    }
    return body;
  },
  z
    .object({
      requisition_id: z.coerce.number().int().positive('Invalid requisition'),
      prepared_by: optionalStaffId,
      reported_by: optionalStaffId,
      culture_status: z.enum(CULTURE_STATUSES, { errorMap: () => ({ message: 'Select the culture status' }) }),
      culture_text: optionalText(10000),
      grams_stain_remark: optionalText(2000),
      organisms: z.array(organismBlock).max(20).default([]),
    })
    .superRefine((v, ctx) => {
      if (v.culture_status === 'NO_GROWTH') {
        if (v.organisms.length > 0) {
          ctx.addIssue({
            code: 'custom',
            path: ['organisms'],
            message: 'Clear organisms when culture status is No Growth',
          });
        }
        return;
      }
      if (!v.prepared_by) {
        ctx.addIssue({
          code: 'custom',
          path: ['prepared_by'],
          message: 'Select the technician who prepared the report',
        });
      }
      if (!v.reported_by) {
        ctx.addIssue({
          code: 'custom',
          path: ['reported_by'],
          message: 'Select the reporting doctor',
        });
      }
      if (v.organisms.length < 1) {
        ctx.addIssue({
          code: 'custom',
          path: ['organisms'],
          message: 'Add at least one organism',
        });
        return;
      }
      const names = v.organisms.map((o) => o.organism_name.toLowerCase());
      if (new Set(names).size !== names.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['organisms'],
          message: 'Each organism can appear only once',
        });
      }
    }),
);

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
