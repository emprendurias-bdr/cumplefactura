// @ts-nocheck
import { FileCode2, FolderOpen, Plus, RefreshCw, Trash2 } from "lucide-react";
import { DataList, Pager } from "../components/lists";
import { cents, short } from "../lib/format";
import { PAGE_SIZE } from "../types";

export function FiscalSection(p: Record<string, any>) {
  return (
    <>
<section className="panel fiscalAuditScreen" aria-label="Auditoria fiscal local">
                <div className="editorTop">
                  <div>
                    <h2>Auditoria fiscal local</h2>
                    <p>{p.fiscalChain?.valid ? `Cadena fiscal OK (${p.fiscalChain.total_records})` : `Incidencias cadena ${p.fiscalChain?.issue_count ?? 0}`}</p>
                  </div>
                  <button type="button" className="linkButton" onClick={() => void p.verifyFiscalChain()}>
                    <RefreshCw size={16} aria-hidden="true" />
                    Verificar cadena
                  </button>
                </div>
                <div className="auditSummary" aria-label="Resumen auditoria fiscal">
                  <div>
                    <strong>Estado cadena</strong>
                    <span>{p.fiscalChain?.valid ? "OK" : "Revisar"}</span>
                  </div>
                  <div>
                    <strong>Registros fiscales verificados</strong>
                    <span>{p.fiscalChain?.total_records ?? 0}</span>
                  </div>
                  <div>
                    <strong>Incidencias cadena</strong>
                    <span>{p.fiscalChain?.issue_count ?? 0}</span>
                  </div>
                  <div>
                    <strong>Empresas con hash final</strong>
                    <span>{p.fiscalChain?.last_hash_by_company.length ?? 0}</span>
                  </div>
                </div>
                <div className="auditColumns">
                  <div>
                    <h3>Incidencias cadena</h3>
                    {p.fiscalChain && p.fiscalChain.issues.length > 0 ? (
                      <ul className="auditList">
                        {p.fiscalChain.issues.map((issue) => (
                          <li key={`${issue.record_id}-${issue.code}`}>
                            <strong>{issue.severity} / {issue.code}</strong>
                            <span>{p.short(issue.record_id)} - {issue.message}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>Sin incidencias cadena.</p>
                    )}
                  </div>
                  <div>
                    <h3>Ultimo hash por empresa</h3>
                    {p.fiscalChain && p.fiscalChain.last_hash_by_company.length > 0 ? (
                      <ul className="auditList">
                        {p.fiscalChain.last_hash_by_company.map((head) => (
                          <li key={head.company_id}>
                            <strong>{p.short(head.company_id)}</strong>
                            <span>{p.short(head.last_hash)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>Sin hash final todavia.</p>
                    )}
                  </div>
                </div>
                <form className="auditExportForm" onSubmit={p.exportFiscalAudit}>
                  <input aria-label="Ruta informe auditoria fiscal" value={p.auditExportPath} readOnly />
                  <button type="button" className="linkButton" onClick={() => void p.pickSavePath("Informe auditoria fiscal", p.auditExportPath, ["json"], p.setAuditExportPath)}>
                    <FolderOpen size={16} aria-hidden="true" />
                    Elegir auditoria
                  </button>
                  <button className="primary" disabled={p.audit.length === 0 && p.fiscalRecords.length === 0}>Exportar auditoria</button>
                </form>
                <p>{p.auditExportResult ? `${p.auditExportResult.status} - ${p.auditExportResult.target_path}` : "Informe JSON de trazabilidad local, no certificacion."}</p>
              </section>

              <section className="panel sidecarChannels" aria-label="Canales ContaPro sidecar">
                <div className="editorTop">
                  <div>
                    <h2>Canales ContaPro sidecar</h2>
                    <p>{p.sidecarCapabilities ? `${p.sidecarCapabilities.source_project} - MVP ${p.mvpSidecarChannels} - diferido ${p.deferredSidecarChannels}` : "Cargando evidencia importada."}</p>
                  </div>
                  <button type="button" className="linkButton" onClick={() => void p.loadDefaults()}>
                    <RefreshCw size={16} aria-hidden="true" />
                    Recargar sidecar
                  </button>
                </div>
                <div className="auditSummary" aria-label="Resumen canales sidecar">
                  {(p.sidecarCapabilities?.channels ?? []).map((channel) => (
                    <div key={channel.channel}>
                      <strong>{channel.channel.toUpperCase()}</strong>
                      <span>{channel.mvp_importable ? "MVP" : channel.status}</span>
                    </div>
                  ))}
                </div>
                <p>Importado de ContaPro para MVP: {p.mvpSidecarChannels}. FACe y TicketBAI quedan diferidos. CumpleFactura no llama a AEAT/SII/FACe/forales durante la importacion.</p>
                <div className="sidecarForms">
                  <form className="backupForm" onSubmit={p.preflightSiiSidecar}>
                    <h3>SII sidecar</h3>
                    <input aria-label="Libro SII" value={p.siiBook} onChange={(event) => p.setSiiBook(event.target.value)} />
                    <input aria-label="Endpoint SII" value={p.siiEndpointName} onChange={(event) => p.setSiiEndpointName(event.target.value)} />
                    <input aria-label="URL sidecar SII" value={p.siiSidecarUrl} onChange={(event) => p.setSiiSidecarUrl(event.target.value)} />
                    <button className="primary" disabled={!p.siiChannel?.mvp_importable}>Preflight SII sidecar</button>
                  </form>
                  <p>{p.siiPreflight ? `${p.siiPreflight.status} - ${p.siiPreflight.sidecar_endpoint} - sidecar ${p.siiPreflight.sidecar_call_performed ? "SI" : "NO"} - AEAT ${p.siiPreflight.external_call_performed ? "SI" : "NO"} - ${p.siiPreflight.blockers.join(", ") || "sin bloqueos"}` : `MVP ${p.siiChannel?.mvp_importable ? "importable" : "no listo"} - acceptance ${p.siiChannel?.acceptance_status ?? "missing"}. Preflight local; sin SOAP AEAT.`}</p>
                  <form className="backupForm" onSubmit={p.preflightTicketBaiSidecar}>
                    <h3>TicketBAI sidecar</h3>
                    <select aria-label="Territorio TicketBAI" value={p.ticketbaiTerritorio} onChange={(event) => p.setTicketbaiTerritorio(event.target.value)}>
                      <option value="bizkaia">bizkaia</option>
                      <option value="gipuzkoa">gipuzkoa</option>
                      <option value="araba">araba</option>
                    </select>
                    <input aria-label="Endpoint TicketBAI" value={p.ticketbaiEndpoint} onChange={(event) => p.setTicketbaiEndpoint(event.target.value)} />
                    <input aria-label="URL sidecar TicketBAI" value={p.ticketbaiSidecarUrl} onChange={(event) => p.setTicketbaiSidecarUrl(event.target.value)} />
                    <button className="primary" disabled={!p.ticketbaiChannel?.mvp_importable}>Preflight TicketBAI sidecar</button>
                  </form>
                  <p>{p.ticketbaiPreflight ? `${p.ticketbaiPreflight.status} - ${p.ticketbaiPreflight.sidecar_endpoint} - sidecar ${p.ticketbaiPreflight.sidecar_call_performed ? "SI" : "NO"} - foral ${p.ticketbaiPreflight.external_call_performed ? "SI" : "NO"} - ${p.ticketbaiPreflight.blockers.join(", ") || "sin bloqueos"}` : `Diferido: ${p.ticketbaiChannel?.deferred_reason ?? "sin evidencia MVP aceptada"}; homologacion foral sigue bloqueada.`}</p>
                </div>
              </section>

<section className="panel lists">
<DataList
                  title="Auditoria"
                  empty="Sin eventos"
                  rows={p.audit.map((item) => `${item.action} - ${item.actor} - ${p.short(item.hash)}`)}
                  footer={<Pager regionLabel="Pagina auditoria" prevLabel="Anterior auditoria" nextLabel="Siguiente auditoria" page={p.auditPage} hasNext={p.audit.length === p.PAGE_SIZE} onPrev={() => void p.changeAuditPage(p.auditPage - 1)} onNext={() => void p.changeAuditPage(p.auditPage + 1)} />} />
                
<DataList
                  title="Fiscal"
                  empty="Sin registros"
                  rows={p.fiscalRecords.map((item) => `${item.record_type} - ${p.short(item.fiscal_hash)} - prev ${p.short(item.previous_fiscal_hash)} - ${item.status}`)}
                  footer={<Pager regionLabel="Pagina fiscal" prevLabel="Anterior fiscal" nextLabel="Siguiente fiscal" page={p.fiscalPage} hasNext={p.fiscalRecords.length === p.PAGE_SIZE} onPrev={() => void p.changeFiscalPage(p.fiscalPage - 1)} onNext={() => void p.changeFiscalPage(p.fiscalPage + 1)} />} />
              
</section>
<section className="panel split"><div>
<h2>XML VERI*FACTU</h2>
              <form className="backupForm pathForm" onSubmit={p.exportXml}>
                <input aria-label="Ruta XML VERIFACTU" value={p.xmlPath} readOnly />
                <button type="button" className="linkButton" onClick={() => void p.pickSavePath("XML VERIFACTU", p.xmlPath, ["xml"], p.setXmlPath)}>
                  <FolderOpen size={16} aria-hidden="true" />
                  Elegir XML
                </button>
                <button className="primary" disabled={!p.canExportXml}>Exportar XML</button>
              </form>
              <p>{p.xmlResult ? `${p.xmlResult.status} - XSD ${p.xmlResult.xsd_validated ? "OK" : "NO"} - ${p.xmlResult.target_path}` : "Borrador tecnico: XSD local, sin firma ni envio."}</p>
<h2>XML anulacion</h2>
              <form className="backupForm pathForm" onSubmit={p.exportCancelXml}>
                <input aria-label="Ruta XML anulacion" value={p.cancelXmlPath} readOnly />
                <button type="button" className="linkButton" onClick={() => void p.pickSavePath("XML anulacion", p.cancelXmlPath, ["xml"], p.setCancelXmlPath)}>
                  <FolderOpen size={16} aria-hidden="true" />
                  Elegir anulacion
                </button>
                <button className="primary" disabled={!p.canExportXml}>Exportar anulacion</button>
              </form>
              <p>{p.cancelXmlResult ? `${p.cancelXmlResult.status} - XSD ${p.cancelXmlResult.xsd_validated ? "OK" : "NO"} - ${p.cancelXmlResult.target_path}` : "Borrador de anulacion: valida XSD y registra estado fiscal."}</p>
<h2>Firma/envio</h2>
              <form className="backupForm" onSubmit={p.prepareSubmission}>
                <input value={p.submission?.xml_sha256 ?? "XML SHA256 pendiente"} readOnly />
                <button className="primary" disabled={!p.xmlResult && !p.cancelXmlResult}>Preparar</button>
              </form>
              <p>{p.submission ? `${p.submission.signature_status} - ${p.submission.transmission_status} - ${p.short(p.submission.xml_sha256)} - export ${p.short(p.submission.export_id)}` : "Prepara paquete local: XSD, SHA256 y estado pendiente de XAdES/envio."}</p>
              <h2>Preflight XAdES</h2>
              <form className="backupForm" onSubmit={p.preflightXadesSidecar}>
                <input value={p.xadesSidecarUrl} onChange={(event) => p.setXadesSidecarUrl(event.target.value)} />
                <input value={p.xadesCertRef} onChange={(event) => p.setXadesCertRef(event.target.value)} />
                <button className="primary" disabled={!p.submission}>Preflight XAdES</button>
              </form>
              <p>{p.xadesPreflight ? `${p.xadesPreflight.status} - ${p.xadesPreflight.sidecar_endpoint} - ref ${p.xadesPreflight.certificate_ref_status} - llamada externa ${p.xadesPreflight.external_call_performed ? "SI" : "NO"} - ${p.xadesPreflight.blockers.join(", ") || "sin bloqueos"}` : "Comprueba sidecar local, hash XML, vault ref y flag; no llama al sidecar."}</p>
              <form className="backupForm pathForm" onSubmit={p.signWithXadesSidecar}>
                <input aria-label="Ruta XML firmado" value={p.signedXmlPath} readOnly />
                <button type="button" className="linkButton" onClick={() => void p.pickSavePath("XML firmado", p.signedXmlPath, ["xml"], p.setSignedXmlPath)}>
                  <FolderOpen size={16} aria-hidden="true" />
                  Elegir firmado
                </button>
                <button className="primary" disabled={!p.submission || !p.xadesPreflight?.ready}>Firmar XAdES</button>
              </form>
              <p>{p.xadesSignature ? `${p.xadesSignature.signature_status} - ${p.xadesSignature.signature_mode} - sidecar ${p.xadesSignature.sidecar_call_performed ? "SI" : "NO"} - AEAT ${p.xadesSignature.external_call_performed ? "SI" : "NO"} - ${p.short(p.xadesSignature.xml_sha256)}` : "Llama al sidecar local con HMAC y exige XAdES real; no llama a AEAT."}</p>
              <h2>Preflight AEAT</h2>
              <form className="backupForm" onSubmit={p.preflightAeatTransport}>
                <input value={p.aeatEndpoint} onChange={(event) => p.setAeatEndpoint(event.target.value)} />
                <button className="primary" disabled={!p.submission}>Preflight AEAT</button>
              </form>
              <p>{p.transportPreflight ? `${p.transportPreflight.status} - ${p.transportPreflight.endpoint_name} - llamada externa ${p.transportPreflight.external_call_performed ? "SI" : "NO"} - ${p.transportPreflight.blockers.join(", ") || "sin bloqueos"}` : "Comprueba endpoint WSDL, hash, XAdES y flag; no llama a AEAT."}</p>
              <h2>Preflight envio sidecar</h2>
              <form className="backupForm" onSubmit={p.preflightSubmitSidecar}>
                <input value={p.submitSidecarUrl} onChange={(event) => p.setSubmitSidecarUrl(event.target.value)} />
                <input value={p.aeatEndpointName} onChange={(event) => p.setAeatEndpointName(event.target.value)} />
                <button className="primary" disabled={!p.submission || p.submission.signature_status !== "signed_xades"}>Preflight envio sidecar</button>
              </form>
              <p>{p.submitPreflight ? `${p.submitPreflight.status} - ${p.submitPreflight.sidecar_endpoint} - ${p.submitPreflight.endpoint_name} - sidecar ${p.submitPreflight.sidecar_call_performed ? "SI" : "NO"} - AEAT ${p.submitPreflight.external_call_performed ? "SI" : "NO"} - ${p.submitPreflight.blockers.join(", ") || "sin bloqueos"}` : "Llama al sidecar local con HMAC para readiness WSDL/vault/flags; sin llamada AEAT real ni CSV."}</p>
              <h2>Enviar via sidecar</h2>
              <form className="backupForm" onSubmit={p.invokeSubmitSidecar}>
                <input value={p.invokeSidecarUrl} onChange={(event) => p.setInvokeSidecarUrl(event.target.value)} />
                <button className="primary" disabled={!p.submission || !p.submitPreflight?.ready}>Enviar via sidecar</button>
              </form>
              <p>{p.submitInvocation ? `${p.submitInvocation.transmission_status} - ${p.submitInvocation.operation} - sidecar ${p.submitInvocation.sidecar_call_performed ? "SI" : "NO"} - AEAT ${p.submitInvocation.external_call_performed ? "SI" : "NO"} - CSV ${p.submitInvocation.csv ?? "sin CSV"}` : "Frontera final: solo sidecar local con HMAC puede invocar AEAT; gate usa sidecar falso, sin aceptacion real."}</p>
</div>
<div className="statusBox">
              <FileCode2 size={24} aria-hidden="true" />
              <strong>SQLite local</strong>
              <span>{p.fiscalChain?.valid ? `Cadena fiscal OK (${p.fiscalChain.total_records})` : "Runtime, PDF, backup y XML cableados."}</span>
            </div>
</section>
    
    </>
  );
}
