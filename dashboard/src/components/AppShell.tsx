import { AppBar, Box, Button, Toolbar, Typography } from "@mui/material";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { clearSession, getUser } from "../lib/auth";
import { disconnectSocket } from "../lib/socket";
import { useRunners } from "../hooks/useRunners";
import { tasksWorkspaceEnabled } from "../lib/config";
import { DispatcherSessionProvider, useDispatcherSession } from "../lib/dispatcherSession";
import DispatcherWorkspacePicker from "./DispatcherWorkspacePicker";

export default function AppShell() {
  return <DispatcherSessionProvider><AppShellContent /></DispatcherSessionProvider>;
}

function AppShellContent() {
  const nav = useNavigate();
  const { connected } = useRunners();
  const isAdmin = Boolean(getUser()?.isAdmin);
  const { selectedOperator, clearSelection, openSelector } = useDispatcherSession();
  function signOut() {
    clearSelection();
    clearSession();
    disconnectSocket();
    nav("/login", { replace: true });
  }
  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: "background.default",
        color: "text.primary",
      }}
    >
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          bgcolor: "rgba(255,255,255,.92)",
          color: "text.primary",
          borderBottom: "1px solid",
          borderColor: "divider",
          backdropFilter: "blur(10px)",
        }}
      >
        <Toolbar
          sx={{
            minHeight: { xs: 64, sm: 72 },
            px: { xs: 2, md: 4 },
            py: { xs: 1, sm: 0 },
            gap: 1.25,
            flexWrap: "wrap",
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.25,
              mr: { md: 2 },
              minWidth: 0,
            }}
          >
            <Box
              sx={{
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
                width: 36,
                height: 36,
                borderRadius: 2,
                bgcolor: "primary.main",
                color: "white",
                fontWeight: 800,
              }}
            >
              ↗
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography fontWeight={700} lineHeight={1.1}>
                TrackRunner
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  mt: 0.35,
                  px: 0.8,
                  py: 0.15,
                  borderRadius: 99,
                  bgcolor: connected ? "#e6f4ef" : "#fff1dc",
                  color: connected ? "#1f7a5a" : "#9a5a14",
                  fontWeight: 700,
                }}
              >
                {connected ? "Connected" : "Reconnecting…"}
              </Typography>
            </Box>
          </Box>
          <Box
            component="nav"
            sx={{
              display: "flex",
              order: { xs: 3, sm: 2 },
              width: { xs: "100%", sm: "auto" },
              gap: 0.5,
            }}
          >
            <NavButton to="/dashboard" label="Dashboard" />
            {tasksWorkspaceEnabled && <NavButton to="/tasks" label="Tasks" />}
            {isAdmin && <NavButton to="/runners" label="Runners" />}
            <NavButton to="/analytics" label="Analytics" />
          </Box>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              ml: "auto",
              order: { xs: 2, sm: 3 },
            }}
          >
            {selectedOperator && <Button
              onClick={openSelector}
              size="small"
              color="inherit"
              sx={{ minHeight: 32, mr: 0.25, px: 1.1, borderRadius: 99, bgcolor: "#e6f4ef", color: "#1f6b50", fontWeight: 750, textTransform: "none", whiteSpace: "nowrap" }}
            >
              {selectedOperator.displayName}'s workspace
            </Button>}
            <Button
              onClick={signOut}
              size="small"
              color="inherit"
              sx={{ minHeight: 36 }}
            >
              Sign out
            </Button>
          </Box>
        </Toolbar>
      </AppBar>
      <Outlet />
      <DispatcherWorkspacePicker />
    </Box>
  );
}

function NavButton({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      style={({ isActive }) => ({
        flex: "1 1 auto",
        textDecoration: "none",
        textAlign: "center",
        borderRadius: 999,
        padding: "8px 12px",
        fontSize: 13,
        fontWeight: 700,
        color: isActive ? "#fff" : "#5e6a69",
        background: isActive ? "#003766" : "transparent",
      })}
    >
      {label}
    </NavLink>
  );
}
