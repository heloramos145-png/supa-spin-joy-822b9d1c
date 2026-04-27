import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { login, getSession } from "@/lib/auth";
import brancoIcon from "@/assets/branco-icon.png";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({
    meta: [{ title: "FluxoJon — Entrar" }],
  }),
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showCode, setShowCode] = useState(false);

  useEffect(() => {
    const s = getSession();
    if (s) {
      navigate({ to: s.isAdmin ? "/admin" : "/" });
    }
  }, [navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await login(email, password, code);
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    navigate({ to: res.session.isAdmin ? "/admin" : "/" });
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* Pedras brancas flutuando no fundo */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {Array.from({ length: 18 }).map((_, i) => {
          const left = (i * 53) % 100;
          const delay = (i * 0.7) % 6;
          const dur = 8 + (i % 5) * 2;
          const size = 18 + ((i * 7) % 22);
          return (
            <div
              key={i}
              className="absolute opacity-20"
              style={{
                left: `${left}%`,
                bottom: `-40px`,
                animation: `floatUp ${dur}s linear ${delay}s infinite`,
              }}
            >
              <div
                className="rounded-md bg-white ring-1 ring-emerald-500 flex items-center justify-center overflow-hidden"
                style={{ width: size, height: size }}
              >
                <img
                  src={brancoIcon}
                  alt=""
                  className="object-contain"
                  style={{ width: size - 4, height: size - 4 }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Glow de fundo */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/3 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/10 blur-3xl animate-pulse" />
      </div>

      <main className="relative z-10 mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 py-8">
        <div className="mb-6 text-center animate-fade-in">
          <h1 className="text-4xl font-extrabold tracking-tight">
            <span className="text-white">FLUXO</span>
            <span className="text-emerald-400 drop-shadow-[0_0_12px_rgba(52,211,153,0.7)]">
              JON
            </span>
          </h1>
          <p className="mt-2 text-xs uppercase tracking-[0.3em] text-emerald-400/80">
            Acesso restrito
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="w-full rounded-2xl border border-emerald-500/30 bg-slate-900/70 p-6 shadow-[0_0_40px_rgba(16,185,129,0.15)] backdrop-blur-sm animate-scale-in"
        >
          <div className="mb-4">
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-emerald-300">
              E-mail
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              className="w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/30"
            />
          </div>

          <div className="mb-4">
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-emerald-300">
              Senha
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/30"
            />
          </div>

          <div className="mb-4">
            <button
              type="button"
              onClick={() => setShowCode((v) => !v)}
              className="mb-1 text-[10px] font-bold uppercase tracking-widest text-emerald-300/80 hover:text-emerald-300"
            >
              {showCode ? "− " : "+ "}Código de ativação
            </button>
            {showCode && (
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="EX: ABC12345"
                className="w-full rounded-md border border-amber-500/40 bg-slate-950/60 px-3 py-2 text-sm font-mono tracking-widest text-amber-200 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30 animate-fade-in"
              />
            )}
            <p className="mt-1 text-[10px] text-slate-500">
              Primeiro acesso? Peça um código ao admin.
            </p>
          </div>

          {error && (
            <div className="mb-3 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300 animate-fade-in">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="group relative w-full overflow-hidden rounded-md bg-gradient-to-r from-emerald-500 to-emerald-400 px-4 py-2.5 text-sm font-extrabold uppercase tracking-wider text-slate-950 transition hover:from-emerald-400 hover:to-emerald-300 disabled:opacity-60"
          >
            <span className="relative z-10">
              {loading ? "Entrando..." : "Entrar"}
            </span>
            <span className="absolute inset-0 -translate-x-full bg-white/30 transition-transform duration-700 group-hover:translate-x-full" />
          </button>
        </form>

        <p className="mt-6 text-center text-[10px] text-slate-500">
          © FluxoJon — Análise Double Jonbet
        </p>
      </main>

      <style>{`
        @keyframes floatUp {
          0% { transform: translateY(0) rotate(0deg); opacity: 0; }
          10% { opacity: 0.25; }
          90% { opacity: 0.25; }
          100% { transform: translateY(-110vh) rotate(360deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
