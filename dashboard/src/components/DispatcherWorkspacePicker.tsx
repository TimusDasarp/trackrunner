import { useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Typography } from "@mui/material";
import { useDispatcherSession } from "../lib/dispatcherSession";

function greetingForCurrentTime() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Good night";
}

export default function DispatcherWorkspacePicker() {
  const { operators, selectedOperator, selectorOpen, selectOperator, closeSelector, loading } = useDispatcherSession();
  const [choice, setChoice] = useState(selectedOperator?.id ?? "");
  const canProceed = Boolean(choice);
  const heading = useMemo(() => `Hello, ${greetingForCurrentTime()}`, []);

  useEffect(() => {
    if (selectorOpen) setChoice(selectedOperator?.id ?? "");
  }, [selectedOperator?.id, selectorOpen]);

  return <Dialog open={selectorOpen} fullWidth maxWidth="sm" disableEscapeKeyDown onClose={(_, reason) => {
    if (selectedOperator && reason === "backdropClick") closeSelector();
  }} PaperProps={{ sx: { borderRadius: 3, mx: { xs: 1.5, sm: 3 } } }}>
    <DialogTitle sx={{ pb: 0.75, fontWeight: 800 }}>{heading}</DialogTitle>
    <DialogContent sx={{ pt: "12px !important" }}>
      <Typography color="text.secondary" variant="body2" mb={2}>Choose the dispatcher workspace you are working in today.</Typography>
      {loading ? <Typography variant="body2">Loading dispatchers…</Typography> : operators.length === 0 ? <Alert severity="warning">No active dispatcher names are available. Add one from the Runners page.</Alert> : <Box display="grid" gridTemplateColumns={{ xs: "repeat(2, minmax(0, 1fr))", sm: "repeat(4, minmax(0, 1fr))" }} gap={1}>
        {operators.map((operator) => <Paper key={operator.id} component="button" type="button" elevation={0} onClick={() => setChoice(operator.id)} sx={{ minHeight: 58, p: 1, borderRadius: 2, border: "1px solid", borderColor: choice === operator.id ? "primary.main" : "divider", bgcolor: choice === operator.id ? "#eef7ff" : "background.paper", color: "text.primary", cursor: "pointer", fontWeight: 750, "&:hover": { borderColor: "primary.main" } }}>{operator.displayName}</Paper>)}
      </Box>}
    </DialogContent>
    <DialogActions sx={{ px: 3, py: 2, pt: 1.25 }}>
      {selectedOperator && <Button color="inherit" onClick={closeSelector}>Cancel</Button>}
      <Button variant="contained" disabled={!canProceed} onClick={() => { const operator = operators.find((item) => item.id === choice); if (operator) { selectOperator(operator); closeSelector(); } }}>Proceed</Button>
    </DialogActions>
  </Dialog>;
}
