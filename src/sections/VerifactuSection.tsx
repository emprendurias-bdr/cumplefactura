/**
 * Verifactu (UX_UI.md §Pantallas 4, maquetas 4–5). Hero «Estado fiscal» con «Comprobar integridad».
 * Un solo aviso honesto: esta versión no envía sola ni tiene cola; envías tú y reintentas tú.
 * Factura elegida + sus 5 pasos; envío (VerifactuEnvio); envíos a la AEAT (F3, con «Reintentar»
 * para los «Sin confirmar»); cadena de registros; conexión y certificado (caducidad leída en la
 * comprobación previa). Lo técnico va dentro de «Herramientas técnicas» (VerifactuTecnico).
 */
import { envLabel, t } from "../i18n/es";
import { invoiceDate, isoDate, timeOf } from "../lib/invoiceDate";
import { short } from "../lib/format";
import { invoiceNumber } from "../lib/numberProposal";
import { Button } from "../ui/Button";
import { Callout } from "../ui/Callout";
import { Card } from "../ui/Card";
import { DataTable } from "../ui/DataTable";
import { Field, Select } from "../ui/Field";
import { Accent, Hero } from "../ui/Hero";
import { chainStatus, expiryStatus, preflightStatus, recordType, submissionStatus } from "../ui/status";
import { StatusChip } from "../ui/StatusChip";
import { Stepper } from "../ui/Stepper";
import { customerName, invoiceProgress, type Ctx } from "./ctx";
import { VerifactuEnvio } from "./VerifactuEnvio";
import { VerifactuTecnico } from "./VerifactuTecnico";

export function VerifactuSection(c: Ctx) {
  const { m, vf } = c;
  const invoice = vf.selected;
  const progress = invoice ? invoiceProgress(c, invoice) : null;
  const number = (id: string) => {
    const found = m.invoices.find((item) => item.id === id);
    return found ? (invoiceNumber(found) ?? "—") : "—";
  };
  const lastPreflight = vf.submitPreflight;
  const latest = vf.submissions[0];

  return (
    <>
      <Hero
        label={`${t("nav.verifactu")} · ${m.company?.legal_name ?? t("contexto.sinEmpresa")} · ${t("vf.modo")}`}
        title={
          <>
            {t("vf.estado")} <Accent>{t("vf.fiscal")}</Accent>
          </>
        }
        chip={<StatusChip status={chainStatus(m.fiscalChain?.valid, m.fiscalChain?.total_records)} />}
        secondary={<Button icon="refresh" onClick={() => void m.verifyFiscalChain()}>{t("vf.comprobarIntegridad")}</Button>}
      />
      <Callout tone="info" title={t("vf.avisoTitulo")}>{t("vf.aviso")}</Callout>

      <Card>
        <div className="cf-form-grid">
          <Field label={t("vf.factura")}>
            <Select value={vf.selectedId} onChange={(e) => vf.selectInvoice(e.target.value)} disabled={vf.issuedInvoices.length === 0}>
              {vf.issuedInvoices.length === 0 ? <option value="">{t("vf.sinEmitidas")}</option> : null}
              {vf.issuedInvoices.map((item) => (
                <option key={item.id} value={item.id}>
                  {invoiceNumber(item)} · {customerName(m, item.customer_id)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {invoice && progress ? (
          <>
            <Stepper steps={progress.labeled} label={t("ficha.estadoFiscal")} />
            <p className="bdr-small">
              {t(`progreso.${progress.summary}`)}
              {progress.csv ? <> · {t("ficha.csv")} <span className="m">{progress.csv}</span></> : null} · {t("vf.sinFirma")}
            </p>
          </>
        ) : null}
      </Card>

      <VerifactuEnvio {...c} />

      <Card title={t("vf.envios")}>
        {!vf.submissionsAvailable ? <p className="bdr-small bdr-muted">{t("vf.enviosSoloSesion")}</p> : null}
        {vf.submissions.length === 0 ? (
          <p className="bdr-small bdr-muted">{t("vf.sinEnvios")}</p>
        ) : (
          <DataTable
            label={t("vf.envios")}
            rows={vf.submissions}
            rowKey={(row) => row.id}
            columns={[
              { key: "fecha", header: t("facturas.fecha"), cell: (row) => <span className="m">{invoiceDate(row.submitted_at)} {timeOf(row.submitted_at)}</span> },
              { key: "factura", header: t("vf.factura"), cell: (row) => <span className="m">{number(row.invoice_id)}</span> },
              { key: "entorno", header: t("vf.entorno"), cell: (row) => envLabel(row.endpoint_name) },
              { key: "estado", header: t("facturas.estado"), cell: (row) => <StatusChip status={submissionStatus(row.status)} /> },
              { key: "csv", header: t("vf.csv"), cell: (row) => <span className="m">{row.csv ?? "—"}</span> },
              {
                key: "accion",
                header: "",
                cell: (row) =>
                  row.status === "transport_error" ? (
                    <Button size="sm" variant="dark" onClick={() => void vf.retry(row)} disabled={!vf.canRetry(row)} reason={vf.canRetry(row) ? null : t("vf.reintentarMotivo")}>
                      {t("envio.reintentar")}
                    </Button>
                  ) : null,
              },
            ]}
          />
        )}
      </Card>

      <div className="cf-grid-2">
        <Card title={t("vf.cadena")}>
          {m.fiscalRecords.length === 0 ? (
            <p className="bdr-small bdr-muted">{t("vf.sinRegistros")}</p>
          ) : (
            <DataTable
              label={t("vf.cadena")}
              rows={m.fiscalRecords}
              rowKey={(row) => row.id}
              columns={[
                { key: "n", header: t("facturas.numero"), cell: (row) => <span className="m">{number(row.invoice_id)}</span> },
                { key: "tipo", header: t("vf.tipo"), cell: (row) => <StatusChip status={recordType(row.record_type)} /> },
                { key: "huella", header: t("vf.huella"), cell: (row) => <span className="m" title={row.fiscal_hash}>{short(row.fiscal_hash)}</span> },
                {
                  key: "envio",
                  header: t("vf.envio"),
                  cell: (row) => <StatusChip status={submissionStatus(vf.submissions.find((s) => s.invoice_id === row.invoice_id)?.status)} />,
                },
                {
                  key: "integridad",
                  header: t("vf.integridad"),
                  cell: (row) => <StatusChip status={chainStatus(m.fiscalChain ? !m.fiscalChain.issues.some((i) => i.record_id === row.id) : null)} />,
                },
              ]}
            />
          )}
        </Card>
        <Card title={t("vf.conexion")}>
          <dl className="cf-dl">
            <dt>{t("vf.envioAeat")}</dt>
            <dd><StatusChip status={submissionStatus(latest?.status)} /></dd>
            <dt>{t("vf.comprobacion")}</dt>
            <dd><StatusChip status={preflightStatus(lastPreflight?.status)} /></dd>
            <dt>{t("vf.certificado")}</dt>
            <dd>
              {lastPreflight && lastPreflight.certificate_expires_in_days == null ? (
                <StatusChip status={lastPreflight.certificate_loaded ? { tone: "ok", label: "estado.cargado" } : { tone: "err", label: "estado.noCargado" }} />
              ) : <StatusChip
                status={expiryStatus(lastPreflight?.certificate_expires_in_days)}
                detail={lastPreflight?.certificate_expires_at ? t("vf.hasta", { fecha: isoDate(lastPreflight.certificate_expires_at.slice(0, 10)) }) : undefined}
              />}
            </dd>
            <dt>{t("vf.entorno")}</dt>
            <dd><span className="bdr-chip bdr-chip--neu">{envLabel(m.endpointName)}</span></dd>
            <dt>{t("vf.cola")}</dt>
            <dd><span className="bdr-chip bdr-chip--neu">— {t("vf.sinCola")}</span></dd>
            <dt>{t("vf.otros")}</dt>
            <dd><span className="bdr-chip bdr-chip--neu">— {t("vf.noDisponible")}</span></dd>
          </dl>
          <p className="bdr-small bdr-muted">{t("vf.certificadoAyuda")}</p>
        </Card>
      </div>

      <VerifactuTecnico {...c} />
      <Callout tone="neu" title={t("vf.limiteTitulo")}>{t("vf.limite")}</Callout>
    </>
  );
}
