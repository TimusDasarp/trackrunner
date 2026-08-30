import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../lib/auth";

type Overview = {
  totals: {
    assigned: number;
    completed: number;
    unable: number;
    overdue: number;
    median_ack_seconds: number | null;
    median_cycle_seconds: number | null;
  };
  byRunner: Array<{
    runner_id: string;
    display_name: string;
    assigned: number;
    completed: number;
    median_cycle_seconds: number | null;
  }>;
};
type AnalyticsGuideItem = {
  title: string;
  explanation: string;
  action: string;
};

const analyticsGuide: AnalyticsGuideItem[] = [
  {
    title: "Completion trend",
    explanation:
      "Shows whether tasks are being completed as quickly as they are assigned.",
    action: "Investigate or add capacity when the backlog starts growing.",
  },
  {
    title: "Task status breakdown",
    explanation:
      "Shows where work is waiting: assigned, acknowledged, in progress, completed, or unable to complete.",
    action: "Follow up, unblock, or reassign tasks that are not moving.",
  },
  {
    title: "On-time performance",
    explanation: "Shows the share of tasks completed before their due time.",
    action: "Improve schedules and identify patterns behind late work.",
  },
  {
    title: "Runner workload",
    explanation:
      "Shows how active and at-risk tasks are spread across runners.",
    action: "Rebalance assignments before one runner becomes overloaded.",
  },
  {
    title: "Unable-to-complete reasons",
    explanation:
      "Shows the most common reasons tasks cannot be completed in the field.",
    action:
      "Fix repeated address, document, customer-availability, or process issues.",
  },
  {
    title: "Task cycle time",
    explanation:
      "Shows how long tasks take from assignment through acknowledgement to completion.",
    action:
      "Find whether delays occur in dispatch, runner response, or on-site work.",
  },
];

// These colors mirror the operational language used elsewhere in TrackRunner.
// Keep their meaning stable: navy is assigned work, green is successful work,
// amber signals risk, and red signals a task that could not be completed.
const chartColors = {
  navy: "#003766",
  blue: "#405f90",
  green: "#1f7a5a",
  amber: "#d97706",
  red: "#dc2626",
  muted: "#64748b",
};

function duration(seconds: number | null) {
  if (seconds == null) return "—";
  return seconds < 3600
    ? `${Math.round(seconds / 60)} min`
    : `${(seconds / 3600).toFixed(1)} hr`;
}

export default function AnalyticsPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  useEffect(() => {
    api<Overview>("/api/analytics/overview?days=7")
      .then(setData)
      .catch(() => setData(null));
  }, []);

  const totals = data?.totals;
  const cards = [
    ["Assigned", totals?.assigned],
    ["Completed", totals?.completed],
    ["Overdue", totals?.overdue],
    [
      "Completion rate",
      totals
        ? `${totals.assigned ? Math.round((totals.completed / totals.assigned) * 100) : 0}%`
        : "—",
    ],
    ["Median acknowledgement", duration(totals?.median_ack_seconds ?? null)],
    ["Median cycle time", duration(totals?.median_cycle_seconds ?? null)],
  ];
  const taskOutcomeData = totals
    ? [
        {
          name: "Completed",
          value: totals.completed,
          color: chartColors.green,
        },
        {
          name: "In progress",
          value: Math.max(
            0,
            totals.assigned - totals.completed - totals.unable,
          ),
          color: chartColors.blue,
        },
        { name: "Unable", value: totals.unable, color: chartColors.red },
      ].filter((item) => item.value > 0)
    : [];
  const runnerWorkloadData =
    data?.byRunner.map((runner) => ({
      name: runner.display_name,
      assigned: runner.assigned,
      completed: runner.completed,
    })) ?? [];

  return (
    <main className="mx-auto w-full max-w-[1450px] p-4 sm:p-6 lg:p-7">
      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems={{ xs: "flex-start", sm: "center" }}
        gap={1.5}
        mb={3}
      >
        <div>
          <Typography variant="h5" fontWeight={700}>
            Analytics
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Last 7 days across your assigned runners.
          </Typography>
        </div>
        <Button variant="outlined" onClick={() => setIsGuideOpen(true)}>
          How to use analytics
        </Button>
      </Stack>
      <Box
        display="grid"
        gridTemplateColumns={{
          xs: "repeat(2,minmax(0,1fr))",
          md: "repeat(3,minmax(0,1fr))",
        }}
        gap={1.5}
      >
        {cards.map(([label, value]) => (
          <Paper
            key={String(label)}
            elevation={0}
            sx={{ border: "1px solid #e3e1e9",p: 2 }}
          >
            <Typography variant="caption" color="text.secondary">
              {label}
            </Typography>
            <Typography variant="h5" fontWeight={700}>
              {value ?? "—"}
            </Typography>
          </Paper>
        ))}
      </Box>
      <Box
        display="grid"
        gridTemplateColumns={{
          xs: "1fr",
          lg: "minmax(0, .9fr) minmax(0, 1.4fr)",
        }}
        gap={2}
        mt={2}
      >
        <Paper
          elevation={0}
          sx={{ border: "1px solid #e3e1e9",p: 2 }}
        >
          <Typography fontWeight={700}>Task outcomes</Typography>
          <Typography variant="body2" color="text.secondary" mb={1}>
            How the last 7 days of assigned work is progressing.
          </Typography>
          {taskOutcomeData.length ? (
            <Box height={250} role="img" aria-label="Task outcomes chart">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={taskOutcomeData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={56}
                    outerRadius={84}
                    paddingAngle={3}
                  >
                    {taskOutcomeData.map((item) => (
                      <Cell key={item.name} fill={item.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </Box>
          ) : (
            <Typography
              color="text.secondary"
              variant="body2"
              py={10}
              textAlign="center"
            >
              Task outcomes will appear once tasks are assigned.
            </Typography>
          )}
        </Paper>
        <Paper
          elevation={0}
          sx={{ border: "1px solid #e3e1e9",p: 2 }}
        >
          <Typography fontWeight={700}>Runner workload</Typography>
          <Typography variant="body2" color="text.secondary" mb={1}>
            Compare assigned work with completed work for each runner.
          </Typography>
          {runnerWorkloadData.length ? (
            <Box height={250} role="img" aria-label="Runner workload chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={runnerWorkloadData}
                  margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
                >
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 12, fill: "#5e6a69" }}
                    interval={0}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 12, fill: "#5e6a69" }}
                  />
                  <Tooltip cursor={{ fill: "#f4f7fb" }} />
                  <Legend />
                  <Bar
                    dataKey="assigned"
                    name="Assigned"
                    fill={chartColors.navy}
                    radius={[5, 5, 0, 0]}
                  />
                  <Bar
                    dataKey="completed"
                    name="Completed"
                    fill={chartColors.green}
                    radius={[5, 5, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </Box>
          ) : (
            <Typography
              color="text.secondary"
              variant="body2"
              py={10}
              textAlign="center"
            >
              Runner workload will appear once tasks are assigned.
            </Typography>
          )}
        </Paper>
      </Box>
      <Paper
        elevation={0}
        sx={{ border: "1px solid #e3e1e9",p: 2, mt: 2 }}
      >
        <Typography fontWeight={700}>Runner performance</Typography>
        <Stack gap={1.25} mt={2}>
          {data?.byRunner.map((runner) => (
            <Box
              key={runner.runner_id}
              display="grid"
              gridTemplateColumns="minmax(0,1fr) auto"
              gap={1}
              alignItems="center"
              borderBottom="1px solid #f0eff6"
              pb={1.25}
            >
              <div>
                <Typography fontWeight={600}>{runner.display_name}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {runner.completed} completed of {runner.assigned} assigned ·
                  median cycle {duration(runner.median_cycle_seconds)}
                </Typography>
              </div>
              <Typography fontWeight={700}>
                {runner.assigned
                  ? `${Math.round((runner.completed / runner.assigned) * 100)}%`
                  : "0%"}
              </Typography>
            </Box>
          )) ?? (
            <Typography color="text.secondary">
              No task data for this period.
            </Typography>
          )}
        </Stack>
      </Paper>
      <Dialog
        open={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
        fullWidth
        maxWidth="sm"
        aria-labelledby="analytics-guide-title"
      >
        <DialogTitle id="analytics-guide-title">
          How to use Analytics
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" mb={2.5}>
            Analytics answers four practical questions: are we keeping up, what
            needs attention, who needs help, and which recurring issues should
            we fix?
          </Typography>
          <Stack gap={2}>
            {analyticsGuide.map((item) => (
              <div key={item.title}>
                <Typography fontWeight={700}>{item.title}</Typography>
                <Typography variant="body2" color="text.secondary" mt={0.25}>
                  {item.explanation}
                </Typography>
                <Typography variant="body2" mt={0.5}>
                  <strong>Use it to:</strong> {item.action}
                </Typography>
              </div>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsGuideOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </main>
  );
}
