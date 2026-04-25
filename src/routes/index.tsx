import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { syncJonbetRoulette } from "@/utils/roulette.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Flame, Snowflake, Activity } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Análise Roleta Jonbet — Histórico e Estatísticas" },
      {
        name: "description",
        content:
          "Acompanhe em tempo real o histórico, números quentes e frios da roleta da Jonbet.",
      },
    ],
  }),
});

type RouletteRow = {
  id: number;
  game_id: string;
  number: number;
  color: "red" | "black" | "green";
  created_at: string;
};

const POLL_MS = 5000;

function colorClass(color: string) {
  if (color === "red") return "bg-red-600 text-white";
  if (color === "black") return "bg-zinc-900 text-white";
  return "bg-emerald-600 text-white";
}

function Index() {
  const [results, setResults] = useState<RouletteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function fetchResults() {
    const { data, error } = await supabase
      .from("roulette_results")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      setError(error.message);
      return;
    }
    setError(null);
    setResults((data ?? []) as RouletteRow[]);
  }

  async function doSync() {
    setSyncing(true);
    try {
      const res = await syncJonbetRoulette();
      if (!res.ok) setError(res.error ?? "Falha ao sincronizar");
      setLastSync(new Date().toLocaleTimeString("pt-BR"));
      await fetchResults();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    (async () => {
      await fetchResults();
      setLoading(false);
      await doSync();
    })();
    const interval = setInterval(doSync, POLL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    const total = results.length;
    const counts: Record<number, number> = {};
    let red = 0,
      black = 0,
      green = 0;
    let even = 0,
      odd = 0;
    let low = 0,
      high = 0; // 1-18 / 19-36
    for (const r of results) {
      counts[r.number] = (counts[r.number] ?? 0) + 1;
      if (r.color === "red") red++;
      else if (r.color === "black") black++;
      else green++;
      if (r.number !== 0) {
        if (r.number % 2 === 0) even++;
        else odd++;
        if (r.number <= 18) low++;
        else high++;
      }
    }
    const sorted = Object.entries(counts)
      .map(([n, c]) => ({ number: Number(n), count: c }))
      .sort((a, b) => b.count - a.count);
    const hot = sorted.slice(0, 5);
    const allNumbers = Array.from({ length: 37 }, (_, i) => i);
    const cold = allNumbers
      .map((n) => ({ number: n, count: counts[n] ?? 0 }))
      .sort((a, b) => a.count - b.count)
      .slice(0, 5);
    return { total, red, black, green, even, odd, low, high, hot, cold };
  }, [results]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Análise Roleta Jonbet
            </h1>
            <p className="text-sm text-muted-foreground">
              Histórico em tempo real • atualiza a cada {POLL_MS / 1000}s
            </p>
          </div>
          <div className="flex items-center gap-3">
            {lastSync && (
              <span className="text-xs text-muted-foreground">
                Última sincronização: {lastSync}
              </span>
            )}
            <Button onClick={doSync} disabled={syncing} size="sm">
              <RefreshCw
                className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`}
              />
              Atualizar
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Stat cards */}
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                <Activity className="mr-1 inline h-4 w-4" /> Total
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                Vermelho / Preto
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-semibold">
                <span className="text-red-500">{stats.red}</span>
                <span className="mx-1 text-muted-foreground">/</span>
                <span>{stats.black}</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                Par / Ímpar
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-semibold">
                {stats.even} / {stats.odd}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                1-18 / 19-36
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-semibold">
                {stats.low} / {stats.high}
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Hot / Cold */}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Flame className="h-4 w-4 text-orange-500" /> Quentes (mais frequentes)
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {stats.hot.map((h) => (
                <div
                  key={h.number}
                  className="flex items-center gap-2 rounded-md border border-border px-2 py-1"
                >
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${colorClass(getNumberColor(h.number))}`}
                  >
                    {h.number}
                  </span>
                  <span className="text-sm text-muted-foreground">×{h.count}</span>
                </div>
              ))}
              {stats.hot.length === 0 && (
                <p className="text-sm text-muted-foreground">Sem dados ainda.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Snowflake className="h-4 w-4 text-sky-500" /> Frios (menos frequentes)
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {stats.cold.map((c) => (
                <div
                  key={c.number}
                  className="flex items-center gap-2 rounded-md border border-border px-2 py-1"
                >
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${colorClass(getNumberColor(c.number))}`}
                  >
                    {c.number}
                  </span>
                  <span className="text-sm text-muted-foreground">×{c.count}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        {/* History */}
        <section>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Histórico recente</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground">Carregando…</p>
              ) : results.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum resultado ainda. Aguardando primeiro sync da API Jonbet…
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {results.map((r) => (
                    <span
                      key={r.id}
                      title={new Date(r.created_at).toLocaleString("pt-BR")}
                      className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold shadow-sm ${colorClass(r.color)}`}
                    >
                      {r.number}
                    </span>
                  ))}
                </div>
              )}
              {results.length > 0 && (
                <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">{results.length} jogadas</Badge>
                  <span>
                    Mais recente:{" "}
                    {new Date(results[0].created_at).toLocaleString("pt-BR")}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}

const RED_SET = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);
function getNumberColor(n: number): "red" | "black" | "green" {
  if (n === 0) return "green";
  return RED_SET.has(n) ? "red" : "black";
}
