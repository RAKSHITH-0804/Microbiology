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
import { NothingToPrintNotice, ReportActionBar, ReportPageFrame } from '@/components/reports/ReportPageFrame';
import { ReportPrintLayout } from '@/components/reports/ReportPrintLayout';
import { RequisitionSummaryCard } from '@/components/reports/RequisitionSummaryCard';
import { RevokeVerificationDialog } from '@/components/reports/RevokeVerificationDialog';
import { SignatoryFields } from '@/components/reports/SignatoryFields';
import { CancelledNotice } from '@/components/requisitions/CancelledNotice';
import { fetchFindingTemplates, saveGeneralReport } from '@/features/reports/api';
import {
  findingsContainPhrase,
  parseAndGroupFindings,
  serializeFindingSections,
  toggleFindingPhrase,
} from '@/features/reports/generalFindings';
import { inheritedInvestigation, inheritedSpecimen } from '@/features/reports/inheritedFields';
import { useReportAccess } from '@/features/reports/useReportAccess';
import { useReportData } from '@/features/reports/useReportData';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { FindingTemplateGroup, RequisitionDetail } from '@/types/report';

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

function defaultsFor(r: RequisitionDetail): FormValues {
  const report = r.general_report;
  return {
    // Always inherited from the requisition master; never overridden at report entry.
    specimen: inheritedSpecimen(r).slice(0, 150),
    investigation_done: inheritedInvestigation(r).slice(0, 255),
    report_findings: report?.report_findings ?? '',
    prepared_by: report?.prepared_by ? String(report.prepared_by) : '',
    reported_by: report?.reported_by ? String(report.reported_by) : '',
  };
}

export default function GeneralReportPage() {
  const requisitionId = Number(useParams().requisitionId);
  const { data, loading, error, reload, updateRequisition } = useReportData(requisitionId, fetchFindingTemplates);
  const [extraTemplate, setExtraTemplate] = useState('');

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
  const { readOnly, readOnlyMessage, notice, draft, printable, print, canRevoke } = useReportAccess({
    reportType: 'general',
    requisition,
    report: requisition?.general_report,
    isDirty,
  });
  const [revokeOpen, setRevokeOpen] = useState(false);

  const relevantNames = useMemo(
    () => [...new Set(requisition?.tests.map((t) => t.template_test_name).filter((n): n is string => !!n) ?? [])],
    [requisition],
  );
  /** Prefer requisition tests, then any template categories, so legacy flat lines can still be grouped. */
  const investigationList = useMemo(() => {
    const fromTemplates = templates.map((g: FindingTemplateGroup) => g.test_name);
    return [...new Set([...relevantNames, ...fromTemplates])];
  }, [relevantNames, templates]);

  const shownGroups = templates.filter((g) => relevantNames.includes(g.test_name) || g.test_name === extraTemplate);
  const otherGroups = templates.filter((g) => !relevantNames.includes(g.test_name));

  const togglePhrase = (testName: string, phrase: string) => {
    const current = getValues('report_findings');
    const next = toggleFindingPhrase(current, testName, phrase, {
      investigationList,
      templates,
    });
    setValue('report_findings', next, { shouldDirty: true, shouldValidate: true });
  };

  const findingSections = useMemo(
    () => parseAndGroupFindings(values.report_findings, investigationList, templates),
    [values.report_findings, investigationList, templates],
  );

  const save = async (v: FormValues): Promise<boolean> => {
    if (!requisition) return false;
    const specimen = inheritedSpecimen(requisition).slice(0, 150) || null;
    const investigation_done = inheritedInvestigation(requisition).slice(0, 255) || null;
    // Persist structured headings so future loads keep test-wise grouping.
    const grouped = parseAndGroupFindings(v.report_findings.trim(), investigationList, templates);
    const report_findings =
      serializeFindingSections(grouped).trim() || v.report_findings.trim();
    try {
      const saved = await saveGeneralReport({
        requisition_id: requisition.id,
        specimen,
        investigation_done,
        report_findings,
        prepared_by: Number(v.prepared_by),
        reported_by: Number(v.reported_by),
      });
      updateRequisition((r) => ({
        ...r,
        status: 'REPORT_ENTERED',
        general_report_id: saved.id,
        general_report_verified: false,
        general_report: {
          id: saved.id,
          reporting_datetime: saved.reporting_datetime,
          specimen,
          investigation_done,
          report_findings,
          prepared_by: Number(v.prepared_by),
          reported_by: Number(v.reported_by),
          is_verified: false,
          updated_at: new Date().toISOString(),
        },
      }));
      reset({ ...v, specimen: specimen ?? '', investigation_done: investigation_done ?? '', report_findings });
      if (saved.verification_reset) {
        toast.success(`General report corrected - Lab No ${saved.lab_no}`, {
          description: 'Verification was reset and the reporting doctor has been notified to verify it again.',
        });
      } else toast.success(`General report saved - Lab No ${saved.lab_no}`);
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

  return (
    <>
      <ReportPageFrame
        step="Step 2A - General Culture Report"
        title="General Report"
        labNo={requisition?.lab_no ?? undefined}
        loading={loading}
        error={error}
        onRetry={reload}
      >
        {requisition && data && (
          <form noValidate onSubmit={onSave} className="space-y-5">
            <CancelledNotice info={requisition} />
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
                  <FormField
                    label="Specimen"
                    htmlFor="specimen"
                    hint="Locked to the requisition sample details"
                  >
                    <Input id="specimen" disabled readOnly aria-readonly="true" {...register('specimen')} />
                  </FormField>
                  <FormField
                    label="Investigation Done"
                    htmlFor="investigation_done"
                    hint="Locked to the investigations selected at registration"
                  >
                    <Input id="investigation_done" disabled readOnly aria-readonly="true" {...register('investigation_done')} />
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
                  <CardDescription className="mt-1">
                    Click a preset to add it under that test heading (click again to remove). Empty headings are cleared
                    automatically.
                  </CardDescription>
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
                            const used = findingsContainPhrase(
                              values.report_findings,
                              group.test_name,
                              f.finding_text,
                              investigationList,
                            );
                            return (
                              <button
                                key={f.id}
                                type="button"
                                disabled={readOnly}
                                aria-pressed={used}
                                title={used ? 'Click to remove from findings' : 'Click to add under this test'}
                                onClick={() => togglePhrase(group.test_name, f.finding_text)}
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
                    placeholder={'AEROBIC CULTURE:\n- No growth after 48 hours\n\nDARK GROUND MICROSCOPY…:\n- …'}
                    aria-invalid={!!errors.report_findings}
                    className="min-h-[26rem] font-mono text-[13px] leading-relaxed"
                    {...register('report_findings')}
                  />
                </FormField>
              </CardContent>
            </Card>

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
        reportType="general"
        reportId={requisition?.general_report?.id}
        labNo={requisition?.lab_no ?? undefined}
        onClose={() => setRevokeOpen(false)}
        onRevoked={reload}
      />

      {requisition && !printable && <NothingToPrintNotice />}
      {requisition && printable && (
        <ReportPrintLayout
          title="Culture & Sensitivity Report"
          requisition={requisition}
          reportingDateTime={requisition.general_report?.reporting_datetime ?? null}
          draft={draft}
          preparedBy={staffById(values.prepared_by)}
          reportedBy={staffById(values.reported_by)}
        >
          <table className="print-report-meta">
            <tbody>
              <tr>
                <td className="w-[28%] font-bold">Specimen</td>
                <td className="w-[3%]">:</td>
                <td>{values.specimen || '-'}</td>
              </tr>
              <tr>
                <td className="font-bold">Investigation Done</td>
                <td>:</td>
                <td>{values.investigation_done || '-'}</td>
              </tr>
            </tbody>
          </table>
          <p className="print-report-section-title">Report</p>
          {findingSections.length > 0 ? (
            <div className="print-findings-groups">
              {findingSections.map((section) => (
                <div key={section.heading} className="print-findings-group">
                  <p className="print-findings-heading">{section.heading}:</p>
                  <ul className="print-findings-list">
                    {section.findings.map((finding) => (
                      <li key={`${section.heading}-${finding}`}>{finding}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <div className="print-report-findings">{values.report_findings}</div>
          )}
        </ReportPrintLayout>
      )}
    </>
  );
}
