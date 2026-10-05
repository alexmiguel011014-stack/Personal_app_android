import { FirebaseError } from "firebase/app";
import { deleteObject, getBytes, getMetadata, ref, uploadBytes, type FirebaseStorage } from "firebase/storage";
import { doc, getDoc, updateDoc, type Firestore } from "firebase/firestore";

export const MAX_ACCOUNT_AVATAR_BYTES = 2 * 1024 * 1024;
export const ACCOUNT_AVATAR_CHANGED_EVENT = "account-avatar-changed";
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function accountAvatarPath(uid: string): string {
  return `account-avatars/${uid}/profile`;
}

export async function saveAccountAvatarPath(db: Firestore, uid: string, path: string | null): Promise<void> {
  if (path !== null && path !== accountAvatarPath(uid)) throw new Error("O caminho da imagem não corresponde a esta conta.");
  await updateDoc(doc(db, "users", uid), { avatarStoragePath: path });
}

export function validateAccountAvatar(file: Pick<File, "size" | "type">): string | null {
  if (!ALLOWED_TYPES.has(file.type)) return "Escolha uma imagem JPG, PNG ou WebP.";
  if (file.size <= 0 || file.size > MAX_ACCOUNT_AVATAR_BYTES) return "A imagem precisa ter até 2 MB.";
  return null;
}

/** Reads with the signed-in Firebase client and returns a temporary object URL, never a token URL. */
export async function loadAccountAvatarObjectUrl(storage: FirebaseStorage, db: Firestore, uid: string): Promise<string | null> {
  const profile = await getDoc(doc(db, "users", uid));
  if (!profile.exists() || profile.get("avatarStoragePath") !== accountAvatarPath(uid)) return null;
  const image = ref(storage, accountAvatarPath(uid));
  try {
    const metadata = await getMetadata(image);
    if (!metadata.contentType || !ALLOWED_TYPES.has(metadata.contentType) || metadata.size > MAX_ACCOUNT_AVATAR_BYTES) return null;
    const bytes = await getBytes(image, MAX_ACCOUNT_AVATAR_BYTES);
    const blobBytes = new Uint8Array(bytes.byteLength);
    blobBytes.set(new Uint8Array(bytes));
    return URL.createObjectURL(new Blob([blobBytes as BlobPart], { type: metadata.contentType }));
  } catch (error) {
    if (error instanceof FirebaseError && error.code === "storage/object-not-found") return null;
    throw error;
  }
}

export async function uploadAccountAvatar(storage: FirebaseStorage, uid: string, file: File): Promise<void> {
  const invalid = validateAccountAvatar(file);
  if (invalid) throw new Error(invalid);
  await uploadBytes(ref(storage, accountAvatarPath(uid)), file, { contentType: file.type });
}

export async function removeAccountAvatar(storage: FirebaseStorage, uid: string): Promise<void> {
  try {
    await deleteObject(ref(storage, accountAvatarPath(uid)));
  } catch (error) {
    if (error instanceof FirebaseError && error.code === "storage/object-not-found") return;
    throw error;
  }
}

export function accountAvatarError(error: unknown): string {
  const code = error instanceof FirebaseError ? error.code : "";
  if (code === "storage/no-default-bucket" || code === "storage/bucket-not-found") {
    return "O armazenamento de imagens ainda não foi configurado no Firebase.";
  }
  if (code === "storage/unauthorized") {
    return "O Firebase recusou o acesso à imagem. Confira se as regras privadas do Storage foram publicadas.";
  }
  return error instanceof Error ? error.message : "Não foi possível atualizar a imagem. Tente novamente.";
}
