import { useWorkspaceState } from "../../shared/context";
export function RuntimeStatus() {
  const { fillDemoData, demoSeedEnabled, fiscalChain, appDefaults } =
    useWorkspaceState();
  return (
    <section className="panel statusGrid" aria-label="Estado pre-MVP">
      <div>
        <strong>Roadmap local MVP</strong>
        <p>Pre-MVP local-first: evidencia local activa, externo bloqueado.</p>
        <button type="button" className="linkButton" onClick={fillDemoData}>
          {demoSeedEnabled ? "Datos demo cargados" : "Rellenar demo"}
        </button>
      </div>
      <div>
        <strong>local_evidence</strong>
        <p>
          {fiscalChain?.valid
            ? `OK (${fiscalChain.total_records} registros)`
            : "pendiente de primera emision"}
        </p>
      </div>
      <div>
        <strong>external_blocked</strong>
        <p>Sin certificado real, vault, flags ni manifiesto AEAT.</p>
      </div>
      <div>
        <strong>Export dir</strong>
        <p>{appDefaults?.export_dir ?? "Cargando ubicacion segura..."}</p>
      </div>
    </section>
  );
}
