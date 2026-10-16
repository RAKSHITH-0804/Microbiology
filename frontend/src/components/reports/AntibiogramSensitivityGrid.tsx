import { cn } from '@/lib/utils';
import type { SensitivityResult } from '@/types/report';

/**
 * Print geometry in CSS px (96 dpi) for A4 with the 12mm x 14mm @page margins in index.css,
 * measured from the rendered print layout.
 */
const PAGE_HEIGHT = 1031; // 273mm printable height
const BODY_WIDTH = 688; // 182mm printable width
const SAFETY = 16;
/** Letterhead, title and patient box down to the sensitivity pattern on page 1. */
const FIRST_PAGE_TOP = 395;
const DRAFT_BANNER = 45;
const REMARK_FIRST_LINE = 28;
const REMARK_EXTRA_LINE = 21;
/** "End of Report" plus the signature block (verified) or the unsigned-draft line. */
const FOOTER_VERIFIED = 190;
const FOOTER_DRAFT = 90;
const HEADING_FIRST = 28;
const HEADING_CONTINUED = 28;
const ORGANISM_HEADER = 36;
const THEAD = 40;
const GRID_GAP = 16;
const ROW_BORDER = 0.8;
/** Compact patient header repeated at the top of every continuation print page. */
const CONTINUATION_HEADER = 78;

/**
 * Row density by report size, so short lists spread out instead of sitting in stubby half-width tables.
 * Must match the `.antibiogram-table-*` cell rules in index.css.
 */
interface Density {
  className: string;
  paddingY: number;
  paddingX: number;
  fontSize: number;
  lineHeight: number;
}

const RELAXED: Density = { className: 'antibiogram-table-relaxed', paddingY: 9, paddingX: 12, fontSize: 11.5, lineHeight: 1.3 };
const MEDIUM: Density = { className: 'antibiogram-table-medium', paddingY: 8, paddingX: 10, fontSize: 11, lineHeight: 1.3 };
const COMPACT: Density = { className: 'antibiogram-table-compact', paddingY: 4, paddingX: 6, fontSize: 11, lineHeight: 1.25 };

/** Reports up to this size print as one full-width table. */
const RELAXED_MAX = 6;
const MEDIUM_MAX = 20;

const densityFor = (total: number) => (total <= RELAXED_MAX ? RELAXED : total <= MEDIUM_MAX ? MEDIUM : COMPACT);

const fontOf = (d: Density) => `${d.fontSize}px "Times New Roman", Times, serif`;

/** On a continuation page of a two-column report, this few leftover items print as one full-width table. */
const SINGLE_TABLE_MAX = 4;
/** Antibiotics carried to the signature page when they cannot all share a page with the signatures. */
const MIN_LAST_PAGE_ITEMS = 2;

/** Printed Result-column labels for each sensitivity selection. */
const RESULT_LABEL: Record<SensitivityResult, string> = {
  S: 'Sensitive',
  R: 'Resistant',
  MS: 'Mod. Sensitive',
};

/** Column widths (SL No, Name of Antibiotics, Result) — ~12% / 53% / 35%. */
const DUAL_WIDTHS = ['12%', '53%', '35%'];
const SINGLE_WIDTHS = ['12%', '53%', '35%'];

const REMARK_WIDTH = BODY_WIDTH * 0.69;
/** Name column share of table width; used for wrap-height estimates. */
const NAME_WIDTH_FRACTION = 0.53;

export interface SensitivityRow {
  antibiotic_name: string;
  sensitivity_result: SensitivityResult | null;
}

export interface OrganismPrintBlock {
  organism_name: string;
  results: SensitivityRow[];
}

/** Fields shown in the compact header on page 2+ of a multi-page antibiogram printout. */
export interface ContinuationPatientHeader {
  patientName: string;
  ageSex: string;
  labNo: string;
  receiptNo: string;
  sample: string;
  date: string;
}

let measureCtx: CanvasRenderingContext2D | null | undefined;

function textWidth(text: string, font: string): number {
  if (measureCtx === undefined) measureCtx = document.createElement('canvas').getContext('2d');
  if (!measureCtx) return text.length * 5.6;
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}

/** Lines `text` wraps to at `width`, breaking between words (and inside words longer than a line). */
function lineCount(text: string, width: number, font: string): number {
  let lines = 1;
  let current = 0;
  const space = textWidth(' ', font);
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const w = textWidth(word, font);
    if (current > 0 && current + space + w > width) {
      lines += 1;
      current = 0;
    }
    if (w > width) {
      lines += Math.floor(w / width);
      current = w % width;
    } else {
      current += (current > 0 ? space : 0) + w;
    }
  }
  return lines;
}

function rowHeight(name: string, dual: boolean, d: Density): number {
  const tableWidth = dual ? (BODY_WIDTH - GRID_GAP) / 2 : BODY_WIDTH;
  const nameWidth = tableWidth * NAME_WIDTH_FRACTION;
  const lines = lineCount(name, nameWidth - 2 * d.paddingX - 1, fontOf(d));
  return 2 * d.paddingY + lines * d.fontSize * d.lineHeight + ROW_BORDER;
}

const isSingleTable = (count: number, d: Density) => d === RELAXED || count <= SINGLE_TABLE_MAX;

/** Printed height of one page's sensitivity section, laid out as it will render. */
function sectionHeight(items: readonly SensitivityRow[], first: boolean, d: Density, withOrganismHeader: boolean): number {
  const heading = first ? HEADING_FIRST : HEADING_CONTINUED;
  const orgHeader = withOrganismHeader ? ORGANISM_HEADER : 0;
  if (isSingleTable(items.length, d)) {
    return orgHeader + heading + THEAD + items.reduce((h, r) => h + rowHeight(r.antibiotic_name, false, d), 0);
  }
  const mid = Math.ceil(items.length / 2);
  let rows = 0;
  for (let i = 0; i < mid; i++) {
    const right = items[mid + i];
    rows += Math.max(
      rowHeight(items[i].antibiotic_name, true, d),
      right ? rowHeight(right.antibiotic_name, true, d) : 0,
    );
  }
  return orgHeader + heading + THEAD + rows;
}

export interface PrintChrome {
  /** Unverified reports print the draft banner and a one-line footer instead of signatures. */
  draft: boolean;
  /** The "Antibiogram" remark printed above the pattern on page 1. */
  remark?: string;
}

function firstPageTop({ draft, remark }: PrintChrome): number {
  let top = FIRST_PAGE_TOP + (draft ? DRAFT_BANNER : 0);
  const text = remark?.trim();
  if (text) {
    const lines = text.split('\n').reduce((n, p) => n + lineCount(p, REMARK_WIDTH, '14.67px "Times New Roman", serif'), 0);
    top += REMARK_FIRST_LINE + (lines - 1) * REMARK_EXTRA_LINE;
  }
  return top;
}

/**
 * Splits one organism's antibiotics into printed pages by available height.
 * `startsOnContinuationPage` is true when this organism's first page is already a print page-break
 * (page 2+), so the compact patient header must be reserved in the budget.
 */
export function paginateAntibiotics(
  items: readonly SensitivityRow[],
  chrome: PrintChrome,
  opts?: { withOrganismHeader?: boolean; startsOnContinuationPage?: boolean },
): SensitivityRow[][] {
  const footer = chrome.draft ? FOOTER_DRAFT : FOOTER_VERIFIED;
  const density = densityFor(items.length);
  const withOrganismHeader = opts?.withOrganismHeader ?? false;
  const startsOnContinuationPage = opts?.startsOnContinuationPage ?? false;
  const pages: SensitivityRow[][] = [];
  let i = 0;
  while (i < items.length) {
    const first = pages.length === 0;
    const pageTop =
      first && !startsOnContinuationPage ? firstPageTop(chrome) : CONTINUATION_HEADER;
    const budget = PAGE_HEIGHT - SAFETY - pageTop;
    const fits = (count: number, reserve: number) =>
      sectionHeight(items.slice(i, i + count), first, density, withOrganismHeader && first) + reserve <= budget;

    let take = 1;
    while (i + take < items.length && fits(take + 1, 0)) take += 1;

    if (take > 1 && i + take === items.length && !fits(take, footer)) {
      let withFooter = take;
      while (withFooter > 1 && !fits(withFooter, footer)) withFooter -= 1;
      take = Math.max(withFooter, take - MIN_LAST_PAGE_ITEMS);
    }
    pages.push(items.slice(i, i + take));
    i += take;
  }
  return pages.length ? pages : [[]];
}

function resultLabel(result: SensitivityResult | null): string {
  return result ? RESULT_LABEL[result] : '';
}

function CompactPatientHeaderBox({ patient }: { patient: ContinuationPatientHeader }) {
  return (
    <div className="antibiogram-continuation-header">
      <table className="antibiogram-continuation-table">
        <tbody>
          <tr>
            <td>
              <span className="antibiogram-continuation-label">Patient Name</span>
              <span className="antibiogram-continuation-value">{patient.patientName || '-'}</span>
            </td>
            <td>
              <span className="antibiogram-continuation-label">Age / Sex</span>
              <span className="antibiogram-continuation-value">{patient.ageSex || '-'}</span>
            </td>
          </tr>
          <tr>
            <td>
              <span className="antibiogram-continuation-label">Lab No</span>
              <span className="antibiogram-continuation-value">{patient.labNo || '-'}</span>
            </td>
            <td>
              <span className="antibiogram-continuation-label">Receipt No</span>
              <span className="antibiogram-continuation-value">{patient.receiptNo || '-'}</span>
            </td>
          </tr>
          <tr>
            <td>
              <span className="antibiogram-continuation-label">Sample / Specimen</span>
              <span className="antibiogram-continuation-value">{patient.sample || '-'}</span>
            </td>
            <td>
              <span className="antibiogram-continuation-label">Date</span>
              <span className="antibiogram-continuation-value">{patient.date || '-'}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function SensitivityTable({
  rows,
  offset,
  dual,
  density,
}: {
  rows: SensitivityRow[];
  offset: number;
  dual: boolean;
  density: Density;
}) {
  return (
    <table className={cn('antibiogram-table', density.className, dual && 'antibiogram-table--dual')}>
      <colgroup>
        {(dual ? DUAL_WIDTHS : SINGLE_WIDTHS).map((w, i) => (
          <col key={i} style={{ width: w }} />
        ))}
      </colgroup>
      <thead>
        <tr>
          <th>SL No</th>
          <th className="antibiogram-name">Name of Antibiotics</th>
          <th className="antibiogram-result">Result</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={`${r.antibiotic_name}-${offset + i}`}>
            <td>{offset + i + 1}</td>
            <td className="antibiogram-name">{r.antibiotic_name}</td>
            <td className="antibiogram-result">{resultLabel(r.sensitivity_result)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function OrganismSensitivitySection({
  index,
  organismName,
  results,
  chrome,
  isFirstSection,
  continuationPatient,
}: {
  index: number;
  organismName: string;
  results: SensitivityRow[];
  chrome: PrintChrome;
  isFirstSection: boolean;
  continuationPatient?: ContinuationPatientHeader;
}) {
  const density = densityFor(results.length);
  const pages = paginateAntibiotics(results, isFirstSection ? chrome : { draft: chrome.draft }, {
    withOrganismHeader: true,
    startsOnContinuationPage: !isFirstSection,
  });
  let offset = 0;

  return (
    <div className="antibiogram-organism-section">
      {pages.map((page, p) => {
        const start = offset;
        offset += page.length;
        const mid = Math.ceil(page.length / 2);
        const showOrganismHeader = p === 0;
        const isContinuation = !isFirstSection || p > 0;
        return (
          <section
            key={`${index}-${start}`}
            className={cn('antibiogram-page', isContinuation && 'antibiogram-page--continued')}
          >
            {isContinuation && continuationPatient && <CompactPatientHeaderBox patient={continuationPatient} />}
            {showOrganismHeader && (
              <p className="antibiogram-organism-heading">
                {index}. Organism Isolated: <span className="italic">{organismName || '-'}</span>
              </p>
            )}
            <p className="antibiogram-heading">
              Antibiotic Sensitivity Pattern{p > 0 && ' (continued)'}
            </p>
            {page.length === 0 ? (
              <p className="text-[10pt] italic">No antibiotics recorded.</p>
            ) : isSingleTable(page.length, density) ? (
              <SensitivityTable rows={page} offset={start} dual={false} density={density} />
            ) : (
              <div className="antibiogram-grid">
                <SensitivityTable rows={page.slice(0, mid)} offset={start} dual density={density} />
                <SensitivityTable rows={page.slice(mid)} offset={start + mid} dual density={density} />
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

/**
 * Printed sensitivity pattern for one or more organisms. Each organism gets its own heading and
 * independent 3-column table(s). Density and 50/50 dual layout still apply per organism.
 */
export function AntibiogramSensitivityGrid({
  organisms,
  results,
  continuationPatient,
  ...chrome
}: {
  organisms?: OrganismPrintBlock[];
  /** @deprecated Prefer `organisms`; treated as a single unnamed block when organisms is omitted. */
  results?: SensitivityRow[];
  /** Compact patient details printed at the top of every page after page 1. */
  continuationPatient?: ContinuationPatientHeader;
} & PrintChrome) {
  const blocks: OrganismPrintBlock[] =
    organisms && organisms.length
      ? organisms
      : results
        ? [{ organism_name: '', results }]
        : [];

  if (blocks.length === 0) {
    return (
      <div className="antibiogram-print-body">
        <p className="antibiogram-heading">Antibiotic Sensitivity Pattern</p>
        <p className="text-[10pt] italic">No antibiotics recorded.</p>
      </div>
    );
  }

  // Single legacy block without an organism name keeps the previous heading-only layout.
  if (blocks.length === 1 && !blocks[0].organism_name.trim()) {
    const density = densityFor(blocks[0].results.length);
    const pages = paginateAntibiotics(blocks[0].results, chrome);
    let offset = 0;
    return (
      <div className="antibiogram-print-body">
        {pages.map((page, p) => {
          const start = offset;
          offset += page.length;
          const mid = Math.ceil(page.length / 2);
          return (
            <section key={start} className={cn('antibiogram-page', p > 0 && 'antibiogram-page--continued')}>
              {p > 0 && continuationPatient && <CompactPatientHeaderBox patient={continuationPatient} />}
              <p className="antibiogram-heading">Antibiotic Sensitivity Pattern{p > 0 && ' (continued)'}</p>
              {isSingleTable(page.length, density) ? (
                <SensitivityTable rows={page} offset={start} dual={false} density={density} />
              ) : (
                <div className="antibiogram-grid">
                  <SensitivityTable rows={page.slice(0, mid)} offset={start} dual density={density} />
                  <SensitivityTable rows={page.slice(mid)} offset={start + mid} dual density={density} />
                </div>
              )}
            </section>
          );
        })}
      </div>
    );
  }

  return (
    <div className="antibiogram-print-body">
      {blocks.map((block, i) => (
        <OrganismSensitivitySection
          key={`${i}-${block.organism_name}`}
          index={i + 1}
          organismName={block.organism_name}
          results={block.results}
          chrome={chrome}
          isFirstSection={i === 0}
          continuationPatient={continuationPatient}
        />
      ))}
    </div>
  );
}
