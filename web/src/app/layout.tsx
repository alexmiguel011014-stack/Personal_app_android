import type { Metadata } from "next";
import { SessionProvider } from "./SessionProvider";

// GOALS.md §23: phase 1 is deliberately unstyled — no stylesheet, no className, no inline style
// anywhere under src/. The visual pass is 23k and is blocked on the 23j validation gate. A
// stylesheet added before then is how phase 1 quietly turns into phase 2.
export const metadata: Metadata = {
  title: "Personal Tracker",
  description: "Gestão de alunos, fichas de treino e evolução para personal trainers.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR">
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
