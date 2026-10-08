import * as React from 'react';
import { DayPicker } from 'react-day-picker';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        months: 'relative flex flex-col gap-4',
        month: 'space-y-3',
        month_caption: 'flex h-8 items-center justify-center',
        caption_label: 'text-sm font-semibold',
        nav: 'absolute inset-x-0 top-0 z-10 flex items-center justify-between',
        button_previous: cn(buttonVariants({ variant: 'outline', size: 'icon' }), 'h-8 w-8'),
        button_next: cn(buttonVariants({ variant: 'outline', size: 'icon' }), 'h-8 w-8'),
        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday: 'w-9 text-center text-[0.75rem] font-medium text-muted-foreground',
        week: 'mt-1 flex w-full',
        day: 'h-9 w-9 p-0 text-center text-sm',
        day_button:
          'h-9 w-9 rounded-md font-normal transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
        selected:
          '[&>button]:bg-primary [&>button]:font-semibold [&>button]:text-primary-foreground [&>button]:hover:bg-primary [&>button]:hover:text-primary-foreground',
        today: '[&>button]:font-bold [&>button]:underline [&>button]:underline-offset-4',
        outside: 'text-muted-foreground/50',
        disabled: 'text-muted-foreground/40 [&>button]:cursor-not-allowed [&>button]:hover:bg-transparent',
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
