import { LockKeyhole, ShieldCheck, UserRound } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ListGroup } from '@/components/ui/list-group';
import { ListRow } from '@/components/ui/list-row';
import { PageHeader } from '@/components/ui/page-header';
import { requireUser } from '@/modules/identity';

export default async function SettingsPage() {
  const user = await requireUser();
  const label = user.name ?? user.email ?? 'Your account';

  return (
    <div className="space-y-6 pt-2">
      <PageHeader title="Settings" description="Manage your Spurs Pay account and security." />

      <Card className="p-4">
        <div className="flex items-center gap-3">
          <Avatar name={label} seed={user.sub} size={48} />
          <div className="min-w-0">
            <p className="type-body-strong truncate">{label}</p>
            {user.email ? <p className="type-body-sm truncate text-muted">{user.email}</p> : null}
          </div>
        </div>
      </Card>

      <ListGroup>
        <ListRow leading={<UserRound aria-hidden="true" size={18} className="text-muted" />} title="Profile" subtitle="Name, email and account details" href="/settings/profile" />
        <ListRow leading={<LockKeyhole aria-hidden="true" size={18} className="text-muted" />} title="PIN" subtitle="Set or change your transaction PIN" href="/settings/pin" />
        <ListRow leading={<ShieldCheck aria-hidden="true" size={18} className="text-muted" />} title="Security" subtitle="Sign in and device checks" href="/settings/security" />
      </ListGroup>

      <form action="/auth/logout" method="post">
        <Button type="submit" variant="ghost" className="w-full justify-start px-3 text-primary">
          Sign out
        </Button>
      </form>
    </div>
  );
}
