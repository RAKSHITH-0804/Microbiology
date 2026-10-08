import { UserRound } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatAge, formatDateTime, formatSex } from '@/lib/format';
import type { RequisitionDetail } from '@/types/report';
import { StatusPill } from './StatusPill';

function Item({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium text-slate-900" title={value ?? undefined}>
        {value || '-'}
      </dd>
    </div>
  );
}

interface RequisitionSummaryCardProps {
  requisition: RequisitionDetail;
  /** When this report was last saved; null until the first save. */
  reportingDateTime: string | null;
}

export function RequisitionSummaryCard({ requisition: r, reportingDateTime }: RequisitionSummaryCardProps) {
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <UserRound className="h-4 w-4 text-primary" />
        <CardTitle className="flex-1">Patient &amp; Sample</CardTitle>
        <StatusPill status={r.status} />
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
          <Item label="Patient Name" value={r.patient.name} />
          <Item label="Age / Sex" value={`${formatAge(r.patient)} / ${formatSex(r.patient.sex)}`} />
          <Item label="Lab No" value={r.lab_no} />
          <Item label="Receipt No" value={r.receipt_no} />
          <Item label="Hospital" value={r.hospital} />
          <Item label="Ward / Unit" value={r.ward_unit} />
          <Item label="Consultant Doctor" value={r.consultant_doctor} />
          <Item label="OP / IP No" value={r.op_ip_no} />
          <Item label="Nature of Sample" value={r.sample_nature} />
          <Item label="Site of Collection" value={r.site_of_collection} />
          <Item label="Date of Receiving" value={formatDateTime(r.sample_received_datetime)} />
          <Item
            label="Date of Reporting"
            value={reportingDateTime ? formatDateTime(reportingDateTime) : 'Not reported yet - set on save'}
          />
          <Item label="Clinical Diagnosis" value={r.clinical_diagnosis} />
        </dl>
      </CardContent>
    </Card>
  );
}
