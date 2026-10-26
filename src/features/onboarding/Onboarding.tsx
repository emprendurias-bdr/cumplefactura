import { FolderOpen } from "lucide-react";
import { useWorkspaceState } from "../../shared/context";
export function Onboarding({
  stage = "all",
  submitLabel = "Guardar onboarding",
}: {
  stage?: "all" | "fiscal" | "export";
  submitLabel?: string;
}) {
  const {
    appSettings,
    onboardingSteps,
    saveOnboarding,
    exportDir,
    setExportDir,
    pickExportDirectory,
    defaultTerritoryFlags,
    toggleTerritoryFlag,
    onboardingReady,
  } = useWorkspaceState();
  return (
    <section className="panel onboardingPanel" aria-label="Onboarding inicial">
      <div className="editorTop">
        <div>
          <h2>Onboarding inicial</h2>
          <p>
            {appSettings?.onboarding_completed
              ? "Configuración básica guardada"
              : "Pendiente"}{" "}
            - empresa, fiscalidad, serie y carpeta export.
          </p>
        </div>
        <div className="stepBadges">
          {onboardingSteps.map((step) => (
            <span key={step.label} className={step.ok ? "ok" : ""}>
              {step.label}
            </span>
          ))}
        </div>
      </div>
      <form className="onboardingForm" onSubmit={saveOnboarding}>
        {stage !== "fiscal" && (
          <div className="pathField">
            <label className="fieldBlock">
              <span>Carpeta export</span>
              <input
                aria-label="Carpeta export"
                value={exportDir}
                onChange={(event) => setExportDir(event.target.value)}
                readOnly
                required
              />
            </label>
            <button
              type="button"
              className="linkButton"
              onClick={() => void pickExportDirectory()}
            >
              <FolderOpen size={16} aria-hidden="true" />
              Elegir carpeta
            </button>
          </div>
        )}
        {stage !== "export" && (
          <fieldset className="flagGroup">
            <legend>Fiscalidad local</legend>
            <label>
              <input
                type="checkbox"
                checked={defaultTerritoryFlags.includes("CommonTerritory")}
                onChange={(event) =>
                  toggleTerritoryFlag("CommonTerritory", event.target.checked)
                }
              />{" "}
              Territorio comun
            </label>
            <label>
              <input
                type="checkbox"
                checked={defaultTerritoryFlags.includes("VeriFactu")}
                onChange={(event) =>
                  toggleTerritoryFlag("VeriFactu", event.target.checked)
                }
              />{" "}
              VERI*FACTU local
            </label>
            <label>
              <input
                type="checkbox"
                checked={defaultTerritoryFlags.includes("Sii")}
                onChange={(event) =>
                  toggleTerritoryFlag("Sii", event.target.checked)
                }
              />{" "}
              SII pendiente
            </label>
          </fieldset>
        )}
        {stage !== "fiscal" && (
          <button className="primary" disabled={!onboardingReady}>
            {submitLabel}
          </button>
        )}
      </form>
    </section>
  );
}
