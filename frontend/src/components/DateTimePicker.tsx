import { forwardRef, useState } from 'react';
import { format } from 'date-fns';
import { CalendarClock, Clock, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { NativeSelect } from '@/components/ui/native-select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toDateTimeLocal } from '@/lib/datetime';
import { cn } from '@/lib/utils';

interface DateTimePickerProps {
  id?: string;
  /** Local "YYYY-MM-DDTHH:mm" string, or "" when empty. */
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  invalid?: boolean;
  disableFuture?: boolean;
  clearable?: boolean;
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const pad = (n: number) => String(n).padStart(2, '0');

function parseLocal(value: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export const DateTimePicker = forwardRef<HTMLButtonElement, DateTimePickerProps>(function DateTimePicker(
  { id, value, onChange, onBlur, placeholder = 'Select date & time', invalid, disableFuture, clearable },
  ref,
) {
  const [open, setOpen] = useState(false);
  const selected = parseLocal(value);

  const emit = (d: Date) => onChange(toDateTimeLocal(d));

  const base = () => {
    const d = selected ? new Date(selected) : new Date();
    d.setSeconds(0, 0);
    return d;
  };

  const handleDaySelect = (day: Date | undefined) => {
    if (!day) return;
    const d = base();
    d.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());
    emit(d);
  };

  const hours24 = selected?.getHours() ?? new Date().getHours();
  const hour12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const meridiem = hours24 >= 12 ? 'PM' : 'AM';
  const minute = selected?.getMinutes() ?? 0;

  const setTime = (h12: number, m: number, mer: string) => {
    const d = base();
    d.setHours((h12 % 12) + (mer === 'PM' ? 12 : 0), m);
    emit(d);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) onBlur?.();
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          ref={ref}
          id={id}
          type="button"
          variant="outline"
          aria-invalid={invalid || undefined}
          className={cn(
            'h-9 w-full justify-start px-3 font-normal',
            !selected && 'text-muted-foreground',
            invalid && 'border-destructive',
          )}
        >
          <CalendarClock className="text-muted-foreground" />
          <span className="truncate">{selected ? format(selected, 'dd MMM yyyy, hh:mm a') : placeholder}</span>
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        collisionPadding={12}
        className="max-h-[var(--radix-popover-content-available-height)] w-auto overflow-y-auto p-0"
      >
        <Calendar
          mode="single"
          selected={selected}
          onSelect={handleDaySelect}
          defaultMonth={selected}
          disabled={disableFuture ? { after: new Date() } : undefined}
          weekStartsOn={1}
        />

        <div className="flex items-center gap-2 border-t px-3 py-3">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <NativeSelect
            aria-label="Hour"
            className="w-[4.25rem]"
            value={hour12}
            onChange={(e) => setTime(Number(e.target.value), minute, meridiem)}
          >
            {HOURS.map((h) => (
              <option key={h} value={h}>{pad(h)}</option>
            ))}
          </NativeSelect>
          <span className="font-semibold text-muted-foreground">:</span>
          <NativeSelect
            aria-label="Minute"
            className="w-[4.25rem]"
            value={minute}
            onChange={(e) => setTime(hour12, Number(e.target.value), meridiem)}
          >
            {MINUTES.map((m) => (
              <option key={m} value={m}>{pad(m)}</option>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label="AM or PM"
            className="w-[4.5rem]"
            value={meridiem}
            onChange={(e) => setTime(hour12, minute, e.target.value)}
          >
            <option value="AM">AM</option>
            <option value="PM">PM</option>
          </NativeSelect>
        </div>

        <div className="flex items-center justify-between gap-2 border-t px-3 py-2.5">
          <Button type="button" size="sm" variant="secondary" onClick={() => emit(new Date())}>
            Today / Now
          </Button>
          <div className="flex gap-2">
            {clearable && selected && (
              <Button type="button" size="sm" variant="ghost" onClick={() => onChange('')}>
                <X /> Clear
              </Button>
            )}
            <Button type="button" size="sm" onClick={() => handleOpenChange(false)}>
              Done
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
});
