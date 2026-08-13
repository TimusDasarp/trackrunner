import { useEffect, useState } from "react";
import { Box, Paper, Stack, Typography } from "@mui/material";
import { api } from "../lib/auth";

type Overview = { totals: { assigned:number; completed:number; unable:number; overdue:number; median_ack_seconds:number|null; median_cycle_seconds:number|null }; byRunner: Array<{runner_id:string;display_name:string;assigned:number;completed:number;median_cycle_seconds:number|null}> };
const duration = (seconds: number | null) => seconds == null ? "—" : seconds < 3600 ? `${Math.round(seconds / 60)} min` : `${(seconds / 3600).toFixed(1)} hr`;

export default function AnalyticsPage() {
  const [data, setData] = useState<Overview | null>(null);
  useEffect(() => { api<Overview>("/api/analytics/overview?days=7").then(setData).catch(() => setData(null)); }, []);
  const t = data?.totals;
  const cards = [["Assigned",t?.assigned],["Completed",t?.completed],["Overdue",t?.overdue],["Completion rate",t ? `${t.assigned ? Math.round(t.completed/t.assigned*100) : 0}%` : "—"],["Median acknowledgement",duration(t?.median_ack_seconds ?? null)],["Median cycle time",duration(t?.median_cycle_seconds ?? null)]];
  return <main className="mx-auto w-full max-w-6xl p-4 sm:p-6 lg:p-7"><Typography variant="h5" fontWeight={700}>Analytics</Typography><Typography variant="body2" color="text.secondary" mb={3}>Last 7 days across your assigned runners.</Typography><Box display="grid" gridTemplateColumns={{ xs:"repeat(2,minmax(0,1fr))", md:"repeat(3,minmax(0,1fr))" }} gap={1.5}>{cards.map(([label,value]) => <Paper key={String(label)} elevation={0} sx={{border:"1px solid #e3e1e9",borderRadius:3,p:2}}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="h5" fontWeight={700}>{value ?? "—"}</Typography></Paper>)}</Box><Paper elevation={0} sx={{border:"1px solid #e3e1e9",borderRadius:3,p:2,mt:2}}><Typography fontWeight={700}>Runner performance</Typography><Stack gap={1.25} mt={2}>{data?.byRunner.map((runner) => <Box key={runner.runner_id} display="grid" gridTemplateColumns="minmax(0,1fr) auto" gap={1} alignItems="center" borderBottom="1px solid #f0eff6" pb={1.25}><div><Typography fontWeight={600}>{runner.display_name}</Typography><Typography variant="caption" color="text.secondary">{runner.completed} completed of {runner.assigned} assigned · median cycle {duration(runner.median_cycle_seconds)}</Typography></div><Typography fontWeight={700}>{runner.assigned ? `${Math.round(runner.completed/runner.assigned*100)}%` : "0%"}</Typography></Box>) ?? <Typography color="text.secondary">No task data for this period.</Typography>}</Stack></Paper></main>;
}
