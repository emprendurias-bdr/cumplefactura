import { FileCode2, FolderOpen } from "lucide-react";
import { useWorkspaceState } from "../../shared/context";
import { short } from "../../shared/forms";
export function ExportsSettings() {
  const {
    exportBackup,
    backupPath,
    pickSavePath,
    setBackupPath,
    backup,
    status,
    restoreBackup,
    restorePath,
    pickRestoreFile,
    restore,
    exportPdf,
    pdfPath,
    setPdfPath,
    draft,
    invoices,
    pdfResult,
    exportJson,
    jsonPath,
    setJsonPath,
    jsonResult,
    exportCsv,
    csvPath,
    setCsvPath,
    csvResult,
    exportXml,
    xmlPath,
    setXmlPath,
    canExportXml,
    xmlResult,
    exportCancelXml,
    cancelXmlPath,
    setCancelXmlPath,
    cancelXmlResult,
    prepareSubmission,
    submission,
    preflightXadesSidecar,
    xadesSidecarUrl,
    setXadesSidecarUrl,
    xadesCertRef,
    setXadesCertRef,
    xadesPreflight,
    signWithXadesSidecar,
    signedXmlPath,
    setSignedXmlPath,
    xadesSignature,
    preflightAeatTransport,
    aeatEndpoint,
    setAeatEndpoint,
    transportPreflight,
    preflightSubmitSidecar,
    submitSidecarUrl,
    setSubmitSidecarUrl,
    aeatEndpointName,
    setAeatEndpointName,
    submitPreflight,
    invokeSubmitSidecar,
    invokeSidecarUrl,
    setInvokeSidecarUrl,
    submitInvocation,
    fiscalChain,
  } = useWorkspaceState();
  return (
    <section className="panel split">
      <div>
        <h2>Backup local</h2>
        <form className="backupForm pathForm" onSubmit={exportBackup}>
          <input aria-label="Ruta backup SQLite" value={backupPath} readOnly />
          <button
            type="button"
            className="linkButton"
            onClick={() =>
              void pickSavePath(
                "Backup SQLite",
                backupPath,
                ["sqlite3", "sqlite", "db"],
                setBackupPath,
              )
            }
          >
            <FolderOpen size={16} aria-hidden="true" />
            Elegir backup
          </button>
          <button className="primary">Exportar SQLite</button>
        </form>
        <p>
          {backup
            ? `${backup.status} - ${backup.target_path}`
            : "Crea copia SQLite con VACUUM INTO."}
        </p>
        <h2>Restore backup</h2>
        <form className="backupForm pathForm" onSubmit={restoreBackup}>
          <input
            aria-label="Ruta restore backup"
            value={restorePath}
            readOnly
            placeholder="Ruta .sqlite3/.db"
          />
          <button
            type="button"
            className="linkButton"
            onClick={() => void pickRestoreFile()}
          >
            <FolderOpen size={16} aria-hidden="true" />
            Elegir restore
          </button>
          <button className="primary" disabled={!restorePath}>
            Validar restore
          </button>
        </form>
        <p>
          {restore
            ? `${restore.status} - destructivo ${restore.destructive_restore_performed ? "SI" : "NO"} - ${restore.source_path}`
            : "Preflight local: valida origen, no reemplaza la base activa."}
        </p>
        <h2>PDF factura</h2>
        <form className="backupForm pathForm" onSubmit={exportPdf}>
          <input aria-label="Ruta PDF factura" value={pdfPath} readOnly />
          <button
            type="button"
            className="linkButton"
            onClick={() =>
              void pickSavePath("PDF factura", pdfPath, ["pdf"], setPdfPath)
            }
          >
            <FolderOpen size={16} aria-hidden="true" />
            Elegir PDF
          </button>
          <button
            className="primary"
            disabled={!draft && invoices.length === 0}
          >
            Exportar PDF
          </button>
        </form>
        <p>
          {pdfResult
            ? `PDF creado - ${pdfResult}`
            : "Exporta la factura/borrador seleccionado."}
        </p>
        <h2>JSON factura</h2>
        <form className="backupForm pathForm" onSubmit={exportJson}>
          <input aria-label="Ruta JSON factura" value={jsonPath} readOnly />
          <button
            type="button"
            className="linkButton"
            onClick={() =>
              void pickSavePath("JSON factura", jsonPath, ["json"], setJsonPath)
            }
          >
            <FolderOpen size={16} aria-hidden="true" />
            Elegir JSON
          </button>
          <button
            className="primary"
            disabled={!draft && invoices.length === 0}
          >
            Exportar JSON
          </button>
        </form>
        <p>
          {jsonResult
            ? `${jsonResult.status} - ${jsonResult.target_path}`
            : "Exporta datos de factura a JSON local."}
        </p>
        <h2>CSV facturas</h2>
        <form className="backupForm pathForm" onSubmit={exportCsv}>
          <input aria-label="Ruta CSV facturas" value={csvPath} readOnly />
          <button
            type="button"
            className="linkButton"
            onClick={() =>
              void pickSavePath("CSV facturas", csvPath, ["csv"], setCsvPath)
            }
          >
            <FolderOpen size={16} aria-hidden="true" />
            Elegir CSV
          </button>
          <button className="primary" disabled={invoices.length === 0}>
            Exportar CSV
          </button>
        </form>
        <p>
          {csvResult
            ? `${csvResult.status} - ${csvResult.target_path}`
            : "Exporta listado local de facturas; filtros en contrato MVP."}
        </p>
        <h2>XML VERI*FACTU</h2>
        <form className="backupForm pathForm" onSubmit={exportXml}>
          <input aria-label="Ruta XML VERIFACTU" value={xmlPath} readOnly />
          <button
            type="button"
            className="linkButton"
            onClick={() =>
              void pickSavePath("XML VERIFACTU", xmlPath, ["xml"], setXmlPath)
            }
          >
            <FolderOpen size={16} aria-hidden="true" />
            Elegir XML
          </button>
          <button className="primary" disabled={!canExportXml}>
            Exportar XML
          </button>
        </form>
        <p>
          {xmlResult
            ? `${xmlResult.status} - XSD ${xmlResult.xsd_validated ? "OK" : "NO"} - ${xmlResult.target_path}`
            : "Borrador tecnico: XSD local, sin firma ni envio."}
        </p>
        <h2>XML anulacion</h2>
        <form className="backupForm pathForm" onSubmit={exportCancelXml}>
          <input
            aria-label="Ruta XML anulacion"
            value={cancelXmlPath}
            readOnly
          />
          <button
            type="button"
            className="linkButton"
            onClick={() =>
              void pickSavePath(
                "XML anulacion",
                cancelXmlPath,
                ["xml"],
                setCancelXmlPath,
              )
            }
          >
            <FolderOpen size={16} aria-hidden="true" />
            Elegir anulacion
          </button>
          <button className="primary" disabled={!canExportXml}>
            Exportar anulacion
          </button>
        </form>
        <p>
          {cancelXmlResult
            ? `${cancelXmlResult.status} - XSD ${cancelXmlResult.xsd_validated ? "OK" : "NO"} - ${cancelXmlResult.target_path}`
            : "Borrador de anulacion: valida XSD y registra estado fiscal."}
        </p>
        <h2>Firma/envio</h2>
        <form className="backupForm" onSubmit={prepareSubmission}>
          <label className="fieldLabel">
            Huella SHA256 del XML
            <input
              value={submission?.xml_sha256 ?? "XML SHA256 pendiente"}
              readOnly
            />
          </label>
          <button className="primary" disabled={!xmlResult && !cancelXmlResult}>
            Preparar
          </button>
        </form>
        <p>
          {submission
            ? `${submission.signature_status} - ${submission.transmission_status} - ${short(submission.xml_sha256)} - export ${short(submission.export_id)}`
            : "Prepara paquete local: XSD, SHA256 y estado pendiente de XAdES/envio."}
        </p>
        <h2>Preflight XAdES</h2>
        <form className="backupForm" onSubmit={preflightXadesSidecar}>
          <label className="fieldLabel">
            URL sidecar de firma
            <input
              value={xadesSidecarUrl}
              onChange={(event) => setXadesSidecarUrl(event.target.value)}
            />
          </label>
          <label className="fieldLabel">
            Referencia del certificado
            <input
              value={xadesCertRef}
              onChange={(event) => setXadesCertRef(event.target.value)}
            />
          </label>
          <button className="primary" disabled={!submission}>
            Preflight XAdES
          </button>
        </form>
        <p>
          {xadesPreflight
            ? `${xadesPreflight.status} - ${xadesPreflight.sidecar_endpoint} - ref ${xadesPreflight.certificate_ref_status} - llamada externa ${xadesPreflight.external_call_performed ? "SI" : "NO"} - ${xadesPreflight.blockers.join(", ") || "sin bloqueos"}`
            : "Comprueba sidecar local, hash XML, vault ref y flag; no llama al sidecar."}
        </p>
        <form className="backupForm pathForm" onSubmit={signWithXadesSidecar}>
          <input aria-label="Ruta XML firmado" value={signedXmlPath} readOnly />
          <button
            type="button"
            className="linkButton"
            onClick={() =>
              void pickSavePath(
                "XML firmado",
                signedXmlPath,
                ["xml"],
                setSignedXmlPath,
              )
            }
          >
            <FolderOpen size={16} aria-hidden="true" />
            Elegir firmado
          </button>
          <button
            className="primary"
            disabled={!submission || !xadesPreflight?.ready}
          >
            Firmar XAdES
          </button>
        </form>
        <p>
          {xadesSignature
            ? `${xadesSignature.signature_status} - ${xadesSignature.signature_mode} - sidecar ${xadesSignature.sidecar_call_performed ? "SI" : "NO"} - AEAT ${xadesSignature.external_call_performed ? "SI" : "NO"} - ${short(xadesSignature.xml_sha256)}`
            : "Llama al sidecar local con HMAC y exige XAdES real; no llama a AEAT."}
        </p>
        <h2>Preflight AEAT</h2>
        <form className="backupForm" onSubmit={preflightAeatTransport}>
          <label className="fieldLabel">
            Endpoint AEAT
            <input
              value={aeatEndpoint}
              onChange={(event) => setAeatEndpoint(event.target.value)}
            />
          </label>
          <button className="primary" disabled={!submission}>
            Preflight AEAT
          </button>
        </form>
        <p>
          {transportPreflight
            ? `${transportPreflight.status} - ${transportPreflight.endpoint_name} - llamada externa ${transportPreflight.external_call_performed ? "SI" : "NO"} - ${transportPreflight.blockers.join(", ") || "sin bloqueos"}`
            : "Comprueba endpoint WSDL, hash, XAdES y flag; no llama a AEAT."}
        </p>
        <h2>Preflight envio sidecar</h2>
        <form className="backupForm" onSubmit={preflightSubmitSidecar}>
          <label className="fieldLabel">
            URL sidecar de preflight
            <input
              value={submitSidecarUrl}
              onChange={(event) => setSubmitSidecarUrl(event.target.value)}
            />
          </label>
          <label className="fieldLabel">
            Nombre del endpoint AEAT
            <input
              value={aeatEndpointName}
              onChange={(event) => setAeatEndpointName(event.target.value)}
            />
          </label>
          <button
            className="primary"
            disabled={
              !submission || submission.signature_status !== "signed_xades"
            }
          >
            Preflight envio sidecar
          </button>
        </form>
        <p>
          {submitPreflight
            ? `${submitPreflight.status} - ${submitPreflight.sidecar_endpoint} - ${submitPreflight.endpoint_name} - sidecar ${submitPreflight.sidecar_call_performed ? "SI" : "NO"} - AEAT ${submitPreflight.external_call_performed ? "SI" : "NO"} - ${submitPreflight.blockers.join(", ") || "sin bloqueos"}`
            : "Llama al sidecar local con HMAC para readiness WSDL/vault/flags; sin llamada AEAT real ni CSV."}
        </p>
        <h2>Enviar via sidecar</h2>
        <form className="backupForm" onSubmit={invokeSubmitSidecar}>
          <label className="fieldLabel">
            URL sidecar de envío
            <input
              value={invokeSidecarUrl}
              onChange={(event) => setInvokeSidecarUrl(event.target.value)}
            />
          </label>
          <button
            className="primary"
            disabled={!submission || !submitPreflight?.ready}
          >
            Enviar via sidecar
          </button>
        </form>
        <p>
          {submitInvocation
            ? `${submitInvocation.transmission_status} - ${submitInvocation.operation} - sidecar ${submitInvocation.sidecar_call_performed ? "SI" : "NO"} - AEAT ${submitInvocation.external_call_performed ? "SI" : "NO"} - CSV ${submitInvocation.csv ?? "sin CSV"}`
            : "Frontera final: solo sidecar local con HMAC puede invocar AEAT; gate usa sidecar falso, sin aceptacion real."}
        </p>
      </div>
      <div className="statusBox">
        <FileCode2 size={24} aria-hidden="true" />
        <strong>SQLite local</strong>
        <span>
          {fiscalChain?.valid
            ? `Cadena fiscal OK (${fiscalChain.total_records})`
            : "Runtime, PDF, backup y XML cableados."}
        </span>
      </div>
    </section>
  );
}
