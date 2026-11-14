import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label: string;
  hint?: string;
  error?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
}

export function Input({ label, hint, error, prefix, suffix, className, id, ...props }: InputProps) {
  const generated = useId();
  const inputId = id ?? generated;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('space-y-2', className)}>
      <label htmlFor={inputId} className="type-body-sm block font-medium">
        {label}
      </label>
      <div
        className={cn(
          'flex h-[52px] items-center gap-2 rounded-control border bg-sunken px-4 transition duration-press',
          'focus-within:border-primary focus-within:ring-1 focus-within:ring-primary',
          error ? 'border-danger focus-within:border-danger focus-within:ring-danger' : 'border-transparent',
        )}
      >
        {prefix ? <span className="type-body text-muted">{prefix}</span> : null}
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className="type-body min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted"
          {...props}
        />
        {suffix ? <span className="type-body text-muted">{suffix}</span> : null}
      </div>
      {error ? (
        <p id={errorId} role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      ) : null}
      {hint ? (
        <p id={hintId} className="type-body-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
