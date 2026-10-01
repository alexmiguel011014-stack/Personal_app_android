"use client";

import { onAuthStateChanged, signOut as firebaseSignOut, type User } from "firebase/auth";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getFirebase } from "../data/firebase";
import { resolveProfile, type Session } from "../data/session";

// GOALS.md §23f: the signed-in person and their role, for every page. Firebase Auth lives in the
// browser, so this is client-side by nature; the pages gate on it for navigation, while the actual
// protection of data is firestore.rules.

interface SessionContextValue {
  session: Session;
  /** Set when the profile couldn't be read (offline, say) — distinct from "not signed in". */
  error: string | null;
  /** Re-reads users/{uid}: a claim changes the profile under a session that's already open. */
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>({ status: "loading" });
  const [error, setError] = useState<string | null>(null);
  // Auth events and refresh() can overlap (sign in, then a claim, then a refresh); only the most
  // recent load may write, or a slow earlier read could put a stale profile back.
  const latestLoad = useRef(0);

  const load = useCallback(async (user: User | null) => {
    const ticket = ++latestLoad.current;
    if (!user) {
      setError(null);
      setSession({ status: "signedOut" });
      return;
    }
    try {
      const profile = await resolveProfile(getFirebase().db, user.uid);
      if (ticket !== latestLoad.current) return;
      setError(null);
      setSession({ status: "signedIn", uid: user.uid, email: user.email, emailVerified: user.emailVerified, profile });
    } catch {
      if (ticket !== latestLoad.current) return;
      setError("Não foi possível carregar sua conta. Verifique a conexão.");
    }
  }, []);

  useEffect(() => onAuthStateChanged(getFirebase().auth, (user) => void load(user)), [load]);

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      error,
      refresh: () => load(getFirebase().auth.currentUser),
      signOut: () => firebaseSignOut(getFirebase().auth),
    }),
    [session, error, load],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession() must be used inside <SessionProvider>.");
  return value;
}
