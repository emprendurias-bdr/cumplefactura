/**
 * Raíz de CumpleFactura. Un hook por dominio (núcleo, Verifactu, documentos, recurrentes) y la ruta
 * por hash eligen la pantalla. Mientras no se ha completado el primer arranque se ve FirstRun a
 * pantalla completa; si los ajustes no cargan, una página de error con «Reintentar».
 * Sin transiciones de página (design.md §4.11).
 */
import { type ReactElement, useEffect } from "react";
import { t } from "./i18n/es";
import { applyPreferences, readPreferences, watchSystemAppearance } from "./lib/appearance";
import type { Section } from "./lib/routes";
import { AjustesSection } from "./sections/AjustesSection";
import { ClientesSection } from "./sections/ClientesSection";
import type { Ctx } from "./sections/ctx";
import { DocumentosSection } from "./sections/DocumentosSection";
import { FacturaDetalle } from "./sections/FacturaDetalle";
import { FacturaEditor } from "./sections/FacturaEditor";
import { FacturasSection } from "./sections/FacturasSection";
import { FirstRun } from "./sections/FirstRun";
import { ProductosSection } from "./sections/ProductosSection";
import { RecurrentesSection } from "./sections/RecurrentesSection";
import { RectificativaWizard } from "./sections/RectificativaWizard";
import { VerifactuSection } from "./sections/VerifactuSection";
import { Shell } from "./shell/Shell";
import { useRoute } from "./shell/useRoute";
import { Button } from "./ui/Button";
import { Callout } from "./ui/Callout";
import { Skeleton } from "./ui/Skeleton";
import { Toaster } from "./ui/Toast";
import { useCumpleFactura } from "./useCumpleFactura";
import { useDocuments } from "./useDocuments";
import { useRecurring } from "./useRecurring";
import { useVerifactu } from "./useVerifactu";

function facturas(c: Ctx) {
  if (c.route.id === "nueva" || (c.route.id && c.route.action === "editar")) return <FacturaEditor {...c} />;
  if (c.route.id && c.route.action === "rectificar") return <RectificativaWizard {...c} />;
  if (c.route.id) return <FacturaDetalle {...c} />;
  return <FacturasSection {...c} />;
}

const SCREENS: Record<Section, (c: Ctx) => ReactElement> = {
  facturas,
  documentos: DocumentosSection,
  recurrentes: RecurrentesSection,
  clientes: ClientesSection,
  productos: ProductosSection,
  verifactu: VerifactuSection,
  ajustes: AjustesSection,
};

export default function App() {
  const m = useCumpleFactura();
  const vf = useVerifactu(m);
  const docs = useDocuments(m);
  const rec = useRecurring(m);
  const route = useRoute();

  useEffect(() => {
    applyPreferences(readPreferences());
    return watchSystemAppearance();
  }, []);

  if (!m.appSettings) {
    return (
      <main className="bdr-main cf-boot" id="contenido">
        {m.loadError ? (
          <Callout tone="err" title={t("error.arranqueTitulo")} actions={<Button variant="dark" onClick={() => location.reload()}>{t("comun.reintentar")}</Button>}>
            {m.loadError}
          </Callout>
        ) : (
          <Skeleton rows={4} />
        )}
        <Toaster />
      </main>
    );
  }
  if (!m.appSettings.onboarding_completed) return <FirstRun m={m} />;

  const Screen = SCREENS[route.section];
  return (
    <Shell m={m} route={route}>
      <Screen m={m} vf={vf} docs={docs} rec={rec} route={route} />
    </Shell>
  );
}
