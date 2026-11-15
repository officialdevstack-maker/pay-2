import { Plus } from 'lucide-react';
import Link from 'next/link';
import { Avatar } from '@/components/ui/avatar';
import type { HomePerson } from '@/modules/dashboard';

const tile =
  'flex flex-col items-center gap-2 rounded-control py-1 transition duration-press active:bg-sunken';

export function PeopleGrid({ people }: { people: HomePerson[] }) {
  if (people.length === 0) return null;

  return (
    <section aria-labelledby="people-heading">
      <h2 id="people-heading" className="type-heading mb-3">
        People
      </h2>
      <ul className="grid grid-cols-4 gap-x-2 gap-y-4">
        {people.map((person) => (
          <li key={person.tag}>
            <Link
              href={`/pay?to=${encodeURIComponent(person.tag)}`}
              aria-label={`Send money to ${person.name}`}
              className={tile}
            >
              <Avatar name={person.name} seed={person.tag} size={48} />
              <span className="type-caption w-full truncate text-center">{person.name.split(' ')[0]}</span>
            </Link>
          </li>
        ))}
        <li>
          <Link href="/pay" aria-label="Send money to someone new" className={tile}>
            <span className="inline-flex size-12 items-center justify-center rounded-full border border-border text-primary">
              <Plus aria-hidden="true" size={24} strokeWidth={1.75} />
            </span>
            <span className="type-caption">New</span>
          </Link>
        </li>
      </ul>
    </section>
  );
}
