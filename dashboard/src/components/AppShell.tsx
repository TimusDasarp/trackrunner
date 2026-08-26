import { AppBar, Box, Button, IconButton, Popover, Toolbar, Typography } from "@mui/material";
import WorkOutlineIcon from "@mui/icons-material/WorkOutline";
import { useState } from "react";
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
  const [workspaceAnchor, setWorkspaceAnchor] = useState<HTMLElement | null>(null);
  const workspacePopoverOpen = Boolean(workspaceAnchor);
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
              flexGrow: { xs: 1, sm: 0 },
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
              justifyContent: "flex-end",
              gap: 0.25,
              minWidth: 0,
            }}
          >
            {/* workspace selector */}
            {selectedOperator && <>
              <Button
                onClick={openSelector}
                size="small"
                color="inherit"
                sx={{ display: { xs: "none", sm: "inline-flex" }, minHeight: 32, minWidth: 0, mr: 0, px: 1.1, borderRadius: 99, bgcolor: "#e6f4ef", color: "#1f6b50", fontWeight: 750, textTransform: "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
              >
                {selectedOperator.displayName}'s workspace
              </Button>
              <IconButton
                aria-label={`Open ${selectedOperator.displayName}'s workspace menu`}
                aria-describedby={workspacePopoverOpen ? "dispatcher-workspace-popover" : undefined}
                onClick={(event) => setWorkspaceAnchor(event.currentTarget)}
                size="small"
                sx={{ display: { xs: "inline-flex", sm: "none" }, width: 36, height: 36, bgcolor: "#e6f4ef", color: "#1f6b50", "&:hover": { bgcolor: "#d6eee4" } }}
              >
                <WorkOutlineIcon fontSize="small" />
              </IconButton>
              <Popover
                id="dispatcher-workspace-popover"
                open={workspacePopoverOpen}
                anchorEl={workspaceAnchor}
                onClose={() => setWorkspaceAnchor(null)}
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                transformOrigin={{ vertical: "top", horizontal: "right" }}
                PaperProps={{ sx: { mt: 1, width: 250, p: 1.5, borderRadius: 2.5 } }}
              >
                <Typography variant="caption" color="text.secondary" fontWeight={700}>CURRENT WORKSPACE</Typography>
                <Typography fontWeight={800} mt={0.4}>{selectedOperator.displayName}</Typography>
                <Typography variant="body2" color="text.secondary" mt={0.35}>New tasks are tagged to this dispatcher.</Typography>
                <Button
                  fullWidth
                  variant="outlined"
                  onClick={() => { setWorkspaceAnchor(null); openSelector(); }}
                  sx={{ mt: 1.5, textTransform: "none", fontWeight: 750 }}
                >
                  Switch workspace
                </Button>
              </Popover>
            </>}
            {/* sign out btn */}
            <Button
              onClick={signOut}
              size="small"
              color="inherit"
              sx={{ minHeight: 36, flexShrink: 0 }}
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
