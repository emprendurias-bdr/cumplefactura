/**
 * Barra superior (design.md §5.1), 52 px en --surface: BDR. · icono + CumpleFactura ·
 * ContextSelect Empresa · Serie · buscador Ctrl K (abre la paleta) · chip de cadena · ⚙ · avatar.
 * Sin campana de avisos. El avatar es la inicial de la empresa activa; sin Cuenta BDR en
 * escritorio, «Cambiar de app» se ve deshabilitado con su motivo (§7.14).
 */
import { Icon } from "../components/Icon";
import { t } from "../i18n/es";
import { AppearancePanel } from "../ui/AppearancePanel";
import { ContextSelect } from "../ui/ContextSelect";
import type { Model } from "../useCumpleFactura";
import { ChainChip } from "./ChainChip";

export function TopBar({ m, onSearch }: { m: Model; onSearch: () => void }) {
  const initial = m.company?.legal_name.trim()[0]?.toUpperCase();
  return (
    <header className="bdr-top">
      <a className="bdr-brand" href="#/facturas" aria-label={t("app.inicio")}>
        BDR<span>.</span>
      </a>
      <span className="bdr-sep" />
      <span className="bdr-appicon" aria-hidden="true">
        <Icon name="receipt" size={15} />
      </span>
      <span className="bdr-appname">CumpleFactura</span>
      <ContextSelect
        label={t("contexto.empresa")}
        value={m.company?.id ?? ""}
        empty={t("contexto.sinEmpresa")}
        options={m.companies.map((item) => ({ value: item.id, label: item.legal_name }))}
        onChange={m.selectCompany}
      />
      <ContextSelect
        label={t("contexto.serie")}
        value={m.selectedSeries?.id ?? ""}
        empty={t("contexto.sinSerie")}
        options={m.seriesConfigs.map((item) => ({ value: item.id, label: item.resolved_series }))}
        onChange={(id) => void m.selectInvoiceSeries(id)}
      />
      <button type="button" className="bdr-search cf-searchbtn" onClick={onSearch} aria-keyshortcuts="Control+K">
        <Icon name="search" />
        <span className="cf-searchbtn__text">{t("buscar.placeholder")}</span>
        <span className="bdr-kbd">Ctrl K</span>
      </button>
      <span className="bdr-spacer" />
      <ChainChip chain={m.fiscalChain} />
      <AppearancePanel />
      <details className="cf-menu cf-avatar">
        <summary className="bdr-avatar" aria-label={t("avatar.menu")} title={m.company?.legal_name}>
          {initial ?? <Icon name="user" />}
        </summary>
        <div className="cf-menu__list" role="menu">
          <div className="cf-menu__info">
            <strong>{m.company?.legal_name ?? t("contexto.sinEmpresa")}</strong>
            <span className="m bdr-muted">{m.company?.tax_id}</span>
          </div>
          <button type="button" role="menuitem" className="cf-menu__item" disabled>
            {t("avatar.cambiarApp")}
          </button>
          <span className="cf-reason cf-menu__reason">{t("avatar.sinCuenta")}</span>
        </div>
      </details>
    </header>
  );
}
