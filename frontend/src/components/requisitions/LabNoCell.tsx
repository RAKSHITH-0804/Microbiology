import { Badge } from '@/components/ui/badge';

/** Lab No with receipt fallback for lists before a lab number is assigned. */
export function LabNoCell({
  labNo,
  receiptNo,
  className,
}: {
  labNo: string | null | undefined;
  receiptNo?: string | null;
  className?: string;
}) {
  if (labNo) {
    return (
      <div className={className}>
        <p className="break-words font-mono font-semibold text-slate-900">{labNo}</p>
        {receiptNo ? <p className="mt-0.5 break-words text-xs text-slate-500">Receipt {receiptNo}</p> : null}
      </div>
    );
  }

  return (
    <div className={className}>
      <Badge tone="amber">Pending Lab No</Badge>
      {receiptNo ? (
        <p className="mt-1 break-words font-mono text-xs font-medium text-slate-700">Receipt {receiptNo}</p>
      ) : (
        <p className="mt-1 text-xs text-slate-500">No receipt on file</p>
      )}
    </div>
  );
}

/** Compact inline label for tables that only show one line. */
export function labNoLabel(labNo: string | null | undefined, receiptNo?: string | null): string {
  if (labNo) return labNo;
  if (receiptNo) return `Receipt ${receiptNo}`;
  return 'Pending Lab No';
}
