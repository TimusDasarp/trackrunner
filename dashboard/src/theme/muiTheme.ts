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
  shape: { borderRadius: 14 },
  typography: {
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    h5: { fontWeight: 750, letterSpacing: "-0.02em" },
    button: { fontWeight: 700, textTransform: "none" },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 10, minHeight: 40, fontWeight: 750 },
        contained: { boxShadow: "0 3px 10px rgb(0 55 102 / 0.18)", "&:hover": { boxShadow: "0 5px 14px rgb(0 55 102 / 0.24)", transform: "translateY(-1px)" } },
      },
    },
    MuiPaper: { styleOverrides: { root: { backgroundImage: "none", borderRadius: 14 } } },
    MuiChip: { styleOverrides: { root: { borderRadius: 8, fontWeight: 700 }, label: { paddingLeft: 8, paddingRight: 8 } } },
    MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 10, backgroundColor: "#fff", "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "#ff7f5a", borderWidth: 2 } } } },
  },
});
