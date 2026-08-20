import { useEffect, useMemo, useState } from "react";
import { useRunners } from "../hooks/useRunners";
import RunnerMap from "../components/RunnerMap";
import RunnerList from "../components/RunnerList";
import RunnerDetail from "../components/RunnerDetail";
import TaskBoard, { type Task as BoardTask } from "../components/TaskBoard";
import AddressPicker, { type AddressPin } from "../components/AddressPicker";
import { api } from "../lib/auth";
import { getSocket } from "../lib/socket";
import { getRunnerStatus, type RunnerState } from "../lib/types";
import { Card } from "@material-tailwind/react";
import { Alert, Snackbar } from "@mui/material";

type RunnerForm = { email: string; password: string; displayName: string };
type TaskForm = {
  clientName: string;
  clientAddress: string;
  clientPhone: string;
  notes: string;
  documents: string[];
  customDocument: string;
  priority: "normal" | "high" | "urgent";
  dueAt: string;
  destinationLat?: number;
  destinationLon?: number;
};
type DashboardTask = BoardTask;
type TaskNotice = {
  id: string;
  clientName: string;
  runnerName: string;
  status: string;
};

const emptyRunnerForm: RunnerForm = {
  email: "",
  password: "",
  displayName: "",
};
const emptyTaskForm: TaskForm = {
  clientName: "",
  clientAddress: "",
  clientPhone: "",
  notes: "",
  documents: [],
  customDocument: "",
  priority: "normal",
  dueAt: "",
};

function normaliseIndianMobile(value: string): string | null {
  const compact = value.replace(/[\s-]/g, "");
  const localNumber = compact.startsWith("+91")
    ? compact.slice(3)
    : compact.startsWith("91") && compact.length === 12
      ? compact.slice(2)
      : compact;
  return /^[6-9]\d{9}$/.test(localNumber) ? `+91${localNumber}` : null;
}

export default function DashboardPage() {
  const { runners, refresh } = useRunners();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [trail, setTrail] = useState<Array<[number, number]>>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [formMode, setFormMode] = useState<"create" | "rename" | null>(null);
  const [form, setForm] = useState<RunnerForm>(emptyRunnerForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  const [taskRunner, setTaskRunner] = useState<RunnerState | null>(null);
  const [editingTask, setEditingTask] = useState<DashboardTask | null>(null);
  const [taskForm, setTaskForm] = useState<TaskForm>(emptyTaskForm);
  const [documentTypes, setDocumentTypes] = useState<string[]>([]);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [activeTasks, setActiveTasks] = useState<DashboardTask[]>([]);
  const [taskTab, setTaskTab] = useState<"active" | "completed">("active");
  const [boardTasks, setBoardTasks] = useState<DashboardTask[]>([]);
  const [pendingDeletion, setPendingDeletion] = useState<DashboardTask | null>(
    null,
  );
  const [viewerLocation, setViewerLocation] = useState<{
    lat: number;
    lon: number;
  } | null>(null);
  const [taskNotices, setTaskNotices] = useState<TaskNotice[]>([]);

  useEffect(() => {
    if (!pendingDeletion) return;
    const timeout = window.setTimeout(() => setPendingDeletion(null), 10_000);
    return () => window.clearTimeout(timeout);
  }, [pendingDeletion]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) =>
        setViewerLocation({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        }),
      () => {},
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  }, []);

  // Load history when selection changes
  useEffect(() => {
    if (!selectedId || !runners[selectedId]?.hasLocation) return;
    api<{ points: any[] }>(`/api/runners/${selectedId}/history?limit=200`)
      .then((res) => {
        setHistory(res.points ?? []);
        setTrail(
          (res.points ?? []).map(
            (p: any) => [p.lat, p.lon] as [number, number],
          ),
        );
      })
      .catch(() => {
        setHistory([]);
        setTrail([]);
      });
  }, [selectedId, runners[selectedId ?? ""]?.hasLocation]);

  const selected = selectedId ? (runners[selectedId] ?? null) : null;

  useEffect(() => {
    if (!selectedId) return setActiveTasks([]);
    api<{
      tasks: Array<{
        id: string;
        runnerId: string;
        clientName: string;
        clientAddress: string;
        status: string;
        priority?: string;
      }>;
    }>(`/api/runners/${selectedId}/tasks`)
      .then((response) => setActiveTasks(response.tasks ?? []))
      .catch(() => setActiveTasks([]));
  }, [selectedId]);

  useEffect(() => {
    api<{ tasks: DashboardTask[] }>(`/api/tasks?scope=${taskTab}`)
      .then((response) => setBoardTasks(response.tasks ?? []))
      .catch(() => setBoardTasks([]));
  }, [taskTab]);

  useEffect(() => {
    const socket = getSocket();
    const updateTask = (task: {
      id: string;
      runnerId: string;
      clientName: string;
      clientAddress: string;
      status: string;
    }) => {
      if (task.runnerId === selectedId)
        setActiveTasks((current) =>
          task.status === "completed" || task.status === "unable_to_complete"
            ? current.filter((item) => item.id !== task.id)
            : [task, ...current.filter((item) => item.id !== task.id)],
        );
      setBoardTasks((current) => {
        const isCompleted =
          task.status === "completed" || task.status === "unable_to_complete";
        if ((taskTab === "completed") !== isCompleted)
          return current.filter((item) => item.id !== task.id);
        return [task, ...current.filter((item) => item.id !== task.id)];
      });
    };
    const notifyTaskStatus = (task: {
      id: string;
      runnerId: string;
      clientName: string;
      status: string;
    }) => {
      // A dispatcher edit leaves the task at "sent"; status alerts are only
      // for runner lifecycle changes such as acknowledged or completed.
      if (task.status === "sent") return;
      setTaskNotices((current) => [
        ...current,
        {
          id: `${task.id}-${task.status}-${Date.now()}-${Math.random()}`,
          clientName: task.clientName,
          runnerName: runners[task.runnerId]?.displayName ?? "Runner",
          status: task.status,
        },
      ]);
    };
    socket.on("task:created", updateTask);
    socket.on("task:updated", updateTask);
    socket.on("task:updated", notifyTaskStatus);
    return () => {
      socket.off("task:created", updateTask);
      socket.off("task:updated", updateTask);
      socket.off("task:updated", notifyTaskStatus);
    };
  }, [selectedId, taskTab, runners]);

  // Append live updates to trail
  useEffect(() => {
    if (!selected?.hasLocation) return;
    setTrail((prev) => {
      const last = prev[prev.length - 1];
      if (!last || last[0] !== selected.lat || last[1] !== selected.lon) {
        const next = [
          ...prev,
          [selected.lat!, selected.lon!] as [number, number],
        ];
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

  const statusCounts = useMemo(
    () =>
      Object.values(runners).reduce(
        (counts, runner) => {
          counts[getRunnerStatus(runner, now)] += 1;
          return counts;
        },
        { live: 0, stale: 0, idle: 0, offline: 0 } as Record<
          "live" | "stale" | "idle" | "offline",
          number
        >,
      ),
    [runners, now],
  );

  function openRename(runner: RunnerState) {
    setForm({
      email: runner.email,
      password: "",
      displayName: runner.displayName,
    });
    setFormError(null);
    setFormMode("rename");
  }

  async function openTask(runner: RunnerState) {
    setTaskRunner(runner);
    setEditingTask(null);
    setTaskForm(emptyTaskForm);
    setTaskError(null);
    try {
      const data = await api<{ documentTypes: Array<{ name: string }> }>(
        "/api/document-types",
      );
      setDocumentTypes(data.documentTypes.map((item) => item.name));
    } catch {
      setDocumentTypes([]);
    }
  }

  async function openEditTask(task: DashboardTask) {
    const runner = runners[task.runnerId];
    if (!runner) return;
    setTaskRunner(runner);
    setEditingTask(task);
    setTaskError(null);
    setTaskForm({
      clientName: task.clientName,
      clientAddress: task.clientAddress,
      clientPhone: task.clientPhone ?? "",
      notes: task.notes ?? "",
      documents: task.documents?.map((document) => document.name) ?? [],
      customDocument: "",
      priority:
        task.priority === "high" || task.priority === "urgent"
          ? task.priority
          : "normal",
      dueAt: task.dueAt ? new Date(task.dueAt).toISOString().slice(0, 16) : "",
      destinationLat: task.destinationLat,
      destinationLon: task.destinationLon,
    });
    try {
      const data = await api<{ documentTypes: Array<{ name: string }> }>(
        "/api/document-types",
      );
      setDocumentTypes(data.documentTypes.map((item) => item.name));
    } catch {
      setDocumentTypes([]);
    }
  }

  function requestDeleteTask(task: DashboardTask) {
    setPendingDeletion(task);
  }

  async function confirmDeleteTask() {
    if (!pendingDeletion) return;
    const task = pendingDeletion;
    setPendingDeletion(null);
    try {
      await api(`/api/tasks/${task.id}`, { method: "DELETE" });
      setBoardTasks((current) => current.filter((item) => item.id !== task.id));
    } catch (error: any) {
      setTaskError(error.message ?? "Could not delete task");
    }
  }

  async function saveTask(event: React.FormEvent) {
    event.preventDefault();
    if (!taskRunner) return;
    const documents = [
      ...taskForm.documents,
      taskForm.customDocument.trim(),
    ].filter(Boolean);
    if (!documents.length)
      return setTaskError("Select or add at least one document.");
    const clientPhone = normaliseIndianMobile(taskForm.clientPhone);
    if (!clientPhone)
      return setTaskError(
        "Enter a valid Indian mobile number (for example, +91 98765 43210).",
      );
    setFormBusy(true);
    setTaskError(null);
    try {
      const payload = {
        ...taskForm,
        clientPhone,
        dueAt: taskForm.dueAt
          ? new Date(taskForm.dueAt).toISOString()
          : undefined,
        documents,
      };
      if (editingTask)
        await api(`/api/tasks/${editingTask.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      else
        await api(`/api/runners/${taskRunner.runnerId}/tasks`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      setTaskRunner(null);
      setEditingTask(null);
      setTaskTab("active");
    } catch (error: any) {
      setTaskError(error.message ?? "Could not send task");
    } finally {
      setFormBusy(false);
    }
  }

  async function saveRunner(event: React.FormEvent) {
    event.preventDefault();
    setFormBusy(true);
    setFormError(null);
    try {
      if (formMode === "create") {
        await api("/api/runners", {
          method: "POST",
          body: JSON.stringify(form),
        });
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
    <div className="flex min-h-[calc(100dvh-116px)] flex-col bg-panel text-ink lg:h-[calc(100dvh-72px)] lg:min-h-0">
      <main className="grid grid-cols-1 gap-3 overflow-visible p-4 sm:gap-4 lg:h-full lg:min-h-0 lg:grid-cols-[25fr_40fr_30fr] lg:overflow-hidden lg:px-7 lg:py-7">
        <Card
          className="order-1 min-w-0 overflow-hidden rounded-[24px] border border-[#e3e1e9] bg-surface shadow-sm"
          color="default"
        >
          <div className="flex items-center justify-between border-b border-[#e3e1e9] px-5 py-4">
              <div className="text-sm font-semibold">Available Runners</div>
          </div>
          <div className="grid grid-cols-2 gap-2 border-b border-[#e3e1e9] bg-[#fbfaff] p-3">
            <Metric
              label="Live"
              value={statusCounts.live}
              tone="bg-emerald-500"
            />
            <Metric
              label="Idle"
              value={statusCounts.idle}
              tone="bg-sky-500"
            />
            {/* <Metric
              label="Needs attention"
              value={statusCounts.stale}
              tone="bg-amber-500"
            />
            <Metric
              label="Offline"
              value={statusCounts.offline}
              tone="bg-slate-400"
            /> */}
          </div>
          <RunnerList
            runners={runners}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </Card>

        <Card
          className="order-2 flex min-h-[620px] min-w-0 flex-col overflow-hidden rounded-[24px] border border-[#e3e1e9] bg-surface shadow-sm"
          color="default"
        >
          <div className="border-b border-[#e3e1e9] shrink-0">
            <div className="px-5 pt-4 text-sm font-semibold">
              Runner details
            </div>
            <RunnerDetail
              runner={selected}
              trail={trail}
              onRename={openRename}
              onCreateTask={openTask}
              tasks={activeTasks}
            />
          </div>
          <div className="min-h-[400px] flex-1 p-3 pt-0">
            <RunnerMap
              runners={runners}
              selectedId={selectedId}
              trail={trail}
              onSelect={(runnerId) => setSelectedId(runnerId || null)}
              viewerLocation={viewerLocation}
            />
          </div>
        </Card>

        <div className="order-3 min-w-0">
          <TaskBoard
            tasks={boardTasks}
            tab={taskTab}
            onTabChange={setTaskTab}
            runners={runners}
            onSelectRunner={setSelectedId}
            onEdit={openEditTask}
            onDelete={requestDeleteTask}
          />
        </div>
      </main>

      {formMode && (
        <div className="fixed inset-0 z-[1400] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
          <form
            onSubmit={saveRunner}
            className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-surface p-5 shadow-2xl sm:rounded-[28px] sm:p-6"
          >
            <div className="sticky -top-5 z-10 -mx-5 mb-4 flex items-start justify-between gap-3 bg-surface px-5 pb-3 pt-5 sm:-top-6 sm:-mx-6 sm:px-6 sm:pt-6">
              <div>
                <h2 className="font-semibold">
                  {formMode === "create" ? "Add runner" : "Edit runner name"}
                </h2>
                <p className="text-xs text-on-surface-variant mt-1">
                  {formMode === "create"
                    ? "The runner is assigned to your dashboard automatically."
                    : "This is the name shown on the dashboard and map."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFormMode(null)}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-2xl text-on-surface-variant hover:bg-[#f0eff6]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <label className="block text-sm mb-1">Display name</label>
            <input
              className="w-full mb-3 rounded-xl border border-[#777680] bg-transparent px-3 py-2 focus:outline-none focus:border-accent"
              value={form.displayName}
              onChange={(e) =>
                setForm({ ...form, displayName: e.target.value })
              }
              required
              minLength={2}
              maxLength={80}
            />
            {formMode === "create" && (
              <>
                <label className="block text-sm mb-1">Runner email</label>
                <input
                  className="w-full mb-3 rounded-xl border border-[#777680] bg-transparent px-3 py-2 focus:outline-none focus:border-accent"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                  type="email"
                />
                <label className="block text-sm mb-1">Temporary password</label>
                <input
                  className="w-full mb-3 rounded-xl border border-[#777680] bg-transparent px-3 py-2 focus:outline-none focus:border-accent"
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                  required
                  type="password"
                  minLength={8}
                />
              </>
            )}
            {formError && (
              <p className="mb-3 text-sm text-red-400">{formError}</p>
            )}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setFormMode(null)}
                className="px-3 py-2 text-sm text-on-surface-variant"
              >
                Cancel
              </button>
              <button
                disabled={formBusy}
                className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {formBusy
                  ? "Saving…"
                  : formMode === "create"
                    ? "Create runner"
                    : "Save name"}
              </button>
            </div>
          </form>
        </div>
      )}
      {taskRunner && (
        <div className="fixed inset-0 z-[1400] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
          <form
            onSubmit={saveTask}
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-[28px] bg-surface p-5 shadow-2xl sm:rounded-[28px] sm:p-6"
          >
            <div className="sticky -top-5 z-10 -mx-5 mb-4 flex items-start justify-between gap-3 bg-surface px-5 pb-3 pt-5 sm:-top-6 sm:-mx-6 sm:px-6 sm:pt-6">
              <div>
                <h2 className="font-semibold">
                  {editingTask
                    ? `Edit task for ${taskRunner.displayName}`
                    : `Assign task to ${taskRunner.displayName}`}
                </h2>
                <p className="text-xs text-on-surface-variant mt-1">
                  {editingTask
                    ? "This task can be changed until the runner acknowledges it."
                    : "The runner receives this immediately when connected, and it remains available after reconnecting."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setTaskRunner(null);
                  setEditingTask(null);
                }}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-2xl text-on-surface-variant hover:bg-[#f0eff6]"
                aria-label="Close task form"
              >
                ×
              </button>
            </div>
            <label className="block text-sm mb-1">Client name</label>
            <input
              className="w-full mb-3 rounded-xl border border-[#777680] bg-transparent px-3 py-2"
              required
              value={taskForm.clientName}
              onChange={(e) =>
                setTaskForm({ ...taskForm, clientName: e.target.value })
              }
            />
            <AddressPicker
              value={
                taskForm.destinationLat != null &&
                taskForm.destinationLon != null
                  ? {
                      address: taskForm.clientAddress,
                      lat: taskForm.destinationLat,
                      lon: taskForm.destinationLon,
                    }
                  : null
              }
              onChange={(pin: AddressPin) =>
                setTaskForm({
                  ...taskForm,
                  clientAddress: pin.address,
                  destinationLat: pin.lat,
                  destinationLon: pin.lon,
                })
              }
            />
            <label className="block text-sm mb-1">
              Phone number{" "}
              <span className="text-on-surface-variant">(India)</span>
            </label>
            <input
              className="w-full rounded-xl border border-[#777680] bg-transparent px-3 py-2"
              required
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              maxLength={16}
              placeholder="+91 98765 43210"
              value={taskForm.clientPhone}
              onChange={(e) =>
                setTaskForm({ ...taskForm, clientPhone: e.target.value })
              }
            />
            {taskForm.clientPhone &&
              !normaliseIndianMobile(taskForm.clientPhone) && (
                <p className="mb-3 mt-1 text-xs text-red-700">
                  Enter a valid 10-digit Indian mobile number beginning with
                  6–9.
                </p>
              )}
            <div className="mb-3" />
            <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-sm">
                Priority
                <select
                  className="mt-1 w-full rounded-xl border border-[#777680] bg-transparent px-3 py-2"
                  value={taskForm.priority}
                  onChange={(e) =>
                    setTaskForm({
                      ...taskForm,
                      priority: e.target.value as TaskForm["priority"],
                    })
                  }
                >
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </label>
              <label className="text-sm">
                Due time{" "}
                <span className="text-on-surface-variant">(optional)</span>
                <input
                  type="datetime-local"
                  className="mt-1 w-full rounded-xl border border-[#777680] bg-transparent px-3 py-2"
                  value={taskForm.dueAt}
                  onChange={(e) =>
                    setTaskForm({ ...taskForm, dueAt: e.target.value })
                  }
                />
              </label>
            </div>
            <label className="block text-sm mb-2">Documents to collect</label>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {documentTypes.map((name) => (
                <label
                  key={name}
                  className="flex items-center gap-2 text-sm text-on-surface-variant"
                >
                  <input
                    className="accent-[#405f90]"
                    type="checkbox"
                    checked={taskForm.documents.includes(name)}
                    onChange={(e) =>
                      setTaskForm({
                        ...taskForm,
                        documents: e.target.checked
                          ? [...taskForm.documents, name]
                          : taskForm.documents.filter((item) => item !== name),
                      })
                    }
                  />
                  {name}
                </label>
              ))}
            </div>
            <input
              className="w-full mb-3 rounded-xl border border-[#777680] bg-transparent px-3 py-2"
              placeholder="Other document (optional)"
              value={taskForm.customDocument}
              onChange={(e) =>
                setTaskForm({ ...taskForm, customDocument: e.target.value })
              }
            />
            <label className="block text-sm mb-1">Notes (optional)</label>
            <textarea
              className="w-full mb-3 rounded-xl border border-[#777680] bg-transparent px-3 py-2"
              value={taskForm.notes}
              onChange={(e) =>
                setTaskForm({ ...taskForm, notes: e.target.value })
              }
            />
            {taskError && (
              <p className="mb-3 text-sm text-red-700">{taskError}</p>
            )}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setTaskRunner(null);
                  setEditingTask(null);
                }}
                className="px-3 py-2 text-sm text-on-surface-variant"
              >
                Cancel
              </button>
              <button
                disabled={formBusy}
                className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {formBusy ? "Saving…" : editingTask ? "Save task" : "Send task"}
              </button>
            </div>
          </form>
        </div>
      )}
      {pendingDeletion && (
        <div
          role="alert"
          className="fixed left-4 right-4 top-4 z-[1100] flex max-w-md flex-col gap-3 rounded-lg bg-[#323232] px-4 py-3 text-sm text-white shadow-xl sm:left-auto sm:flex-row sm:items-center sm:gap-4"
        >
          <span className="min-w-0 break-words">
            Delete completed task for {pendingDeletion.clientName}?
          </span>
          <div className="flex w-full gap-2 sm:w-auto sm:shrink-0">
            <button
              onClick={confirmDeleteTask}
              className="min-h-9 flex-1 rounded px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#a9c7ff] hover:bg-white/15 sm:flex-none"
            >
              OK
            </button>
            <button
              onClick={() => setPendingDeletion(null)}
              className="min-h-9 flex-1 rounded px-3 py-1 text-xs font-bold uppercase tracking-wide text-white/80 hover:bg-white/15 sm:flex-none"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {taskNotices.map((notice, index) => (
        <Snackbar
          key={notice.id}
          open
          autoHideDuration={10_000}
          onClose={() =>
            setTaskNotices((current) =>
              current.filter((item) => item.id !== notice.id),
            )
          }
          anchorOrigin={{ vertical: "top", horizontal: "right" }}
          sx={{
            top: { xs: `${12 + index * 86}px`, sm: `${16 + index * 86}px` },
            right: { xs: 8, sm: 16 },
            left: { xs: 8, sm: "auto" },
            maxWidth: { xs: "none", sm: 420 },
          }}
        >
          <Alert
            variant="filled"
            severity={
              notice.status === "unable_to_complete" ? "error" : "success"
            }
            onClose={() =>
              setTaskNotices((current) =>
                current.filter((item) => item.id !== notice.id),
              )
            }
            sx={{ width: "100%", alignItems: "center" }}
          >
            {notice.status === "completed" ? (
              <>
                Task for <strong>{notice.clientName}</strong> completed by{" "}
                <strong>{notice.runnerName}</strong>.
              </>
            ) : (
              <>
                <strong>{notice.runnerName}</strong> updated{" "}
                <strong>{notice.clientName}</strong> to{" "}
                {notice.status.replaceAll("_", " ")}.
              </>
            )}
          </Alert>
        </Snackbar>
      ))}
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-[#e3e1e9] bg-white px-3 py-2.5">
      {/* <div className="truncate text-[11px] font-medium text-on-surface-variant">
        {label}
      </div> */}
      <div className="mt-1 flex items-center gap-2">
        <span className="text-[12px] font-medium text-on-surface-variant">{label}</span>
        <span className="text-lg font-semibold">{value}</span>
        <span className={`h-2 w-2 shrink-0 rounded-full ${tone}`} />
      </div>
    </div>
  );
}
