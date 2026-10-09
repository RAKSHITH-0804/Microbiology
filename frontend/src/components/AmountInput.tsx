import { forwardRef, type ChangeEvent, type InputHTMLAttributes } from 'react';
import { Input } from '@/components/ui/input';
import { sanitizeAmountInput } from '@/features/requisitions/payment';
import { cn } from '@/lib/utils';

type AmountInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'inputMode'>;

/** Rupee amount field; works with react-hook-form's register(). */
export const AmountInput = forwardRef<HTMLInputElement, AmountInputProps>(({ className, onChange, ...props }, ref) => (
  <div className="relative">
    <span className="pointer-events-none absolute inset-y-1 left-1 flex items-center rounded bg-secondary px-2 text-xs font-semibold text-secondary-foreground">
      ₹
    </span>
    <Input
      ref={ref}
      inputMode="decimal"
      autoComplete="off"
      placeholder="0.00"
      className={cn('pl-9 tabular-nums', className)}
      onChange={(e: ChangeEvent<HTMLInputElement>) => {
        e.target.value = sanitizeAmountInput(e.target.value);
        onChange?.(e);
      }}
      {...props}
    />
  </div>
));
AmountInput.displayName = 'AmountInput';
