import type { Metadata } from "next";

// The tab title of this route ("Agenda — ALLU", from the root layout's template).
export const metadata: Metadata = { title: "Agenda" };

export default function Layout({ children }: LayoutProps<"/app/agenda">) {
  return children;
}
