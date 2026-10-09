import { forwardRef, useState } from 'react';
import { format, isValid, parseISO } from 'date-fns';
import { CalendarIcon, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface DatePickerProps {
  id?: string;
  /** Local "YYYY-MM-DD" string, or "" when empty. */
  value: string;
  onChange: (value: string) => void;
  /** Earliest / latest selectable day, as "YYYY-MM-DD". */
  min?: string;
  max?: string;
  placeholder?: string;
  clearable?: boolean;
  className?: string;
  'aria-label'?: string;
  /** Optional controlled open state, e.g. to open the picker from a "Custom Range" button. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const parseDay = (v: string | undefined) => {
  if (!v) return undefined;
  const d = parseISO(v);
  return isValid(d) ? d : undefined;
};

export const toYmd = (d: Date) => format(d, 'yyyy-MM-dd');

export const DatePicker = forwardRef<HTMLButtonElement, DatePickerProps>(function DatePicker(
  { id, value, onChange, min, max, placeholder = 'Pick a date', clearable, className, open, onOpenChange, ...aria },
  ref,
) {
  const [innerOpen, setInnerOpen] = useState(false);
  const isOpen = open ?? innerOpen;
  const setOpen = (next: boolean) => {
    setInnerOpen(next);
    onOpenChange?.(next);
  };

  const selected = parseDay(value);
  const minDay = parseDay(min);
  const maxDay = parseDay(max);
  const today = new Date();
  const todayAllowed = (!minDay || toYmd(today) >= toYmd(minDay)) && (!maxDay || toYmd(today) <= toYmd(maxDay));

  // Close first so a parent can chain into another picker from onChange.
  const pick = (d: string) => {
    setOpen(false);
    onChange(d);
  };

  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          ref={ref}
          id={id}
          type="button"
          variant="outline"
          aria-label={aria['aria-label']}
          className={cn(
            'h-9 w-full justify-start gap-2 rounded-lg border-slate-200 bg-white px-3 font-normal shadow-sm hover:bg-slate-50',
            !selected && 'text-muted-foreground',
            className,
          )}
        >
          <CalendarIcon className="h-4 w-4 shrink-0 text-slate-500" />
          <span className="truncate">{selected ? format(selected, 'dd MMM yyyy') : placeholder}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={12}
        className="w-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-xl"
        // Focus returning to a sibling picker's trigger must not dismiss a picker opened right after it.
        onFocusOutside={(e) => e.preventDefault()}
      >
        <Calendar
          mode="single"
          className="p-0"
          selected={selected}
          defaultMonth={selected ?? maxDay}
          onSelect={(d) => d && pick(toYmd(d))}
          disabled={[...(minDay ? [{ before: minDay }] : []), ...(maxDay ? [{ after: maxDay }] : [])]}
          weekStartsOn={1}
        />
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <Button type="button" size="sm" variant="secondary" className="rounded-lg" disabled={!todayAllowed} onClick={() => pick(toYmd(today))}>
            Today
          </Button>
          {clearable && selected && (
            <Button type="button" size="sm" variant="ghost" className="rounded-lg" onClick={() => pick('')}>
              <X /> Clear
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
});
