"use client";

import { useRouter } from "next/navigation";
import { useSession } from "./SessionProvider";

export function SignOutButton() {
  const { signOut } = useSession();
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await signOut();
        router.replace("/entrar");
      }}
    >
      Sair
    </button>
  );
}
