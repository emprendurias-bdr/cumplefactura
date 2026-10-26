import type { Density, Theme } from "@bdr/ui";
import {
  AppShell,
  AppearanceControls,
  CommandPalette,
  EmptyState,
} from "@bdr/ui";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CustomerCompanyForms } from "../features/customers/CustomerCompanyForms";
import { FirstRun } from "../features/onboarding/FirstRun";
import { RuntimeStatus } from "../features/verifactu/RuntimeStatus";
import { InvoiceLists } from "../features/invoices/InvoiceLists";
import { ProductCatalog } from "../features/products/ProductCatalog";
import { ExportsSettings } from "../features/settings/ExportsSettings";
import { SeriesSettings } from "../features/settings/SeriesSettings";
import { VerifactuScreen } from "../features/verifactu/VerifactuScreen";
import { SidecarChannels } from "../features/verifactu/SidecarChannels";
import { routeFromHash } from "./routes";
import { invoke } from "./tauri";
import type { Workspace } from "./useWorkspace";
const areas = [
  ["facturas", "Facturas"],
  ["presupuestos", "Presupuestos"],
  ["proformas", "Proformas"],
  ["albaranes", "Albaranes"],
  ["recurrentes", "Recurrentes"],
  ["clientes", "Clientes"],
  ["productos", "Productos"],
  ["verifactu", "Verifactu"],
  ["ajustes", "Ajustes"],
];
export function SuiteShell({
  state,
  children,
}: {
  state: Workspace;
  children: ReactNode;
}) {
  const preferenceEdited = useRef(false);
  const writes = useRef<Promise<unknown>>(Promise.resolve());
  const preferenceVersion = useRef(0);
  const [route, setRoute] = useState(routeFromHash(location.hash));
  const [theme, setTheme] = useState<Theme>("system");
  const [density, setDensity] = useState<Density>("comfortable");
  const [search, setSearch] = useState(false);
  const [prefStatus, setPrefStatus] = useState("");
  useEffect(() => {
    const update = () =>
      setRoute((previous) => routeFromHash(location.hash, previous));
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearch(true);
      }
    };
    window.addEventListener("hashchange", update);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("hashchange", update);
      window.removeEventListener("keydown", key);
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.density = density;
  }, [theme, density]);
  useEffect(() => {
    let cancelled = false;
    if (!("__TAURI_INTERNALS__" in window)) return;
    void invoke<{ theme: Theme; density: Density }>("ui_preferences_get")
      .then((p) => {
        if (!cancelled && !preferenceEdited.current) {
          setTheme(p.theme);
          setDensity(p.density);
        }
      })
      .catch(() => {
        if (!cancelled && !preferenceEdited.current)
          setPrefStatus("No se pudieron cargar las preferencias.");
      });
    return () => {
      cancelled = true;
    };
  }, []);
  async function appearance(nextTheme: Theme, nextDensity: Density) {
    preferenceEdited.current = true;
    const version = ++preferenceVersion.current;
    setTheme(nextTheme);
    setDensity(nextDensity);
    if (!("__TAURI_INTERNALS__" in window)) {
      setPrefStatus(
        "Preferencia temporal: la cuenta web aún no está conectada.",
      );
      return;
    }
    writes.current = writes.current
      .catch(() => {})
      .then(() =>
        invoke("ui_preferences_update", {
          input: { theme: nextTheme, density: nextDensity },
        }),
      );
    try {
      await writes.current;
      if (version === preferenceVersion.current)
        setPrefStatus("Preferencias guardadas en este equipo.");
    } catch {
      if (version === preferenceVersion.current)
        setPrefStatus("No se pudieron guardar las preferencias.");
    }
  }

  const view =
    route === "facturas" || route === "facturas/nueva" ? (
      children
    ) : route === "clientes" ? (
      <CustomerCompanyForms />
    ) : route === "productos" ? (
      <ProductCatalog />
    ) : route === "verifactu" ? (
      <VerifactuScreen />
    ) : route === "ajustes" ? (
      <>
        <h1>
          Ajusta tu <span className="bdr-highlight">espacio</span>
        </h1>
        <AppearanceControls
          theme={theme}
          density={density}
          onThemeChange={(v) => void appearance(v, density)}
          onDensityChange={(v) => void appearance(theme, v)}
        />
        <p role="status">{prefStatus}</p>
        <FirstRun />
        <details className="technical-details">
          <summary>Herramientas locales y exportaciones</summary>
          <RuntimeStatus />
          <ExportsSettings />
          <InvoiceLists />
        </details>
      </>
    ) : (
      <EmptyState
        title={
          areas.find((a) => a[0] === route)?.[1] || "Pantalla no encontrada"
        }
        description="Esta pantalla todavía no está disponible. Las funciones comerciales se incorporan en la fase 4."
      />
    );
  return (
    <AppShell
      product={{ name: "CumpleFactura", initials: "CF", color: "violeta" }}
      apps={[{ value: "CumpleFactura", label: "CumpleFactura" }]}
      onAppChange={() => {}}
      companies={
        state.companies.length
          ? state.companies.map((c) => ({ value: c.id, label: c.legal_name }))
          : [{ value: "", label: "Configura tu empresa" }]
      }
      company={state.company?.id || ""}
      onCompanyChange={state.selectCompany}
      periods={[
        {
          value: String(state.fiscalYear),
          label: `Ejercicio ${state.fiscalYear}`,
        },
      ]}
      period={String(state.fiscalYear)}
      onPeriodChange={() => {
        location.hash = "/ajustes";
      }}
      navigation={areas.map(([id, label]) => ({
        label,
        href: `#/${id}`,
        active: route.split("/")[0] === id,
      }))}
      onSearch={() => setSearch(true)}
    >
      <p className="runtime-notice">
        {"__TAURI_INTERNALS__" in window
          ? "Escritorio local · consulta el estado fiscal de cada registro."
          : "Navegador sin conexión al motor nativo. La emisión web se habilitará con su backend."}{" "}
        No hay una comprobación activa de conexión con la AEAT ni una cola de
        envío disponible todavía.
      </p>
      {route !== "facturas" && <p aria-live="polite">{state.status}</p>}
      {view}
      <CommandPalette
        open={search}
        onClose={() => setSearch(false)}
        commands={areas.map(([id, label]) => ({
          id,
          label,
          onSelect: () => {
            location.hash = "/" + id;
          },
        }))}
      />
    </AppShell>
  );
}
