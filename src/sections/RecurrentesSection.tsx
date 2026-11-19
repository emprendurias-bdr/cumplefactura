/**
 * Recurrentes `#/recurrentes` (ESPEC §5.4 y §6): plantillas que preparan un borrador por periodo.
 * StatCard «Borradores pendientes de emitir» · tabla Plantilla · Cliente · Frecuencia · Próxima
 * fecha · Importe · Estado · ⋯ (Editar, Pausar/Reanudar, Borrar con confirmación). «Generar ahora»
 * repite lo que se hace al abrir la app. Sin comandos en Rust → EmptyState explicativo.
 */
import { useEffect, useState } from "react";
import { t } from "../i18n/es";
import { isoDate } from "../lib/invoiceDate";
import { formatCents } from "../lib/moneyFormat";
import { periodLabel } from "../lib/periods";
import { href } from "../lib/routes";
import { go } from "../shell/useRoute";
import type { RecurringInvoice } from "../types";
import { Button } from "../ui/Button";
import { StatCard } from "../ui/Card";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { DataTable } from "../ui/DataTable";
import { EmptyState } from "../ui/EmptyState";
import { Accent, Hero } from "../ui/Hero";
import { Skeleton, useDelayedLoading } from "../ui/Skeleton";
import { recurringStatus } from "../ui/status";
import { StatusChip } from "../ui/StatusChip";
import { customerName, type Ctx } from "./ctx";
import { RecurrenteEditor } from "./RecurrenteEditor";

export function RecurrentesSection(c: Ctx) {
  // La clave rehace el formulario cuando llega la lista (entrada directa por URL).
  if (c.route.id) return <RecurrenteEditor key={`${c.route.id}-${c.rec.items.length}`} {...c} />;
  return <RecurringList {...c} />;
}

function RecurringList({ m, rec }: Ctx) {
  const [toDelete, setToDelete] = useState<RecurringInvoice | null>(null);
  const skeleton = useDelayedLoading(rec.loading && rec.items.length === 0);
  useEffect(() => {
    void rec.load();
  }, [m.company?.id]);
  const open = (row: RecurringInvoice) => go(href({ section: "recurrentes", id: row.id }));
  const unavailable = rec.available === false;

  return (
    <>
      <Hero
        plain
        label={`${t("nav.recurrentes")} · ${t("recurrentes.etiqueta")}`}
        title={<>{t("recurrentes.titulo")} <Accent>{t("recurrentes.recurrentes")}</Accent></>}
        secondary={unavailable ? undefined : <Button icon="refresh" onClick={() => void rec.generateDue()}>{t("recurrentes.generar")}</Button>}
        primary={unavailable ? undefined : <a className="bdr-btn bdr-btn--primary" href="#/recurrentes/nueva">{t("recurrentes.nueva")}</a>}
      />
      {unavailable ? (
        <EmptyState title={t("recurrentes.proximamenteTitulo")} text={t("recurrentes.proximamente")} />
      ) : (
        <>
          <div className="cf-grid-3">
            <StatCard
              value={rec.pendingDrafts ?? "—"}
              text={t("recurrentes.pendientes")}
              extra={<a className="bdr-btn bdr-btn--ghost bdr-btn--sm" href="#/facturas">{t("recurrentes.verBorradores")}</a>}
            />
            <StatCard value={rec.items.filter((item) => item.active).length} text={t("recurrentes.activas")} />
          </div>
          {skeleton ? (
            <Skeleton />
          ) : rec.items.length === 0 ? (
            <EmptyState text={t("recurrentes.vacio")} action={<a className="bdr-btn bdr-btn--secondary" href="#/recurrentes/nueva">{t("recurrentes.nueva")}</a>} />
          ) : (
            <DataTable
              label={t("nav.recurrentes")}
              rows={rec.items}
              rowKey={(row) => row.id}
              onOpen={open}
              rowActions={(row) => [
                { label: t("comun.editar"), onSelect: () => open(row) },
                { label: row.active ? t("recurrentes.pausar") : t("recurrentes.reanudar"), onSelect: () => void rec.setActive(row.id, !row.active) },
                { label: t("recurrentes.borrar"), danger: true, onSelect: () => setToDelete(row) },
              ]}
              columns={[
                { key: "label", header: t("recurrentes.plantilla"), cell: (row) => row.label },
                { key: "cliente", header: t("facturas.cliente"), cell: (row) => customerName(m, row.customer_id) },
                { key: "freq", header: t("recurrentes.frecuencia"), cell: (row) => t(`frecuencia.${row.frequency}`) },
                { key: "proxima", header: t("recurrentes.proxima"), cell: (row) => <span className="m">{isoDate(row.next_run_date)}</span> },
                { key: "ultimo", header: t("recurrentes.ultimo"), cell: (row) => periodLabel(row.last_period_key) },
                { key: "importe", header: t("recurrentes.importe"), num: true, cell: (row) => formatCents(row.total_cents) },
                { key: "estado", header: t("facturas.estado"), cell: (row) => <StatusChip status={recurringStatus(row.active)} /> },
              ]}
            />
          )}
        </>
      )}
      <ConfirmDialog
        open={toDelete !== null}
        title={t("recurrentes.borrarTitulo", { nombre: toDelete?.label ?? "" })}
        consequences={[t("recurrentes.borrarC1"), t("recurrentes.borrarC2")]}
        irreversible={t("recurrentes.borrarIrreversible")}
        verb={t("recurrentes.borrar")}
        danger
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          if (toDelete) await rec.remove(toDelete.id);
          setToDelete(null);
        }}
      />
    </>
  );
}
