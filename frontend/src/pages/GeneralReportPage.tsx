import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Check, ClipboardPen, ListPlus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/FormField';
import { ReportActionBar, ReportPageFrame } from '@/components/reports/ReportPageFrame';
import { ReportPrintLayout } from '@/components/reports/ReportPrintLayout';
import { RequisitionSummaryCard } from '@/components/reports/RequisitionSummaryCard';
import { SignatoryFields } from '@/components/reports/SignatoryFields';
import { useSettings } from '@/context/SettingsContext';
import { fetchFindingTemplates, saveGeneralReport } from '@/features/reports/api';
import { usePrintOnLoad } from '@/features/reports/usePrintOnLoad';
import { useReportData } from '@/features/reports/useReportData';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { RequisitionDetail } from '@/types/report';

const text = (max: number) => z.string().trim().max(max, `Must be at most ${max} characters`);

const schema = z.object({
  specimen: text(150),
  investigation_done: text(255),
  report_findings: text(10000).min(1, 'Enter the report findings'),
  prepared_by: z.string().min(1, 'Select the technician who prepared the report'),
  reported_by: z.string().min(1, 'Select the reporting doctor'),
});
type FormValues = z.infer<typeof schema>;

const EMPTY: FormValues = { specimen: '', investigation_done: '', report_findings: '', prepared_by: '', reported_by: '' };

/** Case, spacing and a trailing full stop don't make a phrase different. */
const normalizePhrase = (s: string) => s.trim().replace(/\s+/g, ' ').replace(/\.$/, '').toLowerCase();

function defaultsFor(r: RequisitionDetail): FormValues {
  const report = r.general_report;
  const specimen = [r.sample_nature, r.site_of_collection && `(${r.site_of_collection})`].filter(Boolean).join(' ');
  return {
    specimen: report?.specimen ?? specimen.slice(0, 150),
    investigation_done: report?.investigation_done ?? r.tests.map((t) => t.test_name).join(', ').slice(0, 255),
    report_findings: report?.report_findings ?? '',
    prepared_by: report?.prepared_by ? String(report.prepared_by) : '',
    reported_by: report?.reported_by ? String(report.reported_by) : '',
  };
}

export default function GeneralReportPage() {
  const requisitionId = Number(useParams().requisitionId);
  const { data, loading, error, reload, updateRequisition } = useReportData(requisitionId, fetchFindingTemplates);
  const [extraTemplate, setExtraTemplate] = useState('');
  const { printPrefs } = useSettings();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    getValues,
    setValue,
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
  const templates = data?.extra ?? [];
  const values = watch();
  const readOnly = requisition?.status === 'VERIFIED' || !!requisition?.general_report?.is_verified;
  usePrintOnLoad(!!requisition, !!requisition?.general_report);

  const relevantNames = useMemo(
    () => [...new Set(requisition?.tests.map((t) => t.template_test_name).filter((n): n is string => !!n) ?? [])],
    [requisition],
  );
  const shownGroups = templates.filter((g) => relevantNames.includes(g.test_name) || g.test_name === extraTemplate);
  const otherGroups = templates.filter((g) => !relevantNames.includes(g.test_name));

  const findingLines = values.report_findings.split('\n').map(normalizePhrase);
  const togglePhrase = (phrase: string) => {
    const target = normalizePhrase(phrase);
    const current = getValues('report_findings');
    const lines = current.split('\n');
    let next: string;
    if (lines.some((l) => normalizePhrase(l) === target)) {
      next = lines.filter((l) => normalizePhrase(l) !== target).join('\n').replace(/\n{3,}/g, '\n\n').trim();
    } else if (normalizePhrase(current).includes(target)) {
      toast.info('That phrase is already in the report findings');
      return;
    } else {
      next = current.trimEnd() ? `${current.trimEnd()}\n${phrase}` : phrase;
    }
    setValue('report_findings', next, { shouldDirty: true, shouldValidate: true });
  };

  const save = async (v: FormValues): Promise<boolean> => {
    if (!requisition) return false;
    try {
      const saved = await saveGeneralReport({
        requisition_id: requisition.id,
        specimen: v.specimen.trim() || null,
        investigation_done: v.investigation_done.trim() || null,
        report_findings: v.report_findings.trim(),
        prepared_by: Number(v.prepared_by),
        reported_by: Number(v.reported_by),
      });
      updateRequisition((r) => ({
        ...r,
        status: r.status === 'RECEIVED' ? 'REPORT_ENTERED' : r.status,
        general_report_id: saved.id,
        general_report: {
          id: saved.id,
          reporting_datetime: saved.reporting_datetime,
          specimen: v.specimen.trim() || null,
          investigation_done: v.investigation_done.trim() || null,
          report_findings: v.report_findings.trim(),
          prepared_by: Number(v.prepared_by),
          reported_by: Number(v.reported_by),
          is_verified: false,
          updated_at: new Date().toISOString(),
        },
      }));
      reset(v);
      toast.success(`General report saved - Lab No ${saved.lab_no}`);
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
  const needsSave = isDirty || !requisition?.general_report;
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
        step="Step 2A - General Culture Report"
        title="General Report"
        labNo={requisition?.lab_no}
        loading={loading}
        error={error}
        onRetry={reload}
      >
        {requisition && data && (
          <form noValidate onSubmit={onSave} className="space-y-5">
            <RequisitionSummaryCard
              requisition={requisition}
              reportingDateTime={requisition.general_report?.reporting_datetime ?? null}
            />

            <Card>
              <CardHeader className="flex-row items-center gap-2 space-y-0">
                <ClipboardPen className="h-4 w-4 text-primary" />
                <CardTitle>Report Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField label="Specimen" htmlFor="specimen" error={errors.specimen?.message}>
                    <Input id="specimen" disabled={readOnly} aria-invalid={!!errors.specimen} {...register('specimen')} />
                  </FormField>
                  <FormField label="Investigation Done" htmlFor="investigation_done" error={errors.investigation_done?.message}>
                    <Input
                      id="investigation_done"
                      disabled={readOnly}
                      aria-invalid={!!errors.investigation_done}
                      {...register('investigation_done')}
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

            <Card>
              <CardHeader className="flex-row flex-wrap items-center gap-2 space-y-0">
                <ListPlus className="h-4 w-4 text-primary" />
                <div className="flex-1">
                  <CardTitle>Findings</CardTitle>
                  <CardDescription className="mt-1">Click a preset phrase to add it (click again to remove), then edit the text freely.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="grid gap-5 lg:grid-cols-2">
                <div className="space-y-3">
                  <NativeSelect
                    aria-label="Show phrases for another test"
                    value={extraTemplate}
                    onChange={(e) => setExtraTemplate(e.target.value)}
                    disabled={readOnly}
                  >
                    <option value="">Phrases for another test...</option>
                    {otherGroups.map((g) => (
                      <option key={g.test_name} value={g.test_name}>{g.test_name}</option>
                    ))}
                  </NativeSelect>

                  <div className="max-h-[26rem] space-y-4 overflow-y-auto rounded-lg border bg-slate-50 p-3">
                    {shownGroups.length === 0 && (
                      <p className="py-6 text-center text-sm text-muted-foreground">
                        No preset phrases for the requested tests. Choose a test above or type the findings.
                      </p>
                    )}
                    {shownGroups.map((group) => (
                      <div key={group.test_name}>
                        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{group.test_name}</p>
                        <div className="space-y-1.5">
                          {group.findings.map((f) => {
                            const used = findingLines.includes(normalizePhrase(f.finding_text));
                            return (
                              <button
                                key={f.id}
                                type="button"
                                disabled={readOnly}
                                aria-pressed={used}
                                title={used ? 'Click to remove from findings' : 'Click to add to findings'}
                                onClick={() => togglePhrase(f.finding_text)}
                                className={cn(
                                  'flex w-full items-start gap-2 rounded-md border bg-white px-2.5 py-1.5 text-left text-sm transition hover:border-blue-400 hover:bg-blue-50 disabled:pointer-events-none disabled:opacity-60',
                                  used && 'border-emerald-300 bg-emerald-50',
                                )}
                              >
                                <Check className={cn('mt-0.5 h-4 w-4 shrink-0 text-emerald-600', !used && 'invisible')} />
                                <span>{f.finding_text}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <FormField label="Report Findings" htmlFor="report_findings" required error={errors.report_findings?.message}>
                  <Textarea
                    id="report_findings"
                    rows={18}
                    disabled={readOnly}
                    placeholder="Selected phrases appear here. Type or edit as needed."
                    aria-invalid={!!errors.report_findings}
                    className="min-h-[26rem] font-mono text-[13px] leading-relaxed"
                    {...register('report_findings')}
                  />
                </FormField>
              </CardContent>
            </Card>

            <ReportActionBar saving={isSubmitting} readOnly={readOnly} needsSave={needsSave} onPrint={onPrint} />
          </form>
        )}
      </ReportPageFrame>

      {requisition && (
        <ReportPrintLayout
          title="Microbiology Report"
          requisition={requisition}
          reportingDateTime={requisition.general_report?.reporting_datetime ?? null}
          preparedBy={staffById(values.prepared_by)}
          reportedBy={staffById(values.reported_by)}
        >
          <table className="w-full border-collapse text-[11pt]">
            <tbody>
              <tr>
                <td className="w-[28%] py-1 align-top font-bold">Specimen</td>
                <td className="w-[3%] py-1 align-top">:</td>
                <td className="py-1 align-top">{values.specimen || '-'}</td>
              </tr>
              <tr>
                <td className="py-1 align-top font-bold">Investigation Done</td>
                <td className="py-1 align-top">:</td>
                <td className="py-1 align-top">{values.investigation_done || '-'}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-4 font-bold underline underline-offset-2">Report</p>
          <div className="mt-2 whitespace-pre-wrap text-[11.5pt] leading-relaxed">{values.report_findings}</div>
        </ReportPrintLayout>
      )}
    </>
  );
}
