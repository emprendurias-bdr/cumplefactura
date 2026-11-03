/**
 * Ajustes › Fiscalidad: territorio y régimen por defecto de las facturas nuevas, entorno de envío
 * a la AEAT (pruebas o producción; producción está bloqueada por el sidecar en v1) y entorno del
 * QR tributario del PDF (F3, `qr_environment`). `FiscalFields` se reutiliza en FirstRun.
 */
import { envLabel, t } from "../../i18n/es";
import { VERIFACTU_ENDPOINTS } from "../../types";
import { Button } from "../../ui/Button";
import { Callout } from "../../ui/Callout";
import { Card } from "../../ui/Card";
import { Checkbox, Field, Select } from "../../ui/Field";
import type { Model } from "../../useCumpleFactura";
import type { Ctx } from "../ctx";

const FLAGS = ["CommonTerritory", "VeriFactu", "Sii"] as const;

export function FiscalFields({ m }: { m: Model }) {
  return (
    <fieldset className="cf-fieldset cf-wide">
      <legend className="bdr-label">{t("fiscal.territorio")}</legend>
      {FLAGS.map((flag) => (
        <Checkbox key={flag} label={t(`fiscal.flag.${flag}`)} checked={m.defaultTerritoryFlags.includes(flag)} onChange={(e) => m.toggleTerritoryFlag(flag, e.target.checked)} />
      ))}
    </fieldset>
  );
}

export function AjustesFiscalidad({ m }: Ctx) {
  return (
    <Card>
      <form className="cf-form-grid" onSubmit={(e) => { e.preventDefault(); void m.saveSettings(); }}>
        <FiscalFields m={m} />
        <Field label={t("fiscal.entorno")} help={t("fiscal.entornoAyuda")}>
          <Select value={m.endpointName} onChange={(e) => m.setEndpointName(e.target.value)}>
            {VERIFACTU_ENDPOINTS.map((id) => (
              <option key={id} value={id}>{envLabel(id)}</option>
            ))}
          </Select>
        </Field>
        <Field label={t("fiscal.qr")} help={t("fiscal.qrAyuda")}>
          <Select value={m.qrEnvironment} onChange={(e) => m.setQrEnvironment(e.target.value === "production" ? "production" : "test")}>
            <option value="test">{t("fiscal.qrPruebas")}</option>
            <option value="production">{t("fiscal.qrProduccion")}</option>
          </Select>
        </Field>
        {m.qrEnvironment === "production" ? (
          <div className="cf-wide">
            <Callout tone="warn" title={t("fiscal.qrProduccionTitulo")}>{t("fiscal.qrProduccionAviso")}</Callout>
          </div>
        ) : null}
        <div className="cf-row cf-end cf-wide">
          <Button type="submit" variant="primary">{t("ajustes.guardar")}</Button>
        </div>
      </form>
    </Card>
  );
}
