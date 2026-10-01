"use client";

import { onAuthStateChanged, signOut as firebaseSignOut, type User } from "firebase/auth";
import { doc, onSnapshot, type Unsubscribe } from "firebase/firestore";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getFirebase } from "../data/firebase";
import { profileFrom, type Session } from "../data/session";

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
  const profileSubscription = useRef<Unsubscribe | null>(null);

  const load = useCallback(async (user: User | null) => {
    const ticket = ++latestLoad.current;
    profileSubscription.current?.();
    profileSubscription.current = null;
    if (!user) {
      setError(null);
      setSession({ status: "signedOut" });
      return;
    }
    try {
      profileSubscription.current = onSnapshot(doc(getFirebase().db, "users", user.uid), (snapshot) => {
        if (ticket !== latestLoad.current) return;
        setError(null);
        setSession({
          status: "signedIn",
          uid: user.uid,
          email: user.email,
          emailVerified: user.emailVerified,
          profile: profileFrom(snapshot.exists() ? snapshot.data() : undefined),
        });
      }, () => {
        if (ticket === latestLoad.current) setError("Não foi possível carregar sua conta. Verifique a conexão.");
      });
    } catch {
      if (ticket === latestLoad.current) setError("Não foi possível carregar sua conta. Verifique a conexão.");
    }
  }, []);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(getFirebase().auth, (user) => void load(user));
    return () => {
      unsubscribeAuth();
      profileSubscription.current?.();
      profileSubscription.current = null;
      latestLoad.current += 1;
    };
  }, [load]);

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
