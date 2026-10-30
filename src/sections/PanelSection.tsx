// @ts-nocheck
import { FileCheck2, Hash, LockKeyhole, ShieldCheck } from "lucide-react";

const cards = [
  { icon: FileCheck2, title: "Facturas", text: "Borradores, emision, series y export local." },
  { icon: LockKeyhole, title: "Auditoria", text: "Registro append-only preparado para RRSIF." },
  { icon: Hash, title: "Huella", text: "Cadena de hashes estable antes de enviar payload fiscal." },
  { icon: ShieldCheck, title: "Fiscal", text: "XML VERI*FACTU borrador con XSD local, sin envio ni firma." },
];

export function PanelSection(p: Record<string, any>) {
  return (
    <>
<div className="grid">
                {cards.map(({ icon: Icon, title, text }) => (
                  <article key={title} className="card">
                    <Icon size={22} aria-hidden="true" />
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
                  <p>Sin certificado real, vault, flags ni manifiesto AEAT.</p>
                </div>
                <div>
                  <strong>Export dir</strong>
                  <p>{p.appDefaults?.export_dir ?? "Cargando ubicacion segura..."}</p>
                </div>
              </section>
    
    </>
  );
}
