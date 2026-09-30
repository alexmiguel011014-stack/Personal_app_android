import type { Metadata } from "next";

// The tab title of this route ("Mensalidades — ALLU personal", from the root layout's template).
export const metadata: Metadata = { title: "Mensalidades" };

export default function Layout({ children }: LayoutProps<"/app/mensalidades">) {
  return children;
}
