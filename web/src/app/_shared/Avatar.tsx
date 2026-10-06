"use client";

import { useEffect, useRef, useState } from "react";
import { ACCOUNT_AVATAR_CHANGED_EVENT, loadAccountAvatarObjectUrl } from "../../data/accountAvatar";
import { getFirebase } from "../../data/firebase";

// The template's initials avatar. The tone is derived from the name, so the same person keeps the
// same colour on every screen without storing anything.

const TONES = ["sage", "sand", "rose", "mist"] as const;

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : (words[0][1] ?? "");
  return (first + last).toUpperCase();
}

function toneFor(name: string): (typeof TONES)[number] {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TONES[hash % TONES.length];
}

export function Avatar({ name, tone, uid }: { name: string; tone?: "dark" | (typeof TONES)[number]; uid?: string }) {
  const [photo, setPhoto] = useState<{ uid: string; url: string | null } | null>(null);
  const photoUrl = uid && photo?.uid === uid ? photo.url : null;
  const currentUrl = useRef<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    const accountUid = uid;
    let active = true;
    let request = 0;
    async function refreshPhoto() {
      const currentRequest = ++request;
      try {
        const { storage, db } = getFirebase();
        const nextUrl = await loadAccountAvatarObjectUrl(storage, db, accountUid);
        if (!active || currentRequest !== request) {
          if (nextUrl) URL.revokeObjectURL(nextUrl);
          return;
        }
        if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
        currentUrl.current = nextUrl;
        setPhoto({ uid: accountUid, url: nextUrl });
      } catch {
        if (active && currentRequest === request) {
          if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
          currentUrl.current = null;
          setPhoto({ uid: accountUid, url: null });
        }
      }
    }
    const changed = () => { void refreshPhoto(); };
    void refreshPhoto();
    window.addEventListener(ACCOUNT_AVATAR_CHANGED_EVENT, changed);
    return () => {
      active = false;
      request++;
      window.removeEventListener(ACCOUNT_AVATAR_CHANGED_EVENT, changed);
      if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
      currentUrl.current = null;
    };
  }, [uid]);

  return (
    <span
      className={`avatar avatar-${tone ?? toneFor(name)}`}
      aria-hidden="true"
      style={photoUrl ? { backgroundImage: `url("${photoUrl}")`, backgroundPosition: "center", backgroundSize: "cover" } : undefined}
    >
      {photoUrl ? null : initials(name)}
    </span>
  );
}
