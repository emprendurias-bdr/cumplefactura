/**
 * Ajustes con subpáginas por hash `#/ajustes/<x>` y pestañas: Empresa · Series · Fiscalidad ·
 * Certificado y carpeta · Copias · Avanzado. La apariencia vive en ⚙ y la densidad en la barra
 * lateral. Cada subpágina es un formulario con su propio «Guardar» (acción principal).
 */
import type { ReactElement } from "react";
import { t } from "../i18n/es";
import { href, SETTINGS_TABS, type SettingsTab } from "../lib/routes";
import { Hero } from "../ui/Hero";
import { AjustesAvanzado } from "./ajustes/AjustesAvanzado";
import { AjustesCertificado } from "./ajustes/AjustesCertificado";
import { AjustesCopias } from "./ajustes/AjustesCopias";
import { AjustesEmpresa } from "./ajustes/AjustesEmpresa";
import { AjustesFiscalidad } from "./ajustes/AjustesFiscalidad";
import { AjustesSeries } from "./ajustes/AjustesSeries";
import type { Ctx } from "./ctx";

const PAGES: Record<SettingsTab, (c: Ctx) => ReactElement> = {
  empresa: AjustesEmpresa,
  series: AjustesSeries,
  fiscalidad: AjustesFiscalidad,
  certificado: AjustesCertificado,
  copias: AjustesCopias,
  avanzado: AjustesAvanzado,
};

export function AjustesSection(c: Ctx) {
  const tab = (SETTINGS_TABS.find((item) => item === c.route.tab) ?? "empresa") as SettingsTab;
  const Page = PAGES[tab];
  return (
    <>
      <Hero plain label={t("nav.ajustes")} title={t(`ajustes.${tab}`)} support={t(`ajustes.${tab}Ayuda`)} />
      <nav className="cf-tabs" aria-label={t("ajustes.secciones")}>
        {SETTINGS_TABS.map((item) => (
          <a key={item} href={href({ section: "ajustes", tab: item })} aria-current={item === tab ? "page" : undefined}>
            {t(`ajustes.${item}`)}
          </a>
        ))}
      </nav>
      <Page {...c} />
    </>
  );
}
