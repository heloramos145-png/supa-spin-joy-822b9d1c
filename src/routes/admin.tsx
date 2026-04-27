import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  getSession,
  clearSession,
  listCodes,
  createCode,
  deleteCode,
  revokeCode,
  unrevokeCode,
  listUsers,
  deleteUser,
  type ActivationCode,
  type RegisteredUser,
} from "@/lib/auth";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
  head: () => ({
    meta: [{ title: "FluxoJon — ADM" }],
  }),
});

function fmtDate(ms: number): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms));
}

function AdminPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [codes, setCodes] = useState<ActivationCode[]>([]);
  const [users, setUsers] = useState<RegisteredUser[]>([]);

  // Form
  const [customCode, setCustomCode] = useState("");
  const [days, setDays] = useState(30);
  const [maxUses, setMaxUses] = useState(1);
  const [note, setNote] = useState("");

  function refresh() {
    setCodes(listCodes());
    setUsers(listUsers());
  }

  useEffect(() => {
    const s = getSession();
    if (!s) {
      navigate({ to: "/login" });
      return;
    }
    if (!s.isAdmin) {
      navigate({ to: "/" });
      return;
    }
    refresh();
    setReady(true);
  }, [navigate]);

  if (!ready) return null;

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    createCode({
      code: customCode || undefined,
      daysValid: days,
      maxUses,
      note: note || undefined,
    });
    setCustomCode("");
    setNote("");
    refresh();
  }

  function logout() {
    clearSession();
    navigate({ to: "/login" });
  }

  const now = Date.now();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-emerald-500/30 bg-gradient-to-r from-slate-950 via-emerald-950/40 to-slate-950">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">
              <span className="text-white">FLUXO</span>
              <span className="text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]">
                JON
              </span>
              <span className="ml-2 rounded-md bg-emerald-500 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-widest text-slate-950">
                ADM
              </span>
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-emerald-500/40 bg-slate-900 px-3 py-1.5 text-xs font-bold text-emerald-300 hover:bg-slate-800"
            >
              Ver site
            </a>
            <button
              onClick={logout}
              className="rounded-md bg-rose-500/20 px-3 py-1.5 text-xs font-bold text-rose-300 hover:bg-rose-500/30 border border-rose-500/40"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        {/* Criar código */}
        <section className="rounded-xl border border-emerald-500/30 bg-slate-900/60 p-4">
          <h2 className="mb-3 text-sm font-extrabold uppercase tracking-widest text-emerald-300">
            Criar código de ativação
          </h2>
          <form
            onSubmit={handleCreate}
            className="grid grid-cols-1 gap-3 sm:grid-cols-5"
          >
            <div className="sm:col-span-2">
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Código (opcional)
              </label>
              <input
                value={customCode}
                onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
                placeholder="auto-gerado"
                className="w-full rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1.5 text-sm font-mono tracking-widest text-slate-100 outline-none focus:border-emerald-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Dias válido
              </label>
              <input
                type="number"
                min={1}
                value={days}
                onChange={(e) => setDays(Number(e.target.value) || 1)}
                className="w-full rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-emerald-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Usos máx (0=∞)
              </label>
              <input
                type="number"
                min={0}
                value={maxUses}
                onChange={(e) => setMaxUses(Number(e.target.value) || 0)}
                className="w-full rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-emerald-400"
              />
            </div>
            <div className="sm:col-span-5">
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Nota (opcional)
              </label>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="ex: Rodrigo - mensal"
                className="w-full rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-emerald-400"
              />
            </div>
            <div className="sm:col-span-5">
              <button
                type="submit"
                className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-extrabold uppercase tracking-wider text-slate-950 hover:bg-emerald-400"
              >
                Gerar código
              </button>
            </div>
          </form>
        </section>

        {/* Lista de códigos */}
        <section className="rounded-xl border border-emerald-500/30 bg-slate-900/60 p-4">
          <h2 className="mb-3 text-sm font-extrabold uppercase tracking-widest text-emerald-300">
            Códigos ({codes.length})
          </h2>
          {codes.length === 0 ? (
            <p className="text-xs text-slate-500">Nenhum código criado ainda.</p>
          ) : (
            <div className="space-y-2">
              {codes.map((c) => {
                const expired = now > c.expiresAt;
                const usedUp = c.maxUses > 0 && c.usedBy.length >= c.maxUses;
                const revoked = !!c.revoked;
                const dead = expired || usedUp || revoked;
                return (
                  <div
                    key={c.code}
                    className={`rounded-md border p-3 ${
                      revoked
                        ? "border-amber-500/40 bg-amber-500/5 opacity-80"
                        : dead
                          ? "border-slate-700 bg-slate-800/40 opacity-60"
                          : "border-emerald-500/40 bg-emerald-500/5"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-mono text-base font-extrabold tracking-widest text-emerald-200">
                        {c.code}
                      </div>
                      <div className="flex items-center gap-2 text-[10px]">
                        {revoked ? (
                          <span className="rounded bg-amber-500/20 px-2 py-0.5 font-bold text-amber-300">
                            REVOGADO
                          </span>
                        ) : expired ? (
                          <span className="rounded bg-rose-500/20 px-2 py-0.5 font-bold text-rose-300">
                            EXPIRADO
                          </span>
                        ) : (
                          <span className="rounded bg-emerald-500/20 px-2 py-0.5 font-bold text-emerald-300">
                            válido até {fmtDate(c.expiresAt)}
                          </span>
                        )}
                        <span className="text-slate-400">
                          {c.usedBy.length}/{c.maxUses === 0 ? "∞" : c.maxUses} usos
                        </span>
                        {revoked ? (
                          <button
                            onClick={() => {
                              unrevokeCode(c.code);
                              refresh();
                            }}
                            className="rounded bg-emerald-500/20 px-2 py-0.5 text-emerald-300 hover:bg-emerald-500/30"
                          >
                            reativar
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              if (confirm(`Revogar código ${c.code}? Quem usou ele perde acesso.`)) {
                                revokeCode(c.code);
                                refresh();
                              }
                            }}
                            className="rounded bg-amber-500/20 px-2 py-0.5 text-amber-300 hover:bg-amber-500/30"
                          >
                            revogar
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (confirm(`Apagar código ${c.code}?`)) {
                              deleteCode(c.code);
                              refresh();
                            }
                          }}
                          className="rounded bg-rose-500/20 px-2 py-0.5 text-rose-300 hover:bg-rose-500/30"
                        >
                          excluir
                        </button>
                      </div>
                    </div>
                    {c.note && (
                      <div className="mt-1 text-[11px] text-slate-400">
                        {c.note}
                      </div>
                    )}
                    {c.usedBy.length > 0 && (
                      <div className="mt-1 text-[10px] text-slate-500">
                        usado por: {c.usedBy.join(", ")}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Usuários */}
        <section className="rounded-xl border border-emerald-500/30 bg-slate-900/60 p-4">
          <h2 className="mb-3 text-sm font-extrabold uppercase tracking-widest text-emerald-300">
            Usuários cadastrados ({users.length})
          </h2>
          {users.length === 0 ? (
            <p className="text-xs text-slate-500">Ninguém se cadastrou ainda.</p>
          ) : (
            <div className="space-y-2">
              {users.map((u) => {
                const expired = now > u.codeExpiresAt;
                return (
                  <div
                    key={u.email}
                    className={`flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 ${
                      expired
                        ? "border-rose-500/30 bg-rose-500/5"
                        : "border-slate-700 bg-slate-800/40"
                    }`}
                  >
                    <div>
                      <div className="text-sm font-bold text-slate-100">
                        {u.email}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        cód: <span className="font-mono">{u.codeUsed}</span> •
                        cadastrado {fmtDate(u.registeredAt)} • expira{" "}
                        {fmtDate(u.codeExpiresAt)}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        if (confirm(`Remover usuário ${u.email}?`)) {
                          deleteUser(u.email);
                          refresh();
                        }
                      }}
                      className="rounded bg-rose-500/20 px-2 py-1 text-[10px] font-bold text-rose-300 hover:bg-rose-500/30"
                    >
                      remover
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
