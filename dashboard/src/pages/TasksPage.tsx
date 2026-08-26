import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  FormControl,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import FilterListIcon from "@mui/icons-material/FilterList";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import ViewListOutlinedIcon from "@mui/icons-material/ViewListOutlined";
import ViewKanbanOutlinedIcon from "@mui/icons-material/ViewKanbanOutlined";
import { api } from "../lib/auth";
import { useDispatcherSession } from "../lib/dispatcherSession";
import { useRunners } from "../hooks/useRunners";
import {
  beginsToday,
  isFinished,
  statusLabel,
  taskHealth,
  type DispatcherTask,
  type DispatchRunner,
  type TaskPriority,
  type TaskStatus,
} from "../lib/taskWorkspace";

type QuickView = "attention" | "today" | "unassigned" | "at-risk" | "completed";

type TaskAttachment = {
  id: string;
  name: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
};
function formatDate(value?: string | null) {
  if (!value) return "No schedule set";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? "No schedule set"
    : new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      }).format(date);
}

function priorityTone(priority?: TaskPriority) {
  if (priority === "urgent")
    return { border: "#dc2626", background: "#fef2f2", label: "Urgent" };
  if (priority === "high")
    return { border: "#d97706", background: "#fffbeb", label: "High" };
  return { border: "#64748b", background: "#f8fafc", label: "Normal" };
}

/**
 * A dispatcher needs the list and task context at once. This page therefore
 * keeps the queue in place and opens deeper task information in a drawer.
 */
export default function TasksPage() {
  const { runners } = useRunners();
  const { operators } = useDispatcherSession();
  const [params, setParams] = useSearchParams();
  const [tasks, setTasks] = useState<DispatcherTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | TaskStatus>("all");
  const [priority, setPriority] = useState<"all" | TaskPriority>("all");
  const [runnerId, setRunnerId] = useState("all");
  const [operatorId, setOperatorId] = useState("all");
  const [quickView, setQuickView] = useState<QuickView | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [view, setView] = useState<"list" | "board">("list");
  const selectedTask =
    tasks.find((task) => task.id === params.get("task")) ?? null;
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // The backend groups tasks by scope. Combining the three scopes gives the
      // frontend one dependable queue, so every filter has the same data source.
      const [active, completed, incomplete] = await Promise.all([
        api<{ tasks: DispatcherTask[] }>("/api/tasks?scope=active"),
        api<{ tasks: DispatcherTask[] }>("/api/tasks?scope=completed"),
        api<{ tasks: DispatcherTask[] }>("/api/tasks?scope=incomplete"),
      ]);
      const uniqueTasks = new Map<string, DispatcherTask>();
      [...active.tasks, ...completed.tasks, ...incomplete.tasks].forEach(
        (task) => uniqueTasks.set(task.id, task),
      );
      setTasks([...uniqueTasks.values()]);
    } catch {
      setError(
        "Tasks could not be loaded. Check your connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    if (!selectedTask) {
      setAttachments([]);
      return;
    }
    setAttachmentsLoading(true);
    api<{ attachments: TaskAttachment[] }>(
      `/api/tasks/${selectedTask.id}/attachments`,
    )
      .then((response) => setAttachments(response.attachments ?? []))
      .catch(() => setAttachments([]))
      .finally(() => setAttachmentsLoading(false));
  }, [selectedTask]);

  const visibleTasks = useMemo(() => {
    const normalisedQuery = query.trim().toLowerCase();
    return tasks.filter((task) => {
      const runnerName = runners[task.runnerId]?.displayName ?? "";
      const searchableText = [
        task.id,
        task.clientName,
        task.clientAddress,
        task.clientPhone,
        task.notes,
        runnerName,
        ...(task.documents ?? []).map((document) => document.name),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const matchesBasicFilters =
        (status === "all" || task.status === status) &&
        (priority === "all" || task.priority === priority) &&
        (runnerId === "all" ||
          (runnerId === "unassigned"
            ? !task.runnerId
            : task.runnerId === runnerId)) &&
        (operatorId === "all" || task.createdByOperatorId === operatorId) &&
        (!normalisedQuery || searchableText.includes(normalisedQuery));
      if (!matchesBasicFilters) return false;
      if (quickView === "today") return beginsToday(task.dueAt);
      if (quickView === "unassigned") return !task.runnerId;
      if (quickView === "completed") return task.status === "completed";
      if (quickView === "at-risk")
        return (
          !isFinished(task) &&
          Boolean(task.dueAt) &&
          new Date(task.dueAt!).getTime() < Date.now()
        );
      if (quickView === "attention") {
        const health = taskHealth(task, runners[task.runnerId]);
        return !isFinished(task) && health.color !== "success";
      }
      return true;
    });
  }, [operatorId, priority, query, quickView, runnerId, runners, status, tasks]);

  function clearFilters() {
    setQuery("");
    setStatus("all");
    setPriority("all");
    setRunnerId("all");
    setOperatorId("all");
    setQuickView(null);
  }

  function applyQuickView(view: QuickView) {
    clearFilters();
    setQuickView(view);
  }

  function openTask(taskId: string) {
    const next = new URLSearchParams(params);
    next.set("task", taskId);
    setParams(next);
  }

  function closeTask() {
    const next = new URLSearchParams(params);
    next.delete("task");
    setParams(next);
  }

  async function downloadAttachment(attachment: TaskAttachment) {
    if (!selectedTask) return;
    const response = await api<{ url: string }>(
      `/api/tasks/${selectedTask.id}/attachments/${attachment.id}/download`,
    );
    window.open(response.url, "_blank", "noopener,noreferrer");
  }

  async function saveDispatchChange(change: {
    runnerId: string;
    dueAt: string | null;
    reason?: string;
  }) {
    if (!selectedTask) return;
    const updated = await api<{ task: DispatcherTask }>(
      `/api/tasks/${selectedTask.id}/dispatch`,
      {
        method: "POST",
        body: JSON.stringify(change),
      },
    );
    setTasks((current) =>
      current.map((task) =>
        task.id === updated.task.id ? updated.task : task,
      ),
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl p-4 sm:p-6 lg:p-7">
      <Stack
        direction={{ xs: "column", md: "row" }}
        justifyContent="space-between"
        alignItems={{ md: "flex-end" }}
        gap={1.5}
        mb={3}
      >
        <div>
          <Typography variant="h5" fontWeight={700}>
            Tasks
          </Typography>
          <Typography color="text.secondary">
            Check, track, and act on every assignment without losing your queue.
          </Typography>
        </div>
        <Button
          variant="outlined"
          onClick={() => void loadWorkspace()}
          disabled={loading}
        >
          Refresh workspace
        </Button>
      </Stack>
      {error && (
        <Alert
          severity="error"
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => void loadWorkspace()}
            >
              Retry
            </Button>
          }
          sx={{ mb: 2 }}
        >
          {error}
        </Alert>
      )}

      <Stack gap={2} minWidth={0}>
          <Paper
            elevation={0}
            sx={{ border: "1px solid #e3e1e9", p: { xs: 1.5, sm: 2 } }}
          >
            <Stack direction={{ xs: "column", sm: "row" }} gap={1}>
              <TextField
                fullWidth
                size="small"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setQuickView(null);
                }}
                placeholder="Search customer, runner, phone, address, task ID or document"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon color="action" />
                    </InputAdornment>
                  ),
                }}
              />
              <Button
                startIcon={<FilterListIcon />}
                variant={showFilters ? "contained" : "outlined"}
                onClick={() => setShowFilters((current) => !current)}
              >
                Filters
              </Button>
            </Stack>
            {showFilters && (
              <Stack direction={{ xs: "column", sm: "row" }} gap={1} mt={1.5}>
                <FormControl size="small" fullWidth>
                  <InputLabel>Status</InputLabel>
                  <Select
                    label="Status"
                    value={status}
                    onChange={(event) => {
                      setStatus(event.target.value as "all" | TaskStatus);
                      setQuickView(null);
                    }}
                  >
                    <MenuItem value="all">All statuses</MenuItem>
                    {Object.entries(statusLabel).map(([value, label]) => (
                      <MenuItem key={value} value={value}>
                        {label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" fullWidth>
                  <InputLabel>Priority</InputLabel>
                  <Select
                    label="Priority"
                    value={priority}
                    onChange={(event) => {
                      setPriority(event.target.value as "all" | TaskPriority);
                      setQuickView(null);
                    }}
                  >
                    <MenuItem value="all">All priorities</MenuItem>
                    <MenuItem value="urgent">Urgent</MenuItem>
                    <MenuItem value="high">High</MenuItem>
                    <MenuItem value="normal">Normal</MenuItem>
                  </Select>
                </FormControl>
                <FormControl size="small" fullWidth>
                  <InputLabel>Runner</InputLabel>
                  <Select
                    label="Runner"
                    value={runnerId}
                    onChange={(event) => {
                      setRunnerId(event.target.value);
                      setQuickView(null);
                    }}
                  >
                    <MenuItem value="all">All runners</MenuItem>
                    <MenuItem value="unassigned">Unassigned</MenuItem>
                    {Object.values(runners).map((runner) => (
                      <MenuItem key={runner.runnerId} value={runner.runnerId}>
                        {runner.displayName}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" fullWidth>
                  <InputLabel>Assigned by</InputLabel>
                  <Select
                    label="Assigned by"
                    value={operatorId}
                    onChange={(event) => {
                      setOperatorId(event.target.value);
                      setQuickView(null);
                    }}
                  >
                    <MenuItem value="all">All dispatchers</MenuItem>
                    {operators.map((operator) => (
                      <MenuItem key={operator.id} value={operator.id}>{operator.displayName}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Button onClick={clearFilters}>Clear</Button>
              </Stack>
            )}
            <Stack direction="row" flexWrap="wrap" gap={1} mt={1.5}>
              {(
                [
                  "attention",
                  "today",
                  "unassigned",
                  "at-risk",
                  "completed",
                ] as QuickView[]
              ).map((view) => (
                <Chip
                  key={view}
                  color={quickView === view ? "primary" : "default"}
                  label={
                    {
                      attention: "Needs attention",
                      today: "Today",
                      unassigned: "Unassigned",
                      "at-risk": "At risk",
                      completed: "Completed",
                    }[view]
                  }
                  variant={quickView === view ? "filled" : "outlined"}
                  onClick={() => applyQuickView(view)}
                />
              ))}
            </Stack>
          </Paper>
          <Paper
            elevation={0}
            sx={{ border: "1px solid #e3e1e9", overflow: "hidden" }}
          >
            <Box
              px={{ xs: 1.5, sm: 2 }}
              py={1.5}
              display="flex"
              gap={1}
              alignItems="center"
              justifyContent="space-between"
            >
              <div>
                <Typography fontWeight={800}>Operational queue</Typography>
                <Typography
                  aria-live="polite"
                  variant="caption"
                  color="text.secondary"
                >
                  {loading
                    ? "Loading tasks…"
                    : `${visibleTasks.length} task${visibleTasks.length === 1 ? "" : "s"} shown`}
                </Typography>
              </div>
              <Stack direction="row" gap={0.5} aria-label="Task view">
                <Button
                  size="small"
                  variant={view === "list" ? "contained" : "text"}
                  onClick={() => setView("list")}
                  aria-label="List view"
                >
                  <ViewListOutlinedIcon fontSize="small" />
                </Button>
                <Button
                  size="small"
                  variant={view === "board" ? "contained" : "text"}
                  onClick={() => setView("board")}
                  aria-label="Board view"
                >
                  <ViewKanbanOutlinedIcon fontSize="small" />
                </Button>
              </Stack>
            </Box>
            <Divider />
            {loading ? (
              <Box p={5} textAlign="center">
                <CircularProgress size={28} />
              </Box>
            ) : visibleTasks.length === 0 ? (
              <Box p={5} textAlign="center">
                <Typography fontWeight={700}>
                  No tasks match this view
                </Typography>
                <Typography color="text.secondary" variant="body2" mt={0.5}>
                  Try clearing filters or selecting another quick view.
                </Typography>
                <Button onClick={clearFilters} sx={{ mt: 1.5 }}>
                  Clear filters
                </Button>
              </Box>
            ) : view === "list" ? (
              <Box
                display="grid"
                gridTemplateColumns={{
                  xs: "1fr",
                  sm: "repeat(2, minmax(0, 1fr))",
                  lg: "repeat(3, minmax(0, 1fr))",
                }}
                gap={1}
                p={{ xs: 1, sm: 1.5 }}
              >
                {visibleTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    runner={runners[task.runnerId]}
                    runnerName={runners[task.runnerId]?.displayName}
                    selected={task.id === selectedTask?.id}
                    onOpen={() => openTask(task.id)}
                  />
                ))}
              </Box>
            ) : (
              <TaskBoardView
                tasks={visibleTasks}
                runners={runners}
                onOpen={openTask}
              />
            )}
          </Paper>
      </Stack>
      <Drawer
        anchor="right"
        open={Boolean(selectedTask)}
        onClose={closeTask}
        PaperProps={{
          sx: { width: { xs: "100%", sm: 520 }, p: { xs: 2, sm: 3 } },
        }}
      >
        {selectedTask && (
          <TaskDetail
            task={selectedTask}
            runnerName={runners[selectedTask.runnerId]?.displayName}
            runners={Object.values(runners)}
            attachments={attachments}
            loadingAttachments={attachmentsLoading}
            onClose={closeTask}
            onDownload={downloadAttachment}
            onSaveDispatch={saveDispatchChange}
          />
        )}
      </Drawer>
    </main>
  );
}

function TaskBoardView({
  tasks,
  runners,
  onOpen,
}: {
  tasks: DispatcherTask[];
  runners: Record<string, DispatchRunner>;
  onOpen: (taskId: string) => void;
}) {
  const columns: Array<{ status: TaskStatus; label: string; tone: string }> = [
    { status: "sent", label: "Assigned", tone: "#dbeafe" },
    { status: "acknowledged", label: "Acknowledged", tone: "#ede9fe" },
    { status: "in_progress", label: "In progress", tone: "#dcfce7" },
    { status: "completed", label: "Completed", tone: "#f1f5f9" },
    {
      status: "unable_to_complete",
      label: "Unable to complete",
      tone: "#fee2e2",
    },
  ];
  return (
    <Box sx={{ overflowX: "auto", p: 1.5 }}>
      <Stack
        direction="row"
        gap={1.25}
        alignItems="flex-start"
        sx={{ minWidth: 1180 }}
      >
        {columns.map((column) => {
          const columnTasks = tasks.filter(
            (task) => task.status === column.status,
          );
          return (
            <Paper
              key={column.status}
              elevation={0}
              sx={{
                flex: "1 0 215px",
                border: "1px solid #e3e1e9",
                bgcolor: "#fafafa",
                p: 1,
              }}
            >
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                px={0.5}
                pb={1}
              >
                <Typography fontWeight={800} variant="body2">
                  {column.label}
                </Typography>
                <Chip
                  size="small"
                  label={columnTasks.length}
                  sx={{ bgcolor: column.tone }}
                />
              </Stack>
              <Stack gap={1}>
                {columnTasks.map((task) => (
                  <Paper
                    component="button"
                    onClick={() => onOpen(task.id)}
                    key={task.id}
                    elevation={0}
                    sx={{
                      textAlign: "left",
                      cursor: "pointer",
                      border: "1px solid #e3e1e9",
                      borderLeft: `3px solid ${priorityTone(task.priority).border}`,
                      p: 1.25,
                      bgcolor: "#fff",
                      "&:hover": { borderColor: "primary.main" },
                    }}
                  >
                    <Typography fontWeight={800} variant="body2" noWrap>
                      {task.clientName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {runners[task.runnerId]?.displayName ?? "Unassigned"}
                    </Typography>
                    <Typography
                      variant="caption"
                      display="block"
                      color="text.secondary"
                      mt={0.75}
                    >
                      {formatDate(task.dueAt)}
                    </Typography>
                  </Paper>
                ))}
                {columnTasks.length === 0 && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    textAlign="center"
                    py={2}
                  >
                    No tasks
                  </Typography>
                )}
              </Stack>
            </Paper>
          );
        })}
      </Stack>
    </Box>
  );
}

function TaskRow({
  task,
  runner,
  runnerName,
  selected,
  onOpen,
}: {
  task: DispatcherTask;
  runner?: DispatchRunner;
  runnerName?: string;
  selected: boolean;
  onOpen: () => void;
}) {
  const priority = priorityTone(task.priority);
  const health = taskHealth(task, runner);
  const collected =
    task.documents?.filter((document) => document.collected).length ?? 0;
  const required = task.documents?.length ?? 0;
  return (
    <Paper
      component="button"
      onClick={onOpen}
      elevation={0}
      sx={{
        width: "100%",
        minWidth: 0,
        maxWidth: "100%",
        height: "100%",
        overflow: "hidden",
        cursor: "pointer",
        textAlign: "left",
        border: "1px solid",
        borderColor: selected ? "primary.main" : "#e3e1e9",
        borderLeft: `4px solid ${priority.border}`,
        p: 1.5,
        bgcolor: selected ? "#f5faff" : "#fff",
        display: "flex",
        flexDirection: "column",
        "&:hover": {
          borderColor: "primary.main",
          boxShadow: "0 4px 18px rgba(0,55,102,.08)",
        },
      }}
    >
      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        gap={1}
        alignItems="flex-start"
      >
        <div style={{ minWidth: 0 }}>
          <Typography fontWeight={800} noWrap>
            {task.clientName}
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              display: "-webkit-box",
              overflow: "hidden",
              overflowWrap: "anywhere",
              WebkitBoxOrient: "vertical",
              WebkitLineClamp: { xs: 2, sm: 1 },
            }}
          >
            {task.clientAddress}
          </Typography>
        </div>
        <Stack
          direction="row"
          gap={0.75}
          flexWrap="wrap"
          justifyContent={{ xs: "flex-start", sm: "flex-end" }}
        >
          <Chip
            size="small"
            label={priority.label}
            sx={{ bgcolor: priority.background, fontWeight: 700 }}
          />
          <Chip size="small" label={statusLabel[task.status]} />
        </Stack>
      </Stack>
      <Chip
        size="small"
        label={`Assigned by · ${task.createdByOperatorName ?? "Unattributed"}`}
        sx={{
          mt: 1,
          alignSelf: "flex-start",
          maxWidth: "100%",
          bgcolor: "#eef6ff",
          border: "1px solid #c8def2",
          color: "#174d79",
          fontWeight: 750,
          "& .MuiChip-label": { overflow: "hidden", textOverflow: "ellipsis" },
        }}
      />
      <Stack
        direction={{ xs: "column", sm: "row" }}
        gap={1.25}
        mt={1.25}
        color="text.secondary"
      >
        <Stack direction="row" gap={0.5} alignItems="center" minWidth={0}>
          <PersonOutlineIcon fontSize="small" />
          <Typography variant="caption" noWrap>
            {runnerName ?? "Unassigned"}
          </Typography>
        </Stack>
        <Stack direction="row" gap={0.5} alignItems="center">
          <ScheduleOutlinedIcon fontSize="small" />
          <Typography variant="caption">{formatDate(task.dueAt)}</Typography>
        </Stack>
        <Stack direction="row" gap={0.5} alignItems="center">
          <AttachFileIcon fontSize="small" />
          <Typography variant="caption">
            {collected}/{required} docs
          </Typography>
        </Stack>
      </Stack>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        mt={1.25}
      >
        <Chip
          size="small"
          color={health.color}
          icon={
            health.color === "warning" || health.color === "error" ? (
              <WarningAmberOutlinedIcon />
            ) : undefined
          }
          label={health.label}
        />
        <Typography variant="caption" color="text.secondary">
          Task #{task.id}
        </Typography>
      </Stack>
    </Paper>
  );
}

function TaskDetail({
  task,
  runnerName,
  runners,
  attachments,
  loadingAttachments,
  onClose,
  onDownload,
  onSaveDispatch,
}: {
  task: DispatcherTask;
  runnerName?: string;
  runners: DispatchRunner[];
  attachments: TaskAttachment[];
  loadingAttachments: boolean;
  onClose: () => void;
  onDownload: (attachment: TaskAttachment) => Promise<void>;
  onSaveDispatch: (change: {
    runnerId: string;
    dueAt: string | null;
    reason?: string;
  }) => Promise<void>;
}) {
  const [dispatchDialogOpen, setDispatchDialogOpen] = useState(false);
  const [nextRunnerId, setNextRunnerId] = useState(task.runnerId);
  const [nextDueAt, setNextDueAt] = useState(
    task.dueAt ? task.dueAt.slice(0, 16) : "",
  );
  const [reason, setReason] = useState("");
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [savingDispatch, setSavingDispatch] = useState(false);
  const timeline = [
    ["Created", task.createdAt],
    ["Assigned", task.createdAt],
    ["Acknowledged", task.acknowledgedAt],
    ["Started", task.startedAt],
    [
      task.status === "unable_to_complete" ? "Unable to complete" : "Completed",
      task.completedAt,
    ],
  ].filter(([, date]) => Boolean(date));
  const canChangeDispatch = task.status === "sent";

  async function saveDispatch() {
    setSavingDispatch(true);
    setDispatchError(null);
    try {
      await onSaveDispatch({
        runnerId: nextRunnerId,
        dueAt: nextDueAt ? new Date(nextDueAt).toISOString() : null,
        reason: reason.trim() || undefined,
      });
      setDispatchDialogOpen(false);
    } catch (error) {
      setDispatchError(
        error instanceof Error
          ? error.message.replace(/^\d+\s*/, "")
          : "Could not update dispatch details.",
      );
    } finally {
      setSavingDispatch(false);
    }
  }
  return (
    <Stack gap={2.25}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="flex-start"
      >
        <div>
          <Typography variant="h5" fontWeight={800}>
            Task details
          </Typography>
          <Typography color="text.secondary">#{task.id}</Typography>
        </div>
        <Button onClick={onClose}>Close</Button>
      </Stack>
      <Paper elevation={0} sx={{ border: "1px solid #e3e1e9", p: 2 }}>
        <Stack direction="row" justifyContent="space-between" gap={1}>
          <Typography fontWeight={800}>{task.clientName}</Typography>
          {canChangeDispatch && (
            <Button
              size="small"
              variant="outlined"
              onClick={() => setDispatchDialogOpen(true)}
            >
              Reassign or reschedule
            </Button>
          )}
        </Stack>
        <Typography color="text.secondary" variant="body2" mt={0.5}>
          {task.clientAddress}
        </Typography>
        <Stack gap={0.75} mt={2}>
          <Typography variant="body2">
            <strong>Contact:</strong> {task.clientPhone || "Not provided"}
          </Typography>
          <Typography variant="body2">
            <strong>Runner:</strong> {runnerName ?? "Unassigned"}
          </Typography>
          <Typography variant="body2">
            <strong>Schedule:</strong> {formatDate(task.dueAt)}
          </Typography>
          <Typography variant="body2">
            <strong>Status:</strong> {statusLabel[task.status]}
          </Typography>
          {!canChangeDispatch && (
            <Typography variant="caption" color="text.secondary">
              Dispatch details lock after runner acknowledgement to protect
              in-progress work.
            </Typography>
          )}
        </Stack>
      </Paper>
      {task.notes && (
        <DetailSection title="Dispatcher note">
          <Typography variant="body2" whiteSpace="pre-wrap">
            {task.notes}
          </Typography>
        </DetailSection>
      )}
      <DetailSection
        title={`Required documents (${task.documents?.length ?? 0})`}
      >
        {task.documents?.length ? (
          <Stack gap={0.75}>
            {task.documents.map((document, index) => (
              <Stack
                key={`${document.name}-${index}`}
                direction="row"
                justifyContent="space-between"
                gap={1}
              >
                <Typography variant="body2">{document.name}</Typography>
                <Chip
                  size="small"
                  color={document.collected ? "success" : "default"}
                  label={document.collected ? "Collected" : "Pending"}
                />
              </Stack>
            ))}
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary">
            No collection documents were requested.
          </Typography>
        )}
      </DetailSection>
      <DetailSection title={`Attached files (${attachments.length})`}>
        {loadingAttachments ? (
          <CircularProgress size={20} />
        ) : attachments.length ? (
          <Stack gap={0.75}>
            {attachments.map((attachment) => (
              <Stack
                key={attachment.id}
                direction="row"
                alignItems="center"
                gap={1}
              >
                <AttachFileIcon color="primary" fontSize="small" />
                <Typography
                  variant="body2"
                  sx={{ flex: 1, overflowWrap: "anywhere" }}
                >
                  {attachment.name}
                </Typography>
                <Button
                  size="small"
                  startIcon={<DownloadOutlinedIcon />}
                  onClick={() => void onDownload(attachment)}
                >
                  Download
                </Button>
              </Stack>
            ))}
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary">
            No files were attached when this task was assigned.
          </Typography>
        )}
      </DetailSection>
      <DetailSection title="Activity">
        <Stack gap={1}>
          {timeline.length ? (
            timeline.map(([label, date]) => (
              <Stack
                key={String(label)}
                direction="row"
                justifyContent="space-between"
                gap={1}
              >
                <Typography variant="body2" fontWeight={700}>
                  {label}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {formatDate(String(date))}
                </Typography>
              </Stack>
            ))
          ) : (
            <Typography variant="body2" color="text.secondary">
              No activity timestamps are available yet.
            </Typography>
          )}
        </Stack>
      </DetailSection>
      <Dialog
        open={dispatchDialogOpen}
        onClose={() => !savingDispatch && setDispatchDialogOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Update dispatch</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Changes are saved to the task timeline. Only the selected active
            runner receives the updated assignment.
          </Typography>
          <Stack gap={2} pt={0.5}>
            <FormControl fullWidth>
              <InputLabel>Runner</InputLabel>
              <Select
                label="Runner"
                value={nextRunnerId}
                onChange={(event) => setNextRunnerId(event.target.value)}
              >
                {runners.map((runner) => (
                  <MenuItem key={runner.runnerId} value={runner.runnerId}>
                    {runner.displayName} ·{" "}
                    {runner.online ? "online" : "offline"}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Reschedule for"
              type="datetime-local"
              value={nextDueAt}
              onChange={(event) => setNextDueAt(event.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <TextField
              label="Reason (recommended)"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              multiline
              minRows={2}
              inputProps={{ maxLength: 240 }}
              helperText="For example: customer requested a new slot or runner is unavailable."
            />
            {dispatchError && <Alert severity="error">{dispatchError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button
            onClick={() => setDispatchDialogOpen(false)}
            disabled={savingDispatch}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => void saveDispatch()}
            disabled={savingDispatch || !nextRunnerId}
          >
            {savingDispatch ? "Saving…" : "Save dispatch"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Paper elevation={0} sx={{ border: "1px solid #e3e1e9", p: 2 }}>
      <Typography fontWeight={800} mb={1.25}>
        {title}
      </Typography>
      {children}
    </Paper>
  );
}
