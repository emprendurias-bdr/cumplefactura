import type { NextNumberPreview } from "./types";
/** Uses only a matching native sequence preview, with the native XML display format. */
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
