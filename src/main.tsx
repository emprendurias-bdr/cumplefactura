/**
 * Bootstrap React de CumpleFactura (Vite + Tauri webview).
 * Monta <App /> en #root con StrictMode; estilos globales en styles.css.
 * No hay router: toda la UI vive en App.tsx e invoca comandos Rust vía Tauri.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
