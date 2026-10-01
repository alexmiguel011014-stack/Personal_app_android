"use client";

import { useSearchParams } from "next/navigation";
import TrainerDetail from "./trainer-detail";

export default function TrainerDetailQuery() {
  const params = useSearchParams();
  return <TrainerDetail trainerId={params.get("id") ?? ""} />;
}
