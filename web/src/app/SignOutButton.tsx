"use client";

import { useRouter } from "next/navigation";
import { useSession } from "./SessionProvider";

export function SignOutButton({ className }: { className?: string }) {
  const { signOut } = useSession();
  const router = useRouter();
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        await signOut();
        router.replace("/entrar");
      }}
    >
      Sair
    </button>
  );
}
