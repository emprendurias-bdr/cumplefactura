/**
 * Ajustes › Copias (F3.4). Crear copia de seguridad (acción principal). Restaurar en dos pasos:
 * «Validar copia» (solo comprueba, `confirm = false`) y «Restaurar copia», que pasa por
 * ConfirmDialog con «Lo entiendo» (el contrato no guarda motivo): Rust guarda una copia previa, sustituye la base, migra, verifica la
 * cadena y vuelve atrás si algo falla. El resultado se dice tal cual: validada, restaurada o deshecha.
 */
import { useState } from "react";
import { t } from "../../i18n/es";
import type { BackupRestoreResult } from "../../types";
import { Button } from "../../ui/Button";
import { Callout } from "../../ui/Callout";
import { Card } from "../../ui/Card";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { Field, Input } from "../../ui/Field";
import type { Ctx } from "../ctx";

const fileName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? "";

function RestoreResult({ result }: { result: BackupRestoreResult }) {
  if (result.status === "restored")
    return (
      <Callout tone={result.chain_ok === false ? "warn" : "ok"} live title={t("copias.restaurada")}>
        {result.chain_ok === false ? t("copias.cadenaIncidencias") : t("copias.cadenaOk")}
      </Callout>
    );
  if (result.status === "rolled_back") return <Callout tone="err" live title={t("copias.deshechaTitulo")}>{t("copias.deshecha")}</Callout>;
  return <Callout tone="info" live title={t("copias.validadaTitulo")}>{t("copias.validada")}</Callout>;
}

export function AjustesCopias({ m }: Ctx) {
  const [confirming, setConfirming] = useState(false);
  const validated = m.restore?.status === "validated-only" && m.restore.source_path === m.paths.restore;

  return (
    <>
      <Card title={t("copias.crearTitulo")}>
        <p className="bdr-small">{t("copias.crearAyuda")}</p>
        <div className="cf-row">
          <Button variant="primary" onClick={() => void m.exportBackup()}>{t("copias.crear")}</Button>
        </div>
        {m.backup ? <Callout tone="ok" live title={t("copias.creada")}>{fileName(m.backup.target_path)}</Callout> : null}
      </Card>

      <Card title={t("copias.restaurarTitulo")}>
        <p className="bdr-small">{t("copias.restaurarAyuda")}</p>
        <div className="cf-row">
          <Button icon="folderOpen" onClick={() => void m.pickRestoreFile()}>{t("copias.elegir")}</Button>
          <span className="m bdr-small">{fileName(m.paths.restore) || t("copias.sinElegir")}</span>
        </div>
        <div className="cf-row">
          <Button onClick={() => void m.restoreBackup(false)} disabled={!m.paths.restore} reason={m.paths.restore ? null : t("copias.motivoElegir")}>
            {t("copias.validar")}
          </Button>
          <Button variant="danger" onClick={() => setConfirming(true)} disabled={!validated} reason={validated ? null : t("copias.motivoValidar")}>
            {t("copias.restaurar")}
          </Button>
        </div>
        {m.restore ? <RestoreResult result={m.restore} /> : null}
      </Card>

      <details className="cf-tech bdr-card">
        <summary className="bdr-h2">{t("tecnico.titulo")}</summary>
        <div className="cf-form-grid">
          <Field label={t("tecnico.rutaCopia")}>
            <span className="cf-row">
              <Input mono value={m.paths.backup} readOnly aria-label={t("tecnico.rutaCopia")} />
              <Button size="sm" icon="folderOpen" onClick={() => void m.pickSavePath(t("tecnico.rutaCopia"), "backup", ["sqlite3", "sqlite", "db"])}>{t("comun.elegir")}</Button>
            </span>
          </Field>
          <Field label={t("tecnico.rutaRestaurar")}>
            <Input mono value={m.paths.restore} readOnly />
          </Field>
        </div>
        {m.restore ? (
          <dl className="cf-dl cf-dl--mono">
            <dt>{t("tecnico.estado")}</dt>
            <dd>{m.restore.status}</dd>
            <dt>{t("tecnico.copiaPrevia")}</dt>
            <dd>{m.restore.safety_backup_path ?? "—"}</dd>
            <dt>{t("tecnico.notas")}</dt>
            <dd>{m.restore.notes.join(" · ") || "—"}</dd>
          </dl>
        ) : null}
      </details>

      <ConfirmDialog
        open={confirming}
        title={t("copias.confirmTitulo", { archivo: fileName(m.paths.restore) })}
        consequences={[t("copias.c1"), t("copias.c2"), t("copias.c3"), t("copias.c4")]}
        irreversible={t("copias.irreversible")}
        verb={t("copias.restaurar")}
        danger
        acknowledge
        loadingText={t("copias.restaurando")}
        onCancel={() => setConfirming(false)}
        onConfirm={async () => {
          await m.restoreBackup(true);
          setConfirming(false);
        }}
      />
    </>
  );
}
