/**
 * SendingChip (S3): entorno de envío a la AEAT en la barra superior, junto al chip de cadena.
 * PRUEBAS · PRODUCCIÓN, con «· envío apagado» si el envío real no está encendido.
 * Lee los ajustes guardados, no el formulario. Clic → Ajustes › Fiscalidad.
 */
import { t } from "../i18n/es";
import { href } from "../lib/routes";
import { sendingStatus } from "../ui/status";
import { StatusChip } from "../ui/StatusChip";

export function SendingChip({ environment, enabled }: { environment: "test" | "production"; enabled: boolean }) {
  return (
    <a className="cf-chainchip" href={href({ section: "ajustes", tab: "fiscalidad" })} title={t("envioEstado.ayuda")}>
      <StatusChip status={sendingStatus(environment, enabled)} detail={enabled ? undefined : t("envioEstado.apagado")} />
    </a>
  );
}
