/**
 * Ajustes › Avanzado: exportaciones de datos (CSV del listado, auditoría fiscal) y, plegado en
 * «Herramientas técnicas», dónde guarda la app sus datos y las rutas de cada exportación.
 */
import { t } from "../../i18n/es";
import type { PathKey } from "../../types";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { Field, Input } from "../../ui/Field";
import type { Ctx } from "../ctx";

const PATHS: { key: PathKey; ext: string[] }[] = [
  { key: "pdf", ext: ["pdf"] },
  { key: "json", ext: ["json"] },
  { key: "csv", ext: ["csv"] },
  { key: "audit", ext: ["json"] },
];

export function AjustesAvanzado({ m }: Ctx) {
  return (
    <>
      <Card title={t("avanzado.exportar")}>
        <p className="bdr-small">{t("avanzado.exportarAyuda")}</p>
        <div className="cf-row">
          <Button variant="primary" icon="download" onClick={() => void m.exportCsv()} disabled={m.invoices.length === 0} reason={m.invoices.length === 0 ? t("avanzado.sinFacturas") : null}>
            {t("facturas.exportarCsv")}
          </Button>
          <Button icon="download" onClick={() => void m.exportFiscalAudit()} disabled={m.audit.length === 0 && m.fiscalRecords.length === 0}>
            {t("tecnico.exportarAuditoria")}
          </Button>
        </div>
      </Card>
      <details className="cf-tech bdr-card">
        <summary className="bdr-h2">{t("tecnico.titulo")}</summary>
        <div className="cf-form-grid">
          <Field label={t("tecnico.datosApp")}>
            <Input mono value={m.appDefaults?.app_data_dir ?? ""} readOnly />
          </Field>
          <Field label={t("tecnico.carpeta")}>
            <Input mono value={m.exportDir} readOnly />
          </Field>
          {PATHS.map(({ key, ext }) => (
            <Field key={key} label={t(`tecnico.ruta.${key}`)}>
              <span className="cf-row">
                <Input mono value={m.paths[key]} readOnly aria-label={t(`tecnico.ruta.${key}`)} />
                <Button size="sm" icon="folderOpen" onClick={() => void m.pickSavePath(t(`tecnico.ruta.${key}`), key, ext)}>{t("comun.elegir")}</Button>
              </span>
            </Field>
          ))}
        </div>
        <dl className="cf-dl cf-dl--mono">
          <dt>{t("tecnico.ultimoCsv")}</dt>
          <dd>{m.csvResult ? `${m.csvResult.status} · ${m.csvResult.target_path}` : "—"}</dd>
          <dt>{t("tecnico.ultimoJson")}</dt>
          <dd>{m.jsonResult ? `${m.jsonResult.status} · ${m.jsonResult.target_path}` : "—"}</dd>
          <dt>{t("tecnico.ultimoPdf")}</dt>
          <dd>{m.pdfResult ?? "—"}</dd>
          <dt>{t("tecnico.notas")}</dt>
          <dd>{m.appDefaults?.notes.join(" · ") || "—"}</dd>
        </dl>
      </details>
    </>
  );
}
