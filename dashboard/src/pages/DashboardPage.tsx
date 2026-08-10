import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { clearSession } from "../lib/auth";
import { disconnectSocket } from "../lib/socket";
import { useRunners } from "../hooks/useRunners";
import RunnerMap from "../components/RunnerMap";
import RunnerList from "../components/RunnerList";
import RunnerDetail from "../components/RunnerDetail";
import { api } from "../lib/auth";
import { getRunnerStatus, type RunnerState } from "../lib/types";

type RunnerForm = { email: string; password: string; displayName: string };
type TaskForm = { clientName: string; clientAddress: string; clientPhone: string; notes: string; documents: string[]; customDocument: string };

const emptyRunnerForm: RunnerForm = { email: "", password: "", displayName: "" };
const emptyTaskForm: TaskForm = { clientName: "", clientAddress: "", clientPhone: "", notes: "", documents: [], customDocument: "" };

export default function DashboardPage() {
  const nav = useNavigate();
  const { runners, connected, refresh } = useRunners();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [trail, setTrail] = useState<Array<[number, number]>>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [formMode, setFormMode] = useState<"create" | "rename" | null>(null);
  const [form, setForm] = useState<RunnerForm>(emptyRunnerForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  const [taskRunner, setTaskRunner] = useState<RunnerState | null>(null);
  const [taskForm, setTaskForm] = useState<TaskForm>(emptyTaskForm);
  const [documentTypes, setDocumentTypes] = useState<string[]>([]);
  const [taskError, setTaskError] = useState<string | null>(null);

  // Load history when selection changes
  useEffect(() => {
    if (!selectedId || !runners[selectedId]?.hasLocation) return;
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
  }, [selectedId, runners[selectedId ?? ""]?.hasLocation]);

  const selected = selectedId ? runners[selectedId] ?? null : null;

  // Append live updates to trail
  useEffect(() => {
    if (!selected?.hasLocation) return;
    setTrail((prev) => {
      const last = prev[prev.length - 1];
      if (!last || last[0] !== selected.lat || last[1] !== selected.lon) {
        const next = [...prev, [selected.lat!, selected.lon!] as [number, number]];
        return next.length > 500 ? next.slice(-500) : next;
      }
      return prev;
    });
  }, [selected]);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const statusCounts = useMemo(() => Object.values(runners).reduce(
    (counts, runner) => {
      counts[getRunnerStatus(runner, now)] += 1;
      return counts;
    },
    { live: 0, stale: 0, idle: 0, offline: 0 } as Record<"live" | "stale" | "idle" | "offline", number>
  ), [runners, now]);

  function logout() {
    clearSession();
    disconnectSocket();
    nav("/login", { replace: true });
  }

  function openCreate() {
    setForm(emptyRunnerForm);
    setFormError(null);
    setFormMode("create");
  }

  function openRename(runner: RunnerState) {
    setForm({ email: runner.email, password: "", displayName: runner.displayName });
    setFormError(null);
    setFormMode("rename");
  }

  async function openTask(runner: RunnerState) {
    setTaskRunner(runner); setTaskForm(emptyTaskForm); setTaskError(null);
    try { const data = await api<{ documentTypes: Array<{ name: string }> }>("/api/document-types"); setDocumentTypes(data.documentTypes.map((item) => item.name)); }
    catch { setDocumentTypes([]); }
  }

  async function saveTask(event: React.FormEvent) {
    event.preventDefault(); if (!taskRunner) return;
    const documents = [...taskForm.documents, taskForm.customDocument.trim()].filter(Boolean);
    if (!documents.length) return setTaskError("Select or add at least one document.");
    setFormBusy(true); setTaskError(null);
    try {
      await api(`/api/runners/${taskRunner.runnerId}/tasks`, { method: "POST", body: JSON.stringify({ ...taskForm, documents }) });
      setTaskRunner(null);
    } catch (error: any) { setTaskError(error.message ?? "Could not send task"); }
    finally { setFormBusy(false); }
  }

  async function saveRunner(event: React.FormEvent) {
    event.preventDefault();
    setFormBusy(true);
    setFormError(null);
    try {
      if (formMode === "create") {
        await api("/api/runners", { method: "POST", body: JSON.stringify(form) });
      } else if (formMode === "rename" && selected) {
        await api(`/api/runners/${selected.runnerId}`, {
          method: "PATCH",
          body: JSON.stringify({ displayName: form.displayName }),
        });
      }
      await refresh();
      setFormMode(null);
    } catch (error: any) {
      setFormError(error.message ?? "Could not save runner");
    } finally {
      setFormBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-ink text-slate-100 flex flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-accent" />
          <h1 className="font-semibold">TrackRunner</h1>
          <span className="text-xs text-slate-500">
            {connected ? "dashboard connected" : "dashboard reconnecting"} · {statusCounts.live} live · {statusCounts.stale} stale · {statusCounts.idle} idle
          </span>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={openCreate} className="text-sm font-medium text-accent hover:text-cyan-200">Add runner</button>
          <button onClick={logout} className="text-sm text-slate-400 hover:text-slate-100">Sign out</button>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-4 p-3 md:p-4">
        <aside className="order-1 md:col-span-4 lg:col-span-3 bg-panel rounded-2xl border border-slate-800 overflow-hidden max-h-72 md:max-h-none">
          <div className="px-4 py-2 border-b border-slate-800 text-sm font-semibold">
            Runners
          </div>
          <RunnerList
            runners={runners}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </aside>

        <section className="order-2 md:col-span-8 lg:col-span-9 bg-panel rounded-2xl border border-slate-800 overflow-hidden min-h-[520px] flex flex-col">
          <div className="border-b border-slate-800 shrink-0">
            <div className="px-4 py-2 text-sm font-semibold">Details</div>
            <RunnerDetail runner={selected} trail={trail} onRename={openRename} onCreateTask={openTask} />
          </div>
          <div className="min-h-[360px] flex-1">
            <RunnerMap runners={runners} selectedId={selectedId} trail={trail} />
          </div>
        </section>
      </main>

      {formMode && (
        <div className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center bg-black/60 p-3">
          <form onSubmit={saveRunner} className="w-full max-w-md rounded-2xl border border-slate-700 bg-panel p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">{formMode === "create" ? "Add runner" : "Edit runner name"}</h2>
                <p className="text-xs text-slate-400 mt-1">{formMode === "create" ? "The runner is assigned to your dashboard automatically." : "This is the name shown on the dashboard and map."}</p>
              </div>
              <button type="button" onClick={() => setFormMode(null)} className="text-slate-400 hover:text-white" aria-label="Close">×</button>
            </div>
            <label className="block text-sm mb-1">Display name</label>
            <input className="w-full mb-3 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 focus:outline-none focus:border-accent" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} required minLength={2} maxLength={80} />
            {formMode === "create" && <>
              <label className="block text-sm mb-1">Runner email</label>
              <input className="w-full mb-3 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 focus:outline-none focus:border-accent" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required type="email" />
              <label className="block text-sm mb-1">Temporary password</label>
              <input className="w-full mb-3 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 focus:outline-none focus:border-accent" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required type="password" minLength={8} />
            </>}
            {formError && <p className="mb-3 text-sm text-red-400">{formError}</p>}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setFormMode(null)} className="px-3 py-2 text-sm text-slate-300">Cancel</button>
              <button disabled={formBusy} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50">{formBusy ? "Saving…" : formMode === "create" ? "Create runner" : "Save name"}</button>
            </div>
          </form>
        </div>
      )}
      {taskRunner && (
        <div className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center bg-black/60 p-3">
          <form onSubmit={saveTask} className="w-full max-w-lg rounded-2xl border border-slate-700 bg-panel p-5 shadow-2xl max-h-[95vh] overflow-y-auto">
            <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-semibold">Assign task to {taskRunner.displayName}</h2><p className="text-xs text-slate-400 mt-1">The runner receives this immediately when connected, and it remains available after reconnecting.</p></div><button type="button" onClick={() => setTaskRunner(null)} className="text-slate-400 hover:text-white">×</button></div>
            <label className="block text-sm mb-1">Client name</label><input className="w-full mb-3 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2" required value={taskForm.clientName} onChange={(e) => setTaskForm({ ...taskForm, clientName: e.target.value })} />
            <label className="block text-sm mb-1">Address</label><textarea className="w-full mb-3 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2" required minLength={5} value={taskForm.clientAddress} onChange={(e) => setTaskForm({ ...taskForm, clientAddress: e.target.value })} />
            <label className="block text-sm mb-1">Phone number</label><input className="w-full mb-3 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2" required value={taskForm.clientPhone} onChange={(e) => setTaskForm({ ...taskForm, clientPhone: e.target.value })} />
            <label className="block text-sm mb-2">Documents to collect</label><div className="grid grid-cols-2 gap-2 mb-3">{documentTypes.map((name) => <label key={name} className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={taskForm.documents.includes(name)} onChange={(e) => setTaskForm({ ...taskForm, documents: e.target.checked ? [...taskForm.documents, name] : taskForm.documents.filter((item) => item !== name) })} />{name}</label>)}</div>
            <input className="w-full mb-3 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2" placeholder="Other document (optional)" value={taskForm.customDocument} onChange={(e) => setTaskForm({ ...taskForm, customDocument: e.target.value })} />
            <label className="block text-sm mb-1">Notes (optional)</label><textarea className="w-full mb-3 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2" value={taskForm.notes} onChange={(e) => setTaskForm({ ...taskForm, notes: e.target.value })} />
            {taskError && <p className="mb-3 text-sm text-red-400">{taskError}</p>}<div className="flex justify-end gap-3"><button type="button" onClick={() => setTaskRunner(null)} className="px-3 py-2 text-sm">Cancel</button><button disabled={formBusy} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50">{formBusy ? "Sending…" : "Send task"}</button></div>
          </form>
        </div>
      )}
    </div>
  );
}
