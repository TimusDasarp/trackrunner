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

type Form = { email: string; password: string; displayName: string };
const empty: Form = { email: "", password: "", displayName: "" };

export default function ManageRunnersPage() {
  const [runners, setRunners] = useState<Record<string, RunnerState>>({});
  const [target, setTarget] = useState<RunnerState | null | undefined>(
    undefined,
  );
  const [archiveTarget, setArchiveTarget] = useState<RunnerState | null>(null);
  const [form, setForm] = useState<Form>(empty);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
  return (
    <main className="mx-auto w-full max-w-6xl p-4 sm:p-6 lg:p-7">
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
