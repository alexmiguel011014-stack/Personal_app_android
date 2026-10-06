import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "Planos e padrões" };

export default function PlansLayout({ children }: { children: ReactNode }) { return children; }
