import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider, theme } from "@material-tailwind/react";
import { ThemeProvider as MuiThemeProvider } from "@mui/material/styles";
import App from "./App";
import "./index.css";
import { muiTheme } from "./theme/muiTheme";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider value={theme}>
      <MuiThemeProvider theme={muiTheme}>
        <BrowserRouter><App /></BrowserRouter>
      </MuiThemeProvider>
    </ThemeProvider>
  </React.StrictMode>
);
