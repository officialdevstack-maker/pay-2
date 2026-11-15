import { ChevronRight, Circle } from 'lucide-react';
import { ListGroup } from '@/components/ui/list-group';
import { ListRow } from '@/components/ui/list-row';

export interface SetupItem {
  label: string;
  href: string;
}

export function SetupChecklist({ items }: { items: SetupItem[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="setup-heading">
      <h2 id="setup-heading" className="type-heading mb-3">
        Finish setting up
      </h2>
      <ListGroup>
        {items.map((item) => (
          <ListRow
            key={item.label}
            href={item.href}
            leading={<Circle aria-hidden="true" size={20} strokeWidth={1.75} className="text-muted" />}
            title={item.label}
            trailing={<ChevronRight aria-hidden="true" size={20} strokeWidth={1.75} className="text-muted" />}
          />
        ))}
      </ListGroup>
    </section>
  );
}
