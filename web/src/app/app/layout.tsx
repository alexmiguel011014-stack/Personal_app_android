// GOALS.md §23g: the trainer surface. Its own layout, separate from /aluno's, on purpose — the
// two audiences want opposite things (density on a desktop vs one thing at a time on a phone),
// and one layout serving both is exactly the mistake §23 exists to undo.
//
// The doubled "app/app" path is not a typo: the outer `app/` is Next.js's App Router directory,
// the inner one is the `/app` URL segment chosen with the user on 2026-09-22.
export default function TrainerLayout({ children }: LayoutProps<"/app">) {
  return (
    <>
      <header>
        <p>Personal Tracker — treinador</p>
      </header>
      {children}
    </>
  );
}
