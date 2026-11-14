import { cn } from '@/lib/cn';
import { formatNaira, spokenNaira, type Kobo } from '@/lib/money';

type Size = 'xl' | 'lg' | 'md';
type Sign = 'in' | 'out' | 'none';

const sizes: Record<Size, string> = {
  xl: 'type-amount-xl',
  lg: 'type-amount-lg',
  md: 'type-amount-md',
};

export interface AmountDisplayProps {
  kobo: Kobo;
  size?: Size;
  sign?: Sign;
  hideZeroKobo?: boolean;
  hidden?: boolean;
  className?: string;
}

export function AmountDisplay({
  kobo,
  size = 'md',
  sign = 'none',
  hideZeroKobo,
  hidden = false,
  className,
}: AmountDisplayProps) {
  const text = formatNaira(kobo, { hideZeroKobo });
  const prefix = sign === 'in' ? '+' : sign === 'out' ? '\u2212' : '';

  return (
    <span
      className={cn(
        'amount inline-block',
        sizes[size],
        sign === 'in' ? 'text-success' : 'text-foreground',
        hidden && 'min-w-[7ch]',
        className,
      )}
      aria-label={hidden ? 'Balance hidden' : spokenNaira(kobo, { sign })}
    >
      <span aria-hidden="true">{hidden ? '\u2022\u2022\u2022\u2022' : `${prefix}${text}`}</span>
    </span>
  );
}
