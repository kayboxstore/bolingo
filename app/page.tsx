export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-5xl font-semibold tracking-tight text-brand">Motema</h1>
      <p className="max-w-md text-lg text-ink/70">
        Rencontrez, aimez, connectez. Le scaffolding Next.js + Tailwind + Supabase est prêt.
      </p>
      <a
        href="https://supabase.com/docs"
        className="rounded-card bg-brand px-6 py-3 font-medium text-brand-fg transition hover:opacity-90"
      >
        Configurer Supabase
      </a>
    </main>
  );
}
