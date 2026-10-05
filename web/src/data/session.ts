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
  /** Missing or unknown values are active; the rules enforce suspension for trainer writes. */
  accessStatus: "active" | "suspended";
  /** Missing stays null for existing trainers, which are not retroactively assigned terms. */
  platformBillingStatus: "pending" | "trial" | "current" | "blocked" | null;
  platformBillingUntil: number | null;
}

export type Session =
  | { status: "loading" }
  | { status: "signedOut" }
  | {
      status: "signedIn";
      uid: string;
      email: string | null;
      /** GOALS.md §27: whether the address was confirmed by its link — what a new account needs to
       *  claim an invite. As of the last load; `refresh()` after a `reload()` picks up a change. */
      emailVerified: boolean;
      profile: Profile;
    };

export type Area = "/entrar" | "/app" | "/admin" | "/aluno" | "/convite";

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
  const accessStatus = data?.accessStatus === "suspended" ? "suspended" : "active";
  const billingStatus = data?.platformBillingStatus;
  const platformBillingStatus = billingStatus === "pending" || billingStatus === "trial" || billingStatus === "current" || billingStatus === "blocked"
    ? billingStatus
    : null;
  const rawUntil = data?.platformBillingUntil;
  const platformBillingUntil = Number.isSafeInteger(rawUntil) && typeof rawUntil === "number" ? rawUntil : null;
  return { role, trainerId, accessStatus, platformBillingStatus, platformBillingUntil };
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
 * RoleRouter's `when`, as routes. §26g gives ADM its own /admin area. Suspended trainers are sent
 * to /entrar, where the page explains the suspension and offers sign-out. A STUDENT who hasn't
 * claimed an invite goes to /convite; a NONE account to /entrar, which says
 * the account has no role yet — as the Android LoginScreen does.
 */
export function destinationFor(session: Exclude<Session, { status: "loading" }>): Area {
  if (session.status === "signedOut") return "/entrar";
  const { role, trainerId, accessStatus } = session.profile;
  if (role === "ADM") return "/admin";
  if (role === "TRAINER") return accessStatus === "suspended" ? "/entrar" : "/app";
  if (role === "STUDENT") return trainerId !== null ? "/aluno" : "/convite";
  return "/entrar";
}
