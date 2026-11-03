/**
 * Documentos comerciales (F4, ESPEC §4): presupuestos, proformas y albaranes. Ninguno es fiscal:
 * no tocan series de factura, registros ni la cadena. Convertir crea un BORRADOR de factura que
 * se emite con la confirmación de siempre.
 * Estado: lista y total de la pestaña activa, y `available`: si Rust aún no tiene los comandos,
 * la pantalla enseña el EmptyState explicativo en vez de botones que no funcionan.
 */
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { t } from "./i18n/es";
import { isMissingCommand } from "./lib/tauri";
import type {
  CommercialDocument,
  CommercialDocumentInput,
  CommercialDocumentSummary,
  CommercialKind,
  CommercialStatus,
  Invoice,
} from "./types";
import { action, need, run, type Model } from "./useCumpleFactura";

export function useDocuments(m: Model) {
  const [items, setItems] = useState<CommercialDocumentSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [current, setCurrent] = useState<CommercialDocument | null>(null);

  async function load(kind: CommercialKind, status = "") {
    if (!m.company) return;
    setLoading(true);
    try {
      const result = await invoke<{ items: CommercialDocumentSummary[]; total: number }>("commercial_document_list", {
        filters: { company_id: m.company.id, kind, status: status || null, customer_id: null, year: null },
        pagination: { limit: 200, offset: 0 },
      });
      setItems(result.items);
      setTotal(result.total);
      setAvailable(true);
    } catch (error) {
      if (isMissingCommand(error)) setAvailable(false);
      else await run(() => Promise.reject(error)).catch(() => undefined);
    } finally {
      setLoading(false);
    }
  }

  async function open(id: string) {
    setCurrent(null);
    try {
      setCurrent(await run(() => invoke<CommercialDocument>("commercial_document_get", { id })));
    } catch {
      // El toast ya dijo qué pasa.
    }
  }

  const keep = async (doc: CommercialDocument) => {
    setCurrent(doc);
    await load(doc.kind);
  };

  /** Devuelve el documento guardado (o null) para que el editor pase de «nuevo» a su ficha. */
  async function saveDraft(input: CommercialDocumentInput) {
    try {
      const doc = await run(() => invoke<CommercialDocument>("commercial_document_save_draft", { input }), t("ok.documentoGuardado"));
      await keep(doc);
      return doc;
    } catch {
      return null;
    }
  }
  const send = action(t("ok.documentoEnviado"), (id: string) => invoke<CommercialDocument>("commercial_document_send", { id }), keep);
  const setStatus = action(
    t("ok.documentoEstado"),
    (id: string, status: CommercialStatus, reason: string | null) =>
      invoke<CommercialDocument>("commercial_document_set_status", { id, status, reason }),
    keep,
  );
  const derive = action(
    t("ok.documentoDerivado"),
    (id: string, targetKind: CommercialKind) => invoke<CommercialDocument>("commercial_document_derive", { id, targetKind }),
    keep,
  );
  const removeDraft = action(t("ok.documentoBorrado"), async (doc: CommercialDocumentSummary) => {
    await invoke("commercial_document_delete_draft", { id: doc.id });
    setCurrent(null);
    await load(doc.kind);
  });
  const savePdf = action(t("ok.pdf"), (id: string) =>
    invoke<{ target_path: string; sha256: string }>("commercial_document_pdf", { id, targetPath: m.paths.pdf }),
  );

  /** Uno o varios albaranes → borrador de factura, que se abre en el editor. */
  const toInvoiceDraft = action(
    t("ok.convertido"),
    (ids: string[]) => invoke<Invoice>("commercial_document_to_invoice_draft", { ids: need(ids.length ? ids : null, t("error.sinSeleccion")) }),
    async (invoice) => {
      m.openDraft(invoice);
      await m.refreshData();
    },
  );

  return { items, total, loading, available, current, load, open, saveDraft, send, setStatus, derive, removeDraft, savePdf, toInvoiceDraft };
}

export type Documents = ReturnType<typeof useDocuments>;
