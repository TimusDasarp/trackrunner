import type { ReactNode } from "react";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import LocationOnOutlinedIcon from "@mui/icons-material/LocationOnOutlined";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import { Box, Chip, Paper, Stack, Typography } from "@mui/material";
import {
  statusLabel,
  type DispatcherTask,
  type TaskPriority,
  type TaskStatus,
} from "../lib/taskWorkspace";

function formatDueDate(value?: string | null) {
  if (!value) return "No schedule set";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "No schedule set";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function priorityTone(priority?: TaskPriority) {
  if (priority === "urgent")
    return { border: "#b42318", background: "#fee4e2", color: "#7a271a", label: "Urgent" };
  if (priority === "high")
    return { border: "#b54708", background: "#fef0c7", color: "#6b3c00", label: "High" };
  return { border: "#475467", background: "#eaecf0", color: "#1d2939", label: "Normal" };
}

function statusTone(status: TaskStatus) {
  if (status === "completed") return { background: "#d1fadf", color: "#0f5132" };
  if (status === "unable_to_complete") return { background: "#fee4e2", color: "#7a271a" };
  if (status === "in_progress") return { background: "#d1e9ff", color: "#0b4a6f" };
  if (status === "acknowledged") return { background: "#e9d7fe", color: "#432b6f" };
  return { background: "#eaf2f8", color: "#17324d" };
}

type TaskCardProps = {
  task: DispatcherTask;
  runnerName?: string;
  selected?: boolean;
  onOpen?: () => void;
  /** Dashboard actions remain separate from the task's state, so the footer stays easy to scan. */
  actions?: ReactNode;
};

/**
 * A consistent task summary used in both dispatcher workspaces. Colour supports
 * the label rather than carrying meaning alone, and each foreground has a dark,
 * readable contrast against its status or priority surface.
 */
export default function TaskCard({ task, runnerName, selected = false, onOpen, actions }: TaskCardProps) {
  const priority = priorityTone(task.priority);
  const currentStatus = statusTone(task.status);
  const collected = task.documents?.filter((document) => document.collected).length ?? 0;
  const required = task.documents?.length ?? 0;

  return (
    <Paper
      component={onOpen ? "button" : "div"}
      onClick={onOpen}
      elevation={0}
      sx={{
        width: "100%", minWidth: 0, maxWidth: "100%", overflow: "hidden",
        cursor: onOpen ? "pointer" : "default", textAlign: "left",
        border: "1px solid", borderColor: selected ? "primary.main" : "#e3e1e9",
        borderLeft: `4px solid ${priority.border}`, p: 0, bgcolor: "#fff", boxSizing: "border-box",
        "&:hover": onOpen ? { borderColor: "primary.main", boxShadow: "0 4px 18px rgba(0,55,102,.08)" } : undefined,
      }}
    >
      <Box sx={{ p: { xs: 1.75, sm: 2 }, color: "#14213d", background: `linear-gradient(135deg, ${priority.background} 0%, #fffdf8 100%)` }}>
        <Stack direction="row" justifyContent="space-between" gap={1.5} alignItems="flex-start">
          <Typography fontWeight={800} sx={{ minWidth: 0, fontSize: { xs: "1.1rem", sm: "1.25rem" }, lineHeight: 1.25 }}>{task.clientName}</Typography>
          <Chip size="small" label={priority.label} sx={{ flexShrink: 0, bgcolor: priority.background, color: priority.color, border: `1px solid ${priority.border}`, fontWeight: 800 }} />
        </Stack>

        <Stack direction="row" gap={0.75} alignItems="flex-start" mt={1}>
          <LocationOnOutlinedIcon fontSize="small" sx={{ mt: 0.1, color: "#3e4c5a", flexShrink: 0 }} />
          <Typography variant="body2" sx={{ color: "#3e4c5a", display: "-webkit-box", overflow: "hidden", overflowWrap: "anywhere", WebkitBoxOrient: "vertical", WebkitLineClamp: 2 }}>{task.clientAddress}</Typography>
        </Stack>

        <Stack direction="row" flexWrap="wrap" gap={1.25} mt={1.5} sx={{ color: "#405066" }} alignItems="center">
          <Stack direction="row" gap={0.5} alignItems="center" minWidth={0}><PersonOutlineIcon fontSize="small" /><Typography variant="caption" noWrap>{runnerName ?? "Unassigned"}</Typography></Stack>
          <Stack direction="row" gap={0.5} alignItems="center"><ScheduleOutlinedIcon fontSize="small" /><Typography variant="caption">{formatDueDate(task.dueAt)}</Typography></Stack>
          <Stack direction="row" gap={0.5} alignItems="center"><AttachFileIcon fontSize="small" /><Typography variant="caption">{collected}/{required} docs</Typography></Stack>
          <Typography variant="caption" sx={{ ml: { sm: "auto" }, color: "#405066", whiteSpace: "nowrap" }}>Task #{task.id}</Typography>
        </Stack>
      </Box>

      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", sm: "center" }} gap={1} sx={{ borderTop: "1px solid #e4e7ec", px: { xs: 1.75, sm: 2 }, py: 1.25, bgcolor: "#fff" }}>
        <Chip size="small" label={`Assigned by · ${task.createdByOperatorName ?? "Unattributed"}`} sx={{ maxWidth: "100%", bgcolor: "#eef6ff", border: "1px solid #a9cae8", color: "#164d7d", fontWeight: 800, "& .MuiChip-label": { overflow: "hidden", textOverflow: "ellipsis" } }} />
        <Chip size="small" label={statusLabel[task.status]} sx={{ flexShrink: 0, bgcolor: currentStatus.background, color: currentStatus.color, fontWeight: 800 }} />
      </Stack>

      {actions && <Box sx={{ borderTop: "1px solid #e4e7ec", px: { xs: 1.75, sm: 2 }, py: 0.75 }}>{actions}</Box>}
    </Paper>
  );
}
