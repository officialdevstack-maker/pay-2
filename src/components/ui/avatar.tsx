import { cn } from '@/lib/cn';

const TINTS = [
  'bg-avatar-1-bg text-avatar-1-fg',
  'bg-avatar-2-bg text-avatar-2-fg',
  'bg-avatar-3-bg text-avatar-3-fg',
  'bg-avatar-4-bg text-avatar-4-fg',
  'bg-avatar-5-bg text-avatar-5-fg',
  'bg-avatar-6-bg text-avatar-6-fg',
] as const;

const SIZES = { 32: 'size-8 text-xs', 40: 'size-10 text-sm', 48: 'size-12 text-base' } as const;

export function tintIndex(seed: string): number {
  let sum = 0;
  for (const char of seed) sum += char.charCodeAt(0);
  return sum % TINTS.length;
}

export function initials(name: string): string {
  const parts = name.replace(/^@/, '').split(/[\s_]+/).filter(Boolean);
  const letters =
    parts.length > 1
      ? [parts[0]?.[0], parts[1]?.[0]]
      : [parts[0]?.[0], parts[0]?.[1]];
  return letters.filter(Boolean).join('').toUpperCase();
}

export interface AvatarProps {
  name: string;
  seed?: string;
  size?: keyof typeof SIZES;
  decorative?: boolean;
  className?: string;
}

export function Avatar({ name, seed, size = 40, decorative = true, className }: AvatarProps) {
  return (
    <span
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : name}
      role={decorative ? undefined : 'img'}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold',
        SIZES[size],
        TINTS[tintIndex(seed ?? name)],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
