/**
 * Fiscal: auditoría de la cadena, listados, XML VERI*FACTU y envío a la AEAT.
 *
 * Flujo de envío: Exportar XML (o anulación) → Preflight envío → Enviar.
 * Sin firma XAdES: en modo VERI*FACTU basta la huella (RD 1007/2023, art. 16.3) y la
 * AEAT autentica el certificado en la conexión. Solo el sidecar local lo usa.
 */
import { PathForm } from "../components/forms";
import { Icon } from "../components/Icon";
import { DataList, Pager } from "../components/lists";
import { short } from "../lib/format";
import { PAGE_SIZE } from "../types";
import type { Model } from "../useCumpleFactura";

function blockers(list: string[]) {
  return list.join(", ") || "sin bloqueos";
}

export function FiscalSection(p: Model) {
  const chain = p.fiscalChain;
  const preflight = p.submitPreflight;
  const sent = p.submitResult;

  return (
    <>
      <section className="panel fiscalAuditScreen" aria-label="Auditoria fiscal local">
        <div className="editorTop">
          <div>
            <h2>Auditoria fiscal local</h2>
            <p>{chain?.valid ? `Cadena fiscal OK (${chain.total_records})` : `Incidencias cadena ${chain?.issue_count ?? 0}`}</p>
          </div>
          <button type="button" className="linkButton" onClick={() => void p.verifyFiscalChain()}>
            <Icon name="refresh" />
            Verificar cadena
          </button>
        </div>
        <div className="auditSummary" aria-label="Resumen auditoria fiscal">
          <div>
            <strong>Estado cadena</strong>
            <span>{chain?.valid ? "OK" : "Revisar"}</span>
          </div>
          <div>
            <strong>Registros fiscales verificados</strong>
            <span>{chain?.total_records ?? 0}</span>
          </div>
          <div>
            <strong>Incidencias cadena</strong>
            <span>{chain?.issue_count ?? 0}</span>
          </div>
          <div>
            <strong>Empresas con hash final</strong>
            <span>{chain?.last_hash_by_company.length ?? 0}</span>
          </div>
        </div>
        <div className="auditColumns">
          <div>
            <h3>Incidencias cadena</h3>
            {chain && chain.issues.length > 0 ? (
              <ul className="auditList">
                {chain.issues.map((issue) => (
                  <li key={`${issue.record_id}-${issue.code}`}>
                    <strong>
                      {issue.severity} / {issue.code}
                    </strong>
                    <span>
                      {short(issue.record_id)} - {issue.message}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>Sin incidencias cadena.</p>
            )}
          </div>
          <div>
            <h3>Ultimo hash por empresa</h3>
            {chain && chain.last_hash_by_company.length > 0 ? (
              <ul className="auditList">
                {chain.last_hash_by_company.map((head) => (
                  <li key={head.company_id}>
                    <strong>{short(head.company_id)}</strong>
                    <span>{short(head.last_hash)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>Sin hash final todavia.</p>
            )}
          </div>
        </div>
        <PathForm
          p={p}
          pathKey="audit"
          title="Informe auditoria fiscal"
          extensions={["json"]}
          aria="Ruta informe auditoria fiscal"
          pickLabel="Elegir auditoria"
          submitLabel="Exportar auditoria"
          onSubmit={p.exportFiscalAudit}
          disabled={p.audit.length === 0 && p.fiscalRecords.length === 0}
          result={
            p.auditExportResult
              ? `${p.auditExportResult.status} - ${p.auditExportResult.target_path}`
              : "Informe JSON de trazabilidad local, no certificacion."
          }
        />
      </section>

      <section className="panel lists">
        <DataList
          title="Auditoria"
          empty="Sin eventos"
          rows={p.audit.map((item) => `${item.action} - ${item.actor} - ${short(item.hash)}`)}
          footer={
            <Pager
              regionLabel="Pagina auditoria"
              prevLabel="Anterior auditoria"
              nextLabel="Siguiente auditoria"
              page={p.pages.audit}
              hasNext={p.audit.length === PAGE_SIZE}
              onPrev={() => void p.changePage("audit", p.pages.audit - 1)}
              onNext={() => void p.changePage("audit", p.pages.audit + 1)}
            />
          }
        />
        <DataList
          title="Fiscal"
          empty="Sin registros"
          rows={p.fiscalRecords.map(
            (item) => `${item.record_type} - ${short(item.fiscal_hash)} - prev ${short(item.previous_fiscal_hash)} - ${item.status}`,
          )}
          footer={
            <Pager
              regionLabel="Pagina fiscal"
              prevLabel="Anterior fiscal"
              nextLabel="Siguiente fiscal"
              page={p.pages.fiscal}
              hasNext={p.fiscalRecords.length === PAGE_SIZE}
              onPrev={() => void p.changePage("fiscal", p.pages.fiscal - 1)}
              onNext={() => void p.changePage("fiscal", p.pages.fiscal + 1)}
            />
          }
        />
      </section>

      <section className="panel split">
        <div>
          <h2>XML VERI*FACTU</h2>
          <PathForm
            p={p}
            pathKey="xml"
            title="XML VERIFACTU"
            extensions={["xml"]}
            aria="Ruta XML VERIFACTU"
            pickLabel="Elegir XML"
            submitLabel="Exportar XML"
            onSubmit={p.exportXml}
            disabled={!p.canExportXml}
            result={
              p.xmlResult
                ? `${p.xmlResult.status} - XSD ${p.xmlResult.xsd_validated ? "OK" : "NO"} - ${p.xmlResult.target_path}`
                : "Borrador tecnico: XSD local, sin envio."
            }
          />
          <h2>XML anulacion</h2>
          <PathForm
            p={p}
            pathKey="cancelXml"
            title="XML anulacion"
            extensions={["xml"]}
            aria="Ruta XML anulacion"
            pickLabel="Elegir anulacion"
            submitLabel="Exportar anulacion"
            onSubmit={p.exportCancelXml}
            disabled={!p.canExportXml}
            result={
              p.cancelXmlResult
                ? `${p.cancelXmlResult.status} - XSD ${p.cancelXmlResult.xsd_validated ? "OK" : "NO"} - ${p.cancelXmlResult.target_path}`
                : "Borrador de anulacion: valida XSD y registra estado fiscal."
            }
          />

          <h2>Envio VERI*FACTU</h2>
          <p>
            {p.submission
              ? `XML ${short(p.submission.xml_sha256)} - export ${short(p.submission.export_id)} - ${p.endpointName}`
              : "Exporta el XML para preparar el envio."}
          </p>
          <form className="backupForm" onSubmit={p.preflightSubmit}>
            <input aria-label="Certificado vault" value={p.certificateRef} onChange={(event) => p.setCertificateRef(event.target.value)} />
            <button className="primary" disabled={!p.submission}>
              Preflight envio
            </button>
          </form>
          <p>
            {preflight
              ? `${preflight.status} - ${preflight.endpoint_name} - certificado ${preflight.certificate_loaded ? "OK" : "NO"} - AEAT ${preflight.external_call_performed ? "SI" : "NO"} - ${blockers(preflight.blockers)}`
              : "Preflight: sidecar local, sin llamada AEAT real ni CSV."}
          </p>
          <form className="backupForm" onSubmit={p.submitToAeat}>
            <input aria-label="Entorno de envio" value={p.endpointName} readOnly />
            <button className="primary" disabled={!p.submission || p.submitPreflight?.status !== "ready"}>
              Enviar
            </button>
          </form>
          <p>
            {sent
              ? `${sent.status} - ${sent.endpoint_name} - AEAT ${sent.external_call_performed ? "SI" : "NO"} - CSV ${sent.csv ?? "sin CSV"}${sent.codigo_error ? ` - error ${sent.codigo_error}` : ""}`
              : "Frontera final: solo el sidecar local con HMAC y certificado puede invocar AEAT; el gate no llama a AEAT."}
          </p>
        </div>
        <div className="statusBox">
          <Icon name="fileCode" size={24} />
          <strong>SQLite local</strong>
          <span>{chain?.valid ? `Cadena fiscal OK (${chain.total_records})` : "Runtime, PDF, backup y XML cableados."}</span>
        </div>
      </section>
    </>
  );
}
