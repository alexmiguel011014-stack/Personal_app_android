import { FirebaseError } from "firebase/app";
import type { Firestore } from "firebase/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { claimInvite } from "./invites";

const firestoreMock = vi.hoisted(() => ({
  runTransaction: vi.fn(),
  invite: { current: {} as Record<string, unknown> },
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => "adminAudit"),
  doc: vi.fn((...parts: unknown[]) => ({ path: parts.map(String).join("/") })),
  runTransaction: firestoreMock.runTransaction,
}));

const db = {} as Firestore;
const now = 100;

beforeEach(() => {
  firestoreMock.invite.current = { used: false, trainerId: "trainer-a" };
  firestoreMock.runTransaction.mockReset();
  firestoreMock.runTransaction.mockImplementation(async (_db, operation) => operation({
    get: async () => ({
      exists: () => true,
      get: (field: string) => firestoreMock.invite.current[field],
    }),
    set: vi.fn(),
    update: vi.fn(),
  }));
});

async function claim(): ReturnType<typeof claimInvite> {
  return claimInvite(db, "student-a", "INV-OPEN", now);
}

describe("claimInvite eligibility feedback", () => {
  it("accepts a legacy invite with no expiry or resolution fields", async () => {
    await expect(claim()).resolves.toEqual({ ok: true, trainerId: "trainer-a" });
  });

  it("accepts null expiry and null cancellation or revocation fields", async () => {
    firestoreMock.invite.current = {
      ...firestoreMock.invite.current,
      expiresAt: null,
      cancelledAt: null,
      revokedAt: null,
    };
    await expect(claim()).resolves.toEqual({ ok: true, trainerId: "trainer-a" });
  });

  it("accepts a future integer expiry", async () => {
    firestoreMock.invite.current = { ...firestoreMock.invite.current, expiresAt: now + 1 };
    await expect(claim()).resolves.toEqual({ ok: true, trainerId: "trainer-a" });
  });

  it("requires used to be exactly false", async () => {
    delete firestoreMock.invite.current.used;
    await expect(claim()).resolves.toEqual({ ok: false, message: "Este convite não está mais disponível." });
  });

  it("gives an actionable message when Firestore rejects an unavailable or paused invite", async () => {
    firestoreMock.runTransaction.mockRejectedValueOnce(new FirebaseError("permission-denied", "denied"));
    await expect(claim()).resolves.toEqual({
      ok: false,
      message: "O convite não está disponível. Ele pode ter sido pausado, cancelado ou usado, ou sua conta já estar vinculada. Peça ao personal para conferir ou reativar o cadastro.",
    });
  });

  it("explains a used invite", async () => {
    firestoreMock.invite.current.used = true;
    await expect(claim()).resolves.toEqual({ ok: false, message: "Este código de convite já foi utilizado." });
  });

  it("explains a cancelled invite", async () => {
    firestoreMock.invite.current.cancelledAt = now;
    await expect(claim()).resolves.toEqual({
      ok: false,
      message: "Este convite foi cancelado. Peça um novo convite ao treinador.",
    });
  });

  it("explains a revoked invite", async () => {
    firestoreMock.invite.current.revokedAt = now;
    await expect(claim()).resolves.toEqual({
      ok: false,
      message: "Este convite foi revogado. Peça um novo convite ao treinador.",
    });
  });

  it("explains an expired legacy invite using the supplied now", async () => {
    firestoreMock.invite.current.expiresAt = now;
    await expect(claim()).resolves.toEqual({
      ok: false,
      message: "Este convite expirou. Peça um novo código ao treinador.",
    });
  });

  it("rejects a malformed expiry with a clear message", async () => {
    firestoreMock.invite.current.expiresAt = "amanhã";
    await expect(claim()).resolves.toEqual({
      ok: false,
      message: "A validade deste convite é inválida. Peça um novo código ao treinador.",
    });
  });

  it("rejects a non-integer numeric expiry", async () => {
    firestoreMock.invite.current.expiresAt = now + 0.5;
    await expect(claim()).resolves.toEqual({
      ok: false,
      message: "A validade deste convite é inválida. Peça um novo código ao treinador.",
    });
  });
});
