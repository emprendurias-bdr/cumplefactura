/**
 * Button (design.md §7.1). Variantes primary (Menta, una por pantalla) · secondary · dark ·
 * ghost · danger (con ✕); tamaños sm 36 · md 44 · lg 52.
 * Estado: `loading` cambia el texto por el gerundio («Emitiendo…») y marca `aria-busy`;
 * deshabilitado con `reason` pinta el motivo al lado («Exportar XML · 2 errores»).
 * Estructura: <button class="bdr-btn bdr-btn--x"> y, si hay motivo, un <span> hermano.
 */
import type { ButtonHTMLAttributes } from "react";
import { Icon, type IconName } from "../components/Icon";

export type ButtonVariant = "primary" | "secondary" | "dark" | "ghost" | "danger";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  loadingText?: string;
  reason?: string | null;
  icon?: IconName;
};

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  loadingText,
  reason,
  icon,
  disabled,
  className,
  children,
  type = "button",
  ...rest
}: Props) {
  const classes = ["bdr-btn", `bdr-btn--${variant}`, size !== "md" && `bdr-btn--${size}`, className].filter(Boolean).join(" ");
  const shownIcon: IconName | undefined = variant === "danger" ? "x" : icon;
  const button = (
    <button {...rest} type={type} className={classes} disabled={disabled || loading} aria-busy={loading || undefined}>
      {loading ? <span className="cf-spinner" aria-hidden="true" /> : shownIcon ? <Icon name={shownIcon} /> : null}
      {loading && loadingText ? loadingText : children}
    </button>
  );
  if (!disabled || !reason) return button;
  return (
    <span className="cf-btn-reason">
      {button}
      <span className="cf-reason">{reason}</span>
    </span>
  );
}
