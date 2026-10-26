import { RefreshCw } from "lucide-react";
import { useWorkspaceState } from "../../shared/context";
export function SidecarChannels() {
  const {
    sidecarCapabilities,
    mvpSidecarChannels,
    deferredSidecarChannels,
    loadDefaults,
    status,
    preflightSiiSidecar,
    siiBook,
    setSiiBook,
    siiEndpointName,
    setSiiEndpointName,
    siiSidecarUrl,
    setSiiSidecarUrl,
    siiChannel,
    siiPreflight,
    preflightTicketBaiSidecar,
    ticketbaiTerritorio,
    setTicketbaiTerritorio,
    ticketbaiEndpoint,
    setTicketbaiEndpoint,
    ticketbaiSidecarUrl,
    setTicketbaiSidecarUrl,
    ticketbaiChannel,
    ticketbaiPreflight,
  } = useWorkspaceState();
  return (
    <section
      className="panel sidecarChannels"
      aria-label="Canales ContaPro sidecar"
    >
      <div className="editorTop">
        <div>
          <h2>Canales ContaPro sidecar</h2>
          <p>
            {sidecarCapabilities
              ? `${sidecarCapabilities.source_project} - MVP ${mvpSidecarChannels} - diferido ${deferredSidecarChannels}`
              : "Cargando evidencia importada."}
          </p>
        </div>
        <button
          type="button"
          className="linkButton"
          onClick={() => void loadDefaults()}
        >
          <RefreshCw size={16} aria-hidden="true" />
          Recargar sidecar
        </button>
      </div>
      <div className="auditSummary" aria-label="Resumen canales sidecar">
        {(sidecarCapabilities?.channels ?? []).map((channel) => (
          <div key={channel.channel}>
            <strong>{channel.channel.toUpperCase()}</strong>
            <span>{channel.mvp_importable ? "MVP" : channel.status}</span>
          </div>
        ))}
      </div>
      <p>
        Importado de ContaPro para MVP: {mvpSidecarChannels}. FACe y TicketBAI
        quedan diferidos. CumpleFactura no llama a AEAT/SII/FACe/forales durante
        la importacion.
      </p>
      <div className="sidecarForms">
        <form className="backupForm" onSubmit={preflightSiiSidecar}>
          <h3>SII sidecar</h3>
          <input
            aria-label="Libro SII"
            value={siiBook}
            onChange={(event) => setSiiBook(event.target.value)}
          />
          <input
            aria-label="Endpoint SII"
            value={siiEndpointName}
            onChange={(event) => setSiiEndpointName(event.target.value)}
          />
          <input
            aria-label="URL sidecar SII"
            value={siiSidecarUrl}
            onChange={(event) => setSiiSidecarUrl(event.target.value)}
          />
          <button className="primary" disabled={!siiChannel?.mvp_importable}>
            Preflight SII sidecar
          </button>
        </form>
        <p>
          {siiPreflight
            ? `${siiPreflight.status} - ${siiPreflight.sidecar_endpoint} - sidecar ${siiPreflight.sidecar_call_performed ? "SI" : "NO"} - AEAT ${siiPreflight.external_call_performed ? "SI" : "NO"} - ${siiPreflight.blockers.join(", ") || "sin bloqueos"}`
            : `MVP ${siiChannel?.mvp_importable ? "importable" : "no listo"} - acceptance ${siiChannel?.acceptance_status ?? "missing"}. Preflight local; sin SOAP AEAT.`}
        </p>
        <form className="backupForm" onSubmit={preflightTicketBaiSidecar}>
          <h3>TicketBAI sidecar</h3>
          <select
            aria-label="Territorio TicketBAI"
            value={ticketbaiTerritorio}
            onChange={(event) => setTicketbaiTerritorio(event.target.value)}
          >
            <option value="bizkaia">bizkaia</option>
            <option value="gipuzkoa">gipuzkoa</option>
            <option value="araba">araba</option>
          </select>
          <input
            aria-label="Endpoint TicketBAI"
            value={ticketbaiEndpoint}
            onChange={(event) => setTicketbaiEndpoint(event.target.value)}
          />
          <input
            aria-label="URL sidecar TicketBAI"
            value={ticketbaiSidecarUrl}
            onChange={(event) => setTicketbaiSidecarUrl(event.target.value)}
          />
          <button
            className="primary"
            disabled={!ticketbaiChannel?.mvp_importable}
          >
            Preflight TicketBAI sidecar
          </button>
        </form>
        <p>
          {ticketbaiPreflight
            ? `${ticketbaiPreflight.status} - ${ticketbaiPreflight.sidecar_endpoint} - sidecar ${ticketbaiPreflight.sidecar_call_performed ? "SI" : "NO"} - foral ${ticketbaiPreflight.external_call_performed ? "SI" : "NO"} - ${ticketbaiPreflight.blockers.join(", ") || "sin bloqueos"}`
            : `Diferido: ${ticketbaiChannel?.deferred_reason ?? "sin evidencia MVP aceptada"}; homologacion foral sigue bloqueada.`}
        </p>
      </div>
    </section>
  );
}
