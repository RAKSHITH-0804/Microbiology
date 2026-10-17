/** Case, spacing and a trailing full stop don't make a phrase different. */
export const normalizePhrase = (s: string) =>
  s.trim().replace(/\s+/g, ' ').replace(/\.$/, '').toLowerCase();

export interface FindingSection {
  heading: string;
  findings: string[];
}

export interface FindingTemplateLike {
  test_name: string;
  findings: { finding_text: string }[];
}

const bulletMatch = (line: string) => {
  const m = line.trim().match(/^[-•*]\s+(.*)$/);
  return m ? m[1].trim() : null;
};

/** Uppercase investigation heading as stored/printed (trailing colon stripped). */
export const normalizeHeading = (name: string) => name.trim().replace(/:$/, '').toUpperCase();

function nextNonEmptyIsBullet(lines: string[], from: number): boolean {
  for (let j = from + 1; j < lines.length; j++) {
    const n = lines[j].trim();
    if (!n) continue;
    return bulletMatch(n) !== null;
  }
  return false;
}

function isKnownHeading(trimmed: string, investigationList: string[]): boolean {
  const h = normalizeHeading(trimmed);
  return investigationList.some((n) => normalizeHeading(n) === h);
}

/**
 * Parses report findings into optional freeform preamble + investigation-headed sections.
 * A non-bullet line is a heading when it ends with `:`, matches a known investigation,
 * or is followed by a bullet (structured mode).
 */
export function parseFindingDocument(
  text: string,
  investigationList: string[] = [],
): { preamble: string; sections: FindingSection[] } {
  const lines = text.split('\n');
  const preamble: string[] = [];
  const sections: FindingSection[] = [];
  let current: FindingSection | null = null;
  let structured = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed) {
      if (!structured) preamble.push('');
      continue;
    }

    const bullet = bulletMatch(trimmed);
    if (bullet !== null) {
      structured = true;
      if (!current) {
        current = { heading: 'FINDINGS', findings: [] };
        sections.push(current);
      }
      if (bullet) current.findings.push(bullet);
      continue;
    }

    const headingLike =
      trimmed.endsWith(':') ||
      isKnownHeading(trimmed, investigationList) ||
      structured ||
      nextNonEmptyIsBullet(lines, i);

    if (headingLike) {
      structured = true;
      current = { heading: normalizeHeading(trimmed), findings: [] };
      sections.push(current);
    } else {
      preamble.push(raw);
    }
  }

  return {
    preamble: preamble.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    sections: sections.filter((s) => s.findings.length > 0),
  };
}

/** Convenience: sections only. */
export function parseFindingSections(text: string, investigationList: string[] = []): FindingSection[] {
  return parseFindingDocument(text, investigationList).sections;
}

/** Builds normalized-phrase → test_name from finding template groups. */
export function buildPhraseToTestMap(groups: FindingTemplateLike[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const g of groups) {
    for (const f of g.findings) {
      map.set(normalizePhrase(f.finding_text), g.test_name);
    }
  }
  return map;
}

function orderSections(sections: FindingSection[], investigationList: string[]): FindingSection[] {
  const preferred = investigationList.map(normalizeHeading);
  const byHeading = new Map(sections.map((s) => [s.heading, s]));
  const ordered: FindingSection[] = [];
  const seen = new Set<string>();
  for (const h of preferred) {
    const s = byHeading.get(h);
    if (s) {
      ordered.push(s);
      seen.add(h);
    }
  }
  for (const s of sections) {
    if (!seen.has(s.heading)) ordered.push(s);
  }
  return ordered;
}

/**
 * Groups findings for print/view.
 * - Structured text (with headings) → bold headings + bullets as stored.
 * - Legacy flat lists → map each line to its preset test category and group under uppercase headings.
 */
export function parseAndGroupFindings(
  rawText: string,
  investigationList: string[],
  phraseToTest?: Map<string, string> | FindingTemplateLike[],
): FindingSection[] {
  const map =
    phraseToTest instanceof Map
      ? phraseToTest
      : Array.isArray(phraseToTest)
        ? buildPhraseToTestMap(phraseToTest)
        : new Map<string, string>();

  const doc = parseFindingDocument(rawText, investigationList);
  const hasNamedSections = doc.sections.some((s) => s.heading !== 'FINDINGS');

  if (hasNamedSections) {
    return orderSections(doc.sections, investigationList);
  }

  // Flat / legacy: collect every phrase line (bullets, preamble, FINDINGS bucket).
  const phrases: string[] = [];
  const seenPhrase = new Set<string>();
  const pushPhrase = (phrase: string) => {
    const cleaned = phrase.trim();
    if (!cleaned) return;
    if (isKnownHeading(cleaned, investigationList)) return;
    const key = normalizePhrase(cleaned);
    if (seenPhrase.has(key)) return;
    seenPhrase.add(key);
    phrases.push(cleaned);
  };

  for (const line of rawText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const bullet = bulletMatch(trimmed);
    pushPhrase(bullet ?? trimmed);
  }

  const byHeading = new Map<string, string[]>();
  const unknown: string[] = [];

  for (const phrase of phrases) {
    const test = map.get(normalizePhrase(phrase));
    if (test) {
      const h = normalizeHeading(test);
      const list = byHeading.get(h) ?? [];
      list.push(phrase);
      byHeading.set(h, list);
    } else {
      unknown.push(phrase);
    }
  }

  const sections: FindingSection[] = [];
  for (const name of investigationList) {
    const h = normalizeHeading(name);
    const findings = byHeading.get(h);
    if (findings?.length) {
      sections.push({ heading: h, findings });
      byHeading.delete(h);
    }
  }
  for (const [heading, findings] of byHeading) {
    sections.push({ heading, findings });
  }
  if (unknown.length) sections.push({ heading: 'FINDINGS', findings: unknown });

  return sections;
}

/** Serializes sections as `TEST NAME:` headings with `- ` bullets. */
export function serializeFindingSections(sections: FindingSection[]): string {
  return sections
    .filter((s) => s.findings.length > 0)
    .map((s) => `${normalizeHeading(s.heading)}:\n${s.findings.map((f) => `- ${f}`).join('\n')}`)
    .join('\n\n');
}

export function sectionHasFinding(sections: FindingSection[], testName: string, phrase: string): boolean {
  const heading = normalizeHeading(testName);
  const target = normalizePhrase(phrase);
  return !!sections.find((s) => s.heading === heading)?.findings.some((f) => normalizePhrase(f) === target);
}

function lineIsPhrase(line: string, target: string): boolean {
  const bullet = bulletMatch(line);
  return normalizePhrase(bullet ?? line) === target;
}

/**
 * True when the phrase is listed under this test heading, or (legacy) appears as a
 * flat line when the document has no investigation-headed sections.
 */
export function findingsContainPhrase(
  text: string,
  testName: string,
  phrase: string,
  investigationList: string[] = [],
): boolean {
  const { sections } = parseFindingDocument(text, investigationList);
  if (sectionHasFinding(sections, testName, phrase)) return true;

  const target = normalizePhrase(phrase);
  const hasNamedSections = sections.some((s) => s.heading !== 'FINDINGS');
  if (hasNamedSections) return false;

  return text.split('\n').some((line) => lineIsPhrase(line, target));
}

/**
 * Adds or removes a preset phrase under its investigation heading.
 * Empty headings are dropped. On add, the whole document is re-serialized in structured form
 * (legacy flat lines for other known presets are regrouped when a phrase map is provided).
 */
export function toggleFindingPhrase(
  text: string,
  testName: string,
  phrase: string,
  opts?: { investigationList?: string[]; templates?: FindingTemplateLike[] },
): string {
  const heading = normalizeHeading(testName);
  const target = normalizePhrase(phrase);
  const cleanPhrase = phrase.trim();
  const investigationList = opts?.investigationList ?? [];
  const templates = opts?.templates ?? [];

  // Work from a fully grouped view so legacy flats become structured on first toggle.
  let sections =
    templates.length || investigationList.length
      ? parseAndGroupFindings(text, investigationList, templates)
      : parseFindingDocument(text, investigationList).sections;

  if (sectionHasFinding(sections, testName, phrase)) {
    return serializeFindingSections(
      sections.map((s) =>
        s.heading === heading
          ? { ...s, findings: s.findings.filter((f) => normalizePhrase(f) !== target) }
          : s,
      ),
    );
  }

  // Legacy flat-only remove (no templates to regroup).
  const hasNamedSections = sections.some((s) => s.heading !== 'FINDINGS');
  if (!hasNamedSections && text.split('\n').some((line) => lineIsPhrase(line, target))) {
    return text
      .split('\n')
      .filter((line) => !lineIsPhrase(line, target))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  sections = sections
    .map((s) => ({
      ...s,
      findings: s.findings.filter((f) => normalizePhrase(f) !== target),
    }))
    .filter((s) => s.findings.length > 0);

  let section = sections.find((s) => s.heading === heading);
  if (!section) {
    section = { heading, findings: [] };
    sections.push(section);
  }
  section.findings.push(cleanPhrase);

  return serializeFindingSections(orderSections(sections, investigationList.length ? investigationList : [testName]));
}
