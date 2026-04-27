// Auth client-side: sessão fica em localStorage (lembrar login),
// mas códigos e usuários ficam no banco online via server functions.

import {
  loginOrRegisterFn,
  listCodesFn,
  createCodeFn,
  deleteCodeFn,
  revokeCodeFn,
  listUsersFn,
  deleteUserFn,
} from "@/utils/auth.functions";

const ADMIN_EMAIL = "annylaura1718@gmail.com";
const ADMIN_PASSWORD = "Lauraiablaze89@";

const SESSION_KEY = "fluxojon:session:v1";

export type Session = {
  email: string;
  isAdmin: boolean;
  expiresAt: number;
};

export type ActivationCode = {
  code: string;
  createdAt: number;
  expiresAt: number;
  usedBy: string[];
  maxUses: number;
  note?: string | null;
  revoked?: boolean;
};

export type RegisteredUser = {
  email: string;
  codeUsed: string;
  registeredAt: number;
  codeExpiresAt: number;
};

function readSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

function writeSession(s: Session) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(s));
}

export function getSession(): Session | null {
  const s = readSession();
  if (!s) return null;
  if (Date.now() > s.expiresAt) {
    clearSession();
    return null;
  }
  return s;
}

export function clearSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_KEY);
}

// =============== LOGIN ===============

export async function login(
  email: string,
  password: string,
  code: string,
): Promise<{ ok: true; session: Session } | { ok: false; error: string }> {
  const e = email.trim().toLowerCase();
  const p = password;

  // Admin é hardcoded local — sem precisar de código
  if (e === ADMIN_EMAIL.toLowerCase()) {
    if (p !== ADMIN_PASSWORD) {
      return { ok: false, error: "Senha de admin incorreta." };
    }
    const session: Session = {
      email: ADMIN_EMAIL,
      isAdmin: true,
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    };
    writeSession(session);
    return { ok: true, session };
  }

  // Cliente: vai pro servidor
  try {
    const res = await loginOrRegisterFn({
      data: { email: e, password: p, code },
    });
    if (!res.ok) return { ok: false, error: res.error };
    writeSession(res.session);
    return { ok: true, session: res.session };
  } catch (err) {
    return {
      ok: false,
      error: "Erro de conexão. Tente novamente em alguns segundos.",
    };
  }
}

// =============== ADMIN: CÓDIGOS ===============

export async function listCodes(): Promise<ActivationCode[]> {
  return await listCodesFn();
}

export async function createCode(input: {
  code?: string;
  daysValid: number;
  maxUses: number;
  note?: string;
}): Promise<{ code: string }> {
  return await createCodeFn({ data: input });
}

export async function deleteCode(code: string) {
  await deleteCodeFn({ data: { code } });
}

export async function revokeCode(code: string) {
  await revokeCodeFn({ data: { code, revoked: true } });
}

export async function unrevokeCode(code: string) {
  await revokeCodeFn({ data: { code, revoked: false } });
}

// =============== ADMIN: USUÁRIOS ===============

export async function listUsers(): Promise<RegisteredUser[]> {
  return await listUsersFn();
}

export async function deleteUser(email: string) {
  await deleteUserFn({ data: { email } });
}
