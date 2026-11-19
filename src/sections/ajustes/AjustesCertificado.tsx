/**
 * Ajustes › Certificado y carpeta (ADR-002, F3). La persona elige dónde se guarda la contraseña del
 * certificado: «Solo durante esta sesión» (recomendada y por defecto: solo en la memoria de la app)
 * o «Recordar en este equipo» (visible pero deshabilitada: «Pendiente de aprobar»). El modo de
 * variable de entorno no se ofrece aquí: solo para pruebas y homologación.
 * Caducidad: la del último resultado de la comprobación previa; nunca se inventa.
 * Rutas y referencia del vault, solo en «Herramientas técnicas».
 */
import { t } from "../../i18n/es";
import { isoDate } from "../../lib/invoiceDate";
import { Button } from "../../ui/Button";
import { Callout } from "../../ui/Callout";
import { Card } from "../../ui/Card";
import { Field, Input } from "../../ui/Field";
import { expiryStatus } from "../../ui/status";
import { StatusChip } from "../../ui/StatusChip";
import type { Model } from "../../useCumpleFactura";
import type { Ctx } from "../ctx";

const folderName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? "";

export function CertificadoFields({ m }: { m: Model }) {
  return (
    <>
      <fieldset className="cf-fieldset cf-wide" aria-describedby="cf-pass-help">
        <legend className="bdr-label">{t("cert.donde")}</legend>
        <label className="cf-radio">
          <input type="radio" name="cf-pass" checked={m.passwordMode !== "keychain"} onChange={() => m.setPasswordMode("session")} />
          <span>
            <span className="cf-row">
              <strong>{t("cert.sesion")}</strong>
              <span className="bdr-chip bdr-chip--ok">{t("cert.recomendada")}</span>
            </span>
            <span className="bdr-help" id="cf-pass-help">{t("cert.sesionAyuda")}</span>
          </span>
        </label>
        <label className="cf-radio is-disabled">
          <input type="radio" name="cf-pass" disabled checked={m.passwordMode === "keychain"} onChange={() => undefined} />
          <span>
            <span className="cf-row">
              <strong>{t("cert.equipo")}</strong>
              <span className="cf-reason">· {t("cert.pendiente")}</span>
            </span>
            <span className="bdr-help">{t("cert.equipoAyuda")}</span>
          </span>
        </label>
        {m.passwordMode === "env" ? <Callout tone="info" title={t("cert.envTitulo")}>{t("cert.env")}</Callout> : null}
      </fieldset>
      {/* <div> y no <label>: un botón dentro de una etiqueta toma su texto como nombre. */}
      <div className="bdr-field">
        <span>{t("cert.carpeta")}</span>
        <span className="cf-row">
          <span className="bdr-chip bdr-chip--neu m">{folderName(m.exportDir) || t("cert.sinCarpeta")}</span>
          <Button size="sm" icon="folderOpen" onClick={() => void m.pickExportDirectory()}>{t("cert.elegirCarpeta")}</Button>
        </span>
        <span className="bdr-help">{t("cert.carpetaAyuda")}</span>
      </div>
    </>
  );
}

export function AjustesCertificado({ m, vf }: Ctx) {
  const pre = vf.submitPreflight;
  return (
    <>
      <Card>
        <form className="cf-form-grid" onSubmit={(e) => { e.preventDefault(); void m.saveSettings(); }}>
          <CertificadoFields m={m} />
          <div className="cf-row cf-end cf-wide">
            <Button type="submit" variant="primary">{t("ajustes.guardar")}</Button>
          </div>
        </form>
      </Card>
      <Card title={t("cert.estado")}>
        <div className="cf-row">
          {pre && pre.certificate_expires_in_days == null ? null : <StatusChip status={expiryStatus(pre?.certificate_expires_in_days)} detail={pre?.certificate_expires_at ? t("vf.hasta", { fecha: isoDate(pre.certificate_expires_at.slice(0, 10)) }) : undefined} />}
          {pre?.certificate_expires_in_days != null ? <span className="bdr-small">{t("cert.quedan", { n: pre.certificate_expires_in_days })}</span> : null}
        </div>
        <Callout tone="neu" title={t("cert.referenciaTitulo")}>{t("cert.referencia")}</Callout>
        <p className="bdr-small">{vf.certificatePassword ? t("cert.enMemoria") : t("cert.noEnMemoria")}</p>
        {vf.certificatePassword ? <Button variant="ghost" size="sm" onClick={() => vf.setCertificatePassword("")}>{t("envio.olvidar")}</Button> : null}
      </Card>
      <details className="cf-tech bdr-card">
        <summary className="bdr-h2">{t("tecnico.titulo")}</summary>
        <div className="cf-form-grid">
          <Field label={t("tecnico.certificadoVault")} help={t("tecnico.certificadoAyuda")}>
            <Input mono value={vf.certificateRef} onChange={(e) => vf.setCertificateRef(e.target.value)} />
          </Field>
          <Field label={t("tecnico.carpeta")}>
            <Input mono value={m.exportDir} readOnly />
          </Field>
          <Field label={t("tecnico.modo")}>
            <Input mono value={m.passwordMode} readOnly />
          </Field>
        </div>
      </details>
    </>
  );
}
