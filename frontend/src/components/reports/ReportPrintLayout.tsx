import type { ReactNode } from 'react';
import { useSettings } from '@/context/SettingsContext';
import { formatAge, formatDateTime, formatDoctorName, formatSex } from '@/lib/format';
import type { MasterStaff, RequisitionDetail } from '@/types/report';

interface ReportPrintLayoutProps {
  title: string;
  requisition: RequisitionDetail;
  /** When the report was last saved; null until the first save. */
  reportingDateTime: string | null;
  preparedBy?: MasterStaff;
  reportedBy?: MasterStaff;
  children: ReactNode;
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <tr>
      <td className="w-[40%] py-[3px] pr-2 align-top font-bold">{label}</td>
      <td className="w-[4%] py-[3px] align-top">:</td>
      <td className="py-[3px] align-top">{value || '-'}</td>
    </tr>
  );
}

/** Printable A4 report on the department letterhead. Only visible when printing. */
export function ReportPrintLayout({
  title,
  requisition: r,
  reportingDateTime,
  preparedBy,
  reportedBy,
  children,
}: ReportPrintLayoutProps) {
  const { settings, printPrefs } = useSettings();

  return (
    <div className="print-report hidden font-serif text-[11pt] leading-snug text-black print:flex">
      <header className="border-b-[3px] border-double border-black pb-2 text-center">
        <p className="text-[12pt] font-bold">{settings.letterhead_line1}</p>
        <p className="mt-0.5 text-[16pt] font-bold tracking-wider">{settings.letterhead_line2}</p>
        <p className="mt-0.5 text-[13pt] font-bold tracking-wide">{settings.letterhead_line3}</p>
      </header>

      <h1 className="my-3 text-center text-[13pt] font-bold uppercase underline underline-offset-4">{title}</h1>

      <section className="grid grid-cols-2 gap-x-6 border border-black px-3 py-2 text-[10.5pt]">
        <table className="w-full border-collapse">
          <tbody>
            <InfoRow label="Patient Name" value={r.patient.name} />
            <InfoRow label="Age / Sex" value={`${formatAge(r.patient)} / ${formatSex(r.patient.sex)}`} />
            <InfoRow label="Hospital" value={r.hospital} />
            <InfoRow label="Ward / Unit" value={r.ward_unit} />
            <InfoRow label="OP / IP No" value={r.op_ip_no} />
            <InfoRow label="Consultant" value={r.consultant_doctor} />
          </tbody>
        </table>
        <table className="w-full border-collapse">
          <tbody>
            <InfoRow label="Lab No" value={r.lab_no} />
            <InfoRow label="Receipt No" value={r.receipt_no} />
            <InfoRow label="Sample" value={r.sample_nature} />
            <InfoRow label="Date of Receiving" value={formatDateTime(r.sample_received_datetime)} />
            <InfoRow label="Date of Reporting" value={formatDateTime(reportingDateTime ?? new Date().toISOString())} />
          </tbody>
        </table>
      </section>

      <section className="mt-4 flex-1">{children}</section>

      {printPrefs.show_end_of_report && <p className="mt-6 text-center text-[10pt] tracking-widest">*** End of Report ***</p>}

      <footer className="print-signatures mt-4 flex items-end justify-between gap-6">
        <div className="w-[44%] text-left">
          <div className="text-[11pt] font-bold">Prepared by: {preparedBy?.name ?? '\u00A0'}</div>
          <div className="text-[10pt]">(Lab Technician)</div>
          <div className="text-[10pt]">&nbsp;</div>
        </div>
        <div className="w-[48%] text-center">
          <div className="h-16" />
          <div className="border-t border-black pt-1 text-[11pt] font-bold">
            Reported by: {reportedBy ? formatDoctorName(reportedBy.name) : '\u00A0'}
          </div>
          <div className="text-[10pt] font-bold uppercase tracking-wide">Department of Microbiology</div>
          <div className="text-[10pt] font-bold uppercase tracking-wide">J.J.M. Medical College, Davangere</div>
        </div>
      </footer>
    </div>
  );
}
