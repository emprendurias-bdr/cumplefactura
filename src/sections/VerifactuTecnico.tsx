/**
 * «Herramientas técnicas» de Verifactu, plegadas en un <details>: referencia del certificado en
 * el vault, entorno (id del puerto SOAP), rutas y huellas de los XML, detalle de la comprobación
 * previa, incidencias y última huella de la cadena, auditoría exportable y límites del sidecar.
 * Nada de esto aparece fuera de este bloque (regla de estados honestos).
 */
import { t } from "../i18n/es";
import { ActivityLog } from "../ui/ActivityLog";
import { Button } from "../ui/Button";
import { Field, Input } from "../ui/Field";
import type { Ctx } from "./ctx";

export function VerifactuTecnico({ m, vf }: Ctx) {
  const pre = vf.submitPreflight;
  const chain = m.fiscalChain;
  return (
    <details className="cf-tech bdr-card">
      <summary className="bdr-h2">{t("tecnico.titulo")}</summary>
      <div className="cf-stack">
        <p className="bdr-small">{t("tecnico.limiteSidecar")}</p>
        <p className="bdr-small">{t("tecnico.limitePreflight")}</p>
        <div className="cf-form-grid">
          <Field label={t("tecnico.certificadoVault")} help={t("tecnico.certificadoAyuda")}>
            <Input mono value={vf.certificateRef} onChange={(e) => vf.setCertificateRef(e.target.value)} />
          </Field>
          <Field label={t("tecnico.endpoint")}>
            <Input mono value={m.endpointName} readOnly />
          </Field>
          <Field label={t("tecnico.rutaXml")}>
            <span className="cf-row">
              <Input mono value={m.paths.xml} readOnly aria-label={t("tecnico.rutaXml")} />
              <Button size="sm" icon="folderOpen" onClick={() => void m.pickSavePath(t("tecnico.rutaXml"), "xml", ["xml"])}>{t("comun.elegir")}</Button>
            </span>
          </Field>
          <Field label={t("tecnico.rutaAnulacion")}>
            <span className="cf-row">
              <Input mono value={m.paths.cancelXml} readOnly aria-label={t("tecnico.rutaAnulacion")} />
              <Button size="sm" icon="folderOpen" onClick={() => void m.pickSavePath(t("tecnico.rutaAnulacion"), "cancelXml", ["xml"])}>{t("comun.elegir")}</Button>
            </span>
          </Field>
        </div>
        <dl className="cf-dl cf-dl--mono">
          <dt>{t("tecnico.xmlExportado")}</dt>
          <dd>{vf.xmlResult ? `${vf.xmlResult.status} · XSD ${vf.xmlResult.xsd_validated ? "OK" : "NO"} · ${vf.xmlResult.target_path}` : "—"}</dd>
          <dt>{t("tecnico.xmlAnulacion")}</dt>
          <dd>{vf.cancelXmlResult ? `${vf.cancelXmlResult.status} · ${vf.cancelXmlResult.target_path}` : "—"}</dd>
          <dt>{t("tecnico.paquete")}</dt>
          <dd>{vf.submission ? `export ${vf.submission.export_id} · sha256 ${vf.submission.xml_sha256}` : "—"}</dd>
          <dt>{t("tecnico.comprobacion")}</dt>
          <dd>
            {pre
              ? `${pre.status} · ${pre.endpoint_name} · certificado ${pre.certificate_loaded ? "cargado" : "no cargado"} (${pre.certificate_source ?? "—"}) · AEAT habilitada ${pre.aeat_calls_enabled ? "sí" : "no"} · producción ${pre.production_enabled ? "sí" : "no"} · llamada externa ${pre.external_call_performed ? "sí" : "no"} · bloqueos: ${pre.blockers.join(", ") || "ninguno"}`
              : "—"}
          </dd>
          <dt>{t("tecnico.respuesta")}</dt>
          <dd>{vf.submitResult ? `${vf.submitResult.status} · HTTP ${vf.submitResult.http_status ?? "—"} · ${vf.submitResult.estado_envio ?? "—"}/${vf.submitResult.estado_registro ?? "—"} · ${vf.submitResult.codigo_error ?? ""} ${vf.submitResult.soap_fault ?? ""}` : "—"}</dd>
          <dt>{t("tecnico.cadena")}</dt>
          <dd>{chain ? `${chain.total_records} registros · ${chain.issue_count} incidencias · ${chain.last_hash_by_company.map((h) => h.last_hash).join(", ") || "—"}` : "—"}</dd>
        </dl>
        {chain?.issues.length ? (
          <ul className="bdr-small">
            {chain.issues.map((issue) => (
              <li key={`${issue.record_id}-${issue.code}`}>
                <span className="m">{issue.severity}/{issue.code}</span> · {issue.message}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="cf-row">
          <Button icon="download" onClick={() => void m.exportFiscalAudit()} disabled={m.audit.length === 0 && m.fiscalRecords.length === 0}>
            {t("tecnico.exportarAuditoria")}
          </Button>
          <span className="m bdr-small">{m.auditExportResult ? m.auditExportResult.target_path : m.paths.audit}</span>
        </div>
        <h3 className="bdr-h2">{t("tecnico.auditoria")}</h3>
        <ActivityLog
          label={t("tecnico.auditoria")}
          items={m.audit.map((item) => ({ id: item.id, when: item.occurred_at, what: item.action, who: item.actor, type: item.action }))}
        />
        <div className="cf-row">
          <Button size="sm" variant="ghost" disabled={m.pages.audit === 0} onClick={() => void m.changePage("audit", m.pages.audit - 1)}>{t("comun.anterior")}</Button>
          <span className="m bdr-small">{t("comun.pagina", { n: m.pages.audit + 1 })}</span>
          <Button size="sm" variant="ghost" disabled={m.audit.length < 25} onClick={() => void m.changePage("audit", m.pages.audit + 1)}>{t("comun.siguiente")}</Button>
        </div>
      </div>
    </details>
  );
}
