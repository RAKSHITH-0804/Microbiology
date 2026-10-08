import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Bug, FlaskConical, Info, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/FormField';
import { SearchableSelect, type SearchableOption } from '@/components/SearchableSelect';
import { ReportActionBar, ReportPageFrame } from '@/components/reports/ReportPageFrame';
import { ReportPrintLayout } from '@/components/reports/ReportPrintLayout';
import { RequisitionSummaryCard } from '@/components/reports/RequisitionSummaryCard';
import { SignatoryFields } from '@/components/reports/SignatoryFields';
import { useSettings } from '@/context/SettingsContext';
import { fetchAntibiotics, fetchOrganisms, saveAntibiogramReport } from '@/features/reports/api';
import { usePrintOnLoad } from '@/features/reports/usePrintOnLoad';
import { useReportData } from '@/features/reports/useReportData';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { SENSITIVITY_OPTIONS, type RequisitionDetail, type SensitivityResult } from '@/types/report';

const loadMasters = () => Promise.all([fetchOrganisms(), fetchAntibiotics()]);

const schema = z.object({
  organism_isolated: z.string().trim().min(1, 'Select the organism isolated').max(200),
  grams_stain_remark: z.string().trim().max(2000, 'Must be at most 2000 characters'),
  prepared_by: z.string().min(1, 'Select the technician who prepared the report'),
  reported_by: z.string().min(1, 'Select the reporting doctor'),
  results: z
    .record(z.string(), z.enum(['S', 'R', 'MS']))
    .refine((r) => Object.keys(r).length > 0, 'Mark at least one antibiotic as S, R or MS'),
});
type FormValues = z.infer<typeof schema>;

const EMPTY: FormValues = { organism_isolated: '', grams_stain_remark: '', prepared_by: '', reported_by: '', results: {} };

const TOGGLE_STYLES: Record<SensitivityResult, string> = {
  S: 'border-emerald-600 bg-emerald-600 text-white',
  R: 'border-red-600 bg-red-600 text-white',
  MS: 'border-amber-500 bg-amber-500 text-white',
};

function defaultsFor(r: RequisitionDetail): FormValues {
  const report = r.antibiogram_report;
  return {
    organism_isolated: report?.organism_isolated ?? '',
    grams_stain_remark: report?.grams_stain_remark ?? '',
    prepared_by: report?.prepared_by ? String(report.prepared_by) : '',
    reported_by: report?.reported_by ? String(report.reported_by) : '',
    results: Object.fromEntries(report?.results.map((x) => [x.antibiotic_name, x.sensitivity_result]) ?? []),
  };
}

export default function AntibiogramReportPage() {
  const requisitionId = Number(useParams().requisitionId);
  const { data, loading, error, reload, updateRequisition } = useReportData(requisitionId, loadMasters);
  const [search, setSearch] = useState('');
  const [selectedOnly, setSelectedOnly] = useState(false);
  const { printPrefs } = useSettings();

  const {
    control,
    register,
    handleSubmit,
    reset,
    watch,
    getValues,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY });

  const loadedRequisition = data?.requisition;
  const loadedId = loadedRequisition?.id;
  useEffect(() => {
    if (loadedRequisition) reset(defaultsFor(loadedRequisition));
    // Only re-seed the form when a different requisition loads, not after local status updates.
  }, [loadedId, reset]);

  const requisition = data?.requisition;
  const [organisms, antibiotics] = data?.extra ?? [[], []];
  const values = watch();
  const readOnly = requisition?.status === 'VERIFIED' || !!requisition?.antibiogram_report?.is_verified;
  usePrintOnLoad(!!requisition, !!requisition?.antibiogram_report);
  const resultsError = typeof errors.results?.message === 'string' ? errors.results.message : undefined;

  const organismOptions = useMemo<SearchableOption[]>(
    () => organisms.map((o) => ({ value: o.organism_name, label: o.organism_name, group: o.category })),
    [organisms],
  );

  // Master list plus any saved antibiotic that is no longer in the master table.
  const antibioticNames = useMemo(() => {
    const names = antibiotics.map((a) => a.antibiotic_name);
    const saved = requisition?.antibiogram_report?.results.map((r) => r.antibiotic_name) ?? [];
    return [...names, ...saved.filter((n) => !names.includes(n))];
  }, [antibiotics, requisition]);
  const shortCodes = useMemo(() => new Map(antibiotics.map((a) => [a.antibiotic_name, a.short_code])), [antibiotics]);

  const orderedResults = antibioticNames
    .filter((name) => values.results[name])
    .map((name) => ({ antibiotic_name: name, sensitivity_result: values.results[name] }));
  const counts = SENSITIVITY_OPTIONS.map((o) => ({ ...o, count: orderedResults.filter((r) => r.sensitivity_result === o.value).length }));

  const term = search.trim().toLowerCase();
  const visibleAntibiotics = antibioticNames.filter(
    (name) =>
      (!selectedOnly || values.results[name]) &&
      (!term || name.toLowerCase().includes(term) || shortCodes.get(name)?.toLowerCase().includes(term)),
  );

  const save = async (v: FormValues): Promise<boolean> => {
    if (!requisition) return false;
    const results = antibioticNames
      .filter((name) => v.results[name])
      .map((name) => ({ antibiotic_name: name, sensitivity_result: v.results[name] }));
    try {
      const saved = await saveAntibiogramReport({
        requisition_id: requisition.id,
        organism_isolated: v.organism_isolated.trim(),
        grams_stain_remark: v.grams_stain_remark.trim() || null,
        prepared_by: Number(v.prepared_by),
        reported_by: Number(v.reported_by),
        results,
      });
      updateRequisition((r) => ({
        ...r,
        status: r.status === 'RECEIVED' ? 'REPORT_ENTERED' : r.status,
        antibiogram_report_id: saved.id,
        antibiogram_report: {
          id: saved.id,
          reporting_datetime: saved.reporting_datetime,
          organism_isolated: v.organism_isolated.trim(),
          grams_stain_remark: v.grams_stain_remark.trim() || null,
          prepared_by: Number(v.prepared_by),
          reported_by: Number(v.reported_by),
          is_verified: false,
          updated_at: new Date().toISOString(),
          results,
        },
      }));
      reset(v);
      toast.success(`Antibiogram report saved - Lab No ${saved.lab_no}`);
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
  const needsSave = isDirty || !requisition?.antibiogram_report;
  const onPrint = handleSubmit(async (v) => {
    if (needsSave && !readOnly && !(await save(v))) return;
    setTimeout(() => window.print(), 0);
  }, invalid);
  const onSave = handleSubmit(async (v) => {
    if ((await save(v)) && printPrefs.auto_print_after_save) setTimeout(() => window.print(), 0);
  }, invalid);

  const staffById = (id: string) => data?.staff.find((s) => String(s.id) === id);

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
            <RequisitionSummaryCard
              requisition={requisition}
              reportingDateTime={requisition.antibiogram_report?.reporting_datetime ?? null}
            />

            <Card>
              <CardHeader className="flex-row items-center gap-2 space-y-0">
                <Bug className="h-4 w-4 text-primary" />
                <CardTitle>Organism &amp; Signatories</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    label="Organism Isolated"
                    htmlFor="organism_isolated"
                    required
                    error={errors.organism_isolated?.message}
                    hint={`${organisms.length} organisms - type to search, or enter a name not in the list`}
                  >
                    <Controller
                      control={control}
                      name="organism_isolated"
                      render={({ field }) => (
                        <SearchableSelect
                          id="organism_isolated"
                          ref={field.ref}
                          options={organismOptions}
                          value={field.value}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          placeholder="Select organism"
                          searchPlaceholder="Search organism or category..."
                          allowCustom
                          invalid={!!errors.organism_isolated}
                          disabled={readOnly}
                        />
                      )}
                    />
                  </FormField>
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
                </div>
                <SignatoryFields
                  staff={data.staff}
                  preparedBy={register('prepared_by')}
                  reportedBy={register('reported_by')}
                  preparedError={errors.prepared_by?.message}
                  reportedError={errors.reported_by?.message}
                  disabled={readOnly}
                />
              </CardContent>
            </Card>

            <Card className={errors.results ? 'border-red-400' : undefined}>
              <CardHeader className="flex-row flex-wrap items-center gap-3 space-y-0">
                <FlaskConical className="h-4 w-4 text-primary" />
                <div className="flex-1">
                  <CardTitle>Antibiotic Sensitivity</CardTitle>
                  <CardDescription className="mt-1">
                    Mark each tested antibiotic as S (Sensitive), R (Resistant) or MS (Moderately Sensitive). Click again to clear.
                  </CardDescription>
                </div>
                <div className="flex gap-1.5 text-xs font-semibold">
                  {counts.map((c) => (
                    <span key={c.value} className={cn('rounded-full border px-2 py-0.5', c.count ? TOGGLE_STYLES[c.value] : 'text-slate-500')}>
                      {c.short} {c.count}
                    </span>
                  ))}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {(requisition.preferred_antibiotics || requisition.antibiotics_used) && (
                  <div className="flex gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                    <Info className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      {requisition.preferred_antibiotics && (
                        <p><span className="font-semibold">Preferred to be tested:</span> {requisition.preferred_antibiotics}</p>
                      )}
                      {requisition.antibiotics_used && (
                        <p><span className="font-semibold">Antibiotics used:</span> {requisition.antibiotics_used}</p>
                      )}
                    </div>
                  </div>
                )}

                {resultsError && <p role="alert" className="text-sm font-medium text-red-600">{resultsError}</p>}

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
                    <Checkbox id="selected_only" checked={selectedOnly} onCheckedChange={(c) => setSelectedOnly(c === true)} />
                    <Label htmlFor="selected_only" className="cursor-pointer font-normal">
                      Show marked only ({orderedResults.length})
                    </Label>
                  </div>
                </div>

                <Controller
                  control={control}
                  name="results"
                  render={({ field }) => {
                    const setResult = (name: string, result: SensitivityResult) => {
                      const next = { ...getValues('results') };
                      if (next[name] === result) delete next[name];
                      else next[name] = result;
                      field.onChange(next);
                    };

                    return (
                      <div className="grid max-h-[28rem] gap-x-6 overflow-y-auto rounded-lg border md:grid-cols-2">
                        {visibleAntibiotics.length === 0 && (
                          <p className="col-span-full py-8 text-center text-sm text-muted-foreground">No antibiotics match.</p>
                        )}
                        {visibleAntibiotics.map((name) => {
                          const current = field.value[name];
                          return (
                            <div
                              key={name}
                              className={cn('flex items-center gap-3 border-b px-3 py-1.5', current && 'bg-slate-50')}
                            >
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-slate-900" title={name}>{name}</p>
                                {shortCodes.get(name) && <p className="text-xs text-slate-500">{shortCodes.get(name)}</p>}
                              </div>
                              <div role="radiogroup" aria-label={`${name} result`} className="flex shrink-0 gap-1">
                                {SENSITIVITY_OPTIONS.map((o) => (
                                  <button
                                    key={o.value}
                                    type="button"
                                    role="radio"
                                    aria-checked={current === o.value}
                                    title={o.label}
                                    aria-label={`${name}: ${o.label}`}
                                    disabled={readOnly}
                                    onClick={() => setResult(name, o.value)}
                                    className={cn(
                                      'h-7 min-w-[2.5rem] rounded border px-2 text-xs font-bold transition disabled:pointer-events-none disabled:opacity-60',
                                      current === o.value ? TOGGLE_STYLES[o.value] : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100',
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
                    );
                  }}
                />

                {orderedResults.length > 0 && !readOnly && (
                  <div className="flex justify-end">
                    <Controller
                      control={control}
                      name="results"
                      render={({ field }) => (
                        <Button type="button" size="sm" variant="ghost" onClick={() => field.onChange({})}>
                          <X /> Clear all marks
                        </Button>
                      )}
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            <ReportActionBar saving={isSubmitting} readOnly={readOnly} needsSave={needsSave} onPrint={onPrint} />
          </form>
        )}
      </ReportPageFrame>

      {requisition && (
        <ReportPrintLayout
          title="Culture & Antibiotic Sensitivity Report"
          requisition={requisition}
          reportingDateTime={requisition.antibiogram_report?.reporting_datetime ?? null}
          preparedBy={staffById(values.prepared_by)}
          reportedBy={staffById(values.reported_by)}
        >
          <table className="w-full border-collapse text-[11pt]">
            <tbody>
              <tr>
                <td className="w-[28%] py-1 align-top font-bold">Specimen</td>
                <td className="w-[3%] py-1 align-top">:</td>
                <td className="py-1 align-top">{requisition.sample_nature || '-'}</td>
              </tr>
              <tr>
                <td className="py-1 align-top font-bold">Organism Isolated</td>
                <td className="py-1 align-top">:</td>
                <td className="py-1 align-top font-bold italic">{values.organism_isolated || '-'}</td>
              </tr>
              {values.grams_stain_remark.trim() && (
                <tr>
                  <td className="py-1 align-top font-bold">Antibiogram</td>
                  <td className="py-1 align-top">:</td>
                  <td className="whitespace-pre-wrap py-1 align-top">{values.grams_stain_remark}</td>
                </tr>
              )}
            </tbody>
          </table>

          <p className="mb-2 mt-4 font-bold underline underline-offset-2">Antibiotic Sensitivity Pattern</p>
          <table className="w-full border-collapse border border-black text-[10.5pt]">
            <thead>
              <tr>
                <th className="w-[9%] border border-black px-2 py-1 text-center">Sl. No</th>
                <th className="border border-black px-2 py-1 text-left">Antibiotic</th>
                {SENSITIVITY_OPTIONS.map((o) => (
                  <th key={o.value} className="w-[16%] border border-black px-2 py-1 text-center">
                    {o.label}
                    <br />({o.short})
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orderedResults.map((r, i) => (
                <tr key={r.antibiotic_name}>
                  <td className="border border-black px-2 py-[3px] text-center">{i + 1}</td>
                  <td className="border border-black px-2 py-[3px]">{r.antibiotic_name}</td>
                  {SENSITIVITY_OPTIONS.map((o) => (
                    <td key={o.value} className="border border-black px-2 py-[3px] text-center font-bold">
                      {r.sensitivity_result === o.value ? '\u2713' : ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </ReportPrintLayout>
      )}
    </>
  );
}
