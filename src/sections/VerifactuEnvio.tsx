/**
 * Envío de una factura a la AEAT (flujo real de PR #7): 1 Exportar XML → 2 Comprobación previa
 * (el sidecar revisa certificado y entorno, sin llamar a la AEAT) → 3 Enviar a la AEAT.
 * La contraseña del certificado se pide aquí en modo «Solo durante esta sesión» y vive en memoria.
 * Resultados en Callout: comprobación (lista o bloqueada con motivos traducidos) y respuesta de la
 * AEAT (aceptada con CSV, con errores, rechazada o «Sin confirmar» con Reintentar).
 * Si la AEAT pidió esperar, «Enviar» queda deshabilitado con los segundos que faltan.
 */
import { blockerText, envLabel, t } from "../i18n/es";
import { invoiceNumber } from "../lib/numberProposal";
import { Button } from "../ui/Button";
import { Callout } from "../ui/Callout";
import { Card } from "../ui/Card";
import { Field, Input } from "../ui/Field";
import type { Ctx } from "./ctx";

export function VerifactuEnvio({ m, vf }: Ctx) {
  const invoice = vf.selected;
  const issued = invoice?.status === "Issued";
  const pkgForThis = vf.submission && vf.submission.invoice_id === invoice?.id;
  const pre = pkgForThis ? vf.submitPreflight : null;
  const sent = pkgForThis ? vf.submitResult : null;
  const sendReason = !pkgForThis
    ? t("envio.motivoXml")
    : pre?.status !== "ready"
      ? t("envio.motivoComprobacion")
      : vf.waitLeft > 0
        ? t("envio.motivoEspera", { s: vf.waitLeft })
        : null;

  return (
    <Card title={t("envio.titulo")} label={t("envio.titulo")}>
      <ol className="cf-flow">
        <li>
          <span className="bdr-label">1</span>
          <Button onClick={() => invoice && void vf.exportXml(invoice.id)} disabled={!issued} reason={issued ? null : t("envio.motivoEmitida")}>
            {t("envio.exportarXml")}
          </Button>
          <span className="bdr-small bdr-muted">
            {pkgForThis && vf.xmlResult?.xsd_validated ? t("envio.xmlListo") : t("envio.xmlAyuda")}
          </span>
        </li>
        <li>
          <span className="bdr-label">2</span>
          <div className="cf-stack-sm">
            {vf.needsPassword ? (
              <Field label={t("envio.password")} help={t("envio.passwordAyuda")}>
                <Input
                  type="password"
                  autoComplete="off"
                  value={vf.certificatePassword}
                  onChange={(e) => vf.setCertificatePassword(e.target.value)}
                />
              </Field>
            ) : null}
            <div className="cf-row">
              <Button onClick={() => void vf.preflightSubmit()} disabled={!vf.canPreflight || !pkgForThis} reason={!pkgForThis ? t("envio.motivoXml") : vf.canPreflight ? null : t("envio.motivoPassword")}>
                {t("envio.comprobar")}
              </Button>
              {vf.certificatePassword ? (
                <Button variant="ghost" size="sm" onClick={() => vf.setCertificatePassword("")}>{t("envio.olvidar")}</Button>
              ) : null}
            </div>
          </div>
        </li>
        <li>
          <span className="bdr-label">3</span>
          <Button variant="primary" icon="send" onClick={() => void vf.submitToAeat()} disabled={!vf.canSubmit || !pkgForThis} reason={sendReason}>
            {t("envio.enviar")}
          </Button>
        </li>
      </ol>

      {pre ? (
        pre.status === "ready" ? (
          <Callout tone="ok" live title={t("envio.listoTitulo")}>
            {t("envio.listo", { entorno: envLabel(pre.endpoint_name) })}
            {pre.warnings.length ? <> {pre.warnings.map(blockerText).join(" ")}</> : null}
          </Callout>
        ) : (
          <Callout tone="err" live title={t("envio.bloqueadoTitulo")}>
            {pre.blockers.map(blockerText).join(" ")}
          </Callout>
        )
      ) : null}

      {sent ? <Respuesta status={sent.status} csv={sent.csv} detail={sent.descripcion_error} onRetry={() => vf.submission && void vf.retry({ fiscal_export_id: vf.submission.export_id, invoice_id: vf.submission.invoice_id })} n={invoice ? invoiceNumber(invoice) : null} /> : null}
      {!m.endpointName.includes("Pruebas") ? (
        <Callout tone="warn" title={t("envio.produccionTitulo")}>{t("envio.produccion")}</Callout>
      ) : null}
    </Card>
  );
}

function Respuesta({ status, csv, detail, onRetry, n }: { status: string; csv: string | null; detail: string | null; onRetry: () => void; n: string | null }) {
  if (status === "accepted") return <Callout tone="ok" live title={t("envio.aceptadaTitulo", { n: n ?? "" })}>{t("envio.csv")} <span className="m">{csv}</span></Callout>;
  if (status === "accepted_with_errors")
    return <Callout tone="warn" live title={t("envio.conErroresTitulo")}>{detail ?? ""} {t("envio.csv")} <span className="m">{csv}</span></Callout>;
  if (status === "rejected") return <Callout tone="err" live title={t("envio.rechazadaTitulo")}>{detail ?? t("envio.rechazada")}</Callout>;
  return (
    <Callout tone="warn" live title={t("envio.sinConfirmarTitulo")} actions={<Button variant="dark" onClick={onRetry}>{t("envio.reintentar")}</Button>}>
      {t("envio.sinConfirmar")}
    </Callout>
  );
}
