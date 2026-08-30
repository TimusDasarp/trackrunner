import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { api } from "../lib/auth";
import { getRunnerStatus, type RunnerState } from "../lib/types";
import { type DispatchOperator, useDispatcherSession } from "../lib/dispatcherSession";

type Form = { email: string; password: string; displayName: string };
const empty: Form = { email: "", password: "", displayName: "" };

export default function ManageRunnersPage() {
  const { operators, refreshOperators } = useDispatcherSession();
  const [runners, setRunners] = useState<Record<string, RunnerState>>({});
  const [target, setTarget] = useState<RunnerState | null | undefined>(
    undefined,
  );
  const [archiveTarget, setArchiveTarget] = useState<RunnerState | null>(null);
  const [form, setForm] = useState<Form>(empty);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [operatorTarget, setOperatorTarget] = useState<DispatchOperator | null | undefined>(undefined);
  const [operatorName, setOperatorName] = useState("");
  const [operatorDeleteTarget, setOperatorDeleteTarget] = useState<DispatchOperator | null>(null);
  const [selectedOperatorId, setSelectedOperatorId] = useState<string | null>(null);
  const [tab, setTab] = useState(0);
  const refresh = async () => {
    try {
      const response = await api<{ runners: RunnerState[] }>(
        "/api/runners?includeArchived=true",
      );
      setRunners(
        Object.fromEntries(
          response.runners.map((runner) => [runner.runnerId, runner]),
        ),
      );
    } catch (err: any) {
      setError(err.message ?? "Could not load runners");
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  const list = useMemo(
    () =>
      Object.values(runners)
        .filter((runner) => Boolean(runner.assignmentActive) === (tab === 0))
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [runners, tab],
  );
  function openCreate() {
    setTarget(null);
    setForm(empty);
    setError(null);
  }
  function openEdit(runner: RunnerState) {
    setTarget(runner);
    setForm({
      displayName: runner.displayName,
      email: runner.email,
      password: "",
    });
    setError(null);
  }
  function openOperatorForm(operator: DispatchOperator | null) {
    setOperatorTarget(operator);
    setOperatorName(operator?.displayName ?? "");
    setError(null);
  }
  async function saveOperator(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (operatorTarget) await api(`/api/dispatch-operators/${operatorTarget.id}`, { method: "PATCH", body: JSON.stringify({ displayName: operatorName }) });
      else await api("/api/dispatch-operators", { method: "POST", body: JSON.stringify({ displayName: operatorName }) });
      await refreshOperators();
      setSelectedOperatorId(null);
      setOperatorTarget(undefined);
      setNotice(operatorTarget ? "Dispatcher name updated" : "Dispatcher added");
    } catch (err: any) { setError(err.message ?? "Could not save dispatcher"); }
    finally { setBusy(false); }
  }
  async function deleteOperator() {
    if (!operatorDeleteTarget) return;
    setBusy(true);
    try {
      await api(`/api/dispatch-operators/${operatorDeleteTarget.id}`, { method: "DELETE" });
      await refreshOperators();
      setOperatorDeleteTarget(null);
      setSelectedOperatorId(null);
      setNotice("Dispatcher removed from future task assignments");
    } catch (err: any) { setError(err.message ?? "Could not remove dispatcher"); }
    finally { setBusy(false); }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (target)
        await api(`/api/runners/${target.runnerId}`, {
          method: "PATCH",
          body: JSON.stringify({ displayName: form.displayName }),
        });
      else
        await api("/api/runners", {
          method: "POST",
          body: JSON.stringify(form),
        });
      await refresh();
      setTarget(undefined);
      setNotice(target ? "Runner details updated" : "Runner added");
    } catch (err: any) {
      setError(err.message ?? "Could not save runner");
    } finally {
      setBusy(false);
    }
  }
  async function archive() {
    if (!archiveTarget) return;
    setBusy(true);
    try {
      await api(`/api/runners/${archiveTarget.runnerId}`, { method: "DELETE" });
      await refresh();
      setArchiveTarget(null);
      setNotice("Runner archived. Their history is retained.");
    } catch (err: any) {
      setError(err.message ?? "Could not archive runner");
    } finally {
      setBusy(false);
    }
  }
  async function restore(runner: RunnerState) {
    setBusy(true);
    try {
      await api(`/api/runners/${runner.runnerId}/restore`, { method: "POST" });
      await refresh();
      setTab(0);
      setNotice("Runner restored to the dashboard");
    } catch (err: any) {
      setError(err.message ?? "Could not restore runner");
    } finally {
      setBusy(false);
    }
  }
  const selectedOperator = operators.find((operator) => operator.id === selectedOperatorId) ?? null;
  return (
    <main className="mx-auto w-full max-w-[1450px] p-4 sm:p-6 lg:p-7">
      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems={{ sm: "center" }}
        gap={2}
        mb={3}
      >
        <div>
          <Typography variant="h5" fontWeight={700}>
            Manage runners
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Archive runners safely without losing their task or location
            history.
          </Typography>
        </div>
        <Button
          variant="contained"
          onClick={openCreate}
          sx={{ borderRadius: 99, alignSelf: { xs: "stretch", sm: "auto" } }}
        >
          Add runner
        </Button>
      </Stack>
      <Paper elevation={0} sx={{ border: "1px solid #e3e1e9", p: { xs: 1.5, sm: 2 }, mb: 3 }}>
        <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} gap={1.5} mb={1.5}>
          <div><Typography fontWeight={800}>Dispatch team</Typography><Typography variant="body2" color="text.secondary">Choose and maintain the names that appear on task assignments.</Typography></div>
          <Button variant="outlined" onClick={() => openOperatorForm(null)} sx={{ borderRadius: 99, alignSelf: { xs: "stretch", sm: "auto" } }}>Add dispatcher</Button>
        </Stack>
        <Stack direction="row" flexWrap="wrap" gap={1} mb={1.5}>
          {operators.map((operator) => <Paper key={operator.id} component="button" type="button" onClick={() => setSelectedOperatorId((current) => current === operator.id ? null : operator.id)} variant="outlined" sx={{ px: 1.25, py: 0.85, borderRadius: 2, cursor: "pointer", color: "text.primary", borderColor: selectedOperatorId === operator.id ? "primary.main" : "divider", bgcolor: selectedOperatorId === operator.id ? "#eef6ff" : "background.paper", font: "inherit", "&:hover": { borderColor: "primary.main" } }}><Typography variant="body2" fontWeight={750}>{operator.displayName}</Typography></Paper>)}
        </Stack>
        <Stack direction={{ xs: "column", sm: "row" }} gap={1} alignItems={{ sm: "center" }}>
          <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>{selectedOperator ? `${selectedOperator.displayName} selected` : "Select a dispatcher name to edit or remove it."}</Typography>
          <Button variant="outlined" disabled={!selectedOperator} onClick={() => selectedOperator && openOperatorForm(selectedOperator)}>Edit</Button>
          <Button color="error" variant="outlined" disabled={!selectedOperator} onClick={() => selectedOperator && setOperatorDeleteTarget(selectedOperator)}>Delete</Button>
        </Stack>
      </Paper>
      <Paper
        elevation={0}
        sx={{ border: "1px solid #e3e1e9", overflow: "hidden" }}
      >
        <Tabs
          value={tab}
          onChange={(_, value) => setTab(value)}
          variant="fullWidth"
        >
          <Tab label="Active runners" />
          <Tab label="Archived" />
        </Tabs>
      </Paper>
      <Stack gap={1.5} mt={2}>
        {list.map((runner) => (
          <Paper
            key={runner.runnerId}
            elevation={0}
            sx={{
              border: "1px solid #e3e1e9",
              p: 2,
              display: "flex",
              flexDirection: { xs: "column", sm: "row" },
              alignItems: { sm: "center" },
              gap: 1.5,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <Typography fontWeight={700}>{runner.displayName}</Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ overflowWrap: "anywhere" }}
              >
                {runner.email}
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  display: "inline-block",
                  mt: 0.75,
                  px: 1,
                  py: 0.25,
                  borderRadius: 4,
                  bgcolor: "#e9efff",
                  color: "#405f90",
                  textTransform: "capitalize",
                }}
              >
                {getRunnerStatus(runner)}
              </Typography>
            </div>
            {tab === 0 ? (
              <Stack
                direction={{ xs: "column", sm: "row" }}
                gap={1}
                width={{ xs: "100%", sm: "auto" }}
              >
                <Button
                  variant="outlined"
                  onClick={() => openEdit(runner)}
                  sx={{ borderRadius: 99 }}
                >
                  Edit
                </Button>
                <Button
                  color="error"
                  variant="outlined"
                  onClick={() => setArchiveTarget(runner)}
                  sx={{ borderRadius: 99 }}
                >
                  Archive
                </Button>
              </Stack>
            ) : (
              <Button
                variant="contained"
                onClick={() => restore(runner)}
                disabled={busy}
                sx={{
                  borderRadius: 99,
                  alignSelf: { xs: "stretch", sm: "center" },
                }}
              >
                Restore
              </Button>
            )}
          </Paper>
        ))}
        {list.length === 0 && (
          <Paper
            elevation={0}
            sx={{
              border: "1px solid #e3e1e9",
              p: 4,
              textAlign: "center",
              color: "text.secondary",
            }}
          >
            No {tab === 0 ? "active" : "archived"} runners.
          </Paper>
        )}
      </Stack>
      <Dialog
        open={target !== undefined}
        onClose={() => setTarget(undefined)}
        fullWidth
        maxWidth="sm"
      >
        <form onSubmit={save}>
          <DialogTitle>
            {target ? "Edit runner details" : "Add runner"}
          </DialogTitle>
          <DialogContent>
            <Stack gap={2} pt={1}>
              <TextField
                label="Display name"
                value={form.displayName}
                onChange={(e) =>
                  setForm({ ...form, displayName: e.target.value })
                }
                required
                fullWidth
                inputProps={{ minLength: 2, maxLength: 80 }}
              />
              {!target && (
                <>
                  <TextField
                    label="Runner email"
                    value={form.email}
                    onChange={(e) =>
                      setForm({ ...form, email: e.target.value })
                    }
                    required
                    type="email"
                    fullWidth
                  />
                  <TextField
                    label="Temporary password"
                    value={form.password}
                    onChange={(e) =>
                      setForm({ ...form, password: e.target.value })
                    }
                    required
                    type="password"
                    fullWidth
                    inputProps={{ minLength: 8 }}
                  />
                </>
              )}
              {error && (
                <Typography color="error" variant="body2">
                  {error}
                </Typography>
              )}
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setTarget(undefined)}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
      <Dialog open={operatorTarget !== undefined} onClose={() => setOperatorTarget(undefined)} fullWidth maxWidth="xs">
        <form onSubmit={saveOperator}>
          <DialogTitle>{operatorTarget ? "Edit dispatcher" : "Add dispatcher"}</DialogTitle>
          <DialogContent><TextField autoFocus fullWidth required label="Dispatcher name" value={operatorName} onChange={(event) => setOperatorName(event.target.value)} inputProps={{ minLength: 2, maxLength: 80 }} sx={{ mt: 1 }} /></DialogContent>
          <DialogActions sx={{ p: 2 }}><Button onClick={() => setOperatorTarget(undefined)}>Cancel</Button><Button type="submit" variant="contained" disabled={busy}>{busy ? "Saving…" : "Save"}</Button></DialogActions>
        </form>
      </Dialog>
      <Dialog open={Boolean(operatorDeleteTarget)} onClose={() => setOperatorDeleteTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle>Remove dispatcher?</DialogTitle>
        <DialogContent><Typography>{operatorDeleteTarget?.displayName} will no longer be available for future task assignments. Existing task history will be retained.</Typography></DialogContent>
        <DialogActions sx={{ p: 2 }}><Button onClick={() => setOperatorDeleteTarget(null)}>Cancel</Button><Button color="error" variant="contained" onClick={deleteOperator} disabled={busy}>Remove</Button></DialogActions>
      </Dialog>
      <Dialog
        open={Boolean(archiveTarget)}
        onClose={() => setArchiveTarget(null)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Archive runner?</DialogTitle>
        <DialogContent>
          <Typography>
            Archive {archiveTarget?.displayName}? They will leave the live
            dashboard, but their past tasks and location history remain
            available.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setArchiveTarget(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={archive}
            disabled={busy}
          >
            Archive
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar
        open={Boolean(notice)}
        autoHideDuration={4_000}
        onClose={() => setNotice(null)}
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <Alert
          severity="success"
          onClose={() => setNotice(null)}
          variant="filled"
        >
          {notice}
        </Alert>
      </Snackbar>
    </main>
  );
}
