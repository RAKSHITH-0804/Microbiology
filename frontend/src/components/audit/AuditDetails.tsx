import type { ReactNode } from 'react';
import { ArrowRight, Globe, ListChecks, Monitor } from 'lucide-react';
import { formatRupees, PAYMENT_STATUS_META, paymentModeLabel } from '@/features/requisitions/payment';
import { MODULE_LABELS, ROLE_LABELS, type ModuleKey, type UserRole } from '@/types/auth';
import type { PaymentMode, PaymentStatus } from '@/types/requisition';

type Details = Record<string, unknown>;

const KEY_LABELS: Record<string, string> = {
  ip: 'IP Address',
  userAgent: 'Browser / Device',
  lab_no: 'Lab No',
  requisition_id: 'Requisition ID',
  patient_id: 'Patient ID',
  staff_id: 'Staff ID',
  module_key: 'Module',
  rows_exported: 'Rows Exported',
  total_matching: 'Matching Rows',
  verified_by_staff_id: 'Verified By (Staff ID)',
  reported_by: 'Reported By (Staff ID)',
  authored_by: 'Entered By',
  antibiotics: 'Antibiotics Tested',
  tests: 'Investigations',
  tests_added: 'Investigations Added',
  tests_removed: 'Investigations Removed',
  first_login: 'First Login',
  new_staff: 'New Staff Record',
  patient_created: 'New Patient Record',
  patient_reassigned: 'Patient Reassigned',
  requested_by_user: 'Requested by User',
  default_password: 'Default Password Used',
  staff_deleted: 'Staff Record Removed',
  start_date: 'From',
  end_date: 'To',
  granted: 'Modules Granted',
  revoked: 'Modules Revoked',
  scope: 'Applied To',
};

/** Keys whose values are module keys (or lists of them). */
const MODULE_VALUE_KEYS = new Set(['module_key', 'granted', 'revoked']);

/** Rendered in their own sections, or folded into the change list. */
const SEPARATE_KEYS = new Set(['ip', 'userAgent', 'changes', 'from', 'to']);

function labelFor(key: string): string {
  if (KEY_LABELS[key]) return KEY_LABELS[key];
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[_\s]+/)
    .map((w) => (w.toLowerCase() === 'id' ? 'ID' : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

/** "REPORT_ENTERED" -> "Report Entered". */
const titleCase = (v: string) => v.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function formatValue(key: string, value: unknown, booleans: [string, string] = ['Yes', 'No']): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? booleans[0] : booleans[1];
  if (Array.isArray(value)) return value.length ? value.map((v) => formatValue(key, v)).join(', ') : 'None';
  if (typeof value === 'number') return key.endsWith('_amount') ? formatRupees(value) : value.toLocaleString('en-IN');
  if (typeof value === 'object') {
    const o = value as Details;
    if (typeof o.username === 'string') return o.role ? `${o.username} (${ROLE_LABELS[o.role as UserRole] ?? o.role})` : o.username;
    if (typeof o.test_name === 'string') return o.test_category ? `${o.test_name} (${String(o.test_category)})` : o.test_name;
    return Object.entries(o)
      .map(([k, v]) => `${labelFor(k)}: ${formatValue(k, v)}`)
      .join(', ');
  }
  const text = String(value);
  if (key === 'payment_status') return PAYMENT_STATUS_META[text as PaymentStatus]?.label ?? text;
  if (key === 'payment_mode') return paymentModeLabel(text as PaymentMode) ?? text;
  if (key === 'role') return ROLE_LABELS[text as UserRole] ?? text;
  if (MODULE_VALUE_KEYS.has(key)) return MODULE_LABELS[text as ModuleKey] ?? text;
  if (key === 'scope' && text === 'all_users') return 'Every staff account';
  if (key === 'status' || key.endsWith('_status')) return titleCase(text);
  if (key.endsWith('_amount') && text !== '' && !Number.isNaN(Number(text))) return formatRupees(Number(text));
  return text;
}

/** "Chrome 154 / Windows" from a raw User-Agent header. */
function describeUserAgent(ua: string): string {
  const version = (re: RegExp) => re.exec(ua)?.[1];
  const browser =
    (version(/Edg\/(\d+)/) && `Edge ${version(/Edg\/(\d+)/)}`) ||
    (version(/OPR\/(\d+)/) && `Opera ${version(/OPR\/(\d+)/)}`) ||
    (version(/Firefox\/(\d+)/) && `Firefox ${version(/Firefox\/(\d+)/)}`) ||
    (version(/Chrome\/(\d+)/) && `Chrome ${version(/Chrome\/(\d+)/)}`) ||
    (version(/Version\/(\d+).*Safari/) && `Safari ${version(/Version\/(\d+).*Safari/)}`) ||
    'Unknown browser';
  const os = /Windows NT/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad/.test(ua)
        ? 'iOS'
        : /Mac OS X/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'Unknown device';
  return `${browser} / ${os}`;
}

const LOCAL_IPS = new Set(['::1', '127.0.0.1', '::ffff:127.0.0.1']);

interface Change {
  label: string;
  before: string;
  after: string;
}

function collectChanges(d: Details): Change[] {
  const changes: Change[] = [];
  if (d.changes && typeof d.changes === 'object' && !Array.isArray(d.changes)) {
    for (const [key, change] of Object.entries(d.changes as Details)) {
      const c = (change ?? {}) as { from?: unknown; to?: unknown };
      changes.push({ label: labelFor(key), before: formatValue(key, c.from), after: formatValue(key, c.to) });
    }
  }
  // Permission switches log the old and new state at the top level.
  if ('from' in d || 'to' in d) {
    const onOff: [string, string] = ['Enabled', 'Disabled'];
    changes.push({ label: d.module_key ? 'Access' : 'Value', before: formatValue('', d.from, onOff), after: formatValue('', d.to, onOff) });
  }
  return changes;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-slate-900">{children}</dd>
    </div>
  );
}

function SectionTitle({ icon: Icon, children }: { icon: typeof Globe; children: ReactNode }) {
  return (
    <h4 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
      <Icon className="h-3.5 w-3.5" /> {children}
    </h4>
  );
}

/** Readable breakdown of an audit entry's metadata: what changed, the other recorded facts and the session. */
export function AuditDetails({ details }: { details: Details | null }) {
  if (!details || Object.keys(details).length === 0) {
    return <p className="text-sm text-slate-500">No additional details recorded.</p>;
  }

  const changes = collectChanges(details);
  const hasChangeMap = !!details.changes && typeof details.changes === 'object';
  const fields = Object.entries(details).filter(
    ([k, v]) => !SEPARATE_KEYS.has(k) && v !== null && v !== undefined && v !== '',
  );
  const ip = typeof details.ip === 'string' ? details.ip : null;
  const ua = typeof details.userAgent === 'string' ? details.userAgent : null;
  const hasSession = !!(ip || ua);
  const hasAction = changes.length > 0 || hasChangeMap || fields.length > 0;

  return (
    <div className={hasAction && hasSession ? 'grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]' : undefined}>
      {hasAction && (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <SectionTitle icon={ListChecks}>Action Details</SectionTitle>
          {changes.length > 0 ? (
            <ul className="mb-4 space-y-1.5">
              {changes.map((c) => (
                <li key={c.label} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                  <span className="min-w-[9rem] font-medium text-slate-700">{c.label}</span>
                  <span className="text-slate-500">
                    Before: <span className="font-medium text-slate-600">{c.before}</span>
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                  <span className="text-slate-500">
                    After: <span className="font-semibold text-slate-900">{c.after}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            hasChangeMap && <p className="mb-4 text-sm text-slate-500">Saved without changing any field.</p>
          )}
          {fields.length > 0 && (
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
              {fields.map(([key, value]) => (
                <Field key={key} label={labelFor(key)}>
                  {formatValue(key, value)}
                </Field>
              ))}
            </dl>
          )}
        </section>
      )}
      {hasSession && (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <SectionTitle icon={Globe}>Session</SectionTitle>
          <dl className="space-y-3">
            {ip && (
              <Field label="IP Address">
                <span className="font-mono">{ip}</span>
                {LOCAL_IPS.has(ip) && <span className="ml-1.5 text-xs text-slate-500">(this computer)</span>}
              </Field>
            )}
            {ua && (
              <Field label="Browser / Device">
                <span className="inline-flex items-center gap-1.5" title={ua}>
                  <Monitor className="h-3.5 w-3.5 text-slate-400" /> {describeUserAgent(ua)}
                </span>
              </Field>
            )}
          </dl>
        </section>
      )}
    </div>
  );
}
