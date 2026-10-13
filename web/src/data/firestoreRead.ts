import {
  getDoc as firestoreGetDoc,
  getDocs as firestoreGetDocs,
  type DocumentData,
  type DocumentReference,
  type DocumentSnapshot,
  type Query,
  type QuerySnapshot,
} from "firebase/firestore";

// GOALS.md §38b: the Spark plan bills every document a read returns (a query that returns nothing
// still costs one), and its 50,000 reads a day are shared by the whole project. Every getDoc/getDocs
// in data/ goes through here so that, against the local emulators only, the documents each page
// reads are tallied in `window.__alluReads` by collection — what `npm run e2e:read-budget` asserts.
// In production this is a plain pass-through.

const counting = process.env.NEXT_PUBLIC_FIREBASE_EMULATORS === "true";

type ReadTally = Record<string, number>;

/** Adds `documents` reads (at least one: an empty result is billed too) under `label`. */
export function noteReads(label: string, documents: number): void {
  if (!counting || typeof window === "undefined") return;
  const scope = window as unknown as { __alluReads?: ReadTally };
  const tally = (scope.__alluReads ??= {});
  tally[label] = (tally[label] ?? 0) + Math.max(1, documents);
}

export async function getDocs<AppModel, DbModel extends DocumentData>(
  query: Query<AppModel, DbModel>,
): Promise<QuerySnapshot<AppModel, DbModel>> {
  const snapshot = await firestoreGetDocs(query);
  noteReads(snapshot.docs[0]?.ref.parent.id ?? "(consulta vazia)", snapshot.size);
  return snapshot;
}

export async function getDoc<AppModel, DbModel extends DocumentData>(
  reference: DocumentReference<AppModel, DbModel>,
): Promise<DocumentSnapshot<AppModel, DbModel>> {
  const snapshot = await firestoreGetDoc(reference);
  noteReads(reference.parent.id, 1);
  return snapshot;
}
