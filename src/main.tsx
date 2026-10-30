/**
 * Bootstrap React de CumpleFactura (Vite + Tauri webview).
 * Monta <App /> en #root con StrictMode; estilos globales en styles.css.
 * No hay router: App.tsx gestiona estado y navegación; cada pantalla vive en sections/.
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
