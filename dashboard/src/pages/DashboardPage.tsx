import { useEffect, useMemo, useState } from "react";
import { useRunners } from "../hooks/useRunners";
import RunnerMap from "../components/RunnerMap";
import RunnerList from "../components/RunnerList";
import RunnerDetail from "../components/RunnerDetail";
import TaskBoard, { type Task as BoardTask } from "../components/TaskBoard";
import AddressPicker, { type AddressPin } from "../components/AddressPicker";
import { api, getToken } from "../lib/auth";
import { apiUrl } from "../lib/config";
import { getSocket } from "../lib/socket";
import { getRunnerStatus, type RunnerState } from "../lib/types";
import { Card } from "@material-tailwind/react";
import { Alert, Snackbar } from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";

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
type TaskAttachment = {
  id: string;
  name: string;
  sizeBytes: number;
  contentType: string;
  createdAt: string;
};
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

const allowedAttachmentTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function waitForOnline(): Promise<void> {
  if (navigator.onLine) return Promise.resolve();
  return new Promise((resolve) => window.addEventListener("online", () => resolve(), { once: true }));
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function fetchWithNetworkRetry(
  url: string,
  options: RequestInit,
  onRetry: (message: string) => void,
): Promise<Response> {
  const attempts = 3;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (!navigator.onLine) {
      onRetry("Connection lost. Waiting for internet to retry task assignment…");
      await waitForOnline();
    }
    try {
      return await fetch(url, options);
    } catch (error) {
      if (attempt === attempts - 1) {
        throw new Error("Could not reach the server. Your task was not created; please try again when connected.");
      }
      onRetry(`Connection interrupted. Retrying task assignment (${attempt + 1}/${attempts - 1})…`);
      if (!navigator.onLine) await waitForOnline();
      else await wait(1_000 * (attempt + 1));
    }
  }
  throw new Error("Could not reach the server.");
}

async function uploadTaskAttachment(taskId: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const token = getToken();
  const response = await fetch(apiUrl(`/api/tasks/${taskId}/attachments`), {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: formData,
  });
  if (response.ok) return;

  const body = await response.json().catch(() => null);
  throw new Error(body?.error ?? `Upload failed (${response.status})`);
}

async function createTaskWithAttachments(
  runnerId: string,
  task: Record<string, unknown>,
  attachments: File[],
  idempotencyKey: string,
  onNetworkRetry: (message: string) => void,
): Promise<{ task: DashboardTask }> {
  const formData = new FormData();
  formData.append("task", JSON.stringify(task));
  for (const attachment of attachments) formData.append("attachments", attachment);
  const token = getToken();
  const response = await fetchWithNetworkRetry(apiUrl(`/api/runners/${runnerId}/tasks/with-attachments`), {
    method: "POST",
    headers: {
      "Idempotency-Key": idempotencyKey,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  }, onNetworkRetry);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error ?? `Could not create task (${response.status})`);
  return body;
}

export default function DashboardPage() {
  const { runners, refresh } = useRunners();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isMapOpen, setIsMapOpen] = useState(() => window.innerWidth >= 1024);
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
  const [taskAttachments, setTaskAttachments] = useState<File[]>([]);
  const [existingTaskAttachments, setExistingTaskAttachments] = useState<TaskAttachment[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null);
  const [taskSubmissionKey, setTaskSubmissionKey] = useState<string | null>(null);
  const [taskTab, setTaskTab] = useState<"active" | "completed" | "incomplete">("active");
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
      setBoardTasks((current) => {
        const matchesTab = taskTab === "completed"
          ? task.status === "completed"
          : taskTab === "incomplete"
            ? task.status === "unable_to_complete"
            : task.status !== "completed" && task.status !== "unable_to_complete";
        if (!matchesTab)
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
    setTaskAttachments([]);
    setExistingTaskAttachments([]);
    setTaskSubmissionKey(crypto.randomUUID());
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
    setTaskAttachments([]);
    setExistingTaskAttachments([]);
    setAttachmentsLoading(true);
    setTaskSubmissionKey(null);
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
    try {
      const data = await api<{ attachments: TaskAttachment[] }>(`/api/tasks/${task.id}/attachments`);
      setExistingTaskAttachments(data.attachments ?? []);
    } catch (error: any) {
      setTaskError(error.message ?? "Could not load existing attachments");
    } finally {
      setAttachmentsLoading(false);
    }
  }

  async function openTaskAttachment(taskId: string, attachmentId: string) {
    try {
      const data = await api<{ url: string }>(`/api/tasks/${taskId}/attachments/${attachmentId}/download`);
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (error: any) {
      setTaskError(error.message ?? "Could not open attachment");
    }
  }

  async function deleteTaskAttachment(taskId: string, attachment: TaskAttachment) {
    if (!window.confirm(`Delete ${attachment.name}? This cannot be undone.`)) return;
    setDeletingAttachmentId(attachment.id);
    try {
      await api(`/api/tasks/${taskId}/attachments/${attachment.id}`, { method: "DELETE" });
      setExistingTaskAttachments((attachments) => attachments.filter((item) => item.id !== attachment.id));
    } catch (error: any) {
      setTaskError(error.message ?? "Could not delete attachment");
    } finally {
      setDeletingAttachmentId(null);
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
    if (taskAttachments.length > 5)
      return setTaskError("You can attach up to 5 documents to a task.");
    const invalidAttachment = taskAttachments.find(
      (file) => file.size > 25 * 1024 * 1024 || !allowedAttachmentTypes.has(file.type),
    );
    if (invalidAttachment) {
      return setTaskError(
        `${invalidAttachment.name} must be a PDF, DOC, or DOCX file no larger than 25 MB.`,
      );
    }
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
      const result = editingTask
        ? await api<{ task: DashboardTask }>(`/api/tasks/${editingTask.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        })
        : await createTaskWithAttachments(taskRunner.runnerId, payload, taskAttachments, taskSubmissionKey ?? crypto.randomUUID(), setTaskError);
      if (editingTask) {
        for (const file of taskAttachments) await uploadTaskAttachment(result.task.id, file);
      }
      setTaskAttachments([]);
      setTaskSubmissionKey(null);
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

  function closeTaskForm() {
    setTaskRunner(null);
    setEditingTask(null);
    setTaskSubmissionKey(null);
  }

  function removeSelectedAttachment(fileToRemove: File) {
    setTaskAttachments((attachments) => attachments.filter((file) => file !== fileToRemove));
  }

  const selectedDocuments = [
    ...taskForm.documents,
    taskForm.customDocument.trim(),
  ].filter(Boolean);
  const invalidTaskAttachment = taskAttachments.find(
    (file) => file.size > 25 * 1024 * 1024 || !allowedAttachmentTypes.has(file.type),
  );
  const isTaskReadyToAssign = Boolean(
    taskForm.clientName.trim()
      && taskForm.clientAddress.trim()
      && normaliseIndianMobile(taskForm.clientPhone)
      && selectedDocuments.length > 0
      && taskAttachments.length <= 5
      && !invalidTaskAttachment,
  );

  return (
    <div className="flex min-h-[calc(100dvh-116px)] flex-col bg-panel text-ink lg:h-[calc(100dvh-72px)] lg:min-h-0">
      <main className="grid grid-cols-1 gap-3 overflow-visible p-4 sm:gap-4 lg:h-full lg:min-h-0 lg:grid-cols-[minmax(220px,0.75fr)_minmax(0,1.65fr)_minmax(260px,0.8fr)] lg:overflow-hidden lg:px-7 lg:py-7">
        <Card
          className="order-1 min-w-0 overflow-hidden  border border-border bg-surface shadow-[var(--shadow-card)]"
          color="default"
        >
          <div className="border-b border-border px-5 py-4">
            <div className="text-sm font-semibold">Available Runners</div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-on-surface-variant">
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-600" />Location always allowed</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-600" />Location when app is open</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-500" />Offline</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 border-b border-border bg-surface-variant p-3">
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

        <div className="order-2 flex min-w-0 flex-col overflow-hidden lg:min-h-0 lg:pr-1">
          <Card
            className="flex min-w-0 flex-col overflow-hidden  border border-border bg-surface shadow-[var(--shadow-card)] lg:min-h-0 lg:flex-1"
            color="default"
          >
            <div className="border-b border-border">
              <div className="px-5 pt-4 text-sm font-semibold">
                Runner details
              </div>
              <RunnerDetail runner={selected} onRename={openRename} onCreateTask={openTask}>
                <TaskBoard
                  tasks={selectedId ? boardTasks.filter((task) => task.runnerId === selectedId) : []}
                  tab={taskTab}
                  onTabChange={setTaskTab}
                  selectedRunnerName={selected?.displayName ?? null}
                  runners={runners}
                  embedded
                  onEdit={openEditTask}
                  onDelete={requestDeleteTask}
                />
              </RunnerDetail>
            </div>
          </Card>
        </div>

        <Card
          className="order-3 min-w-0 overflow-hidden  border border-border bg-surface shadow-[var(--shadow-card)] lg:flex lg:min-h-0 lg:flex-col"
          color="default"
        >
          <div className="flex items-center justify-between px-5 py-4">
            <div><div className="text-sm font-semibold">Location</div><p className="mt-0.5 text-xs text-on-surface-variant">{selected?.hasLocation ? "Live location and route" : "Location is unavailable"}</p></div>
            <button type="button" onClick={() => setIsMapOpen((open) => !open)} className="rounded-full px-3 py-1.5 text-xs font-semibold text-accent hover:bg-surface-variant" aria-expanded={isMapOpen}>{isMapOpen ? "Hide map" : "View map"}</button>
          </div>
          {isMapOpen && <div className="border-t border-border p-3 lg:min-h-0 lg:flex-1"><RunnerMap runners={runners} selectedId={selectedId} trail={trail} onSelect={(runnerId) => setSelectedId(runnerId || null)} viewerLocation={viewerLocation} compact /></div>}
        </Card>
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
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-2xl text-on-surface-variant hover:bg-surface-variant"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <label className="block text-sm mb-1">Display name</label>
            <input
              className="mb-3 w-full rounded-xl border border-border bg-transparent px-3 py-2 focus:border-accent focus:outline-none"
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
                className="mb-3 w-full rounded-xl border border-border bg-transparent px-3 py-2 focus:border-accent focus:outline-none"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                  type="email"
                />
                <label className="block text-sm mb-1">Temporary password</label>
                <input
                className="mb-3 w-full rounded-xl border border-border bg-transparent px-3 py-2 focus:border-accent focus:outline-none"
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
            className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[28px] bg-surface shadow-2xl sm:rounded-[28px]"
          >
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold">{editingTask ? "Edit task for" : "Assign task to"}</h2>
                <div className="inline-flex max-w-full items-center gap-2 rounded-full bg-surface-variant px-2.5 py-1 text-xs font-medium text-on-surface-variant">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${getRunnerStatus(taskRunner) === "live" ? "bg-emerald-600" : getRunnerStatus(taskRunner) === "idle" ? "bg-amber-600" : "bg-slate-500"}`} />
                  <span className="truncate">{taskRunner.displayName} · {getRunnerStatus(taskRunner) === "live" ? "Location live" : getRunnerStatus(taskRunner) === "idle" ? "Location while open" : "Offline"}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={closeTaskForm}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xl text-on-surface-variant hover:bg-surface-variant"
                aria-label="Close task form"
              >
                ×
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5">
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <label className="text-sm font-medium">Client name
                  <input className="mt-1 min-h-11 w-full rounded-xl border border-border bg-transparent px-3 py-2" required value={taskForm.clientName} onChange={(e) => setTaskForm({ ...taskForm, clientName: e.target.value })} />
                </label>
                <label className="text-sm font-medium">Phone number <span className="font-normal text-on-surface-variant">(India)</span>
                  <input className="mt-1 min-h-11 w-full rounded-xl border border-border bg-transparent px-3 py-2" required type="tel" inputMode="numeric" autoComplete="tel" maxLength={16} placeholder="+91 98765 43210" value={taskForm.clientPhone} onChange={(e) => setTaskForm({ ...taskForm, clientPhone: e.target.value })} />
                  {taskForm.clientPhone && !normaliseIndianMobile(taskForm.clientPhone) && <p className="mt-1 text-xs font-normal text-red-700">Enter a valid 10-digit Indian mobile number beginning with 6–9.</p>}
                </label>
                <label className="text-sm font-medium">Priority
                  <select className="mt-1 min-h-11 w-full rounded-xl border border-border bg-transparent px-3 py-2" value={taskForm.priority} onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value as TaskForm["priority"] })}>
                    <option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
                  </select>
                </label>
                <label className="text-sm font-medium">Due time <span className="font-normal text-on-surface-variant">(optional)</span>
                  <input type="datetime-local" className="mt-1 min-h-11 w-full rounded-xl border border-border bg-transparent px-3 py-2" value={taskForm.dueAt} onChange={(e) => setTaskForm({ ...taskForm, dueAt: e.target.value })} />
                </label>

                <div className="space-y-2 sm:col-span-2">
                  <label className="text-sm font-medium">Documents to collect</label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {documentTypes.map((name) => <label key={name} className="flex min-h-10 items-center gap-2 rounded-lg border border-border px-2.5 text-sm text-on-surface-variant"><input className="accent-[#405f90]" type="checkbox" checked={taskForm.documents.includes(name)} onChange={(e) => setTaskForm({ ...taskForm, documents: e.target.checked ? [...taskForm.documents, name] : taskForm.documents.filter((item) => item !== name) })} />{name}</label>)}
                  </div>
                  {selectedDocuments.length === 0 && <p className="text-xs text-amber-700">Choose at least one document to collect before assigning this task.</p>}
                  <input className="min-h-11 w-full rounded-xl border border-border bg-transparent px-3 py-2 text-sm" placeholder="Other document (optional)" value={taskForm.customDocument} onChange={(e) => setTaskForm({ ...taskForm, customDocument: e.target.value })} />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <label className="text-sm font-medium">Attachments <span className="font-normal text-on-surface-variant">(PDF, DOC, DOCX; max 25 MB each)</span></label>
                  <label className="block rounded-xl border border-dashed border-border bg-surface-variant/40 px-3 py-2 text-sm text-on-surface-variant">Choose supporting files<input className="mt-1 block w-full text-sm" type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" multiple onChange={(e) => setTaskAttachments(Array.from(e.target.files ?? []))} /></label>
                  {editingTask && <div className="rounded-xl border border-border bg-surface-variant/40 p-3"><p className="text-sm font-medium">Attached files</p>{attachmentsLoading ? <p className="mt-1 text-xs text-on-surface-variant">Loading attached files…</p> : existingTaskAttachments.length === 0 ? <p className="mt-1 text-xs text-on-surface-variant">No files were attached to this task.</p> : <ul className="mt-2 space-y-1">{existingTaskAttachments.map((attachment) => <li key={attachment.id} className="flex items-center justify-between gap-2"><button type="button" onClick={() => openTaskAttachment(editingTask.id, attachment.id)} className="min-w-0 text-left text-xs font-medium text-accent hover:underline">{attachment.name} <span className="font-normal text-on-surface-variant">({Math.ceil(attachment.sizeBytes / 1024)} KB)</span></button><button type="button" aria-label={`Delete ${attachment.name}`} title="Delete attachment" disabled={deletingAttachmentId === attachment.id} onClick={() => deleteTaskAttachment(editingTask.id, attachment)} className="shrink-0 rounded p-1 text-red-700 hover:bg-red-50 disabled:opacity-50"><DeleteOutlineIcon fontSize="small" /></button></li>)}</ul>}</div>}
                  {taskAttachments.length > 0 && <ul className="space-y-1.5">{taskAttachments.map((file) => <li key={`${file.name}-${file.lastModified}`} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-sm"><span className="min-w-0 truncate">{file.name} <span className="text-xs text-on-surface-variant">({(file.size / (1024 * 1024)).toFixed(1)} MB)</span></span><button type="button" onClick={() => removeSelectedAttachment(file)} className="shrink-0 text-xs font-semibold text-red-700 hover:underline">Remove</button></li>)}</ul>}
                  {taskAttachments.length > 5 && <p className="text-xs text-red-700">A task can include up to 5 supporting files.</p>}
                  {invalidTaskAttachment && <p className="text-xs text-red-700">{invalidTaskAttachment.name} must be a PDF, DOC, or DOCX file no larger than 25 MB.</p>}
                </div>

                <label className="space-y-1 text-sm font-medium sm:col-span-2">Notes <span className="font-normal text-on-surface-variant">(optional)</span>
                  <textarea className="block min-h-20 w-full rounded-xl border border-border bg-transparent px-3 py-2" value={taskForm.notes} onChange={(e) => setTaskForm({ ...taskForm, notes: e.target.value })} />
                </label>

                <div className="space-y-2 sm:col-span-2">
                  <AddressPicker label="Client location" value={taskForm.destinationLat != null && taskForm.destinationLon != null ? { address: taskForm.clientAddress, lat: taskForm.destinationLat, lon: taskForm.destinationLon } : null} onChange={(pin: AddressPin) => setTaskForm({ ...taskForm, clientAddress: pin.address, destinationLat: pin.lat, destinationLon: pin.lon })} onReset={() => setTaskForm({ ...taskForm, clientAddress: "", destinationLat: undefined, destinationLon: undefined })} />
                </div>
              </div>
            </div>
            {taskError && <p className="mx-4 mt-2 text-sm text-red-700 sm:mx-5">{taskError}</p>}
            <div className="flex justify-end gap-2 border-t border-border bg-surface px-4 py-3 sm:px-5">
              <button type="button" onClick={closeTaskForm} className="min-h-10 rounded-xl border border-border px-4 text-sm font-medium text-on-surface-variant hover:bg-surface-variant">Cancel</button>
              <button disabled={formBusy || !isTaskReadyToAssign} className="min-h-10 rounded-xl bg-accent px-4 text-sm font-semibold text-white disabled:opacity-50">
                {formBusy ? "Saving…" : editingTask ? "Save task" : "Assign task"}
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
