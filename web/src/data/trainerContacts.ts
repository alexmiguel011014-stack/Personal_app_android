import { deleteDoc, doc, serverTimestamp, setDoc, type Firestore } from "firebase/firestore";
import { getDoc } from "./firestoreRead";
import { checkContactInput, type TrainerContact } from "../domain/trainerContact";
import { toTrainerContact } from "./converters";

// GOALS.md §38h (D9): the personal's opt-in contact card. Written only by them (firestore.rules v8), read by them and by
// the alunos linked to them; turning it off deletes the document.

/** Saves the card; throws on input `checkContactInput` refuses (the screen checks first and says which field). */
export async function saveMyContact(db: Firestore, trainerId: string, input: { name: string; whatsapp: string }): Promise<void> {
  const checked = checkContactInput(input);
  if (!checked.ok) throw new Error(`invalid contact: ${checked.problem}`);
  await setDoc(doc(db, "trainerContacts", trainerId), { name: checked.name, whatsapp: checked.whatsapp, updatedAt: serverTimestamp() });
}

export async function removeMyContact(db: Firestore, trainerId: string): Promise<void> {
  await deleteDoc(doc(db, "trainerContacts", trainerId));
}

/** One read: the card of the personal `trainerId`, or null when they have none (the aluno's side and the personal's own account page). */
export async function loadTrainerContact(db: Firestore, trainerId: string): Promise<TrainerContact | null> {
  const snapshot = await getDoc(doc(db, "trainerContacts", trainerId));
  return snapshot.exists() ? toTrainerContact(snapshot.id, snapshot.data()) : null;
}
