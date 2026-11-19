/**
 * Shell (design.md §5.1): salto al contenido · TopBar · SideNav · <main> de hasta 1440 px · Toaster.
 * Atajos de teclado (design.md §9, apps de trabajo): Ctrl K paleta · N nueva factura · / buscar
 * facturas · Ctrl+Enter emitir (lo recoge el editor con el evento `cf:emitir`) · Esc cierra
 * diálogos (nativo). N y / no se disparan mientras se escribe en un campo.
 */
import { type ReactNode, useEffect, useState } from "react";
import { t } from "../i18n/es";
import { invoiceNumber } from "../lib/numberProposal";
import { href, type Route } from "../lib/routes";
import { Toaster } from "../ui/Toast";
import type { Model } from "../useCumpleFactura";
import { type Command, CommandPalette } from "./CommandPalette";
import { SideNav } from "./SideNav";
import { TopBar } from "./TopBar";

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

export const SEARCH_ID = "cf-buscar-facturas";

function focusSearch() {
  location.hash = "#/facturas";
  setTimeout(() => document.getElementById(SEARCH_ID)?.focus(), 0);
}

export function Shell({ m, route, children }: { m: Model; route: Route; children: ReactNode }) {
  const [palette, setPalette] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPalette(true);
      } else if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        dispatchEvent(new Event("cf:emitir"));
      } else if (!event.ctrlKey && !event.metaKey && !event.altKey && !typing(event.target) && !document.querySelector("dialog[open]")) {
        if (event.key === "n" || event.key === "N") {
          event.preventDefault();
          location.hash = "#/facturas/nueva";
        } else if (event.key === "/") {
          event.preventDefault();
          focusSearch();
        }
      }
    }
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    document.getElementById("contenido")?.scrollTo?.(0, 0);
    scrollTo(0, 0);
  }, [route.section, route.tab, route.id]);

  const customerName = (id: string) => m.customers.find((item) => item.id === id)?.display_name ?? "";
  const commands: Command[] = [
    { id: "nueva", label: t("acciones.nuevaFactura"), hint: "N", hash: "#/facturas/nueva" },
    { id: "nuevo-cliente", label: t("acciones.nuevoCliente"), hash: "#/clientes/nuevo" },
    { id: "nuevo-producto", label: t("acciones.nuevoProducto"), hash: "#/productos/nuevo" },
    { id: "nuevo-presupuesto", label: t("acciones.nuevoPresupuesto"), hash: "#/documentos/presupuestos/nuevo" },
    ...(["facturas", "documentos", "recurrentes", "clientes", "productos", "verifactu", "ajustes"] as const).map((section) => ({
      id: section,
      label: t(`nav.${section}`),
      hint: t("paleta.pantalla"),
      hash: href({ section }),
    })),
    ...(["series", "fiscalidad", "certificado", "copias", "avanzado"] as const).map((tab) => ({
      id: `ajustes-${tab}`,
      label: `${t("nav.ajustes")} › ${t(`ajustes.${tab}`)}`,
      hash: href({ section: "ajustes", tab }),
    })),
    ...m.invoices.map((item) => ({
      id: item.id,
      label: `${invoiceNumber(item) ?? t("estado.borrador")} · ${customerName(item.customer_id)}`,
      hint: t("paleta.factura"),
      hash: href({ section: "facturas", id: item.id }),
    })),
  ];

  return (
    <div className="bdr-app">
      <a className="cf-skip" href="#contenido">
        {t("app.saltar")}
      </a>
      <TopBar m={m} onSearch={() => setPalette(true)} />
      <div className="bdr-body">
        <SideNav active={route.section} />
        <main className="bdr-main" id="contenido" tabIndex={-1}>
          {children}
        </main>
      </div>
      <CommandPalette open={palette} commands={commands} onClose={() => setPalette(false)} />
      <Toaster />
    </div>
  );
}
