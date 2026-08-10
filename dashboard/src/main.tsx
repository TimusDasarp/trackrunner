import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider, theme } from "@material-tailwind/react";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider value={theme}>
      <BrowserRouter><App /></BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);
