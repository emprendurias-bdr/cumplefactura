import { Button, EmptyState } from "@bdr/ui";
import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { useWorkspaceState } from "../../shared/context";
import { cents, short } from "../../shared/forms";
import { FiscalProgress } from "./FiscalProgress";
import { fiscalProgress } from "./progress";
import { FiscalAudit } from "./FiscalAudit";
import { SidecarChannels } from "./SidecarChannels";
export function VerifactuScreen() {
  const s = useWorkspaceState();
  const [selected, setSelected] = useState("");
  const invoices = s.invoices.filter(
    (i) => !s.company || i.company_id === s.company.id,
  );
  const invoice =
    invoices.find((i) => i.id === selected) ??
    invoices.find((i) => i.status === "Issued") ??
    invoices[0];
  const progress = invoice
    ? fiscalProgress(invoice, s.fiscalRecords, s.submitInvocation, s.submission)
    : null;
  const days = s.submitPreflight?.certificate_days_remaining;
  const certificate = s.submitPreflight?.certificate_loaded
    ? days == null
      ? "Cargado · caducidad sin confirmar"
      : days < 0
        ? "Caducado"
        : `${days} días restantes`
    : "No comprobado";
  const isTest = /^https:\/\/prewww[12]\.aeat\.es\//.test(s.aeatEndpoint);
  return (
    <section className="phase2-screen" aria-label="Estado fiscal Verifactu">
      <header className="phase2-head">
        <div>
          <p className="eyebrow">
            Verifactu · {s.company?.legal_name || "Configura tu empresa"}
          </p>
          <h1>
            Estado <span className="bdr-highlight">fiscal</span>
          </h1>
        </div>
        <div className="phase2-actions">
          <Button
            variant="secondary"
            onClick={() => void s.verifyFiscalChain()}
          >
            <RefreshCw size={16} />
            Comprobar integridad
          </Button>
          <Button
            variant="dark"
            disabled
            title="La cola de reintentos todavía no está disponible"
          >
            Reintentar ahora
          </Button>
        </div>
      </header>
      <aside className="phase2-info">
        La conexión con la AEAT no se comprueba automáticamente. El envío
        automático y la cola todavía no están disponibles. Un registro local no
        acredita presentación ni aceptación.
      </aside>
      <div className="fiscal-overview">
        <label>
          Factura
          <select
            aria-label="Factura para revisar estado fiscal"
            value={invoice?.id || ""}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Elige una factura</option>
            {invoices.map((i) => (
              <option key={i.id} value={i.id}>
                {i.series}-{i.number ?? "Borrador"} · {cents(i.total_cents)}
              </option>
            ))}
          </select>
        </label>
        {progress ? (
          <FiscalProgress state={progress} />
        ) : (
          <EmptyState
            title="Aún no hay facturas para revisar."
            description="Los pasos se mostrarán cuando tengas una factura guardada."
          />
        )}
        <p className="fiscal-explanation">
          En modo VERI*FACTU los registros no necesitan firma electrónica. La
          respuesta y su CSV solo aparecen si la aplicación ha recibido
          confirmación para esta factura y este XML.
        </p>
      </div>
      <div className="fiscal-columns">
        <section className="fiscal-overview">
          <h2>Cadena de registros</h2>
          {s.fiscalRecords.length ? (
            <div className="invoice-table-wrap">
              <table className="invoice-table">
                <caption className="sr-only">
                  Registros locales y comprobación de integridad
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Factura</th>
                    <th scope="col">Tipo</th>
                    <th scope="col">Huella</th>
                    <th scope="col">Envío</th>
                    <th scope="col">Integridad</th>
                  </tr>
                </thead>
                <tbody>
                  {s.fiscalRecords
                    .filter((r) => invoices.some((i) => i.id === r.invoice_id))
                    .map((record) => {
                      const linked = invoices.find(
                        (i) => i.id === record.invoice_id,
                      );
                      const evidence = linked
                        ? fiscalProgress(
                            linked,
                            [record],
                            s.submitInvocation,
                            s.submission,
                          )
                        : null;
                      const issue = s.fiscalChain?.issues.some(
                        (i) => i.record_id === record.id,
                      );
                      return (
                        <tr key={record.id}>
                          <th scope="row" className="bdr-mono">
                            {linked
                              ? `${linked.series}-${linked.number ?? "Borrador"}`
                              : short(record.invoice_id)}
                          </th>
                          <td>
                            {record.record_type === "Alta"
                              ? "Alta"
                              : record.record_type}
                          </td>
                          <td>
                            <abbr
                              className="bdr-mono"
                              title={record.fiscal_hash}
                            >
                              {short(record.fiscal_hash)}
                            </abbr>
                          </td>
                          <td>
                            {evidence?.steps[3].confirmed
                              ? evidence.responseLabel
                              : evidence?.steps[2].confirmed
                                ? "Enviada · sin respuesta confirmada"
                                : "Sin confirmar"}
                          </td>
                          <td>
                            {issue
                              ? "Incidencia"
                              : s.fiscalChain?.valid
                                ? "Cuadra"
                                : "Sin verificar"}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          ) : (
            <p>Aún no hay registros locales.</p>
          )}
          <p className="fiscal-explanation">
            Esta página contiene los registros cargados. La comprobación de
            integridad revisa la cadena completa de la base local.
          </p>
        </section>
        <aside className="fiscal-overview">
          <h2>Conexión y certificado</h2>
          <dl className="connection-details">
            <dt>Envío a la AEAT</dt>
            <dd>Sin comprobar</dd>
            <dt>Certificado</dt>
            <dd>{certificate}</dd>
            <dt>Entorno</dt>
            <dd className="bdr-mono">
              {isTest ? "Pruebas" : "Endpoint sin verificar"}
            </dd>
            <dt>Cola</dt>
            <dd>No disponible todavía</dd>
            <dt>SII · TicketBAI · FACe</dt>
            <dd>Consulta la capacidad en herramientas técnicas</dd>
          </dl>
          <p className="fiscal-explanation">
            El certificado debe ser de la empresa o de quien la represente. Su
            referencia no acredita que esté cargado ni vigente.
          </p>
        </aside>
      </div>
      <details className="technical-details">
        <summary>Auditoría y herramientas técnicas</summary>
        <FiscalAudit />
        <SidecarChannels />
      </details>
      <aside className="phase2-info">
        Comprueba con tu asesor que tu caso cumple lo que exige la normativa.
        Esta pantalla no es una acreditación.
      </aside>
    </section>
  );
}
