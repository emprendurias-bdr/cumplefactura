/**
 * ChainChip (design.md §10, CumpleFactura): integridad de la cadena de registros en la barra
 * superior. Usa el último resultado de `fiscal_chain_verify` ya cargado; no lanza verificación
 * sola. ✓ CADENA ÍNTEGRA · ✕ CON INCIDENCIAS · N · — SIN REGISTROS · — SIN COMPROBAR. Clic → Verifactu.
 */
import { href } from "../lib/routes";
import type { FiscalChainVerification } from "../types";
import { chainStatus } from "../ui/status";
import { StatusChip } from "../ui/StatusChip";
import { t } from "../i18n/es";

export function ChainChip({ chain }: { chain: FiscalChainVerification | null }) {
  return (
    <a className="cf-chainchip" href={href({ section: "verifactu" })} title={t("cadena.ayuda")}>
      <StatusChip status={chainStatus(chain?.valid, chain?.total_records)} detail={chain && !chain.valid ? chain.issue_count : undefined} />
    </a>
  );
}
