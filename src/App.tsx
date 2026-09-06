export function App() {
  return (
    <main className="min-h-screen bg-primary-light font-sans text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <section className="mx-auto max-w-xl px-6 py-16">
        <p className="text-xs font-medium tracking-widest text-primary uppercase dark:text-accent">
          Sowel
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-balance">House 3D</h1>
        <p className="mt-4 leading-relaxed">
          A stylised 3D view of a home, driven live by a Sowel instance. The scene arrives with
          phase 3 of the project map; the visual reference is the prototype in{" "}
          <code className="font-mono text-sm">prototype/maison-temoin.html</code>.
        </p>
      </section>
    </main>
  );
}
