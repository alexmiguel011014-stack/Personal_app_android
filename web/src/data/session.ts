import { doc, getDoc, type Firestore } from "firebase/firestore";
import type { LinkedStudentDoc } from "../domain/students";
import { toLinkedStudent } from "./converters";

// GOALS.md §23f: who the signed-in person is, and where they belong — ports of
// AuthRepository.resolveRole and RoleRouter's `when`.

export type UserRole = "ADM" | "TRAINER" | "STUDENT" | "NONE";

export interface Profile {
  role: UserRole;
  /** Set only for a STUDENT who has claimed an invite. */
  trainerId: string | null;
}

export type Session =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; uid: string; email: string | null; profile: Profile };

export type Area = "/entrar" | "/app" | "/aluno" | "/convite";

const ROLES: readonly UserRole[] = ["ADM", "TRAINER", "STUDENT", "NONE"];

/**
 * AuthRepository.resolveRole: the role from users/{uid}, uppercased; a missing document or an
 * unknown value reads as STUDENT — a self-registered account has no role document until it
 * claims an invite (firestore.rules only lets an ADM grant TRAINER).
 */
export function profileFrom(data: Record<string, unknown> | undefined): Profile {
  const raw = typeof data?.role === "string" ? data.role.toUpperCase() : "STUDENT";
  const role = ROLES.includes(raw as UserRole) ? (raw as UserRole) : "STUDENT";
  const trainerId = typeof data?.trainerId === "string" ? data.trainerId : null;
  return { role, trainerId };
}

/** A connected student's own profile — StudentRepository.getMyProfile, read once. */
export async function loadMyProfile(db: Firestore, uid: string): Promise<LinkedStudentDoc | null> {
  const snapshot = await getDoc(doc(db, "users", uid));
  return snapshot.exists() ? toLinkedStudent(uid, snapshot.data()) : null;
}

/** Reading one's own users/{uid} is allowed even before it exists (firestore.rules self-read). */
export async function resolveProfile(db: Firestore, uid: string): Promise<Profile> {
  const snapshot = await getDoc(doc(db, "users", uid));
  return profileFrom(snapshot.exists() ? snapshot.data() : undefined);
}

/**
 * RoleRouter's `when`, as routes. One difference by design: an ADM lands on /app — the Android
 * app's admin dashboard has no web counterpart in §23, and /app is where a staff account belongs.
 * A STUDENT who hasn't claimed an invite goes to /convite; a NONE account to /entrar, which says
 * the account has no role yet — as the Android LoginScreen does.
 */
export function destinationFor(session: Exclude<Session, { status: "loading" }>): Area {
  if (session.status === "signedOut") return "/entrar";
  const { role, trainerId } = session.profile;
  if (role === "ADM" || role === "TRAINER") return "/app";
  if (role === "STUDENT") return trainerId !== null ? "/aluno" : "/convite";
  return "/entrar";
}
