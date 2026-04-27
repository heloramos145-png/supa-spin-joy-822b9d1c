import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// hash básico (mantido pra não quebrar usuários antigos)
function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return `h${h}`;
}

export type ActivationCodeRow = {
  code: string;
  createdAt: number;
  expiresAt: number;
  usedBy: string[];
  maxUses: number;
  note?: string | null;
  revoked: boolean;
};

export type AppUserRow = {
  email: string;
  codeUsed: string;
  registeredAt: number;
  codeExpiresAt: number;
};

// ============ LOGIN / REGISTER ============

export const loginOrRegisterFn = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { email: string; password: string; code?: string }) => input,
  )
  .handler(async ({ data }) => {
    const e = data.email.trim().toLowerCase();
    const p = data.password;
    const c = (data.code || "").trim().toUpperCase();

    if (!e || !p) {
      return { ok: false as const, error: "Email e senha obrigatórios." };
    }

    // 1) Usuário já existe?
    const { data: existing } = await supabaseAdmin
      .from("app_users")
      .select("*")
      .eq("email", e)
      .maybeSingle();

    if (existing) {
      if (existing.password_hash !== simpleHash(p)) {
        return { ok: false as const, error: "Senha incorreta." };
      }
      // verifica revogação do código
      const { data: codeRow } = await supabaseAdmin
        .from("activation_codes")
        .select("revoked")
        .eq("code", existing.code_used)
        .maybeSingle();
      if (codeRow?.revoked) {
        return { ok: false as const, error: "Seu acesso foi revogado pelo admin." };
      }
      const codeExp = new Date(existing.code_expires_at).getTime();
      if (Date.now() > codeExp) {
        return {
          ok: false as const,
          error: "Seu código de ativação expirou. Peça um novo ao admin.",
        };
      }
      return {
        ok: true as const,
        session: { email: e, isAdmin: false, expiresAt: codeExp },
      };
    }

    // 2) Novo cadastro: precisa de código válido
    if (!c) {
      return { ok: false as const, error: "Código de ativação obrigatório." };
    }
    if (p.length < 4) {
      return { ok: false as const, error: "Senha precisa ter pelo menos 4 caracteres." };
    }
    const { data: code } = await supabaseAdmin
      .from("activation_codes")
      .select("*")
      .eq("code", c)
      .maybeSingle();
    if (!code) {
      return { ok: false as const, error: "Código inválido." };
    }
    if (code.revoked) {
      return { ok: false as const, error: "Código revogado pelo admin." };
    }
    const codeExp = new Date(code.expires_at).getTime();
    if (Date.now() > codeExp) {
      return { ok: false as const, error: "Código expirado." };
    }
    const usedBy = code.used_by ?? [];
    if (code.max_uses > 0 && usedBy.length >= code.max_uses) {
      return { ok: false as const, error: "Código já foi usado o máximo de vezes." };
    }

    // cria usuário
    const { error: insertErr } = await supabaseAdmin.from("app_users").insert({
      email: e,
      password_hash: simpleHash(p),
      code_used: c,
      code_expires_at: code.expires_at,
    });
    if (insertErr) {
      return { ok: false as const, error: "Erro ao cadastrar. Tente novamente." };
    }

    // marca código como usado
    await supabaseAdmin
      .from("activation_codes")
      .update({ used_by: [...usedBy, e] })
      .eq("code", c);

    return {
      ok: true as const,
      session: { email: e, isAdmin: false, expiresAt: codeExp },
    };
  });

// ============ ADMIN: CÓDIGOS ============

export const listCodesFn = createServerFn({ method: "GET" }).handler(async () => {
  const { data } = await supabaseAdmin
    .from("activation_codes")
    .select("*")
    .order("created_at", { ascending: false });
  const rows: ActivationCodeRow[] = (data ?? []).map((r) => ({
    code: r.code,
    createdAt: new Date(r.created_at).getTime(),
    expiresAt: new Date(r.expires_at).getTime(),
    usedBy: r.used_by ?? [],
    maxUses: r.max_uses,
    note: r.note,
    revoked: r.revoked,
  }));
  return rows;
});

export const createCodeFn = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      code?: string;
      daysValid: number;
      maxUses: number;
      note?: string;
    }) => input,
  )
  .handler(async ({ data }) => {
    const code =
      data.code?.trim().toUpperCase() ||
      Math.random().toString(36).slice(2, 10).toUpperCase();
    const expiresAt = new Date(
      Date.now() + data.daysValid * 24 * 60 * 60 * 1000,
    ).toISOString();
    const { error } = await supabaseAdmin.from("activation_codes").insert({
      code,
      expires_at: expiresAt,
      max_uses: data.maxUses,
      note: data.note ?? null,
    });
    if (error) throw new Error(error.message);
    return { code };
  });

export const deleteCodeFn = createServerFn({ method: "POST" })
  .inputValidator((input: { code: string }) => input)
  .handler(async ({ data }) => {
    await supabaseAdmin.from("activation_codes").delete().eq("code", data.code);
    return { ok: true };
  });

export const revokeCodeFn = createServerFn({ method: "POST" })
  .inputValidator((input: { code: string; revoked: boolean }) => input)
  .handler(async ({ data }) => {
    await supabaseAdmin
      .from("activation_codes")
      .update({ revoked: data.revoked })
      .eq("code", data.code);
    return { ok: true };
  });

// ============ ADMIN: USUÁRIOS ============

export const listUsersFn = createServerFn({ method: "GET" }).handler(async () => {
  const { data } = await supabaseAdmin
    .from("app_users")
    .select("*")
    .order("registered_at", { ascending: false });
  const rows = (data ?? []).map((u) => ({
    email: u.email,
    codeUsed: u.code_used,
    registeredAt: new Date(u.registered_at).getTime(),
    codeExpiresAt: new Date(u.code_expires_at).getTime(),
  }));
  return rows;
});

export const deleteUserFn = createServerFn({ method: "POST" })
  .inputValidator((input: { email: string }) => input)
  .handler(async ({ data }) => {
    await supabaseAdmin.from("app_users").delete().eq("email", data.email);
    return { ok: true };
  });
