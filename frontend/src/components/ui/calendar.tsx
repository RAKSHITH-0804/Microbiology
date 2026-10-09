import * as React from 'react';
import { DayPicker } from 'react-day-picker';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

const navButton =
  'inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-blue-50 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:pointer-events-none disabled:opacity-40';

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        months: 'relative flex flex-col gap-4',
        month: 'space-y-3',
        month_caption: 'flex h-8 items-center justify-center',
        caption_label: 'text-sm font-bold text-slate-800',
        nav: 'absolute inset-x-0 top-0 z-10 flex items-center justify-between',
        button_previous: navButton,
        button_next: navButton,
        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday: 'w-9 text-center text-[0.7rem] font-semibold uppercase tracking-wide text-slate-400',
        week: 'mt-1 flex w-full',
        day: 'h-9 w-9 p-0 text-center text-sm text-slate-700',
        day_button:
          'h-9 w-9 rounded-lg font-normal transition-colors hover:bg-blue-50 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40',
        selected:
          '[&>button]:bg-blue-600 [&>button]:font-semibold [&>button]:text-white [&>button]:shadow-sm [&>button]:hover:bg-blue-700 [&>button]:hover:text-white',
        range_start: 'rounded-l-lg bg-blue-50',
        range_end: 'rounded-r-lg bg-blue-50',
        range_middle: 'bg-blue-50 [&>button]:bg-transparent [&>button]:font-normal [&>button]:text-blue-700 [&>button]:shadow-none',
        today: '[&>button]:font-semibold [&>button]:text-blue-600 [&>button]:ring-1 [&>button]:ring-inset [&>button]:ring-blue-200',
        outside: 'text-slate-300',
        disabled: 'text-slate-300 [&>button]:cursor-not-allowed [&>button]:hover:bg-transparent [&>button]:hover:text-slate-300',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === 'left' ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />,
      }}
      {...props}
    />
  );
}
Calendar.displayName = 'Calendar';

export { Calendar };
