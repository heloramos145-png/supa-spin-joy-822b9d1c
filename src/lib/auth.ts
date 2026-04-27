// Sistema simples de "auth" via localStorage.
// - Admin (você) tem credenciais fixas hardcoded.
// - Usuários comuns logam com email + senha + CÓDIGO DE ATIVAÇÃO criado pelo admin.
// - Códigos têm data de validade. Cada código pode ser de uso único ou múltiplo.

const ADMIN_EMAIL = "annylaura1718@gmail.com";
const ADMIN_PASSWORD = "Lauraiablaze89@";

const SESSION_KEY = "fluxojon:session:v1";
const CODES_KEY = "fluxojon:codes:v1";
const USERS_KEY = "fluxojon:users:v1";

export type Session = {
  email: string;
  isAdmin: boolean;
  expiresAt: number; // ms
};

export type ActivationCode = {
  code: string;
  createdAt: number;
  expiresAt: number; // ms
  usedBy: string[]; // emails que usaram
  maxUses: number; // 0 = ilimitado
  note?: string;
  revoked?: boolean;
};

export type RegisteredUser = {
  email: string;
  passwordHash: string; // simples (não é seguro de verdade — é só pra UX local)
  codeUsed: string;
  registeredAt: number;
  codeExpiresAt: number;
};

// hash bem básico só pra não guardar senha em texto puro no localStorage
function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return `h${h}`;
}

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, val: T) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(val));
  } catch {
    // ignore
  }
}

// ============ Sessão ============

export function getSession(): Session | null {
  const s = read<Session | null>(SESSION_KEY, null);
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

function setSession(s: Session) {
  write(SESSION_KEY, s);
}

// ============ Login ============

export type LoginResult =
  | { ok: true; session: Session }
  | { ok: false; error: string };

export function login(
  email: string,
  password: string,
  code: string,
): LoginResult {
  const e = email.trim().toLowerCase();
  const p = password;
  const c = code.trim().toUpperCase();

  // Admin: ignora código
  if (e === ADMIN_EMAIL.toLowerCase()) {
    if (p !== ADMIN_PASSWORD) {
      return { ok: false, error: "Senha de admin incorreta." };
    }
    const session: Session = {
      email: ADMIN_EMAIL,
      isAdmin: true,
      // admin: 30 dias
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    };
    setSession(session);
    return { ok: true, session };
  }

  // Usuário existente
  const users = read<RegisteredUser[]>(USERS_KEY, []);
  const existing = users.find((u) => u.email === e);
  if (existing) {
    if (existing.passwordHash !== simpleHash(p)) {
      return { ok: false, error: "Senha incorreta." };
    }
    if (Date.now() > existing.codeExpiresAt) {
      return {
        ok: false,
        error: "Seu código de ativação expirou. Peça um novo ao admin.",
      };
    }
    const session: Session = {
      email: e,
      isAdmin: false,
      expiresAt: existing.codeExpiresAt,
    };
    setSession(session);
    return { ok: true, session };
  }

  // Novo usuário: precisa de código válido
  if (!c) {
    return { ok: false, error: "Código de ativação obrigatório." };
  }
  const codes = read<ActivationCode[]>(CODES_KEY, []);
  const found = codes.find((x) => x.code === c);
  if (!found) {
    return { ok: false, error: "Código inválido." };
  }
  if (found.revoked) {
    return { ok: false, error: "Código revogado pelo admin." };
  }
  if (Date.now() > found.expiresAt) {
    return { ok: false, error: "Código expirado." };
  }
  if (found.maxUses > 0 && found.usedBy.length >= found.maxUses) {
    return { ok: false, error: "Código já foi usado o máximo de vezes." };
  }
  if (!p || p.length < 4) {
    return { ok: false, error: "Senha precisa ter pelo menos 4 caracteres." };
  }

  // registra
  const newUser: RegisteredUser = {
    email: e,
    passwordHash: simpleHash(p),
    codeUsed: c,
    registeredAt: Date.now(),
    codeExpiresAt: found.expiresAt,
  };
  users.push(newUser);
  write(USERS_KEY, users);

  const updatedCodes = codes.map((x) =>
    x.code === c ? { ...x, usedBy: [...x.usedBy, e] } : x,
  );
  write(CODES_KEY, updatedCodes);

  const session: Session = {
    email: e,
    isAdmin: false,
    expiresAt: found.expiresAt,
  };
  setSession(session);
  return { ok: true, session };
}

// ============ Códigos (admin) ============

export function listCodes(): ActivationCode[] {
  return read<ActivationCode[]>(CODES_KEY, []).sort(
    (a, b) => b.createdAt - a.createdAt,
  );
}

export function createCode(input: {
  code?: string;
  daysValid: number;
  maxUses: number;
  note?: string;
}): ActivationCode {
  const codes = read<ActivationCode[]>(CODES_KEY, []);
  const code =
    input.code?.trim().toUpperCase() ||
    Math.random().toString(36).slice(2, 10).toUpperCase();
  const entry: ActivationCode = {
    code,
    createdAt: Date.now(),
    expiresAt: Date.now() + input.daysValid * 24 * 60 * 60 * 1000,
    usedBy: [],
    maxUses: input.maxUses,
    note: input.note,
  };
  codes.push(entry);
  write(CODES_KEY, codes);
  return entry;
}

export function deleteCode(code: string) {
  const codes = read<ActivationCode[]>(CODES_KEY, []);
  write(
    CODES_KEY,
    codes.filter((c) => c.code !== code),
  );
}

export function listUsers(): RegisteredUser[] {
  return read<RegisteredUser[]>(USERS_KEY, []).sort(
    (a, b) => b.registeredAt - a.registeredAt,
  );
}

export function deleteUser(email: string) {
  const users = read<RegisteredUser[]>(USERS_KEY, []);
  write(
    USERS_KEY,
    users.filter((u) => u.email !== email),
  );
}
