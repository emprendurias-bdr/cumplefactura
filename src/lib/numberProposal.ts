/**
 * «Se numerará A-129 al emitir»: solo con la vista previa de Rust de la misma empresa, serie y
 * ejercicio. Rust reserva el número de verdad al emitir. Rescatado de fase-2.
 */
import type { NextNumberPreview } from "../types";

export function numberProposal(
  preview: NextNumberPreview | null,
  scope: { companyId?: string; series: string; fiscalYear: number },
): string | null {
  if (
    !preview ||
    preview.company_id !== scope.companyId ||
    preview.series !== scope.series ||
    preview.fiscal_year !== scope.fiscalYear ||
    !Number.isSafeInteger(preview.next_number) ||
    preview.next_number <= 0
  )
    return null;
  return `${preview.series}-${preview.next_number}`;
}

/** Número visible de una factura: `A-12`, o null si aún es borrador. */
export function invoiceNumber(invoice: { series: string; number?: number | null }): string | null {
  return invoice.number != null && invoice.number > 0 ? `${invoice.series}-${invoice.number}` : null;
}
