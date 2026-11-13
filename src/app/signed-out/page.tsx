export const metadata = { title: 'Signed out' };

export default async function SignedOutPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-5 text-center">
      <h1 className="text-2xl font-bold">{error ? 'We could not sign you in' : 'You’re signed out'}</h1>
      <p className="text-sm text-muted">
        {error
          ? 'The sign-in was cancelled or expired. Try again.'
          : 'You have signed out of your Spurs account.'}
      </p>
      <a href="/auth/login" className="text-sm font-semibold text-primary">
        Sign in again
      </a>
    </main>
  );
}
