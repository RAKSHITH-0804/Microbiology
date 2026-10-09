import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AxiosError } from 'axios';
import { toast } from 'sonner';
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  FlaskConical,
  Info,
  Loader2,
  Lock,
  ReceiptIndianRupee,
  RotateCcw,
  Save,
  TestTubes,
  UserRound,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { DateTimePicker } from '@/components/DateTimePicker';
import { FormField } from '@/components/FormField';
import { AmountInput } from '@/components/AmountInput';
import { PaymentStatusBadge } from '@/components/PaymentStatusBadge';
import { createRequisition, fetchSamples, fetchTestCatalog, updateRequisition } from '@/features/requisitions/api';
import { fetchRequisition } from '@/features/reports/api';
import {
  buildRequisitionFormSchema,
  fromRequisition,
  RequisitionFormValues,
  SERVER_FIELD_MAP,
  stripDoctorPrefix,
  testKey,
  testKeyCategory,
  toCreatePayload,
  withDoctorPrefix,
} from '@/features/requisitions/requisitionForm.schema';
import {
  computePayment,
  EMPTY_PAYMENT,
  EXEMPT_REFERRAL_LABEL,
  EXEMPT_REFERRAL_PLACEHOLDER,
  formatRupees,
  isNoCounterPayment,
  isReleasedForReporting,
  paymentModeNote,
} from '@/features/requisitions/payment';
import { useAuth } from '@/context/AuthContext';
import { getErrorMessage } from '@/lib/api';
import { toDateTimeLocal } from '@/lib/datetime';
import { formatDateTime } from '@/lib/format';
import { HOSPITALS, PAYMENT_MODES, type MasterSample, type PaymentStatus, type TestCategory } from '@/types/requisition';
import type { RequisitionDetail } from '@/types/report';

const SEX_OPTIONS = [
  { value: 'M', label: 'Male' },
  { value: 'F', label: 'Female' },
  { value: 'Other', label: 'Other' },
] as const;

const AGE_PARTS = [
  { key: 'years', label: 'Years', maxLength: 3, max: 150 },
  { key: 'months', label: 'Months', maxLength: 2, max: 11 },
  { key: 'days', label: 'Days', maxLength: 2, max: 31 },
] as const;

/** Blocks non-digit characters while still allowing shortcuts (Ctrl+V, Ctrl+A) and navigation keys. */
function allowDigitsOnly(e: KeyboardEvent<HTMLInputElement>) {
  if (e.key.length === 1 && !/\d/.test(e.key) && !e.ctrlKey && !e.metaKey) e.preventDefault();
}

function emptyForm(): RequisitionFormValues {
  return {
    lab_no: '',
    receipt_no: '',
    sample_received_datetime: toDateTimeLocal(),
    patient_name: '',
    age: { years: '', months: '', days: '' },
    sex: '',
    phone: '',
    address: '',
    consultant_doctor: '',
    op_ip_no: '',
    ward_unit: '',
    hospital: '',
    hospital_other: '',
    clinical_diagnosis: '',
    preferred_antibiotics: '',
    antibiotics_used: '',
    sample_nature: '',
    site_of_collection: '',
    sample_collection_datetime: '',
    tests: [],
    ...EMPTY_PAYMENT,
  };
}

interface SavedInfo {
  labNo: string;
  patientName: string;
  testCount: number;
  paymentStatus: PaymentStatus;
}

export default function RequisitionFormPage() {
  const navigate = useNavigate();
  const params = useParams();
  const editId = params.id ? Number(params.id) : null;
  const isEdit = editId !== null;

  const [samples, setSamples] = useState<MasterSample[]>([]);
  const [catalog, setCatalog] = useState<TestCategory[]>([]);
  const [mastersLoading, setMastersLoading] = useState(true);
  const [mastersError, setMastersError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<SavedInfo | null>(null);
  const [original, setOriginal] = useState<RequisitionDetail | null>(null);
  const [editLoading, setEditLoading] = useState(isEdit);
  const [editError, setEditError] = useState<string | null>(null);

  const { user } = useAuth();
  // Doctors don't handle billing; the server ignores any payment fields they send.
  const showBilling = user?.role !== 'DOCTOR';
  const formSchema = useMemo(() => buildRequisitionFormSchema(showBilling), [showBilling]);

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RequisitionFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: emptyForm(),
    mode: 'onTouched',
  });

  const focusLabNo = () => setTimeout(() => document.getElementById('lab_no')?.focus(), 0);

  const phoneField = register('phone');
  const hospital = watch('hospital');
  const selectedTests = watch('tests');
  const payment = computePayment({
    total_amount: watch('total_amount'),
    paid_amount: watch('paid_amount'),
    payment_mode: watch('payment_mode'),
    exempt_referred_by: watch('exempt_referred_by'),
  });
  const balanceDue = Math.max(payment.total_amount - payment.paid_amount, 0);
  const exempt = payment.payment_mode === 'EXEMPT';
  const noCounterPayment = isNoCounterPayment(payment.payment_mode);

  // The server stamps the receiving time (and keeps it on edits) for everyone but the Super Admin.
  const canSetReceivedTime = user?.role === 'SUPER_ADMIN';
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (isEdit || canSetReceivedTime) return;
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, [isEdit, canSetReceivedTime]);

  const loadMasters = useCallback(async () => {
    setMastersLoading(true);
    setMastersError(null);
    try {
      const [s, c] = await Promise.all([fetchSamples(), fetchTestCatalog()]);
      setSamples(s);
      setCatalog(c);
    } catch (err) {
      setMastersError(getErrorMessage(err, 'Failed to load master data'));
    } finally {
      setMastersLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMasters();
  }, [loadMasters]);

  const loadOriginal = useCallback(async () => {
    setOriginal(null);
    setEditError(null);
    if (editId === null || !Number.isInteger(editId) || editId <= 0) {
      setEditLoading(false);
      if (editId !== null) setEditError('Invalid requisition id');
      else reset(emptyForm());
      return;
    }
    setEditLoading(true);
    try {
      setOriginal(await fetchRequisition(editId));
    } catch (err) {
      setEditError(getErrorMessage(err, 'Could not load the requisition'));
    } finally {
      setEditLoading(false);
    }
  }, [editId, reset]);

  useEffect(() => {
    loadOriginal();
  }, [loadOriginal]);

  // Fill the form only once the sample options exist, so the select can show the saved value.
  useEffect(() => {
    if (original && !mastersLoading) reset(fromRequisition(original));
  }, [original, mastersLoading, reset]);

  const readOnly =
    original?.status === 'VERIFIED' || !!original?.general_report?.is_verified || !!original?.antibiogram_report?.is_verified;
  const sampleOptions = useMemo(() => {
    const names = samples.map((s) => s.sample_name);
    const saved = original?.sample_nature;
    return saved && !names.includes(saved) ? [...names, saved] : names;
  }, [samples, original]);

  const selectedCountByCategory = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const key of selectedTests) {
      const category = testKeyCategory(key);
      counts[category] = (counts[category] ?? 0) + 1;
    }
    return counts;
  }, [selectedTests]);

  const onSubmit = async (values: RequisitionFormValues) => {
    try {
      if (isEdit) {
        if (!original) return;
        const updated = await updateRequisition(original.id, toCreatePayload(values));
        toast.success('Requisition updated successfully', {
          description: isReleasedForReporting(updated.payment_status)
            ? undefined
            : 'Payment pending - it stays off the Pending Worklist until paid.',
        });
        navigate('/requisitions/pending');
        return;
      }
      const saved = await createRequisition(toCreatePayload(values));
      setLastSaved({
        labNo: saved.lab_no,
        patientName: values.patient_name.trim(),
        testCount: values.tests.length,
        paymentStatus: saved.payment_status,
      });
      toast.success(`Requisition saved - Lab No ${saved.lab_no}`, {
        description: `${values.patient_name.trim()} - ${values.tests.length} investigation(s)`,
      });
      reset(emptyForm());
      document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' });
      focusLabNo();
    } catch (err) {
      const body = (err as AxiosError<{ errors?: Record<string, string[] | string> }>).response?.data;
      if (body?.errors && typeof body.errors === 'object') {
        for (const [key, messages] of Object.entries(body.errors)) {
          const field = SERVER_FIELD_MAP[key] ?? (key in emptyForm() ? (key as keyof RequisitionFormValues) : null);
          if (field) {
            setError(field, { type: 'server', message: Array.isArray(messages) ? messages[0] : String(messages) });
          }
        }
      }
      toast.error(getErrorMessage(err, isEdit ? 'Could not update requisition' : 'Could not save requisition'));
    }
  };

  const handleReset = () => {
    reset(original ? fromRequisition(original) : emptyForm());
    focusLabNo();
  };

  if (isEdit && (editLoading || editError || !original)) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <Link to="/worklist" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Pending Worklist
        </Link>
        <h2 className="text-xl font-semibold text-foreground">Edit Requisition</h2>
        {editError ? (
          <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {editError}
            <Button type="button" size="sm" variant="outline" onClick={loadOriginal}>Retry</Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading requisition...
          </div>
        )}
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit(onSubmit, () => toast.error('Please correct the highlighted fields'))}
      onKeyDown={(e) => {
        // Barcode scanners and habit send Enter; only the Save button should submit.
        if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') e.preventDefault();
      }}
      className="mx-auto max-w-6xl space-y-5"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {isEdit && (
            <Link to="/worklist" className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" /> Pending Worklist
            </Link>
          )}
          <h2 className="text-xl font-semibold text-foreground">
            {isEdit ? `Edit Requisition - ${original?.lab_no}` : 'Investigations Requisition Form'}
          </h2>
          <p className="text-sm text-muted-foreground">Department of Microbiology, J.J.M. Medical College, Davangere</p>
        </div>
      </div>

      {readOnly && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Lock className="h-4 w-4 shrink-0" />
          Verified reports are locked and cannot be modified, so this requisition can no longer be edited.
        </div>
      )}

      {!isEdit && lastSaved && (
        <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="flex-1 text-sm">
            <p className="font-semibold">
              Saved with Lab No <span className="rounded bg-emerald-600 px-1.5 py-0.5 font-mono text-white">{lastSaved.labNo}</span>
            </p>
            <p className="mt-0.5 text-emerald-700">
              {lastSaved.patientName} - {lastSaved.testCount} investigation(s). The form is ready for the next sample.
            </p>
            {!isReleasedForReporting(lastSaved.paymentStatus) && (
              <p className="mt-1 flex items-center gap-1.5 text-amber-800">
                <PaymentStatusBadge status={lastSaved.paymentStatus} />
                Awaiting payment - it will reach the Pending Worklist once the bill is settled.
              </p>
            )}
          </div>
          <button type="button" onClick={() => setLastSaved(null)} aria-label="Dismiss" className="text-emerald-700 hover:text-emerald-900">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Header: lab no / receipt / received time */}
      <Card>
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <ClipboardList className="h-4 w-4 text-primary" />
          <CardTitle>Registration</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <FormField label="Lab No." htmlFor="lab_no" required error={errors.lab_no?.message}>
            <Input id="lab_no" autoFocus autoComplete="off" placeholder="e.g. LAB-2026-001" aria-invalid={!!errors.lab_no} {...register('lab_no')} />
          </FormField>
          <FormField
            label="Receipt No."
            htmlFor="receipt_no"
            error={errors.receipt_no?.message}
            hint={isEdit ? 'Locked to the receipt issued at registration' : undefined}
          >
            {isEdit ? (
              <div className="relative">
                <Input
                  id="receipt_no"
                  readOnly
                  tabIndex={-1}
                  title="The receipt number cannot be changed after registration"
                  className="cursor-not-allowed bg-slate-50 pr-9 text-slate-700"
                  {...register('receipt_no')}
                />
                <Lock className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>
            ) : (
              <Input id="receipt_no" autoComplete="off" aria-invalid={!!errors.receipt_no} {...register('receipt_no')} />
            )}
          </FormField>
          <FormField
            label="Date & Time of Receiving Sample"
            htmlFor="sample_received_datetime"
            required
            error={errors.sample_received_datetime?.message}
            hint={canSetReceivedTime ? undefined : isEdit ? 'Locked to the original receiving time' : 'Recorded automatically when saved'}
          >
            {canSetReceivedTime ? (
              <Controller
                control={control}
                name="sample_received_datetime"
                render={({ field }) => (
                  <DateTimePicker
                    id="sample_received_datetime"
                    ref={field.ref}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    invalid={!!errors.sample_received_datetime}
                    disableFuture
                  />
                )}
              />
            ) : (
              <div className="relative">
                <Input
                  id="sample_received_datetime"
                  readOnly
                  tabIndex={-1}
                  value={formatDateTime(isEdit ? original?.sample_received_datetime : now.toISOString())}
                  title="Only the Super Admin can change the receiving time"
                  className="cursor-not-allowed bg-slate-50 pr-9 text-slate-700"
                />
                <Lock className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>
            )}
          </FormField>
        </CardContent>
      </Card>

      {/* Patient demographics */}
      <Card>
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <UserRound className="h-4 w-4 text-primary" />
          <CardTitle>Patient Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-12">
          <FormField label="Patient Name" htmlFor="patient_name" required error={errors.patient_name?.message} className="md:col-span-5">
            <Input id="patient_name" autoComplete="off" aria-invalid={!!errors.patient_name} {...register('patient_name')} />
          </FormField>

          <FormField
            label="Age"
            htmlFor="age_years"
            required
            error={errors.age?.years?.message ?? errors.age?.months?.message ?? errors.age?.days?.message}
            className="md:col-span-4"
          >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {AGE_PARTS.map((part) => {
                const ageField = register(`age.${part.key}`);
                return (
                  <label key={part.key} className="flex cursor-pointer items-center gap-1.5 text-sm text-slate-700">
                    <Input
                      id={`age_${part.key}`}
                      inputMode="numeric"
                      maxLength={part.maxLength}
                      min={0}
                      max={part.max}
                      placeholder="0"
                      autoComplete="off"
                      className="w-14 text-center"
                      aria-invalid={!!errors.age?.[part.key]}
                      {...ageField}
                      onKeyDown={allowDigitsOnly}
                      onChange={(e) => {
                        e.target.value = e.target.value.replace(/\D/g, '').slice(0, part.maxLength);
                        return ageField.onChange(e);
                      }}
                    />
                    {part.label}
                  </label>
                );
              })}
            </div>
          </FormField>

          <FormField label="Sex" required error={errors.sex?.message} className="md:col-span-3">
            <div role="radiogroup" aria-label="Sex" className="flex h-9 flex-wrap items-center gap-x-5 gap-y-1">
              {SEX_OPTIONS.map((o) => (
                <label key={o.value} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    value={o.value}
                    className="h-4 w-4 cursor-pointer accent-blue-600"
                    aria-invalid={!!errors.sex}
                    {...register('sex')}
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </FormField>

          <FormField label="Phone No." htmlFor="phone" required error={errors.phone?.message} hint="10-digit mobile number" className="md:col-span-4">
            <Input
              id="phone"
              type="tel"
              inputMode="numeric"
              maxLength={10}
              placeholder="9876543210"
              autoComplete="off"
              aria-invalid={!!errors.phone}
              {...phoneField}
              onKeyDown={allowDigitsOnly}
              onChange={(e) => {
                e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
                return phoneField.onChange(e);
              }}
            />
          </FormField>
          <FormField label="Consultant Doctor" htmlFor="consultant_doctor" error={errors.consultant_doctor?.message} className="md:col-span-4">
            <Controller
              control={control}
              name="consultant_doctor"
              render={({ field }) => (
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-1 left-1 flex items-center rounded bg-secondary px-2 text-xs font-semibold text-secondary-foreground">
                    Dr.
                  </span>
                  <Input
                    id="consultant_doctor"
                    ref={field.ref}
                    className="pl-12"
                    placeholder="Doctor's name"
                    autoComplete="off"
                    aria-invalid={!!errors.consultant_doctor}
                    value={stripDoctorPrefix(field.value)}
                    onChange={(e) => field.onChange(withDoctorPrefix(e.target.value))}
                    onBlur={field.onBlur}
                  />
                </div>
              )}
            />
          </FormField>
          <FormField label="OP / IP No." htmlFor="op_ip_no" error={errors.op_ip_no?.message} className="md:col-span-4">
            <Input id="op_ip_no" autoComplete="off" aria-invalid={!!errors.op_ip_no} {...register('op_ip_no')} />
          </FormField>

          <FormField label="Hospital" htmlFor="hospital" required error={errors.hospital?.message} className="md:col-span-4">
            <NativeSelect id="hospital" aria-invalid={!!errors.hospital} {...register('hospital')}>
              <option value="">Select hospital</option>
              {HOSPITALS.map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </NativeSelect>
          </FormField>
          {hospital === 'Other' && (
            <FormField label="Hospital Name" htmlFor="hospital_other" required error={errors.hospital_other?.message} className="md:col-span-4">
              <Input id="hospital_other" autoComplete="off" aria-invalid={!!errors.hospital_other} {...register('hospital_other')} />
            </FormField>
          )}
          <FormField label="Ward / Unit" htmlFor="ward_unit" error={errors.ward_unit?.message} className="md:col-span-4">
            <Input id="ward_unit" autoComplete="off" aria-invalid={!!errors.ward_unit} {...register('ward_unit')} />
          </FormField>

          <FormField label="Patient Address" htmlFor="address" error={errors.address?.message} className="md:col-span-12">
            <Textarea
              id="address"
              rows={2}
              placeholder="House / street, village / town, taluk, district"
              aria-invalid={!!errors.address}
              {...register('address')}
            />
          </FormField>

          <FormField label="Clinical Diagnosis / Short History" htmlFor="clinical_diagnosis" error={errors.clinical_diagnosis?.message} className="md:col-span-12">
            <Textarea id="clinical_diagnosis" rows={2} aria-invalid={!!errors.clinical_diagnosis} {...register('clinical_diagnosis')} />
          </FormField>

          <FormField label="Antibiotics Used" htmlFor="antibiotics_used" error={errors.antibiotics_used?.message} className="md:col-span-6">
            <Input
              id="antibiotics_used"
              autoComplete="off"
              placeholder="e.g. Ceftriaxone, Amikacin"
              aria-invalid={!!errors.antibiotics_used}
              {...register('antibiotics_used')}
            />
          </FormField>
          <FormField label="Preferred Antibiotics to be tested" htmlFor="preferred_antibiotics" error={errors.preferred_antibiotics?.message} className="md:col-span-6">
            <Input
              id="preferred_antibiotics"
              autoComplete="off"
              placeholder="e.g. Meropenem, Colistin"
              aria-invalid={!!errors.preferred_antibiotics}
              {...register('preferred_antibiotics')}
            />
          </FormField>
        </CardContent>
      </Card>

      {/* Sample information */}
      <Card>
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <TestTubes className="h-4 w-4 text-primary" />
          <CardTitle>Sample Information</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <FormField label="Nature of Sample" htmlFor="sample_nature" required error={errors.sample_nature?.message}>
            <NativeSelect id="sample_nature" disabled={mastersLoading} aria-invalid={!!errors.sample_nature} {...register('sample_nature')}>
              <option value="">{mastersLoading ? 'Loading...' : 'Select sample'}</option>
              {sampleOptions.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="Site of Collection" htmlFor="site_of_collection" error={errors.site_of_collection?.message}>
            <Input id="site_of_collection" autoComplete="off" aria-invalid={!!errors.site_of_collection} {...register('site_of_collection')} />
          </FormField>
          <FormField label="Date & Time of Sample Collection" htmlFor="sample_collection_datetime" error={errors.sample_collection_datetime?.message}>
            <Controller
              control={control}
              name="sample_collection_datetime"
              render={({ field }) => (
                <DateTimePicker
                  id="sample_collection_datetime"
                  ref={field.ref}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  invalid={!!errors.sample_collection_datetime}
                  placeholder="Select collection time"
                  disableFuture
                  clearable
                />
              )}
            />
          </FormField>
        </CardContent>
      </Card>

      {/* Requested tests */}
      <Card className={errors.tests ? 'border-destructive/60' : undefined}>
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <FlaskConical className="h-4 w-4 text-primary" />
          <div className="flex-1">
            <CardTitle>Culture Investigations Requested</CardTitle>
            <CardDescription className="mt-1">Tick all investigations requested on the form.</CardDescription>
          </div>
          {selectedTests.length > 0 && (
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              {selectedTests.length} selected
            </span>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {errors.tests?.message && (
            <p role="alert" className="text-sm font-medium text-destructive">{errors.tests.message}</p>
          )}

          {mastersLoading && (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading investigations...
            </div>
          )}

          {mastersError && (
            <div className="flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {mastersError}
              <Button type="button" size="sm" variant="outline" onClick={loadMasters}>Retry</Button>
            </div>
          )}

          <Controller
            control={control}
            name="tests"
            render={({ field }) => {
              const toggle = (key: string, checked: boolean) =>
                field.onChange(checked ? [...field.value, key] : field.value.filter((k) => k !== key));

              return (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {catalog.map((group) => (
                    <fieldset key={group.category} className="rounded-lg border bg-muted/40 p-4">
                      <legend className="flex w-full items-center justify-between px-1 text-sm font-semibold text-foreground">
                        {group.category}
                        {selectedCountByCategory[group.category] ? (
                          <span className="ml-2 text-xs font-medium text-primary">
                            {selectedCountByCategory[group.category]}
                          </span>
                        ) : null}
                      </legend>
                      <div className="mt-1 space-y-2.5">
                        {group.tests.map((t) => {
                          const key = testKey(group.category, t.test_name);
                          const id = `test_${t.id}`;
                          return (
                            <div key={t.id} className="flex items-start gap-2.5">
                              <Checkbox
                                id={id}
                                className="mt-0.5"
                                checked={field.value.includes(key)}
                                onCheckedChange={(c) => toggle(key, c === true)}
                                onBlur={field.onBlur}
                              />
                              <Label htmlFor={id} className="cursor-pointer font-normal leading-snug">
                                {t.test_name}
                              </Label>
                            </div>
                          );
                        })}
                      </div>
                    </fieldset>
                  ))}
                </div>
              );
            }}
          />
        </CardContent>
      </Card>

      {/* Billing */}
      {showBilling && (
      <Card>
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <ReceiptIndianRupee className="h-4 w-4 text-primary" />
          <CardTitle className="flex-1">Billing &amp; Payment</CardTitle>
          <PaymentStatusBadge status={payment.payment_status} />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <FormField
              label="Total Amount (₹)"
              htmlFor="total_amount"
              required={!exempt}
              error={errors.total_amount?.message}
            >
              <AmountInput id="total_amount" aria-invalid={!!errors.total_amount} {...register('total_amount')} />
            </FormField>
            <FormField
              label="Amount Paid (₹)"
              htmlFor="paid_amount"
              error={errors.paid_amount?.message}
              hint={balanceDue > 0 && !noCounterPayment ? `Balance due ${formatRupees(balanceDue)}` : undefined}
            >
              <AmountInput id="paid_amount" aria-invalid={!!errors.paid_amount} {...register('paid_amount')} />
            </FormField>
            <FormField label="Payment Mode" htmlFor="payment_mode" error={errors.payment_mode?.message}>
              <NativeSelect id="payment_mode" aria-invalid={!!errors.payment_mode} {...register('payment_mode')}>
                <option value="">Select mode</option>
                {PAYMENT_MODES.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="Payment Status" hint={noCounterPayment ? 'Set by the payment mode' : 'Calculated from the amounts'}>
              <div className="flex h-9 items-center rounded-md border border-dashed bg-muted/40 px-3">
                <PaymentStatusBadge status={payment.payment_status} />
              </div>
            </FormField>
          </div>
          {exempt && (
            <FormField
              label={EXEMPT_REFERRAL_LABEL}
              htmlFor="exempt_referred_by"
              required
              error={errors.exempt_referred_by?.message}
              hint="Recorded on the bill and in the audit trail"
            >
              <Input
                id="exempt_referred_by"
                autoComplete="off"
                maxLength={255}
                placeholder={EXEMPT_REFERRAL_PLACEHOLDER}
                aria-invalid={!!errors.exempt_referred_by}
                {...register('exempt_referred_by')}
              />
            </FormField>
          )}
          <p className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            {paymentModeNote(payment.payment_mode)}
          </p>
          {readOnly && (
            <p className="text-xs text-muted-foreground">
              This requisition is locked. Settle the bill from the Requisitions directory using Update Payment.
            </p>
          )}
        </CardContent>
      </Card>
      )}

      <div className="sticky -bottom-6 z-20 -mx-6 -mb-6 border-t bg-white/95 backdrop-blur">
        <div className="flex items-center justify-end gap-3 px-6 py-3">
          {isEdit && (
            <Button asChild variant="ghost">
              <Link to="/worklist">Cancel</Link>
            </Button>
          )}
          <Button type="button" variant="outline" onClick={handleReset} disabled={isSubmitting || readOnly}>
            <RotateCcw /> {isEdit ? 'Undo Changes' : 'Clear'}
          </Button>
          <Button type="submit" disabled={isSubmitting || mastersLoading || readOnly}>
            {isSubmitting ? <Loader2 className="animate-spin" /> : <Save />}
            {isSubmitting ? 'Saving...' : isEdit ? 'Update Requisition' : 'Save Requisition'}
          </Button>
        </div>
      </div>
    </form>
  );
}
