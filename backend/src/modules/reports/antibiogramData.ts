import type { AntibiogramReportInput } from './report.schema';

export type CultureStatus = 'NO_GROWTH' | 'GROWTH';
export type SensitivityResult = 'S' | 'R' | 'MS';

export interface AntibiogramOrganismResult {
  antibiotic_name: string;
  sensitivity_result: SensitivityResult;
}

export interface AntibiogramOrganismBlock {
  organism_name: string;
  results: AntibiogramOrganismResult[];
}

/** Canonical JSON stored in antibiogram_reports.antibiogram_data. */
export interface AntibiogramData {
  culture_status: CultureStatus;
  culture_text: string | null;
  organisms: AntibiogramOrganismBlock[];
}

export const NO_GROWTH_LABEL = 'No Growth';
export const DEFAULT_NO_GROWTH_TEXT =
  'No pathogenic organism isolated after 48 hours of aerobic incubation at 37°C.';

const isSensitivity = (v: unknown): v is SensitivityResult => v === 'S' || v === 'R' || v === 'MS';

/** Normalises stored JSONB or a legacy single-organism shape into AntibiogramData. */
export function parseAntibiogramData(
  raw: unknown,
  legacy?: { organism_isolated?: string | null; results?: AntibiogramOrganismResult[] },
): AntibiogramData {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    const status = obj.culture_status === 'NO_GROWTH' || obj.culture_status === 'GROWTH' ? obj.culture_status : null;
    if (status) {
      const organisms = Array.isArray(obj.organisms)
        ? obj.organisms
            .map((o) => {
              if (!o || typeof o !== 'object') return null;
              const block = o as Record<string, unknown>;
              const name = typeof block.organism_name === 'string' ? block.organism_name.trim() : '';
              const results = Array.isArray(block.results)
                ? block.results
                    .map((r) => {
                      if (!r || typeof r !== 'object') return null;
                      const row = r as Record<string, unknown>;
                      const antibiotic_name = typeof row.antibiotic_name === 'string' ? row.antibiotic_name.trim() : '';
                      if (!antibiotic_name || !isSensitivity(row.sensitivity_result)) return null;
                      return { antibiotic_name, sensitivity_result: row.sensitivity_result };
                    })
                    .filter((r): r is AntibiogramOrganismResult => !!r)
                : [];
              return name ? { organism_name: name, results } : null;
            })
            .filter((o): o is AntibiogramOrganismBlock => !!o)
        : [];
      const culture_text =
        typeof obj.culture_text === 'string' && obj.culture_text.trim() ? obj.culture_text.trim() : null;
      return { culture_status: status, culture_text, organisms };
    }

    // Legacy object shape: { organism_name, sensitivity } or { organism_isolated, results }
    const name =
      (typeof obj.organism_name === 'string' && obj.organism_name.trim()) ||
      (typeof obj.organism_isolated === 'string' && obj.organism_isolated.trim()) ||
      '';
    if (name) {
      const results = Array.isArray(obj.results)
        ? (obj.results as AntibiogramOrganismResult[]).filter(
            (r) => r && typeof r.antibiotic_name === 'string' && isSensitivity(r.sensitivity_result),
          )
        : [];
      return { culture_status: 'GROWTH', culture_text: null, organisms: [{ organism_name: name, results }] };
    }
  }

  const organism = legacy?.organism_isolated?.trim();
  if (organism && organism.toLowerCase() !== 'no growth') {
    return {
      culture_status: 'GROWTH',
      culture_text: null,
      organisms: [{ organism_name: organism, results: legacy?.results ?? [] }],
    };
  }
  if (organism && organism.toLowerCase() === 'no growth') {
    return {
      culture_status: 'NO_GROWTH',
      culture_text: DEFAULT_NO_GROWTH_TEXT,
      organisms: [],
    };
  }

  return { culture_status: 'GROWTH', culture_text: null, organisms: [] };
}

/** Builds the JSONB payload and the denormalised organism_isolated summary for storage. */
export function toStoredAntibiogram(input: AntibiogramReportInput): {
  data: AntibiogramData;
  organism_isolated: string;
  flatResults: { organism_name: string; antibiotic_name: string; sensitivity_result: SensitivityResult }[];
} {
  if (input.culture_status === 'NO_GROWTH') {
    const culture_text = (input.culture_text?.trim() || DEFAULT_NO_GROWTH_TEXT).slice(0, 10000);
    return {
      data: { culture_status: 'NO_GROWTH', culture_text, organisms: [] },
      organism_isolated: NO_GROWTH_LABEL,
      flatResults: [],
    };
  }

  const organisms = (input.organisms ?? []).map((o) => ({
    organism_name: o.organism_name.trim(),
    results: o.results.map((r) => ({
      antibiotic_name: r.antibiotic_name.trim(),
      sensitivity_result: r.sensitivity_result,
    })),
  }));

  const organism_isolated = organisms.map((o) => o.organism_name).join(' + ').slice(0, 500);
  const flatResults = organisms.flatMap((o) =>
    o.results.map((r) => ({
      organism_name: o.organism_name,
      antibiotic_name: r.antibiotic_name,
      sensitivity_result: r.sensitivity_result,
    })),
  );

  return {
    data: { culture_status: 'GROWTH', culture_text: null, organisms },
    organism_isolated,
    flatResults,
  };
}
