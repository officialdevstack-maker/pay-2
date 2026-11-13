import Link from 'next/link';

export default function SignedOutPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-5 text-center">
      <h1 className="text-2xl font-bold">You’re signed out</h1>
      <p className="text-sm text-muted">You have signed out of your Spurs account.</p>
      <Link href="/auth/login" className="text-sm font-semibold text-primary">
        Sign in again
      </Link>
    </main>
  );
}
