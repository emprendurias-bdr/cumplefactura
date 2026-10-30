// @ts-nocheck
import { FileCode2, FolderOpen, Plus, RefreshCw, Trash2 } from "lucide-react";
import { DataList, Pager } from "../components/lists";
import { cents, short } from "../lib/format";
import { PAGE_SIZE } from "../types";

export function AjustesSection(p: Record<string, any>) {
  return (
    <>
<section className="panel onboardingPanel"aria-label="Onboarding inicial">
              <div className="editorTop">
                <div>
                  <h2>Onboarding inicial</h2>
                  <p>{p.appSettings?.onboarding_completed ? "Completado" : "Pendiente"} - empresa, fiscalidad, serie y carpeta export.</p>
                </div>
                <div className="stepBadges">
                  {p.onboardingSteps.map((step) => (
                    <span key={step.label} className={step.ok ? "ok" : ""}>{step.label}</span>
                  ))}
                </div>
              </div>
              <form className="onboardingForm" onSubmit={p.saveOnboarding}>
                <div className="pathField">
                  <label className="fieldBlock">
                    <span>Carpeta export</span>
                    <input
                      aria-label="Carpeta export"
                      value={p.exportDir}
                      onChange={(event) => p.setExportDir(event.target.value)}
                      readOnly
                      required />
                  </label>
                  <button type="button" className="linkButton" onClick={() => void p.pickExportDirectory()}>
                    <FolderOpen size={16} aria-hidden="true" />
                    Elegir carpeta
                  </button>
                </div>
                <fieldset className="flagGroup">
                  <legend>Fiscalidad local</legend>
                  <label><input type="checkbox" checked={p.defaultTerritoryFlags.includes("CommonTerritory")} onChange={(event) => p.toggleTerritoryFlag("CommonTerritory", event.target.checked)} /> Territorio comun</label>
                  <label><input type="checkbox" checked={p.defaultTerritoryFlags.includes("VeriFactu")} onChange={(event) => p.toggleTerritoryFlag("VeriFactu", event.target.checked)} /> VERI*FACTU local</label>
                  <label><input type="checkbox" checked={p.defaultTerritoryFlags.includes("Sii")} onChange={(event) => p.toggleTerritoryFlag("Sii", event.target.checked)} /> SII pendiente</label>
                </fieldset>
                <button className="primary" disabled={!p.onboardingReady}>Guardar onboarding</button>
              </form>
            </section>
<section className="panel split"><div>
<h2>Backup local</h2>
              <form className="backupForm pathForm" onSubmit={p.exportBackup}>
                <input aria-label="Ruta backup SQLite" value={p.backupPath} readOnly />
                <button type="button" className="linkButton" onClick={() => void p.pickSavePath("Backup SQLite", p.backupPath, ["sqlite3", "sqlite", "db"], p.setBackupPath)}>
                  <FolderOpen size={16} aria-hidden="true" />
                  Elegir backup
                </button>
                <button className="primary">Exportar SQLite</button>
              </form>
              <p>{p.backup ? `${p.backup.status} - ${p.backup.target_path}` : "Crea copia SQLite con VACUUM INTO."}</p>
<h2>Restore backup</h2>
              <form className="backupForm pathForm" onSubmit={p.restoreBackup}>
                <input aria-label="Ruta restore backup" value={p.restorePath} readOnly placeholder="Ruta .sqlite3/.db" />
                <button type="button" className="linkButton" onClick={() => void p.pickRestoreFile()}>
                  <FolderOpen size={16} aria-hidden="true" />
                  Elegir restore
                </button>
                <button className="primary" disabled={!p.restorePath}>Validar restore</button>
              </form>
              <p>{p.restore ? `${p.restore.status} - destructivo ${p.restore.destructive_restore_performed ? "SI" : "NO"} - ${p.restore.source_path}` : "Preflight local: valida origen, no reemplaza la base activa."}</p>
</div></section>
    
    </>
  );
}
