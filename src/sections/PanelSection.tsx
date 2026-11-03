/** Panel: resumen del producto, estado de la evidencia local y datos demo. */
import { Icon, type IconName } from "../components/Icon";
import type { Model } from "../useCumpleFactura";

const cards: { icon: IconName; title: string; text: string }[] = [
  { icon: "fileCheck", title: "Facturas", text: "Borradores, emision, series y export local." },
  { icon: "lock", title: "Auditoria", text: "Registro append-only preparado para RRSIF." },
  { icon: "hash", title: "Huella", text: "Cadena de hashes estable antes de enviar payload fiscal." },
  { icon: "shieldCheck", title: "Fiscal", text: "XML VERI*FACTU con XSD local; el envio solo lo hace el sidecar." },
];

export function PanelSection(p: Model) {
  return (
    <>
      <div className="grid">
        {cards.map(({ icon, title, text }) => (
          <article key={title} className="card">
            <Icon name={icon} size={22} />
            <h2>{title}</h2>
            <p>{text}</p>
          </article>
        ))}
      </div>

      <section className="panel statusGrid" aria-label="Estado pre-MVP">
        <div>
          <strong>Roadmap local MVP</strong>
          <p>Pre-MVP local-first: evidencia local activa, externo bloqueado.</p>
          <button type="button" className="linkButton" onClick={p.fillDemoData}>
            {p.demoSeedEnabled ? "Datos demo cargados" : "Rellenar demo"}
          </button>
        </div>
        <div>
          <strong>local_evidence</strong>
          <p>{p.fiscalChain?.valid ? `OK (${p.fiscalChain.total_records} registros)` : "pendiente de primera emision"}</p>
        </div>
        <div>
          <strong>external_blocked</strong>
          <p>Sin certificado en el vault ni CUMPLEFACTURA_SIDECAR_ALLOW_AEAT=1, el sidecar no llama a AEAT.</p>
        </div>
        <div>
          <strong>Export dir</strong>
          <p>{p.appDefaults?.export_dir ?? "Cargando ubicacion segura..."}</p>
        </div>
      </section>
    </>
  );
}
