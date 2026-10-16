import type { ReactNode } from 'react';
import { MicroscopeWatermark } from '@/components/reports/MicroscopeWatermark';
import { DRAFT_PRINT_TITLE } from '@/components/reports/ReportPageFrame';
import { useSettings } from '@/context/SettingsContext';
import { formatAge, formatDateTime, formatDoctorDesignation, formatDoctorName, formatSex } from '@/lib/format';
import type { MasterStaff, RequisitionDetail } from '@/types/report';

interface ReportPrintLayoutProps {
  title: string;
  requisition: RequisitionDetail;
  /** When the report was last saved; null until the first save. */
  reportingDateTime: string | null;
  /** Unverified report: watermarked, and no signatory names or signatures are printed. */
  draft: boolean;
  preparedBy?: MasterStaff;
  reportedBy?: MasterStaff;
  children: ReactNode;
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <tr>
      <td className="print-patient-label">{label}</td>
      <td className="print-patient-sep">:</td>
      <td className="print-patient-value">{value || '-'}</td>
    </tr>
  );
}

/** Printable A4 report on the department letterhead. Only visible when printing. */
export function ReportPrintLayout({
  title,
  requisition: r,
  reportingDateTime,
  draft,
  preparedBy,
  reportedBy,
  children,
}: ReportPrintLayoutProps) {
  const { settings, printPrefs } = useSettings();

  return (
    <div className="report-print-container print-report relative hidden font-serif text-[8.5pt] leading-snug text-black print:flex">
      {draft ? (
        // position: fixed repeats the watermark on every printed page.
        <div aria-hidden className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center">
          <p className="-rotate-[35deg] font-sans text-[96pt] font-bold uppercase tracking-[0.15em] text-black/[0.09]">
            Draft
          </p>
        </div>
      ) : (
        <MicroscopeWatermark />
      )}

      <header className="print-letterhead border-b-[2px] border-double border-black text-center">
        <p className="print-letterhead-line1 font-bold">{settings.letterhead_line1}</p>
        <p className="print-letterhead-line2 font-bold tracking-wider">{settings.letterhead_line2}</p>
        <p className="print-letterhead-line3 font-bold tracking-wide">{settings.letterhead_line3}</p>
      </header>

      {draft && (
        <p className="print-draft-banner border-2 border-black text-center font-sans font-bold tracking-wide">
          {DRAFT_PRINT_TITLE}
        </p>
      )}

      <h1 className="print-report-title text-center font-bold uppercase underline underline-offset-2">{title}</h1>

      <section className="print-patient-box grid grid-cols-3 border border-black">
        <table className="print-patient-col w-full border-collapse">
          <tbody>
            <InfoRow label="Patient Name" value={r.patient.name} />
            <InfoRow label="Age / Sex" value={`${formatAge(r.patient)} / ${formatSex(r.patient.sex)}`} />
            <InfoRow label="Hospital" value={r.hospital} />
            <InfoRow label="Ward / Unit" value={r.ward_unit} />
          </tbody>
        </table>
        <table className="print-patient-col w-full border-collapse">
          <tbody>
            <InfoRow label="Lab No" value={r.lab_no} />
            <InfoRow label="Receipt No" value={r.receipt_no} />
            <InfoRow label="OP / IP No" value={r.op_ip_no} />
            <InfoRow label="Consultant Dr." value={r.consultant_doctor} />
          </tbody>
        </table>
        <table className="print-patient-col w-full border-collapse">
          <tbody>
            <InfoRow label="Sample / Specimen" value={r.sample_nature} />
            <InfoRow label="Date of Receiving" value={formatDateTime(r.sample_received_datetime)} />
            <InfoRow label="Date of Reporting" value={formatDateTime(reportingDateTime ?? new Date().toISOString())} />
          </tbody>
        </table>
      </section>

      <section className="print-report-body">{children}</section>

      {printPrefs.show_end_of_report && (
        <p className="print-end-of-report text-center tracking-widest">*** End of Report ***</p>
      )}

      {/* Fixed footer repeats on every printed page (A5). */}
      {draft ? (
        <footer className="print-signatures print-signatures--running print-signatures--draft border-t border-black text-center italic">
          Unverified draft - not signed. Valid only after verification by the reporting doctor.
        </footer>
      ) : (
        <footer className="print-signatures print-signatures--running flex items-end justify-between gap-4 border-t border-black">
          <div className="w-[44%] text-left">
            <div className="print-sig-name">Prepared by: {preparedBy?.name ?? '\u00A0'}</div>
            <div className="print-sig-role">(Lab Technician)</div>
          </div>
          <div className="w-[48%] text-center">
            <div className="print-sig-space" />
            <div className="print-sig-name border-t border-black">
              Reported by: {reportedBy ? formatDoctorName(reportedBy.name) : '\u00A0'}
            </div>
            <div className="print-sig-dept uppercase tracking-wide">
              {formatDoctorDesignation(reportedBy?.designation)}
            </div>
            <div className="print-sig-dept uppercase tracking-wide">Department of Microbiology</div>
            <div className="print-sig-dept uppercase tracking-wide">J.J.M. Medical College, Davangere</div>
          </div>
        </footer>
      )}
    </div>
  );
}
