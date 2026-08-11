import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { clearSession } from "../lib/auth";
import { disconnectSocket } from "../lib/socket";
import { useRunners } from "../hooks/useRunners";
import RunnerMap from "../components/RunnerMap";
import RunnerList from "../components/RunnerList";
import RunnerDetail from "../components/RunnerDetail";
import AddressPicker, { type AddressPin } from "../components/AddressPicker";
import { api } from "../lib/auth";
import { getSocket } from "../lib/socket";
import { getRunnerStatus, type RunnerState } from "../lib/types";
import { Button, Card, Chip } from "@material-tailwind/react";

type RunnerForm = { email: string; password: string; displayName: string };
type TaskForm = { clientName: string; clientAddress: string; clientPhone: string; notes: string; documents: string[]; customDocument: string; destinationLat?: number; destinationLon?: number };

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
  const [activeTasks, setActiveTasks] = useState<Array<{ id: string; runnerId: string; clientName: string; clientAddress: string; status: string }>>([]);

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

  useEffect(() => {
    if (!selectedId) return setActiveTasks([]);
    api<{ tasks: Array<{ id: string; runnerId: string; clientName: string; clientAddress: string; status: string }> }>(`/api/runners/${selectedId}/tasks`).then((response) => setActiveTasks(response.tasks ?? [])).catch(() => setActiveTasks([]));
  }, [selectedId]);

  useEffect(() => {
    const socket = getSocket();
    const updateTask = (task: { id: string; runnerId: string; clientName: string; clientAddress: string; status: string }) => {
      if (task.runnerId !== selectedId) return;
      setActiveTasks((current) => (task.status === "completed" || task.status === "unable_to_complete") ? current.filter((item) => item.id !== task.id) : [task, ...current.filter((item) => item.id !== task.id)]);
    };
    socket.on("task:created", updateTask); socket.on("task:updated", updateTask);
    return () => { socket.off("task:created", updateTask); socket.off("task:updated", updateTask); };
  }, [selectedId]);

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
    <div className="min-h-screen bg-panel text-ink flex flex-col">
      <header className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-3 border-b border-[#e3e1e9] bg-surface/90 px-4 py-3 backdrop-blur-md md:px-7">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-accent font-bold text-white">↗</div>
          <div><h1 className="font-semibold leading-tight">TrackRunner</h1><p className="text-xs text-on-surface-variant">Dispatcher workspace</p></div>
          <Chip className={`hidden rounded-full px-3 py-1 text-xs md:block ${connected ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{connected ? "Live connection" : "Reconnecting"}</Chip>
        </div>
        <div className="flex items-center gap-4">
          <Button onClick={openCreate} size="sm" className="rounded-full bg-accent px-4 text-white">Add runner</Button>
          <button onClick={logout} className="rounded-full px-3 py-2 text-sm font-medium text-on-surface-variant hover:bg-[#f0eff6]">Sign out</button>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 px-4 pt-4 md:grid-cols-4 md:px-7"><Metric label="Live runners" value={statusCounts.live} tone="bg-emerald-100 text-emerald-800" /><Metric label="Idle runners" value={statusCounts.idle} tone="bg-sky-100 text-sky-800" /><Metric label="Needs attention" value={statusCounts.stale} tone="bg-amber-100 text-amber-800" /><Metric label="Offline" value={statusCounts.offline} tone="bg-slate-200 text-slate-700" /></section>

      <main className="flex-1 grid grid-cols-1 gap-4 p-4 md:grid-cols-12 md:px-7 md:pb-7">
        <Card className="order-1 overflow-hidden rounded-[24px] border border-[#e3e1e9] bg-surface shadow-sm md:col-span-4 lg:col-span-3" color="default">
          <div className="flex items-center justify-between border-b border-[#e3e1e9] px-5 py-4"><div><div className="text-sm font-semibold">Available runners</div><p className="mt-0.5 text-xs text-on-surface-variant">Live tracking now</p></div><span className="rounded-full bg-[#e9efff] px-2.5 py-1 text-xs font-semibold text-accent">{statusCounts.live}</span></div>
          <RunnerList
            runners={runners}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </Card>

        <Card className="order-2 min-h-[620px] overflow-hidden rounded-[24px] border border-[#e3e1e9] bg-surface shadow-sm md:col-span-8 lg:col-span-9" color="default">
          <div className="border-b border-[#e3e1e9] shrink-0">
            <div className="px-5 pt-4 text-sm font-semibold">Runner details</div>
            <RunnerDetail runner={selected} trail={trail} onRename={openRename} onCreateTask={openTask} tasks={activeTasks} />
          </div>
          <div className="min-h-[400px] flex-1 p-3 pt-0">
            <RunnerMap runners={runners} selectedId={selectedId} trail={trail} />
          </div>
        </Card>
      </main>

      {formMode && (
        <div className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center bg-black/60 p-3">
          <form onSubmit={saveRunner} className="w-full max-w-md rounded-[28px] bg-surface p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">{formMode === "create" ? "Add runner" : "Edit runner name"}</h2>
                <p className="text-xs text-on-surface-variant mt-1">{formMode === "create" ? "The runner is assigned to your dashboard automatically." : "This is the name shown on the dashboard and map."}</p>
              </div>
              <button type="button" onClick={() => setFormMode(null)} className="text-on-surface-variant" aria-label="Close">×</button>
            </div>
            <label className="block text-sm mb-1">Display name</label>
            <input className="w-full mb-3 rounded-xl border border-[#777680] bg-transparent px-3 py-2 focus:outline-none focus:border-accent" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} required minLength={2} maxLength={80} />
            {formMode === "create" && <>
              <label className="block text-sm mb-1">Runner email</label>
              <input className="w-full mb-3 rounded-xl border border-[#777680] bg-transparent px-3 py-2 focus:outline-none focus:border-accent" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required type="email" />
              <label className="block text-sm mb-1">Temporary password</label>
              <input className="w-full mb-3 rounded-xl border border-[#777680] bg-transparent px-3 py-2 focus:outline-none focus:border-accent" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required type="password" minLength={8} />
            </>}
            {formError && <p className="mb-3 text-sm text-red-400">{formError}</p>}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setFormMode(null)} className="px-3 py-2 text-sm text-on-surface-variant">Cancel</button>
              <button disabled={formBusy} className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{formBusy ? "Saving…" : formMode === "create" ? "Create runner" : "Save name"}</button>
            </div>
          </form>
        </div>
      )}
      {taskRunner && (
        <div className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center bg-black/60 p-3">
          <form onSubmit={saveTask} className="w-full max-w-lg rounded-[28px] bg-surface p-6 shadow-2xl max-h-[95vh] overflow-y-auto">
            <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-semibold">Assign task to {taskRunner.displayName}</h2><p className="text-xs text-on-surface-variant mt-1">The runner receives this immediately when connected, and it remains available after reconnecting.</p></div><button type="button" onClick={() => setTaskRunner(null)} className="text-on-surface-variant">×</button></div>
            <label className="block text-sm mb-1">Client name</label><input className="w-full mb-3 rounded-xl border border-[#777680] bg-transparent px-3 py-2" required value={taskForm.clientName} onChange={(e) => setTaskForm({ ...taskForm, clientName: e.target.value })} />
            <AddressPicker value={taskForm.destinationLat != null && taskForm.destinationLon != null ? { address: taskForm.clientAddress, lat: taskForm.destinationLat, lon: taskForm.destinationLon } : null} onChange={(pin: AddressPin) => setTaskForm({ ...taskForm, clientAddress: pin.address, destinationLat: pin.lat, destinationLon: pin.lon })} />
            <label className="block text-sm mb-1">Phone number</label><input className="w-full mb-3 rounded-xl border border-[#777680] bg-transparent px-3 py-2" required value={taskForm.clientPhone} onChange={(e) => setTaskForm({ ...taskForm, clientPhone: e.target.value })} />
            <label className="block text-sm mb-2">Documents to collect</label><div className="grid grid-cols-2 gap-2 mb-3">{documentTypes.map((name) => <label key={name} className="flex items-center gap-2 text-sm text-on-surface-variant"><input className="accent-[#405f90]" type="checkbox" checked={taskForm.documents.includes(name)} onChange={(e) => setTaskForm({ ...taskForm, documents: e.target.checked ? [...taskForm.documents, name] : taskForm.documents.filter((item) => item !== name) })} />{name}</label>)}</div>
            <input className="w-full mb-3 rounded-xl border border-[#777680] bg-transparent px-3 py-2" placeholder="Other document (optional)" value={taskForm.customDocument} onChange={(e) => setTaskForm({ ...taskForm, customDocument: e.target.value })} />
            <label className="block text-sm mb-1">Notes (optional)</label><textarea className="w-full mb-3 rounded-xl border border-[#777680] bg-transparent px-3 py-2" value={taskForm.notes} onChange={(e) => setTaskForm({ ...taskForm, notes: e.target.value })} />
            {taskError && <p className="mb-3 text-sm text-red-700">{taskError}</p>}<div className="flex justify-end gap-3"><button type="button" onClick={() => setTaskRunner(null)} className="px-3 py-2 text-sm text-on-surface-variant">Cancel</button><button disabled={formBusy} className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{formBusy ? "Sending…" : "Send task"}</button></div>
          </form>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <div className="rounded-2xl border border-[#e3e1e9] bg-surface px-4 py-3 shadow-sm"><div className="text-xs text-on-surface-variant">{label}</div><div className="mt-1 flex items-center gap-2"><span className="text-2xl font-semibold">{value}</span><span className={`h-2 w-2 rounded-full ${tone.split(" ")[0]}`} /></div></div>;
}
