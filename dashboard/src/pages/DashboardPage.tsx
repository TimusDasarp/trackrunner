import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { clearSession } from "../lib/auth";
import { disconnectSocket } from "../lib/socket";
import { useRunners } from "../hooks/useRunners";
import RunnerMap from "../components/RunnerMap";
import RunnerList from "../components/RunnerList";
import RunnerDetail from "../components/RunnerDetail";
import { api } from "../lib/auth";

export default function DashboardPage() {
  const nav = useNavigate();
  const { runners, connected } = useRunners();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [trail, setTrail] = useState<Array<[number, number]>>([]);
  const [history, setHistory] = useState<any[]>([]);

  // Auto-select first runner
  useEffect(() => {
    if (!selectedId && Object.keys(runners).length > 0) {
      setSelectedId(Object.keys(runners)[0]);
    }
  }, [runners, selectedId]);

  // Load history when selection changes
  useEffect(() => {
    if (!selectedId) return;
    api<{ points: any[] }>(`/api/runners/${selectedId}/history?limit=200`)
      .then((res) => {
        setHistory(res.points ?? []);
        setTrail(
          (res.points ?? []).map((p: any) => [p.lat, p.lon] as [number, number])
        );
      })
      .catch(() => {
        setHistory([]);
        setTrail([]);
      });
  }, [selectedId]);

  const selected = selectedId ? runners[selectedId] ?? null : null;

  // Append live updates to trail
  useEffect(() => {
    if (!selected) return;
    setTrail((prev) => {
      const last = prev[prev.length - 1];
      if (!last || last[0] !== selected.lat || last[1] !== selected.lon) {
        const next = [...prev, [selected.lat, selected.lon] as [number, number]];
        return next.length > 500 ? next.slice(-500) : next;
      }
      return prev;
    });
  }, [selected]);

  const onlineCount = useMemo(
    () => Object.values(runners).filter((r) => r.online).length,
    [runners]
  );

  function logout() {
    clearSession();
    disconnectSocket();
    nav("/login", { replace: true });
  }

  return (
    <div className="min-h-screen bg-ink text-slate-100 flex flex-col">
      <header className="flex items-center justify-between px-6 py-3 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-accent" />
          <h1 className="font-semibold">TrackRunner</h1>
          <span className="text-xs text-slate-500">
            {connected ? "live" : "disconnected"} · {onlineCount} online
          </span>
        </div>
        <button
          onClick={logout}
          className="text-sm text-slate-400 hover:text-slate-100"
        >
          Sign out
        </button>
      </header>

      <main className="flex-1 grid grid-cols-12 gap-4 p-4">
        <aside className="col-span-3 bg-panel rounded-2xl border border-slate-800 overflow-hidden">
          <div className="px-4 py-2 border-b border-slate-800 text-sm font-semibold">
            Runners
          </div>
          <RunnerList
            runners={runners}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </aside>

        <section className="col-span-6 bg-panel rounded-2xl border border-slate-800 overflow-hidden">
          <RunnerMap runners={runners} selectedId={selectedId} trail={trail} />
        </section>

        <aside className="col-span-3 bg-panel rounded-2xl border border-slate-800 overflow-hidden">
          <div className="px-4 py-2 border-b border-slate-800 text-sm font-semibold">
            Details
          </div>
          <RunnerDetail runner={selected} trail={trail} />
        </aside>
      </main>
    </div>
  );
}
