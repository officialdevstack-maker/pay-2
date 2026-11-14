import type { ReactNode } from 'react';
import { Clock } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AmountDisplay } from '@/components/ui/amount-display';
import { Avatar } from '@/components/ui/avatar';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { ListGroup } from '@/components/ui/list-group';
import { ListRow } from '@/components/ui/list-row';
import { BalanceSkeleton, ListSkeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';

export const metadata = { title: 'UI kit' };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="type-heading">{title}</h2>
      {children}
    </section>
  );
}

function ThemePreview({ theme, label }: { theme: 'light' | 'dark'; label: string }) {
  return (
    <section
      data-theme={theme}
      aria-label={`${label} theme preview`}
      className="space-y-8 rounded-card bg-background p-5 text-foreground"
    >
      <h2 className="type-heading">{label} theme</h2>
      <Section title="Amounts">
        <Card className="space-y-3 p-6">
          <AmountDisplay kobo={1250000n} size="lg" />
          <AmountDisplay kobo={125050n} size="xl" />
          <AmountDisplay kobo={85000n} size="md" sign="out" />
          <AmountDisplay kobo={300000n} size="md" sign="in" />
          <AmountDisplay kobo={1250000n} size="lg" hidden />
        </Card>
      </Section>

      <Section title="Buttons">
        <div className="space-y-3">
          <Button className="w-full" size="lg">Send ₦1,200.00</Button>
          <Button className="w-full" variant="secondary">Add money</Button>
          <Button className="w-full" variant="ghost">Sign out</Button>
          <Button className="w-full" variant="danger">Remove</Button>
          <Button className="w-full" loading>Sending</Button>
          <Button className="w-full" disabled>Disabled</Button>
        </div>
      </Section>

      <Section title="Inputs">
        <Input label="To" prefix="@" placeholder="ada_okafor" hint="Enter their Spurs Pay tag." />
        <Input label="To" prefix="@" defaultValue="nobody_here" error="We could not find that tag." />
      </Section>

      <Section title="List">
        <ListGroup>
          <ListRow
            leading={<Avatar name="Tunde Bello" seed="tunde_b" />}
            title="Tunde Bello"
            subtitle="Sent · 2:14 PM"
            trailing={<AmountDisplay kobo={85000n} sign="out" />}
            href="/"
          />
          <ListRow
            leading={<Avatar name="Ngozi Eze" seed="ngozi_e" />}
            title="Ngozi Eze"
            subtitle="Received · 9:02 AM"
            trailing={<AmountDisplay kobo={300000n} sign="in" />}
            href="/"
          />
          <ListRow
            leading={<Avatar name="Emeka Obi" seed="emeka_o" />}
            title="Emeka Obi"
            subtitle="Sent · Yesterday"
            trailing={<StatusBadge status="pending" />}
          />
        </ListGroup>
      </Section>

      <Section title="Avatars">
        <div className="flex flex-wrap gap-3">
          {['Ada Okafor', 'Tunde Bello', 'Ngozi Eze', 'Emeka Obi', 'Fatima Yusuf', 'Chidi Nwosu'].map((name) => (
            <Avatar key={name} name={name} />
          ))}
        </div>
      </Section>

      <Section title="Status">
        <div className="flex flex-wrap gap-2">
          <StatusBadge status="success" />
          <StatusBadge status="pending" />
          <StatusBadge status="failed" />
        </div>
      </Section>

      <Section title="Banners">
        <Banner tone="info" action={<Link href="/">Verify</Link>}>Verify your email to send money.</Banner>
        <Banner tone="warning">This transfer is above your per-transfer limit.</Banner>
        <Banner tone="danger">This person cannot receive money right now.</Banner>
      </Section>

      <Section title="Empty state">
        <Card>
          <EmptyState icon={Clock} action={<Link href="/">Add money</Link>}>
            No activity yet. Add money to get started.
          </EmptyState>
        </Card>
      </Section>

      <Section title="Loading">
        <Card><BalanceSkeleton /></Card>
        <ListSkeleton />
      </Section>
    </section>
  );
}

export default function DevUiPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <main className="mx-auto max-w-md space-y-8 px-5 py-8">
      <h1 className="type-title">UI kit</h1>
      <ThemePreview theme="light" label="Light" />
      <ThemePreview theme="dark" label="Dark" />
    </main>
  );
}
