import type { Metadata, Viewport } from "next";
import { SessionProvider } from "./SessionProvider";
// Direction B · Energia (GOALS.md §24): Inter for text, Barlow Condensed for headings. Self-hosted
// from the npm packages (Latin only) so the CSP's `font-src 'self'` holds and nothing is fetched
// from Google at run time.
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/barlow-condensed/latin-500.css";
import "@fontsource/barlow-condensed/latin-600.css";
import "@fontsource/barlow-condensed/latin-700.css";
import "./globals.css";

// GOALS.md §23k: the visual pass. One global stylesheet (globals.css) carries the ALLU design — the
// static template's layout and breakpoints, in the colours and type of direction B (§24) — over the
// phase-1 component tree, which was built and validated unstyled (§23j) and is left as it was.
export const metadata: Metadata = {
  title: { default: "ALLU personal", template: "%s — ALLU personal" },
  description: "Gestão de alunos, fichas de treino e evolução para personal trainers.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets the bottom tab bar sit above the home indicator (env(safe-area-inset-bottom)).
  viewportFit: "cover",
  themeColor: "#12161c",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" data-scroll-behavior="smooth">
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
