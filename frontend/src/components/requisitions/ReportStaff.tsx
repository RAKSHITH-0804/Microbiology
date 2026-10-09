import { Microscope, Stethoscope } from 'lucide-react';

/** Lab technician who prepared and doctor who reported a requisition's report(s). */
export function ReportStaff({ preparedBy, reportedBy }: { preparedBy: string | null; reportedBy: string | null }) {
  if (!preparedBy && !reportedBy) return <span className="text-xs text-slate-400">No report yet</span>;
  return (
    <div className="space-y-1 text-xs leading-snug">
      <p className="flex items-start gap-1.5" title="Prepared by (lab technician)">
        <Microscope className="mt-px h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
        <span>
          <span className="text-slate-500">Prepared: </span>
          <span className="font-medium text-slate-800">{preparedBy ?? '-'}</span>
        </span>
      </p>
      <p className="flex items-start gap-1.5" title="Reported by (doctor)">
        <Stethoscope className="mt-px h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
        <span>
          <span className="text-slate-500">Reported: </span>
          <span className="font-medium text-slate-800">{reportedBy ?? '-'}</span>
        </span>
      </p>
    </div>
  );
}
