import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset',
  {
    variants: {
      tone: {
        slate: 'bg-slate-100 text-slate-700 ring-slate-300',
        blue: 'bg-blue-50 text-blue-700 ring-blue-200',
        violet: 'bg-violet-50 text-violet-700 ring-violet-200',
        emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
        amber: 'bg-amber-50 text-amber-800 ring-amber-300',
        red: 'bg-red-50 text-red-700 ring-red-200',
      },
    },
    defaultVariants: { tone: 'slate' },
  },
);

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
