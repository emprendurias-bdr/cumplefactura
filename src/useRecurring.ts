/**
 * Facturas recurrentes (F4, ESPEC §5.4): plantillas que preparan un BORRADOR por periodo.
 * Nunca se emite nada sola. `recurring_generate_due` se llama al abrir la app (cuando hay
 * empresa) y con «Generar ahora»; Rust garantiza un borrador por plantilla y periodo.
 * Estado: plantillas, borradores pendientes de emitir y `available` (comando aún no existe →
 * EmptyState explicativo).
 */
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { t } from "./i18n/es";
import { isMissingCommand } from "./lib/tauri";
import type { InvoiceSummary, RecurringGenerateResult, RecurringInput, RecurringInvoice, RecurringRun } from "./types";
import { toast } from "./ui/Toast";
import { action, run, type Model } from "./useCumpleFactura";

export function useRecurring(m: Model) {
  const [items, setItems] = useState<RecurringInvoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [pendingDrafts, setPendingDrafts] = useState<number | null>(null);
  const generatedFor = useRef<string | null>(null);
  const companyId = m.company?.id ?? null;

  async function load() {
    if (!companyId) return;
    setLoading(true);
    try {
      setItems(await invoke<RecurringInvoice[]>("recurring_list", { companyId }));
      setAvailable(true);
      const drafts = await invoke<InvoiceSummary[]>("invoice_list", {
        filters: { company_id: companyId, customer_id: null, fiscal_year: null, series: null, status: "Draft", kind: null, search: null },
        pagination: { limit: 500, offset: 0 },
      });
      setPendingDrafts(drafts.length);
    } catch (error) {
      if (isMissingCommand(error)) setAvailable(false);
    } finally {
      setLoading(false);
    }
  }

  /** Prepara los borradores vencidos. `quiet`: al abrir la app solo avisa si creó alguno. */
  async function generateDue(quiet = false) {
    try {
      const result = await invoke<RecurringGenerateResult>("recurring_generate_due", { today: null });
      if (result.created.length > 0) {
        toast(t("recurrentes.preparados", { n: result.created.length }), "ok", { label: t("recurrentes.verBorradores"), run: () => (location.hash = "#/facturas") });
        await m.refreshData();
      } else if (!quiet) toast(t("recurrentes.nadaPendiente"), "info");
      await load();
    } catch (error) {
      if (isMissingCommand(error)) setAvailable(false);
      else if (!quiet) await run(() => Promise.reject(error)).catch(() => undefined);
    }
  }

  useEffect(() => {
    if (!companyId || generatedFor.current === companyId) return;
    generatedFor.current = companyId;
    void generateDue(true);
  }, [companyId]);

  const save = action(t("ok.plantilla"), (input: RecurringInput) => invoke<RecurringInvoice>("recurring_save", { input }), load);
  const setActive = action(
    null,
    (id: string, active: boolean) => invoke<RecurringInvoice>("recurring_set_active", { id, active }),
    async (saved) => {
      toast(saved.active ? t("ok.plantillaActiva") : t("ok.plantillaPausada"), "ok");
      await load();
    },
  );
  const remove = action(t("ok.plantillaBorrada"), (id: string) => invoke<null>("recurring_delete", { id }), load);

  /** Próximas fechas e importes; con `input` sirve antes de guardar (ESPEC §5.4.1). */
  async function preview(id: string | null, input: RecurringInput | null, count = 3): Promise<RecurringRun[]> {
    try {
      return await invoke<RecurringRun[]>("recurring_preview", { id, count, input });
    } catch {
      return [];
    }
  }

  return { items, loading, available, pendingDrafts, load, generateDue, save, setActive, remove, preview };
}

export type Recurring = ReturnType<typeof useRecurring>;
