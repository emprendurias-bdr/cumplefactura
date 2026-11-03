/** Ajustes: onboarding (carpeta, territorios, entorno VERI*FACTU) y copia de seguridad. */
import { PathForm } from "../components/forms";
import { Icon } from "../components/Icon";
import { VERIFACTU_ENDPOINTS } from "../types";
import type { Model } from "../useCumpleFactura";

const territoryFlags = [
  { flag: "CommonTerritory", label: "Territorio comun" },
  { flag: "VeriFactu", label: "VERI*FACTU local" },
  { flag: "Sii", label: "SII pendiente" },
];

export function AjustesSection(p: Model) {
  return (
    <>
      <section className="panel onboardingPanel" aria-label="Onboarding inicial">
        <div className="editorTop">
          <div>
            <h2>Onboarding inicial</h2>
            <p>{p.appSettings?.onboarding_completed ? "Completado" : "Pendiente"} - empresa, fiscalidad, serie y carpeta export.</p>
          </div>
          <div className="stepBadges">
            {p.onboardingSteps.map((step) => (
              <span key={step.label} className={step.ok ? "ok" : ""}>
                {step.label}
              </span>
            ))}
          </div>
        </div>
        <form className="onboardingForm" onSubmit={p.saveOnboarding}>
          <div className="pathField">
            <label className="fieldBlock">
              <span>Carpeta export</span>
              <input aria-label="Carpeta export" value={p.exportDir} readOnly required />
            </label>
            <button type="button" className="linkButton" onClick={() => void p.pickExportDirectory()}>
              <Icon name="folderOpen" />
              Elegir carpeta
            </button>
          </div>
          <fieldset className="flagGroup">
            <legend>Fiscalidad local</legend>
            {territoryFlags.map(({ flag, label }) => (
              <label key={flag}>
                <input
                  type="checkbox"
                  checked={p.defaultTerritoryFlags.includes(flag)}
                  onChange={(event) => p.toggleTerritoryFlag(flag, event.target.checked)}
                />{" "}
                {label}
              </label>
            ))}
          </fieldset>
          <label className="fieldBlock">
            <span>Entorno VERI*FACTU</span>
            <select aria-label="Entorno VERI*FACTU" value={p.endpointName} onChange={(event) => p.setEndpointName(event.target.value)}>
              {VERIFACTU_ENDPOINTS.map(({ id, label }) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button className="primary" disabled={!p.onboardingReady}>
            Guardar onboarding
          </button>
        </form>
      </section>

      <section className="panel split">
        <div>
          <h2>Backup local</h2>
          <PathForm
            p={p}
            pathKey="backup"
            title="Backup SQLite"
            extensions={["sqlite3", "sqlite", "db"]}
            aria="Ruta backup SQLite"
            pickLabel="Elegir backup"
            submitLabel="Exportar SQLite"
            onSubmit={p.exportBackup}
            result={p.backup ? `${p.backup.status} - ${p.backup.target_path}` : "Crea copia SQLite con VACUUM INTO."}
          />
          <h2>Restore backup</h2>
          <PathForm
            p={p}
            pathKey="restore"
            title="Restore backup"
            extensions={["sqlite", "sqlite3", "db"]}
            aria="Ruta restore backup"
            pickLabel="Elegir restore"
            submitLabel="Validar restore"
            onSubmit={p.restoreBackup}
            onPick={() => void p.pickRestoreFile()}
            placeholder="Ruta .sqlite3/.db"
            disabled={!p.paths.restore}
            result={
              p.restore
                ? `${p.restore.status} - destructivo ${p.restore.destructive_restore_performed ? "SI" : "NO"} - ${p.restore.source_path}`
                : "Preflight local: valida origen, no reemplaza la base activa."
            }
          />
        </div>
      </section>
    </>
  );
}
