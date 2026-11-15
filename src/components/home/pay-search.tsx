import { Search } from 'lucide-react';

/** A plain GET form; /pay handles the tag lookup. */
export function PaySearch() {
  return (
    <form action="/pay" method="get" role="search">
      <label htmlFor="home-search" className="sr-only">
        Send money to a tag
      </label>
      <div className="flex h-14 items-center gap-3 rounded-full border border-border bg-surface px-5 transition duration-press focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
        <Search aria-hidden="true" size={20} strokeWidth={1.75} className="text-muted" />
        <input
          id="home-search"
          name="to"
          type="text"
          maxLength={40}
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          placeholder="Pay by @tag"
          className="type-body min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted"
        />
      </div>
    </form>
  );
}
