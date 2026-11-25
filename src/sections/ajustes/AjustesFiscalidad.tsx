/**
 * Ajustes › Fiscalidad: territorio y régimen por defecto de las facturas nuevas, envío a la AEAT
 * (S3: «Envío real» apagado por defecto, tipo de certificado y entorno) y entorno del QR tributario
 * del PDF (F3, `qr_environment`). `FiscalFields` se reutiliza en FirstRun.
 * El entorno se guarda al elegirlo: pruebas al momento; producción solo tras el ConfirmDialog.
 */
import { useState } from "react";
import { t } from "../../i18n/es";
import { VERIFACTU_ENDPOINTS } from "../../types";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
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
  const [askProduction, setAskProduction] = useState(false);
  return (
    <Card>
      <ConfirmDialog
        open={askProduction}
        title={t("fiscal.produccionTitulo")}
        consequences={[t("fiscal.produccionC1"), t("fiscal.produccionC2"), t("fiscal.produccionC3")]}
        irreversible={t("fiscal.produccionIrreversible")}
        verb={t("fiscal.produccionVerbo")}
        danger
        acknowledge
        onConfirm={async () => {
          await m.setSendingEnvironment("production");
          setAskProduction(false);
        }}
        onCancel={() => setAskProduction(false)}
      />
      <form className="cf-form-grid" onSubmit={(e) => { e.preventDefault(); void m.saveSettings(); }}>
        <FiscalFields m={m} />
        <div className="cf-wide">
          <Checkbox label={t("fiscal.envioReal")} checked={m.aeatSendingEnabled} onChange={(e) => m.setAeatSendingEnabled(e.target.checked)} />
          <p className="bdr-small bdr-muted">{t("fiscal.envioRealAyuda")}</p>
        </div>
        <Field label={t("fiscal.entorno")} help={t("fiscal.entornoAyuda")}>
          <Select
            value={m.sendingEnvironment}
            onChange={(e) => (e.target.value === "production" ? setAskProduction(true) : void m.setSendingEnvironment("test"))}
          >
            <option value="test">{t("fiscal.entornoPruebas")}</option>
            <option value="production">{t("fiscal.entornoProduccion")}</option>
          </Select>
        </Field>
        <Field label={t("fiscal.certificadoTipo")} help={t("fiscal.certificadoTipoAyuda")}>
          <Select value={m.endpointName} onChange={(e) => m.setEndpointName(e.target.value)}>
            {VERIFACTU_ENDPOINTS.map((id) => (
              <option key={id} value={id}>{t(`fiscal.cert.${id}`)}</option>
            ))}
          </Select>
        </Field>
        {m.sendingEnvironment === "production" ? (
          <div className="cf-wide">
            <Callout tone="warn" title={t("envio.produccionTitulo")}>{t("envio.produccion")}</Callout>
          </div>
        ) : null}
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
