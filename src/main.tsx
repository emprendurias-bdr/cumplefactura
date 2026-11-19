/**
 * Arranque React de CumpleFactura (Vite + webview Tauri). Estilos en orden de design.md:
 * tokens.css → bdr.css → motion.css (copiados tal cual de bdr-ui) → fuentes → app.css (solo var(--…)).
 */
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/bdr/tokens.css";
import "./styles/bdr/bdr.css";
import "./styles/bdr/motion.css";
import "./styles/fonts.css";
import "./styles/app.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
