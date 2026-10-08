import { forwardRef, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronsUpDown, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface SearchableOption {
  value: string;
  label: string;
  group?: string;
}

interface SearchableSelectProps {
  id?: string;
  options: SearchableOption[];
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Offer the typed text as a value when it matches no option. */
  allowCustom?: boolean;
  invalid?: boolean;
  disabled?: boolean;
}

type Row = { kind: 'group'; label: string } | { kind: 'option'; option: SearchableOption; index: number };

export const SearchableSelect = forwardRef<HTMLButtonElement, SearchableSelectProps>(function SearchableSelect(
  {
    id,
    options,
    value,
    onChange,
    onBlur,
    placeholder = 'Select...',
    searchPlaceholder = 'Search...',
    emptyText = 'No matches',
    allowCustom,
    invalid,
    disabled,
  },
  ref,
) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const term = search.trim().toLowerCase();
  const filtered = useMemo(
    () => (term ? options.filter((o) => o.label.toLowerCase().includes(term) || o.group?.toLowerCase().includes(term)) : options),
    [options, term],
  );
  const customValue =
    allowCustom && term && !options.some((o) => o.label.toLowerCase() === term) ? search.trim() : null;
  const choices: SearchableOption[] = customValue
    ? [...filtered, { value: customValue, label: customValue }]
    : filtered;

  const rows = useMemo(() => {
    const out: Row[] = [];
    let lastGroup: string | undefined;
    filtered.forEach((option, index) => {
      if (option.group && option.group !== lastGroup) {
        out.push({ kind: 'group', label: option.group });
        lastGroup = option.group;
      }
      out.push({ kind: 'option', option, index });
    });
    return out;
  }, [filtered]);

  useEffect(() => setActive(0), [term]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const select = (option: SearchableOption) => {
    onChange(option.value);
    setOpen(false);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setSearch('');
      const current = options.findIndex((o) => o.value === value);
      setActive(current >= 0 ? current : 0);
    } else {
      onBlur?.();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, choices.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (choices[active]) select(choices[active]);
    }
  };

  const selectedLabel = options.find((o) => o.value === value)?.label ?? value;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          ref={ref}
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          className={cn(
            'h-9 w-full justify-between px-3 font-normal',
            !value && 'text-muted-foreground',
            invalid && 'border-destructive',
          )}
        >
          <span className="truncate">{value ? selectedLabel : placeholder}</span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={12}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          searchRef.current?.focus();
        }}
        className="flex max-h-[min(24rem,var(--radix-popover-content-available-height))] w-[var(--radix-popover-trigger-width)] min-w-[18rem] flex-col p-0"
      >
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={searchPlaceholder}
            className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div ref={listRef} role="listbox" className="min-h-0 flex-1 overflow-y-auto p-1">
          {rows.map((row) =>
            row.kind === 'group' ? (
              <div key={`g-${row.label}`} className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {row.label}
              </div>
            ) : (
              <button
                key={`${row.option.group ?? ''}-${row.option.value}`}
                type="button"
                role="option"
                aria-selected={row.option.value === value}
                data-index={row.index}
                onMouseEnter={() => setActive(row.index)}
                onClick={() => select(row.option)}
                className={cn(
                  'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm',
                  row.index === active && 'bg-slate-100',
                )}
              >
                <Check className={cn('h-4 w-4 shrink-0', row.option.value === value ? 'opacity-100' : 'opacity-0')} />
                {row.option.label}
              </button>
            ),
          )}
          {customValue && (
            <button
              type="button"
              data-index={filtered.length}
              onMouseEnter={() => setActive(filtered.length)}
              onClick={() => select({ value: customValue, label: customValue })}
              className={cn(
                'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm',
                active === filtered.length && 'bg-slate-100',
              )}
            >
              <Plus className="h-4 w-4 shrink-0" />
              Use &ldquo;{customValue}&rdquo;
            </button>
          )}
          {choices.length === 0 && <p className="px-2 py-6 text-center text-sm text-muted-foreground">{emptyText}</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
});
