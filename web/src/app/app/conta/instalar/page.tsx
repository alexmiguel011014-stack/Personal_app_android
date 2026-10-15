import type { Metadata } from "next";
import { InstallGuidePage } from "../../../_shared/InstallGuide";

// GOALS.md §40c: the same guide in every area; the area's own layout supplies the guard and the frame.
export const metadata: Metadata = { title: "Instalar no celular" };

export default function InstallPage() {
  return <InstallGuidePage />;
}
