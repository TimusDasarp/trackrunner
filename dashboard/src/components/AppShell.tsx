import { AppBar, Box, Button, Toolbar, Typography } from "@mui/material";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { clearSession } from "../lib/auth";
import { disconnectSocket } from "../lib/socket";
import { useRunners } from "../hooks/useRunners";

export default function AppShell() {
  const nav = useNavigate();
  const { connected } = useRunners();
  function signOut() { clearSession(); disconnectSocket(); nav("/login", { replace: true }); }
  return <Box sx={{ minHeight: "100vh", bgcolor: "#f8f7ff", color: "#1b1b1f" }}>
    <AppBar position="sticky" elevation={0} sx={{ bgcolor: "rgba(255,255,255,.92)", color: "#1b1b1f", borderBottom: "1px solid #e3e1e9", backdropFilter: "blur(10px)" }}>
      <Toolbar sx={{ minHeight: { xs: 64, sm: 72 }, px: { xs: 2, md: 4 }, py: { xs: 1, sm: 0 }, gap: 1.25, flexWrap: "wrap" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mr: { md: 2 }, minWidth: 0 }}><Box sx={{ display: "grid", placeItems: "center", flexShrink: 0, width: 36, height: 36, borderRadius: 2, bgcolor: "#405f90", color: "white", fontWeight: 800 }}>↗</Box><Box sx={{ minWidth: 0 }}><Typography fontWeight={700} lineHeight={1.1}>TrackRunner</Typography><Typography variant="caption" sx={{ display: "inline-flex", alignItems: "center", mt: .35, px: .8, py: .15, borderRadius: 99, bgcolor: connected ? "#dcfce7" : "#fef3c7", color: connected ? "#166534" : "#92400e", fontWeight: 700 }}>Dispatcher workspace</Typography></Box></Box>
        <Box component="nav" sx={{ display: "flex", order: { xs: 3, sm: 2 }, width: { xs: "100%", sm: "auto" }, gap: .5 }}>
          <NavButton to="/dashboard" label="Dashboard" /><NavButton to="/runners" label="Runners" /><NavButton to="/analytics" label="Analytics" /><NavButton to="/shifts" label="Shifts" />
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", ml: { sm: "auto" }, order: { xs: 2, sm: 3 } }}><Button onClick={signOut} size="small" color="inherit" sx={{ minHeight: 36 }}>Sign out</Button></Box>
      </Toolbar>
    </AppBar>
    <Outlet />
  </Box>;
}

function NavButton({ to, label }: { to: string; label: string }) {
  return <NavLink to={to} style={({ isActive }) => ({ flex: "1 1 auto", textDecoration: "none", textAlign: "center", borderRadius: 999, padding: "8px 12px", fontSize: 13, fontWeight: 700, color: isActive ? "#fff" : "#56606f", background: isActive ? "#405f90" : "transparent" })}>{label}</NavLink>;
}
