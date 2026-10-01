import { FirebaseError } from "firebase/app";

// GOALS.md §23f: Firebase Auth's error codes, as sentences a trainer or student can act on.
// Firebase deliberately returns one code for "no such user" and "wrong password" on current
// projects (invalid-credential), so the message doesn't say which — that's the point.

const MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "E-mail ou senha incorretos.",
  "auth/wrong-password": "E-mail ou senha incorretos.",
  "auth/user-not-found": "E-mail ou senha incorretos.",
  "auth/invalid-email": "E-mail inválido.",
  "auth/missing-password": "Digite a senha.",
  "auth/email-already-in-use": "Já existe uma conta com este e-mail — use \"Já tenho conta\".",
  "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
  "auth/too-many-requests": "Muitas tentativas. Espere alguns minutos e tente de novo.",
  "auth/network-request-failed": "Sem conexão com o servidor. Verifique a internet.",
  "auth/user-disabled": "Esta conta foi desativada.",
  // GOALS.md §27: the verification link. A continue URL outside the console's authorized domains is a
  // setup problem on our side, not something the student can fix.
  "auth/unauthorized-continue-uri": "Não foi possível enviar o link de confirmação agora. Avise o seu personal.",
  "auth/invalid-continue-uri": "Não foi possível enviar o link de confirmação agora. Avise o seu personal.",
  "auth/requires-recent-login": "Por segurança, entre de novo e repita.",
};

export function authErrorMessage(error: unknown): string {
  if (error instanceof FirebaseError && error.code in MESSAGES) return MESSAGES[error.code];
  return "Não foi possível concluir. Tente de novo.";
}
