// GOALS.md §23h: the student surface. Mobile-first from the first line of markup — a student is on
// a phone browser essentially always, so this layout never inherits the trainer dashboard's.
export default function StudentLayout({ children }: LayoutProps<"/aluno">) {
  return (
    <>
      <header>
        <p>Personal Tracker — aluno</p>
      </header>
      {children}
    </>
  );
}
