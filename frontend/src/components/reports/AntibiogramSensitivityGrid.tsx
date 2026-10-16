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
const HEADING_CONTINUED = 51;
const THEAD = 40;
const GRID_GAP = 16;
const ROW_BORDER = 0.8;

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
function sectionHeight(items: readonly SensitivityRow[], first: boolean, d: Density): number {
  const heading = first ? HEADING_FIRST : HEADING_CONTINUED;
  if (isSingleTable(items.length, d)) {
    return heading + THEAD + items.reduce((h, r) => h + rowHeight(r.antibiotic_name, false, d), 0);
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
  return heading + THEAD + rows;
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
 * Splits the antibiotics into printed pages by available height: every page is filled as far as it fits,
 * and the last page keeps room for "End of Report" and the signatures.
 */
export function paginateAntibiotics(items: readonly SensitivityRow[], chrome: PrintChrome): SensitivityRow[][] {
  const footer = chrome.draft ? FOOTER_DRAFT : FOOTER_VERIFIED;
  const density = densityFor(items.length);
  const pages: SensitivityRow[][] = [];
  let i = 0;
  while (i < items.length) {
    const first = pages.length === 0;
    const budget = PAGE_HEIGHT - SAFETY - (first ? firstPageTop(chrome) : 0);
    const fits = (count: number, reserve: number) =>
      sectionHeight(items.slice(i, i + count), first, density) + reserve <= budget;

    let take = 1;
    while (i + take < items.length && fits(take + 1, 0)) take += 1;

    if (take > 1 && i + take === items.length && !fits(take, footer)) {
      // Everything left fits, but not together with the signatures. The signatures then go to a final page,
      // so keep this page as full as possible and carry only a short tail along with them.
      let withFooter = take;
      while (withFooter > 1 && !fits(withFooter, footer)) withFooter -= 1;
      take = Math.max(withFooter, take - MIN_LAST_PAGE_ITEMS);
    }
    pages.push(items.slice(i, i + take));
    i += take;
  }
  return pages;
}

function resultLabel(result: SensitivityResult | null): string {
  return result ? RESULT_LABEL[result] : '';
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
          <tr key={r.antibiotic_name}>
            <td>{offset + i + 1}</td>
            <td className="antibiogram-name">{r.antibiotic_name}</td>
            <td className="antibiogram-result">{resultLabel(r.sensitivity_result)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Printed sensitivity pattern, spanning the full body width. Up to 6 antibiotics print as one roomy
 * full-width table; larger reports split each page evenly into two side-by-side tables (left takes the
 * extra row when the count is odd), with tighter rows for long lists. Pages are filled by available
 * height and numbering runs on across tables and pages.
 *
 * Each table has three columns: SL No, Name of Antibiotics, and Result (full word: Sensitive /
 * Resistant / Mod. Sensitive).
 */
export function AntibiogramSensitivityGrid({ results, ...chrome }: { results: SensitivityRow[] } & PrintChrome) {
  const pages = paginateAntibiotics(results, chrome);
  const density = densityFor(results.length);
  let offset = 0;

  return (
    <div className="antibiogram-print-body">
      {pages.length === 0 && (
        <>
          <p className="antibiogram-heading">Antibiotic Sensitivity Pattern</p>
          <p className="text-[10pt] italic">No antibiotics recorded.</p>
        </>
      )}
      {pages.map((page, p) => {
        const start = offset;
        offset += page.length;
        const mid = Math.ceil(page.length / 2);
        return (
          <section key={start} className={cn('antibiogram-page', p > 0 && 'antibiogram-page--continued')}>
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
