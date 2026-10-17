import { useMemo } from 'react';
import { parseAndGroupFindings, type FindingTemplateLike } from '@/features/reports/generalFindings';
import { cn } from '@/lib/utils';

/** Screen / dialog view of findings grouped under bold investigation headings. */
export function GroupedFindingsView({
  text,
  investigationList,
  templates = [],
  className,
}: {
  text: string;
  investigationList: string[];
  templates?: FindingTemplateLike[];
  className?: string;
}) {
  const sections = useMemo(
    () => parseAndGroupFindings(text, investigationList, templates),
    [text, investigationList, templates],
  );

  if (!text.trim()) {
    return <div className={cn('text-sm text-muted-foreground', className)}>-</div>;
  }

  if (sections.length === 0) {
    return <div className={cn('whitespace-pre-wrap font-serif text-[15px] leading-relaxed', className)}>{text}</div>;
  }

  return (
    <div className={cn('space-y-2 font-serif text-[15px] leading-relaxed', className)}>
      {sections.map((section) => (
        <div key={section.heading}>
          <p className="font-semibold text-slate-900">{section.heading}:</p>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-5 text-slate-800">
            {section.findings.map((finding) => (
              <li key={`${section.heading}-${finding}`}>{finding}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
