import type { Metadata, Viewport } from "next";
import { SessionProvider } from "./SessionProvider";
import "./globals.css";

// GOALS.md §23k: the visual pass. One global stylesheet (globals.css) carries the ALLU design — the
// static template's tokens, components and breakpoints — over the phase-1 component tree, which was
// built and validated unstyled (§23j) and is left as it was.
export const metadata: Metadata = {
  title: { default: "ALLU", template: "%s — ALLU" },
  description: "Gestão de alunos, fichas de treino e evolução para personal trainers.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets the bottom tab bar sit above the home indicator (env(safe-area-inset-bottom)).
  viewportFit: "cover",
  themeColor: "#173d32",
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
