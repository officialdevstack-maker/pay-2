'use client';

import { Check, Copy } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from './button';

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: nothing to confirm */
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={label}
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted transition duration-press hover:bg-sunken active:bg-sunken"
    >
      {copied ? (
        <Check aria-hidden="true" size={20} strokeWidth={1.75} className="text-success" />
      ) : (
        <Copy aria-hidden="true" size={20} strokeWidth={1.75} />
      )}
      <span role="status" className="sr-only">
        {copied ? 'Copied' : ''}
      </span>
    </button>
  );
}

/** Uses the share sheet where it exists, otherwise copies the text. */
export function ShareButton({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  async function share() {
    try {
      if (navigator.share) await navigator.share({ title, text });
      else await navigator.clipboard.writeText(text);
    } catch {
      /* share cancelled */
    }
  }

  return (
    <Button variant="secondary" size="lg" className="w-full" onClick={share}>
      {children}
    </Button>
  );
}
