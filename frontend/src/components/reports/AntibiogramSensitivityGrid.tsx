import { cn } from '@/lib/utils';
import type { SensitivityResult } from '@/types/report';

/**
 * Print geometry in CSS px (96 dpi) for A5 portrait with the 6mm × 8mm @page margins in index.css.
 * A5 printable area ≈ 132mm × 198mm. Signature footer is reserved on every page.
 */
const PAGE_HEIGHT = 748; // 198mm printable height
const BODY_WIDTH = 499; // 132mm printable width
const SAFETY = 12;
/** Letterhead, title, 3-col patient box and specimen meta down to the sensitivity pattern on page 1. */
const FIRST_PAGE_TOP = 185;
const DRAFT_BANNER = 28;
const REMARK_FIRST_LINE = 18;
const REMARK_EXTRA_LINE = 12;
/** Running signature block reserved at the bottom of every printed page. */
const FOOTER_VERIFIED = 88;
const FOOTER_DRAFT = 44;
const HEADING_FIRST = 18;
const HEADING_CONTINUED = 18;
const ORGANISM_HEADER = 22;
const THEAD = 24;
const GRID_GAP = 8;
const ROW_BORDER = 0.8;
/** Compact patient header repeated at the top of every continuation print page. */
const CONTINUATION_HEADER = 56;

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

const RELAXED: Density = { className: 'antibiogram-table-relaxed', paddingY: 3, paddingX: 6, fontSize: 12, lineHeight: 1.3 };
const MEDIUM: Density = { className: 'antibiogram-table-medium', paddingY: 2, paddingX: 4, fontSize: 11.33, lineHeight: 1.3 };
const COMPACT: Density = { className: 'antibiogram-table-compact', paddingY: 2, paddingX: 4, fontSize: 11.33, lineHeight: 1.3 };

/** Reports up to this size print as one full-width table. */
const RELAXED_MAX = 6;
const MEDIUM_MAX = 20;

const densityFor = (total: number) => (total <= RELAXED_MAX ? RELAXED : total <= MEDIUM_MAX ? MEDIUM : COMPACT);

const PRINT_FONT = 'Arial, "Helvetica Neue", Helvetica, "Segoe UI", sans-serif';
const fontOf = (d: Density) => `${d.fontSize}px ${PRINT_FONT}`;

/** On a continuation page of a two-column report, this few leftover items print as one full-width table. */
const SINGLE_TABLE_MAX = 4;

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
  if (items.length === 0) return orgHeader + heading + 16;
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
    const lines = text.split('\n').reduce((n, p) => n + lineCount(p, REMARK_WIDTH, `11.33px ${PRINT_FONT}`), 0);
    top += REMARK_FIRST_LINE + (lines - 1) * REMARK_EXTRA_LINE;
  }
  return top;
}

function footerReserve(draft: boolean) {
  return draft ? FOOTER_DRAFT : FOOTER_VERIFIED;
}

function contentBudget(pageTop: number, draft: boolean) {
  return PAGE_HEIGHT - SAFETY - footerReserve(draft) - pageTop;
}

/**
 * Splits one organism's antibiotics into printed pages by available height (legacy single-block path).
 * Signature footer space is reserved on every page.
 */
export function paginateAntibiotics(
  items: readonly SensitivityRow[],
  chrome: PrintChrome,
  opts?: { withOrganismHeader?: boolean; startsOnContinuationPage?: boolean },
): SensitivityRow[][] {
  const density = densityFor(items.length);
  const withOrganismHeader = opts?.withOrganismHeader ?? false;
  const startsOnContinuationPage = opts?.startsOnContinuationPage ?? false;
  const pages: SensitivityRow[][] = [];
  let i = 0;
  while (i < items.length) {
    const first = pages.length === 0;
    const pageTop =
      first && !startsOnContinuationPage ? firstPageTop(chrome) : CONTINUATION_HEADER;
    const budget = contentBudget(pageTop, chrome.draft);
    const fits = (count: number) =>
      sectionHeight(items.slice(i, i + count), first, density, withOrganismHeader && first) <= budget;

    let take = 1;
    while (i + take < items.length && fits(take + 1)) take += 1;
    pages.push(items.slice(i, i + take));
    i += take;
  }
  return pages.length ? pages : [[]];
}

interface PrintChunk {
  key: string;
  organismIndex: number;
  organismName: string;
  rows: SensitivityRow[];
  offset: number;
  density: Density;
  showOrganismHeader: boolean;
  patternContinued: boolean;
  /** True when this chunk starts a new physical page. */
  forcePageBreak: boolean;
  /** Whole organism fits on one page — CSS keeps the block unbroken. */
  atomic: boolean;
}

function maxFit(
  items: readonly SensitivityRow[],
  start: number,
  budget: number,
  density: Density,
  withOrganismHeader: boolean,
): number {
  if (start >= items.length) return 0;
  let take = 1;
  while (start + take < items.length) {
    const h = sectionHeight(items.slice(start, start + take + 1), true, density, withOrganismHeader);
    if (h > budget) break;
    take += 1;
  }
  while (
    take > 1 &&
    sectionHeight(items.slice(start, start + take), true, density, withOrganismHeader) > budget
  ) {
    take -= 1;
  }
  return take;
}

/**
 * Packs organisms so each complete block stays on one page when possible.
 * If the next organism cannot fit entirely in the remaining space, it starts on a new page.
 * Only organisms taller than a full page are split across pages.
 */
function paginateOrganisms(blocks: OrganismPrintBlock[], chrome: PrintChrome): PrintChunk[] {
  const chunks: PrintChunk[] = [];
  let remaining = contentBudget(firstPageTop(chrome), chrome.draft);
  const fullContinuation = contentBudget(CONTINUATION_HEADER, chrome.draft);

  blocks.forEach((block, bi) => {
    const density = densityFor(block.results.length);
    const items = block.results;
    const fullHeight = sectionHeight(items, true, density, true);

    // Entire organism fits on the current page — keep it atomic.
    if (fullHeight <= remaining) {
      chunks.push({
        key: `${bi}-0`,
        organismIndex: bi + 1,
        organismName: block.organism_name,
        rows: items,
        offset: 0,
        density,
        showOrganismHeader: true,
        patternContinued: false,
        forcePageBreak: false,
        atomic: true,
      });
      remaining -= fullHeight;
      return;
    }

    // Fits on a clean continuation page but not in the leftover space → new page, still atomic.
    if (fullHeight <= fullContinuation) {
      remaining = fullContinuation;
      chunks.push({
        key: `${bi}-0`,
        organismIndex: bi + 1,
        organismName: block.organism_name,
        rows: items,
        offset: 0,
        density,
        showOrganismHeader: true,
        patternContinued: false,
        forcePageBreak: chunks.length > 0,
        atomic: true,
      });
      remaining -= fullHeight;
      return;
    }

    // Taller than one page — split antibiotics; first slice may need a page break.
    let i = 0;
    let organismChunk = 0;
    let offset = 0;
    while (i < items.length) {
      const withOrganismHeader = organismChunk === 0;
      let forcePageBreak = false;
      const minHeight = sectionHeight(items.slice(i, i + 1), true, density, withOrganismHeader);

      if (organismChunk > 0 || (chunks.length > 0 && remaining < minHeight)) {
        remaining = fullContinuation;
        forcePageBreak = organismChunk > 0 || chunks.length > 0;
      }

      const take = Math.max(1, maxFit(items, i, remaining, density, withOrganismHeader));
      const page = items.slice(i, i + take);
      const height = sectionHeight(page, true, density, withOrganismHeader);

      chunks.push({
        key: `${bi}-${offset}`,
        organismIndex: bi + 1,
        organismName: block.organism_name,
        rows: page,
        offset,
        density,
        showOrganismHeader: withOrganismHeader,
        patternContinued: organismChunk > 0,
        forcePageBreak,
        atomic: false,
      });

      remaining -= height;
      if (remaining < 0) remaining = 0;
      offset += page.length;
      i += take;
      organismChunk += 1;
    }
  });

  return chunks;
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

function ChunkSection({
  chunk,
  continuationPatient,
}: {
  chunk: PrintChunk;
  continuationPatient?: ContinuationPatientHeader;
}) {
  const mid = Math.ceil(chunk.rows.length / 2);
  return (
    <section
      className={cn(
        'antibiogram-page',
        'antibiogram-organism-block',
        chunk.atomic && 'antibiogram-organism-block--atomic',
        chunk.forcePageBreak && 'antibiogram-page--continued',
      )}
    >
      {chunk.forcePageBreak && continuationPatient && <CompactPatientHeaderBox patient={continuationPatient} />}
      {chunk.showOrganismHeader && chunk.organismName.trim() && (
        <p className="antibiogram-organism-heading">
          {chunk.organismIndex}. Organism Isolated: <span className="italic">{chunk.organismName || '-'}</span>
        </p>
      )}
      <p className="antibiogram-heading">
        Antibiotic Sensitivity Pattern{chunk.patternContinued && ' (continued)'}
      </p>
      {chunk.rows.length === 0 ? (
        <p className="text-[8.5pt] italic">No antibiotics recorded.</p>
      ) : isSingleTable(chunk.rows.length, chunk.density) ? (
        <SensitivityTable rows={chunk.rows} offset={chunk.offset} dual={false} density={chunk.density} />
      ) : (
        <div className="antibiogram-grid">
          <SensitivityTable rows={chunk.rows.slice(0, mid)} offset={chunk.offset} dual density={chunk.density} />
          <SensitivityTable
            rows={chunk.rows.slice(mid)}
            offset={chunk.offset + mid}
            dual
            density={chunk.density}
          />
        </div>
      )}
    </section>
  );
}

/**
 * Printed sensitivity pattern for one or more organisms. Complete organism blocks stay on one page
 * when possible; otherwise they start on the next page. Signatures are reserved via print CSS.
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
        <p className="text-[8.5pt] italic">No antibiotics recorded.</p>
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
            <section
              key={start}
              className={cn('antibiogram-page antibiogram-organism-block', p > 0 && 'antibiogram-page--continued')}
            >
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

  const chunks = paginateOrganisms(blocks, chrome);
  return (
    <div className="antibiogram-print-body">
      {chunks.map((chunk) => (
        <ChunkSection key={chunk.key} chunk={chunk} continuationPatient={continuationPatient} />
      ))}
    </div>
  );
}
