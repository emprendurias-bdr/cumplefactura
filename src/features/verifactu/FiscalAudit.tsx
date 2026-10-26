import { FolderOpen, RefreshCw } from "lucide-react";
import { useWorkspaceState } from "../../shared/context";
import { short } from "../../shared/forms";
export function FiscalAudit() {
  const {
    fiscalChain,
    verifyFiscalChain,
    exportFiscalAudit,
    auditExportPath,
    pickSavePath,
    setAuditExportPath,
    audit,
    fiscalRecords,
    auditExportResult,
    status,
  } = useWorkspaceState();
  return (
    <section
      className="panel fiscalAuditScreen"
      aria-label="Auditoria fiscal local"
    >
      <div className="editorTop">
        <div>
          <h2>Auditoria fiscal local</h2>
          <p>
            {fiscalChain?.valid
              ? `Cadena fiscal OK (${fiscalChain.total_records})`
              : `Incidencias cadena ${fiscalChain?.issue_count ?? 0}`}
          </p>
        </div>
        <button
          type="button"
          className="linkButton"
          onClick={() => void verifyFiscalChain()}
        >
          <RefreshCw size={16} aria-hidden="true" />
          Verificar cadena
        </button>
      </div>
      <div className="auditSummary" aria-label="Resumen auditoria fiscal">
        <div>
          <strong>Estado cadena</strong>
          <span>{fiscalChain?.valid ? "OK" : "Revisar"}</span>
        </div>
        <div>
          <strong>Registros fiscales verificados</strong>
          <span>{fiscalChain?.total_records ?? 0}</span>
        </div>
        <div>
          <strong>Incidencias cadena</strong>
          <span>{fiscalChain?.issue_count ?? 0}</span>
        </div>
        <div>
          <strong>Empresas con hash final</strong>
          <span>{fiscalChain?.last_hash_by_company.length ?? 0}</span>
        </div>
      </div>
      <div className="auditColumns">
        <div>
          <h3>Incidencias cadena</h3>
          {fiscalChain && fiscalChain.issues.length > 0 ? (
            <ul className="auditList">
              {fiscalChain.issues.map((issue) => (
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
          {fiscalChain && fiscalChain.last_hash_by_company.length > 0 ? (
            <ul className="auditList">
              {fiscalChain.last_hash_by_company.map((head) => (
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
      <form className="auditExportForm" onSubmit={exportFiscalAudit}>
        <input
          aria-label="Ruta informe auditoria fiscal"
          value={auditExportPath}
          readOnly
        />
        <button
          type="button"
          className="linkButton"
          onClick={() =>
            void pickSavePath(
              "Informe auditoria fiscal",
              auditExportPath,
              ["json"],
              setAuditExportPath,
            )
          }
        >
          <FolderOpen size={16} aria-hidden="true" />
          Elegir auditoria
        </button>
        <button
          className="primary"
          disabled={audit.length === 0 && fiscalRecords.length === 0}
        >
          Exportar auditoria
        </button>
      </form>
      <p>
        {auditExportResult
          ? `${auditExportResult.status} - ${auditExportResult.target_path}`
          : "Informe JSON de trazabilidad local, no certificacion."}
      </p>
    </section>
  );
}
