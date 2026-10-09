import { format, parseISO } from 'date-fns';
import type { jsPDF } from 'jspdf';
import dejaVuBoldUrl from 'dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf?url';
import dejaVuRegularUrl from 'dejavu-fonts-ttf/ttf/DejaVuSans.ttf?url';
import { formatRupees, isNoCounterPayment, PAYMENT_STATUS_META, paymentModeLabel } from '@/features/requisitions/payment';
import type { PaymentTransaction } from '@/types/payments';
import { PAYMENT_MODES, type PaymentMode } from '@/types/requisition';

export const modeName = (mode: PaymentMode | 'NOT_RECORDED' | null) =>
  mode === 'NOT_RECORDED' || mode === null ? 'Not recorded' : (paymentModeLabel(mode) ?? mode);

export interface RevenueExport {
  rows: PaymentTransaction[];
  /** Matching transactions on the server; larger than rows.length when the export was capped. */
  total: number;
  startDate: string;
  endDate: string;
  /** Active filters besides the date range, e.g. "Mode: Cash". */
  filters: string[];
}

export type ExportFormat = 'csv' | 'xlsx' | 'pdf';

const INSTITUTION = 'J.J.M. Medical College - Department of Microbiology';
const REPORT_TITLE = 'Departmental Revenue Ledger Summary';
const AMOUNT_COLUMNS = [4, 5, 6];

const HEADERS = ['Lab No', 'Date', 'Patient Name', 'Phone', 'Total (₹)', 'Paid (₹)', 'Balance Due (₹)', 'Payment Mode', 'Status'];

const rowCells = (r: PaymentTransaction): (string | number)[] => [
  r.lab_no,
  format(new Date(r.created_at), 'dd-MM-yyyy HH:mm'),
  r.patient_name,
  r.phone ?? '',
  r.total_amount,
  r.paid_amount,
  r.balance_due,
  modeName(r.payment_mode),
  PAYMENT_STATUS_META[r.payment_status].label,
];

export const exportFileName = (e: RevenueExport, ext: ExportFormat) =>
  `Microbiology_Revenue_Report_${e.startDate}_${e.endDate}.${ext}`;

const rangeLabel = (e: RevenueExport) => {
  const day = (d: string) => format(parseISO(d), 'dd MMM yyyy');
  return e.startDate === e.endDate ? day(e.startDate) : `${day(e.startDate)} to ${day(e.endDate)}`;
};

/** Sums in paise so totals match the database to the rupee. */
const sumOf = (rows: PaymentTransaction[], key: 'total_amount' | 'paid_amount' | 'balance_due') =>
  rows.reduce((acc, r) => acc + Math.round(r[key] * 100), 0) / 100;

function totalsOf(rows: PaymentTransaction[]) {
  return { billed: sumOf(rows, 'total_amount'), collected: sumOf(rows, 'paid_amount'), due: sumOf(rows, 'balance_due') };
}

/** Collected per mode; hospital credit and exempt bills are never collected, so their billed amount is shown. */
function modeBreakdown(rows: PaymentTransaction[]) {
  const modes: (PaymentMode | null)[] = [...PAYMENT_MODES.map((m) => m.value), null];
  return modes.map((mode) => {
    const inMode = rows.filter((r) => r.payment_mode === mode);
    const billed = isNoCounterPayment(mode);
    return {
      label: billed ? `${modeName(mode)} (billed)` : modeName(mode),
      count: inMode.length,
      amount: sumOf(inMode, billed ? 'total_amount' : 'paid_amount'),
    };
  });
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Spreadsheet apps evaluate text starting with these characters as a formula. */
const FORMULA_START = /^[=+\-@\t\r]/;

function csvCell(v: string | number) {
  if (typeof v === 'number') return v.toFixed(2);
  const s = FORMULA_START.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCsv(e: RevenueExport) {
  const lines = [HEADERS, ...e.rows.map(rowCells)].map((cells) => cells.map(csvCell).join(','));
  // The BOM makes Excel read the file as UTF-8 (patient names may contain non-ASCII text).
  saveBlob(new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), exportFileName(e, 'csv'));
}

export async function downloadXlsx(e: RevenueExport) {
  const mod = await import('exceljs');
  // exceljs ships a CommonJS browser bundle; depending on bundler interop its API sits on `default`.
  const { Workbook } = mod.default ?? mod;

  const wb = new Workbook();
  wb.creator = INSTITUTION;
  wb.created = new Date();
  const ws = wb.addWorksheet('Revenue Ledger', { views: [{ state: 'frozen', ySplit: 1 }] });
  const widths = [16, 18, 28, 14, 14, 14, 16, 18, 12];
  ws.columns = HEADERS.map((header, i) => ({
    header,
    width: widths[i],
    ...(AMOUNT_COLUMNS.includes(i) && { style: { numFmt: '#,##0.00' } }),
  }));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };

  // Strings are written as plain text cells, so patient-entered values are never evaluated as formulas.
  for (const r of e.rows) ws.addRow(rowCells(r));

  const t = totalsOf(e.rows);
  const totalRow = ws.addRow(['Total', '', `${e.rows.length} transaction(s)`, '', t.billed, t.collected, t.due]);
  totalRow.font = { bold: true };
  totalRow.border = { top: { style: 'thin' } };

  const buffer = await wb.xlsx.writeBuffer();
  saveBlob(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    exportFileName(e, 'xlsx'),
  );
}

const amount = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** The standard PDF fonts have no rupee glyph (U+20B9); DejaVu Sans does. */
const PDF_FONT = 'DejaVuSans';
let pdfFonts: Promise<[string, string]> | null = null;

async function fontBase64(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Could not load the PDF font');
  const bytes = new Uint8Array(await res.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

async function registerPdfFonts(doc: jsPDF) {
  pdfFonts ??= Promise.all([fontBase64(dejaVuRegularUrl), fontBase64(dejaVuBoldUrl)]).catch((err) => {
    pdfFonts = null;
    throw err;
  });
  const [regular, bold] = await pdfFonts;
  doc.addFileToVFS('DejaVuSans.ttf', regular);
  doc.addFont('DejaVuSans.ttf', PDF_FONT, 'normal');
  doc.addFileToVFS('DejaVuSans-Bold.ttf', bold);
  doc.addFont('DejaVuSans-Bold.ttf', PDF_FONT, 'bold');
}

interface PdfCard {
  label: string;
  value: string;
  sub: string;
  accent: [number, number, number];
}

export async function downloadPdf(e: RevenueExport) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  await registerPdfFonts(doc);
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const center = pageW / 2;

  doc.setFont(PDF_FONT, 'bold');
  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42);
  doc.text(INSTITUTION, center, 15, { align: 'center' });
  doc.setFontSize(12);
  doc.setTextColor(37, 99, 235);
  doc.text(REPORT_TITLE, center, 22, { align: 'center' });
  doc.setFont(PDF_FONT, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(`Period: ${rangeLabel(e)}    Generated: ${format(new Date(), 'dd MMM yyyy, hh:mm a')}`, center, 28, {
    align: 'center',
  });
  let y = 32;
  if (e.filters.length) {
    doc.text(`Filters: ${e.filters.join('; ')}`, center, y, { align: 'center' });
    y += 4;
  }
  if (e.total > e.rows.length) {
    doc.setTextColor(180, 83, 9);
    doc.text(`Showing the latest ${e.rows.length} of ${e.total} matching transactions.`, center, y, { align: 'center' });
    y += 4;
  }

  const card = (x: number, top: number, w: number, { label, value, sub, accent }: PdfCard) => {
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, top, w, 17, 2, 2, 'FD');
    doc.setFillColor(...accent);
    doc.rect(x, top, 1.4, 17, 'F');
    doc.setFont(PDF_FONT, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(label.toUpperCase(), x + 4, top + 5);
    doc.setFont(PDF_FONT, 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(15, 23, 42);
    doc.text(value, x + 4, top + 11);
    doc.setFont(PDF_FONT, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(sub, x + 4, top + 15);
  };
  const cardRow = (top: number, cards: PdfCard[]) => {
    const gap = 4;
    const w = (pageW - 2 * margin - gap * (cards.length - 1)) / cards.length;
    cards.forEach((c, i) => card(margin + i * (w + gap), top, w, c));
  };

  const t = totalsOf(e.rows);
  y += 2;
  cardRow(y, [
    { label: 'Total Collection', value: formatRupees(t.collected), sub: `${e.rows.length} transaction(s)`, accent: [16, 185, 129] },
    { label: 'Total Billed', value: formatRupees(t.billed), sub: 'Including hospital credit', accent: [37, 99, 235] },
    { label: 'Balance Due', value: formatRupees(t.due), sub: 'Outstanding in this period', accent: [245, 158, 11] },
  ]);
  y += 20;
  cardRow(
    y,
    modeBreakdown(e.rows).map((m) => ({
      label: m.label,
      value: formatRupees(m.amount),
      sub: `${m.count} requisition(s)`,
      accent: [139, 92, 246],
    })),
  );
  y += 22;

  autoTable(doc, {
    startY: y,
    head: [HEADERS],
    body: e.rows.map((r) => rowCells(r).map((c) => (typeof c === 'number' ? amount(c) : c))),
    foot: [['Total', '', `${e.rows.length} transaction(s)`, '', amount(t.billed), amount(t.collected), amount(t.due), '', '']],
    showFoot: 'lastPage',
    theme: 'grid',
    margin: { left: margin, right: margin, bottom: 14 },
    styles: { font: PDF_FONT, fontSize: 8, cellPadding: 1.6, textColor: [30, 41, 59], lineColor: [226, 232, 240] },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: Object.fromEntries(AMOUNT_COLUMNS.map((i) => [i, { halign: 'right' }])),
  });

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont(PDF_FONT, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`${INSTITUTION} - ${REPORT_TITLE}`, margin, pageH - 7);
    doc.text(`Page ${i} of ${pages}`, pageW - margin, pageH - 7, { align: 'right' });
  }

  doc.save(exportFileName(e, 'pdf'));
}
