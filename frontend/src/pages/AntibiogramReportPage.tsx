import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Controller, useFieldArray, useForm, useWatch, type Control, type UseFormGetValues, type UseFormSetValue } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Bug, ClipboardPen, FlaskConical, Info, Plus, Search, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/FormField';
import { SearchableSelect, type SearchableOption } from '@/components/SearchableSelect';
import { AntibiogramSensitivityGrid } from '@/components/reports/AntibiogramSensitivityGrid';
import { NothingToPrintNotice, ReportActionBar, ReportPageFrame } from '@/components/reports/ReportPageFrame';
import { ReportPrintLayout } from '@/components/reports/ReportPrintLayout';
import { RequisitionSummaryCard } from '@/components/reports/RequisitionSummaryCard';
import { RevokeVerificationDialog } from '@/components/reports/RevokeVerificationDialog';
import { SignatoryFields } from '@/components/reports/SignatoryFields';
import { CancelledNotice } from '@/components/requisitions/CancelledNotice';
import { useAuth } from '@/context/AuthContext';
import { fetchAntibiotics, fetchOrganisms, saveAntibiogramReport } from '@/features/reports/api';
import { inheritedInvestigation, inheritedSpecimen } from '@/features/reports/inheritedFields';
import { useReportAccess } from '@/features/reports/useReportAccess';
import { useReportData } from '@/features/reports/useReportData';
import { getErrorMessage } from '@/lib/api';
import { formatAge, formatDateTime, formatSex } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { RequisitionStatus } from '@/types/requisition';
import {
  SENSITIVITY_OPTIONS,
  type CultureStatus,
  type RequisitionDetail,
  type SensitivityResult,
} from '@/types/report';

const loadMasters = () => Promise.all([fetchOrganisms(), fetchAntibiotics()]);

export const DEFAULT_NO_GROWTH_TEXT =
  'No pathogenic organism isolated after 48 hours of aerobic incubation at 37°C.';

const organismBlockSchema = z.object({
  organism_name: z.string().trim().max(200),
  sensitivity: z.record(z.string(), z.enum(['S', 'R', 'MS'])),
});

const schema = z
  .object({
    culture_status: z.enum(['NO_GROWTH', 'GROWTH']),
    culture_text: z.string().trim().max(10000, 'Must be at most 10000 characters'),
    grams_stain_remark: z.string().trim().max(2000, 'Must be at most 2000 characters'),
    prepared_by: z.string(),
    reported_by: z.string(),
    organisms: z.array(organismBlockSchema).max(20),
  })
  .superRefine((v, ctx) => {
    if (v.culture_status === 'NO_GROWTH') {
      if (!v.culture_text.trim()) {
        ctx.addIssue({ code: 'custom', path: ['culture_text'], message: 'Enter the culture findings' });
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
      ctx.addIssue({ code: 'custom', path: ['organisms'], message: 'Add at least one organism' });
      return;
    }
    const names = v.organisms.map((o) => o.organism_name.trim().toLowerCase()).filter(Boolean);
    if (new Set(names).size !== names.length) {
      ctx.addIssue({ code: 'custom', path: ['organisms'], message: 'Each organism can appear only once' });
    }
    v.organisms.forEach((o, i) => {
      if (!o.organism_name.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['organisms', i, 'organism_name'],
          message: 'Select the organism isolated',
        });
      }
      if (Object.keys(o.sensitivity).length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['organisms', i, 'sensitivity'],
          message: 'Mark at least one antibiotic as S, R or MS',
        });
      }
    });
  });

type FormValues = z.infer<typeof schema>;

const emptyOrganism = (): FormValues['organisms'][number] => ({ organism_name: '', sensitivity: {} });

const EMPTY: FormValues = {
  culture_status: 'GROWTH',
  culture_text: DEFAULT_NO_GROWTH_TEXT,
  grams_stain_remark: '',
  prepared_by: '',
  reported_by: '',
  organisms: [emptyOrganism()],
};

const TOGGLE_STYLES: Record<SensitivityResult, string> = {
  S: 'border-emerald-600 bg-emerald-600 text-white',
  R: 'border-red-600 bg-red-600 text-white',
  MS: 'border-amber-500 bg-amber-500 text-white',
};

const CULTURE_OPTIONS: { value: CultureStatus; label: string; hint: string }[] = [
  {
    value: 'NO_GROWTH',
    label: 'No Growth / Sterile',
    hint: 'Negative culture — no organism or sensitivity grid',
  },
  {
    value: 'GROWTH',
    label: 'Growth / Organisms Isolated',
    hint: 'Positive culture — enter one or more organisms with sensitivity',
  },
];

function defaultsFor(r: RequisitionDetail): FormValues {
  const report = r.antibiogram_report;
  const data = report?.antibiogram_data;
  const status: CultureStatus =
    data?.culture_status ??
    report?.culture_status ??
    (report?.organism_isolated?.toLowerCase() === 'no growth' ? 'NO_GROWTH' : 'GROWTH');

  const organisms =
    (data?.organisms ?? report?.organisms)?.map((o) => ({
      organism_name: o.organism_name,
      sensitivity: Object.fromEntries(o.results.map((x) => [x.antibiotic_name, x.sensitivity_result])),
    })) ??
    (report?.organism_isolated && status === 'GROWTH'
      ? [
          {
            organism_name: report.organism_isolated,
            sensitivity: Object.fromEntries(report.results.map((x) => [x.antibiotic_name, x.sensitivity_result])),
          },
        ]
      : [emptyOrganism()]);

  return {
    culture_status: status,
    culture_text: data?.culture_text ?? report?.culture_text ?? DEFAULT_NO_GROWTH_TEXT,
    grams_stain_remark: report?.grams_stain_remark ?? '',
    prepared_by: report?.prepared_by ? String(report.prepared_by) : '',
    reported_by: report?.reported_by ? String(report.reported_by) : '',
    organisms: organisms.length ? organisms : [emptyOrganism()],
  };
}

function OrganismSensitivityCard({
  index,
  control,
  getValues,
  setValue,
  organismOptions,
  antibioticNames,
  shortCodes,
  canRemove,
  onRemove,
  readOnly,
  nameError,
  sensitivityError,
}: {
  index: number;
  control: Control<FormValues>;
  getValues: UseFormGetValues<FormValues>;
  setValue: UseFormSetValue<FormValues>;
  organismOptions: SearchableOption[];
  antibioticNames: string[];
  shortCodes: Map<string, string | null>;
  canRemove: boolean;
  onRemove: () => void;
  readOnly: boolean;
  nameError?: string;
  sensitivityError?: string;
}) {
  const [search, setSearch] = useState('');
  const [selectedOnly, setSelectedOnly] = useState(false);
  const sensitivity = useWatch({ control, name: `organisms.${index}.sensitivity` }) ?? {};

  const ordered = antibioticNames
    .filter((name) => sensitivity[name])
    .map((name) => ({ antibiotic_name: name, sensitivity_result: sensitivity[name] as SensitivityResult }));
  const counts = SENSITIVITY_OPTIONS.map((o) => ({
    ...o,
    count: ordered.filter((r) => r.sensitivity_result === o.value).length,
  }));

  const term = search.trim().toLowerCase();
  const visible = antibioticNames.filter(
    (name) =>
      (!selectedOnly || sensitivity[name]) &&
      (!term || name.toLowerCase().includes(term) || shortCodes.get(name)?.toLowerCase().includes(term)),
  );

  return (
    <Card className={cn(nameError || sensitivityError ? 'border-red-400' : undefined)}>
      <CardHeader className="flex-row flex-wrap items-start gap-3 space-y-0">
        <Bug className="mt-0.5 h-4 w-4 text-primary" />
        <div className="min-w-0 flex-1">
          <CardTitle>Organism {index + 1}</CardTitle>
          <CardDescription className="mt-1">
            Dedicated sensitivity grid — marks here do not affect other organisms.
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
          {counts.map((c) => (
            <span
              key={c.value}
              className={cn('rounded-full border px-2 py-0.5', c.count ? TOGGLE_STYLES[c.value] : 'text-slate-500')}
            >
              {c.short} {c.count}
            </span>
          ))}
        </div>
        {canRemove && !readOnly && (
          <Button type="button" size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={onRemove}>
            <Trash2 /> Remove Organism
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <FormField
          label="Organism Isolated"
          htmlFor={`organism_name_${index}`}
          required
          error={nameError}
          hint="Type to search, or enter a name not in the list"
        >
          <Controller
            control={control}
            name={`organisms.${index}.organism_name`}
            render={({ field }) => (
              <SearchableSelect
                id={`organism_name_${index}`}
                ref={field.ref}
                options={organismOptions}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                placeholder="Select organism"
                searchPlaceholder="Search organism or category..."
                allowCustom
                invalid={!!nameError}
                disabled={readOnly}
              />
            )}
          />
        </FormField>

        {sensitivityError && (
          <p role="alert" className="text-sm font-medium text-red-600">
            {sensitivityError}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[16rem] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${antibioticNames.length} antibiotics or short code`}
              className="pl-8"
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id={`selected_only_${index}`}
              checked={selectedOnly}
              onCheckedChange={(c) => setSelectedOnly(c === true)}
            />
            <Label htmlFor={`selected_only_${index}`} className="cursor-pointer font-normal">
              Show marked only ({ordered.length})
            </Label>
          </div>
        </div>

        <div className="grid max-h-[22rem] gap-x-6 overflow-y-auto rounded-lg border md:grid-cols-2">
          {visible.length === 0 && (
            <p className="col-span-full py-8 text-center text-sm text-muted-foreground">No antibiotics match.</p>
          )}
          {visible.map((name) => {
            const current = sensitivity[name];
            const setResult = (result: SensitivityResult) => {
              const next = { ...getValues(`organisms.${index}.sensitivity`) };
              if (next[name] === result) delete next[name];
              else next[name] = result;
              setValue(`organisms.${index}.sensitivity`, next, { shouldDirty: true, shouldValidate: true });
            };
            return (
              <div key={name} className={cn('flex items-center gap-3 border-b px-3 py-1.5', current && 'bg-slate-50')}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900" title={name}>
                    {name}
                  </p>
                  {shortCodes.get(name) && <p className="text-xs text-slate-500">{shortCodes.get(name)}</p>}
                </div>
                <div role="radiogroup" aria-label={`Organism ${index + 1} ${name} result`} className="flex shrink-0 gap-1">
                  {SENSITIVITY_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      role="radio"
                      aria-checked={current === o.value}
                      title={o.label}
                      aria-label={`${name}: ${o.label}`}
                      disabled={readOnly}
                      onClick={() => setResult(o.value)}
                      className={cn(
                        'h-7 min-w-[2.5rem] rounded border px-2 text-xs font-bold transition disabled:pointer-events-none disabled:opacity-60',
                        current === o.value
                          ? TOGGLE_STYLES[o.value]
                          : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100',
                      )}
                    >
                      {o.short}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {ordered.length > 0 && !readOnly && (
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setValue(`organisms.${index}.sensitivity`, {}, { shouldDirty: true, shouldValidate: true })}
            >
              <X /> Clear all marks
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function staffIdString(staffId: number | null | undefined): string {
  return staffId != null ? String(staffId) : '';
}

export default function AntibiogramReportPage() {
  const requisitionId = Number(useParams().requisitionId);
  const { user } = useAuth();
  const { data, loading, error, reload, updateRequisition } = useReportData(requisitionId, loadMasters);

  const {
    control,
    register,
    handleSubmit,
    reset,
    watch,
    getValues,
    setValue,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY });

  const { fields, append, remove } = useFieldArray({ control, name: 'organisms' });

  const loadedRequisition = data?.requisition;
  const loadedId = loadedRequisition?.id;
  useEffect(() => {
    if (loadedRequisition) reset(defaultsFor(loadedRequisition));
  }, [loadedId, reset]);

  const requisition = data?.requisition;
  const [masterOrganisms, antibiotics] = data?.extra ?? [[], []];
  const values = watch();
  const cultureStatus = values.culture_status;
  const { readOnly, readOnlyMessage, notice, draft, printable, print, canRevoke } = useReportAccess({
    reportType: 'antibiogram',
    requisition,
    report: requisition?.antibiogram_report,
    isDirty,
  });
  const [revokeOpen, setRevokeOpen] = useState(false);

  /** For sterile cultures, pre-fill empty signatories from the signed-in staff member so saves are not blocked. */
  const autofillNoGrowthSignatories = () => {
    const sid = staffIdString(user?.staffId);
    if (!sid || !data?.staff.some((s) => String(s.id) === sid)) return;
    if (!getValues('prepared_by')) setValue('prepared_by', sid, { shouldValidate: true });
    if (!getValues('reported_by') && (user?.role === 'DOCTOR' || user?.role === 'HOD')) {
      setValue('reported_by', sid, { shouldValidate: true });
    }
  };

  useEffect(() => {
    if (cultureStatus === 'NO_GROWTH' && !readOnly) autofillNoGrowthSignatories();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run when culture/session/load changes
  }, [cultureStatus, loadedId, user?.staffId, user?.role, data?.staff, readOnly]);

  const organismOptions = useMemo<SearchableOption[]>(
    () => masterOrganisms.map((o) => ({ value: o.organism_name, label: o.organism_name, group: o.category })),
    [masterOrganisms],
  );

  const antibioticNames = useMemo(() => {
    const names = antibiotics.map((a) => a.antibiotic_name);
    const saved =
      requisition?.antibiogram_report?.organisms?.flatMap((o) => o.results.map((r) => r.antibiotic_name)) ??
      requisition?.antibiogram_report?.results.map((r) => r.antibiotic_name) ??
      [];
    return [...names, ...saved.filter((n) => !names.includes(n))];
  }, [antibiotics, requisition]);
  const shortCodes = useMemo(() => new Map(antibiotics.map((a) => [a.antibiotic_name, a.short_code])), [antibiotics]);

  const printOrganisms = values.organisms
    .filter((o) => o.organism_name.trim() && Object.keys(o.sensitivity).length)
    .map((o) => ({
      organism_name: o.organism_name.trim(),
      results: antibioticNames
        .filter((name) => o.sensitivity[name])
        .map((name) => ({ antibiotic_name: name, sensitivity_result: o.sensitivity[name] as SensitivityResult })),
    }));

  const setCultureStatus = (status: CultureStatus) => {
    setValue('culture_status', status, { shouldDirty: true, shouldValidate: true });
    if (status === 'NO_GROWTH') {
      if (!getValues('culture_text').trim()) {
        setValue('culture_text', DEFAULT_NO_GROWTH_TEXT, { shouldDirty: true });
      }
      autofillNoGrowthSignatories();
    } else if (getValues('organisms').length === 0) {
      setValue('organisms', [emptyOrganism()], { shouldDirty: true });
    }
  };

  const save = async (v: FormValues): Promise<boolean> => {
    if (!requisition) return false;
    const organisms =
      v.culture_status === 'GROWTH'
        ? v.organisms.map((o) => ({
            organism_name: o.organism_name.trim(),
            results: antibioticNames
              .filter((name) => o.sensitivity[name])
              .map((name) => ({ antibiotic_name: name, sensitivity_result: o.sensitivity[name] as SensitivityResult })),
          }))
        : [];
    const preparedBy = v.prepared_by ? Number(v.prepared_by) : null;
    const reportedBy = v.reported_by ? Number(v.reported_by) : null;
    try {
      const saved = await saveAntibiogramReport({
        requisition_id: requisition.id,
        culture_status: v.culture_status,
        culture_text: v.culture_status === 'NO_GROWTH' ? v.culture_text.trim() || DEFAULT_NO_GROWTH_TEXT : null,
        grams_stain_remark: v.grams_stain_remark.trim() || null,
        prepared_by: preparedBy,
        reported_by: reportedBy,
        organisms,
      });
      const antibiogram_data = {
        culture_status: v.culture_status,
        culture_text: v.culture_status === 'NO_GROWTH' ? v.culture_text.trim() || DEFAULT_NO_GROWTH_TEXT : null,
        organisms,
      };
      const verified = !!saved.is_verified || v.culture_status === 'NO_GROWTH';
      const requisitionStatus = saved.requisition_status ?? saved.status ?? (verified ? 'VERIFIED' : 'REPORT_ENTERED');
      updateRequisition((r) => ({
        ...r,
        status: requisitionStatus as RequisitionStatus,
        antibiogram_report_id: saved.id,
        antibiogram_report_verified: verified,
        antibiogram_report: {
          id: saved.id,
          reporting_datetime: saved.reporting_datetime,
          organism_isolated:
            v.culture_status === 'NO_GROWTH' ? 'No Growth' : organisms.map((o) => o.organism_name).join(' + '),
          grams_stain_remark: v.grams_stain_remark.trim() || null,
          prepared_by: preparedBy,
          reported_by: reportedBy,
          is_verified: verified,
          updated_at: new Date().toISOString(),
          antibiogram_data,
          culture_status: v.culture_status,
          culture_text: antibiogram_data.culture_text,
          organisms,
          results: organisms[0]?.results ?? [],
        },
      }));
      reset(v);
      if (saved.verification_reset) {
        toast.success(`Antibiogram report corrected - Lab No ${saved.lab_no}`, {
          description: 'Verification was reset and the reporting doctor has been notified to verify it again.',
        });
      } else if (verified && v.culture_status === 'NO_GROWTH') {
        toast.success(`No-growth report completed - Lab No ${saved.lab_no}`, {
          description: 'Report verified and cleared from the pending worklist and verification queues.',
        });
      } else toast.success(`Antibiogram report saved - Lab No ${saved.lab_no}`);
      return true;
    } catch (err) {
      const body = (err as { response?: { data?: { errors?: Record<string, string[]> } } }).response?.data;
      for (const [key, messages] of Object.entries(body?.errors ?? {})) {
        if (key in EMPTY) setError(key as keyof FormValues, { type: 'server', message: messages[0] });
      }
      toast.error(getErrorMessage(err, 'Could not save the report'));
      return false;
    }
  };

  const invalid = () => toast.error('Please correct the highlighted fields');
  const onSave = handleSubmit(async (v) => {
    await save(v);
  }, invalid);

  const staffById = (id: string) => data?.staff.find((s) => String(s.id) === id);
  const growth = cultureStatus === 'GROWTH';

  return (
    <>
      <ReportPageFrame
        step="Step 2B - Antibiogram Report"
        title="Culture & Sensitivity"
        labNo={requisition?.lab_no}
        loading={loading}
        error={error}
        onRetry={reload}
      >
        {requisition && data && (
          <form noValidate onSubmit={onSave} className="space-y-5">
            <CancelledNotice info={requisition} />
            <RequisitionSummaryCard
              requisition={requisition}
              reportingDateTime={requisition.antibiogram_report?.reporting_datetime ?? null}
            />

            <Card>
              <CardHeader className="flex-row items-center gap-2 space-y-0">
                <ClipboardPen className="h-4 w-4 text-primary" />
                <CardTitle>Report Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField label="Specimen" htmlFor="ab_specimen" hint="Locked to the requisition sample details">
                    <Input id="ab_specimen" disabled readOnly aria-readonly="true" value={inheritedSpecimen(requisition)} />
                  </FormField>
                  <FormField
                    label="Investigation Done"
                    htmlFor="ab_investigation_done"
                    hint="Locked to the investigations selected at registration"
                  >
                    <Input
                      id="ab_investigation_done"
                      disabled
                      readOnly
                      aria-readonly="true"
                      value={inheritedInvestigation(requisition)}
                    />
                  </FormField>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="space-y-1">
                <CardTitle>Culture Status</CardTitle>
                <CardDescription>Choose whether organisms were isolated before entering sensitivity results.</CardDescription>
              </CardHeader>
              <CardContent>
                <div role="radiogroup" aria-label="Culture Status" className="grid gap-3 md:grid-cols-2">
                  {CULTURE_OPTIONS.map((opt) => {
                    const active = cultureStatus === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        disabled={readOnly}
                        onClick={() => setCultureStatus(opt.value)}
                        className={cn(
                          'rounded-lg border px-4 py-3 text-left transition disabled:opacity-60',
                          active
                            ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
                            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
                        )}
                      >
                        <p className="text-sm font-semibold text-slate-900">{opt.label}</p>
                        <p className="mt-1 text-xs text-slate-500">{opt.hint}</p>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {!growth && (
              <Card>
                <CardHeader className="flex-row items-center gap-2 space-y-0">
                  <FlaskConical className="h-4 w-4 text-primary" />
                  <CardTitle>Culture Findings</CardTitle>
                </CardHeader>
                <CardContent>
                  <FormField
                    label="Report"
                    htmlFor="culture_text"
                    required
                    error={errors.culture_text?.message}
                    hint="Printed as a general culture report (no antibiogram table)"
                  >
                    <Textarea
                      id="culture_text"
                      rows={4}
                      disabled={readOnly}
                      aria-invalid={!!errors.culture_text}
                      {...register('culture_text')}
                    />
                  </FormField>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="flex-row items-center gap-2 space-y-0">
                <Bug className="h-4 w-4 text-primary" />
                <CardTitle>{growth ? 'Remark & Signatories' : 'Signatories'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {growth && (
                  <FormField label="Antibiogram" htmlFor="grams_stain_remark" error={errors.grams_stain_remark?.message}>
                    <Textarea
                      id="grams_stain_remark"
                      rows={2}
                      disabled={readOnly}
                      placeholder="e.g. Direct smear / Gram stain findings..."
                      aria-invalid={!!errors.grams_stain_remark}
                      {...register('grams_stain_remark')}
                    />
                  </FormField>
                )}
                <SignatoryFields
                  staff={data.staff}
                  preparedBy={register('prepared_by')}
                  reportedBy={register('reported_by')}
                  preparedError={errors.prepared_by?.message}
                  reportedError={errors.reported_by?.message}
                  disabled={readOnly}
                  required={growth}
                />
              </CardContent>
            </Card>

            {growth && (
              <>
                {(requisition.preferred_antibiotics || requisition.antibiotics_used) && (
                  <div className="flex gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                    <Info className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      {requisition.preferred_antibiotics && (
                        <p>
                          <span className="font-semibold">Preferred to be tested:</span> {requisition.preferred_antibiotics}
                        </p>
                      )}
                      {requisition.antibiotics_used && (
                        <p>
                          <span className="font-semibold">Antibiotics used:</span> {requisition.antibiotics_used}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {typeof errors.organisms?.message === 'string' && (
                  <p role="alert" className="text-sm font-medium text-red-600">
                    {errors.organisms.message}
                  </p>
                )}

                {fields.map((field, index) => (
                  <OrganismSensitivityCard
                    key={field.id}
                    index={index}
                    control={control}
                    getValues={getValues}
                    setValue={setValue}
                    organismOptions={organismOptions}
                    antibioticNames={antibioticNames}
                    shortCodes={shortCodes}
                    canRemove={fields.length > 1}
                    onRemove={() => remove(index)}
                    readOnly={readOnly}
                    nameError={errors.organisms?.[index]?.organism_name?.message}
                    sensitivityError={
                      typeof errors.organisms?.[index]?.sensitivity?.message === 'string'
                        ? errors.organisms[index]?.sensitivity?.message
                        : undefined
                    }
                  />
                ))}

                {!readOnly && (
                  <div className="flex justify-start">
                    <Button type="button" variant="outline" onClick={() => append(emptyOrganism())}>
                      <Plus /> Add Organism
                    </Button>
                  </div>
                )}
              </>
            )}

            <ReportActionBar
              saving={isSubmitting}
              readOnly={readOnly}
              readOnlyMessage={readOnlyMessage}
              draft={draft}
              onPrint={print}
              notice={notice}
              onRevoke={canRevoke ? () => setRevokeOpen(true) : undefined}
            />
          </form>
        )}
      </ReportPageFrame>
      <RevokeVerificationDialog
        open={revokeOpen}
        reportType="antibiogram"
        reportId={requisition?.antibiogram_report?.id}
        labNo={requisition?.lab_no}
        onClose={() => setRevokeOpen(false)}
        onRevoked={reload}
      />

      {requisition && !printable && <NothingToPrintNotice />}
      {requisition && printable && (
        <ReportPrintLayout
          title={growth ? 'Culture & Antibiotic Sensitivity Report' : 'Culture Report'}
          requisition={requisition}
          reportingDateTime={requisition.antibiogram_report?.reporting_datetime ?? null}
          draft={draft}
          preparedBy={staffById(values.prepared_by)}
          reportedBy={staffById(values.reported_by)}
        >
          <table className="w-full border-collapse text-[11pt]">
            <tbody>
              <tr>
                <td className="w-[28%] py-1 align-top font-bold">Specimen</td>
                <td className="w-[3%] py-1 align-top">:</td>
                <td className="py-1 align-top">{inheritedSpecimen(requisition) || '-'}</td>
              </tr>
              <tr>
                <td className="py-1 align-top font-bold">Investigation Done</td>
                <td className="py-1 align-top">:</td>
                <td className="py-1 align-top">{inheritedInvestigation(requisition) || '-'}</td>
              </tr>
              {growth && values.grams_stain_remark.trim() && (
                <tr>
                  <td className="py-1 align-top font-bold">Antibiogram</td>
                  <td className="py-1 align-top">:</td>
                  <td className="whitespace-pre-wrap py-1 align-top">{values.grams_stain_remark}</td>
                </tr>
              )}
            </tbody>
          </table>

          {!growth && (
            <>
              <p className="mt-4 font-bold underline underline-offset-2">Report</p>
              <div className="mt-2 whitespace-pre-wrap text-[11.5pt] leading-relaxed">
                {values.culture_text.trim() || DEFAULT_NO_GROWTH_TEXT}
              </div>
            </>
          )}

          {growth && (
            <AntibiogramSensitivityGrid
              organisms={printOrganisms}
              draft={draft}
              remark={values.grams_stain_remark}
              continuationPatient={{
                patientName: requisition.patient.name,
                ageSex: `${formatAge(requisition.patient)} / ${formatSex(requisition.patient.sex)}`,
                labNo: requisition.lab_no,
                receiptNo: requisition.receipt_no ?? '-',
                sample: requisition.sample_nature ?? '-',
                date: formatDateTime(requisition.sample_received_datetime),
              }}
            />
          )}
        </ReportPrintLayout>
      )}
    </>
  );
}
