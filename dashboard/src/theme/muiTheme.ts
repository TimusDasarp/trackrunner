import { createTheme } from "@mui/material/styles";

export const muiTheme = createTheme({
  palette: {
    primary: { main: "#003766", dark: "#0f2734", light: "#e8f0f6", contrastText: "#fff" },
    secondary: { main: "#ff7f5a", dark: "#db674b", contrastText: "#102038" },
    background: { default: "#faf5f1", paper: "#fff" },
    text: { primary: "#102038", secondary: "#5e6a69" },
    divider: "#e5e1dc",
    success: { main: "#1f7a5a" },
    warning: { main: "#9a5a14" },
    error: { main: "#b8432b" },
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    h5: { fontWeight: 750, letterSpacing: "-0.02em" },
    button: { fontWeight: 700, textTransform: "none" },
  },
  components: {
    MuiButton: { styleOverrides: { root: { borderRadius: 999, minHeight: 36 } } },
    MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
  },
});
