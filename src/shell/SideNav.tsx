/**
 * Barra lateral (design.md §5.1): las 7 secciones de CumpleFactura con icono y texto; la activa en
 * --p-activo-bg / --p-activo-fg. Abajo, el ajuste propio de la app: densidad Cómoda · Compacta
 * (filas de 48 o 40 px), guardado en este equipo.
 */
import { useState } from "react";
import { Icon, type IconName } from "../components/Icon";
import { t, type Key } from "../i18n/es";
import { readPreferences, savePreference, type Densidad } from "../lib/appearance";
import { href, type Section } from "../lib/routes";

const ITEMS: { section: Section; icon: IconName; label: Key }[] = [
  { section: "facturas", icon: "fileText", label: "nav.facturas" },
  { section: "documentos", icon: "files", label: "nav.documentos" },
  { section: "recurrentes", icon: "repeat", label: "nav.recurrentes" },
  { section: "clientes", icon: "users", label: "nav.clientes" },
  { section: "productos", icon: "package", label: "nav.productos" },
  { section: "verifactu", icon: "shieldCheck", label: "nav.verifactu" },
  { section: "ajustes", icon: "settings", label: "nav.ajustes" },
];

export function SideNav({ active }: { active: Section }) {
  const [density, setDensity] = useState<Densidad>(() => readPreferences().densidad);
  const choose = (value: Densidad) => {
    savePreference("densidad", value);
    setDensity(value);
  };
  return (
    <nav className="bdr-side" aria-label={t("nav.secciones")}>
      {ITEMS.map((item) => (
        <a key={item.section} href={href({ section: item.section })} aria-current={item.section === active ? "page" : undefined}>
          <Icon name={item.icon} size={18} />
          <span>{t(item.label)}</span>
        </a>
      ))}
      <div className="cf-side__foot">
        <div className="bdr-label" id="cf-density">
          {t("densidad.titulo")}
        </div>
        <div className="bdr-seg" role="group" aria-labelledby="cf-density">
          {(["comoda", "compacta"] as const).map((value) => (
            <button key={value} type="button" aria-pressed={density === value} onClick={() => choose(value)}>
              {t(value === "comoda" ? "densidad.comoda" : "densidad.compacta")}
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}
