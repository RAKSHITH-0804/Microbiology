import { Phone } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatAge, formatSex } from '@/lib/format';
import type { PendingRequisition } from '@/types/requisition';

export function PatientDetails({ patient }: { patient: PendingRequisition['patient'] }) {
  return (
    <div className="min-w-0">
      <p className="break-words font-medium text-slate-900">{patient.name}</p>
      <p className="text-xs text-slate-500">
        {formatAge(patient)} / {formatSex(patient.sex)}
      </p>
      {patient.phone && (
        <p className="mt-0.5 flex items-center gap-1 text-xs tabular-nums text-slate-500">
          <Phone className="h-3 w-3 shrink-0" /> {patient.phone}
        </p>
      )}
    </div>
  );
}

export function SampleBadge({ sample }: { sample: string | null }) {
  if (!sample) return <span className="text-slate-400">-</span>;
  return (
    <Badge tone="blue" className="max-w-full whitespace-normal break-words rounded-md text-left leading-snug" title={sample}>
      {sample}
    </Badge>
  );
}
