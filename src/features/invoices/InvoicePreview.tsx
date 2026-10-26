import { useEffect, useState } from "react";
import { invoke } from "../../shared/tauri";
import { useWorkspaceState } from "../../shared/context";
import { cents, eurosToCents } from "../../shared/forms";
export function InvoicePreview() {
  const s = useWorkspaceState();
  const invoiceId = s.issued?.invoice.id ?? s.draft?.id;
  const [pdf, setPdf] = useState<{ invoiceId: string; url: string } | null>(
    null,
  );
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | undefined;
    setError("");
    if (!invoiceId || !("__TAURI_INTERNALS__" in window)) return;
    void invoke<number[]>("invoice_pdf_preview", { invoiceId })
      .then((bytes) => {
        if (cancelled) return;
        if (
          bytes.length > 2 * 1024 * 1024 ||
          String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-"
        )
          throw new Error("El motor no ha devuelto un PDF válido.");
        objectUrl = URL.createObjectURL(
          new Blob([Uint8Array.from(bytes)], { type: "application/pdf" }),
        );
        setPdf({ invoiceId, url: objectUrl });
      })
      .catch(() => {
        if (!cancelled)
          setError(
            "No se ha podido cargar el PDF. Puedes intentar exportarlo desde Ajustes.",
          );
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [invoiceId]);
  const currentPdf = pdf?.invoiceId === invoiceId ? pdf : null;
  return (
    <aside className="invoice-preview" aria-label="Vista previa de la factura">
      <p className="eyebrow">
        {currentPdf
          ? "PDF del documento guardado"
          : "Vista previa de datos · provisional"}
      </p>
      {currentPdf ? (
        <iframe
          className="native-pdf"
          title="PDF de la factura guardada"
          src={currentPdf.url}
        />
      ) : (
        <>
          <div className="invoice-paper">
            <header>
              <strong>{s.company?.legal_name || "Tu empresa"}</strong>
              <span>FACTURA</span>
            </header>
            <p className="bdr-mono">
              NIF {s.company?.tax_id || "por completar"} ·{" "}
              {s.issued
                ? `${s.issued.invoice.series}-${s.issued.invoice.number}`
                : "n.º por asignar"}
            </p>
            <h3>{s.customer?.display_name || "Elige un cliente"}</h3>
            <p className="bdr-mono">
              NIF {s.customer?.tax_id || "por completar"}
            </p>
            <table>
              <caption className="sr-only">Líneas de la vista previa</caption>
              <thead>
                <tr>
                  <th scope="col">Descripción</th>
                  <th scope="col" className="numeric">
                    Cantidad
                  </th>
                  <th scope="col" className="numeric">
                    Precio unitario
                  </th>
                </tr>
              </thead>
              <tbody>
                {s.invoiceLines.map((line) => (
                  <tr key={line.id}>
                    <th scope="row">
                      {line.description || "Concepto por completar"}
                    </th>
                    <td className="numeric bdr-mono">{line.quantity}</td>
                    <td className="numeric bdr-mono">
                      {cents(eurosToCents(line.unit_price_euros))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="invoice-totals">
              <dt>Base imponible</dt>
              <dd>{cents(s.invoiceTotals.taxable_base_cents)}</dd>
              <dt>IVA</dt>
              <dd>{cents(s.invoiceTotals.tax_cents)}</dd>
              <dt>IRPF</dt>
              <dd>{cents(s.invoiceTotals.withholding_cents)}</dd>
              <dt>Total provisional</dt>
              <dd>{cents(s.invoiceTotals.total_cents)}</dd>
            </dl>
            <p className="qr-notice">
              QR VERI*FACTU: reservado para el documento fiscal. Esta vista no
              contiene un QR válido.
            </p>
          </div>
        </>
      )}
      {error && (
        <p role="status" className="preview-limit">
          {error}
        </p>
      )}
      <p className="preview-limit">
        {currentPdf
          ? "PDF generado por el motor actual; todavía no incorpora QR VERI*FACTU."
          : "Guarda el borrador para consultar su PDF. Al editar se invalida el documento anterior. Rust confirma los importes al guardar y emitir."}
      </p>
    </aside>
  );
}
