/**
 * Campos (design.md §7.3): Field (etiqueta encima + control + ayuda/error), Input, Select,
 * MoneyInput (mono, derecha, `€` al final) y DateInput (calendario nativo; se muestra dd/mm/aaaa).
 * Estado: `error` marca `aria-invalid` y pinta «✕ qué pasa y qué hacer» en --err-text.
 * Estructura: <div class="bdr-field"><label for>Etiqueta</label>{control}<span class="bdr-help">…</span></div>.
 * Los NIF, códigos y cantidades van en mono con `mono`.
 */
import { cloneElement, isValidElement, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";

type FieldProps = { label: ReactNode; help?: ReactNode; error?: string | null; wide?: boolean; children: ReactNode };

/** La etiqueta apunta al control con `htmlFor` (no lo envuelve): así su nombre accesible es solo
 *  la etiqueta, sin el valor del select ni el `€`. La ayuda se enlaza con `aria-describedby`. */
export function Field({ label, help, error, wide, children }: FieldProps) {
  const id = useId();
  const note = error ?? help;
  const control = isValidElement<{ id?: string; "aria-describedby"?: string }>(children)
    ? cloneElement(children, { id: children.props.id ?? id, "aria-describedby": note ? `${id}-nota` : undefined })
    : children;
  return (
    <div className={wide ? "bdr-field cf-wide" : "bdr-field"}>
      <label htmlFor={id}>{label}</label>
      {control}
      {error ? (
        <span className="bdr-help bdr-help--err" id={`${id}-nota`}>
          <span aria-hidden="true">✕ </span>
          {error}
        </span>
      ) : help ? (
        <span className="bdr-help" id={`${id}-nota`}>{help}</span>
      ) : null}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { mono?: boolean; invalid?: boolean };

export function Input({ mono, invalid, className, ...rest }: InputProps) {
  const classes = ["bdr-input", mono && "bdr-input--mono", className].filter(Boolean).join(" ");
  return <input {...rest} className={classes} aria-invalid={invalid || undefined} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={["bdr-select", className].filter(Boolean).join(" ")}>
      {children}
    </select>
  );
}

/** Importe en euros como texto (`1234,56`); el formato `1.234,56 €` se ve en tablas y totales. */
export function MoneyInput({ invalid, ...rest }: Omit<InputProps, "mono" | "type">) {
  return (
    <span className="cf-money">
      <input {...rest} className="bdr-input bdr-input--money" inputMode="decimal" aria-invalid={invalid || undefined} />
      <span className="cf-money__eur" aria-hidden="true">
        €
      </span>
    </span>
  );
}

/** Fecha ISO `AAAA-MM-DD`; el navegador la pinta con el locale es-ES (dd/mm/aaaa). */
export function DateInput(props: Omit<InputProps, "type" | "mono">) {
  return <input {...props} type="date" lang="es-ES" className="bdr-input bdr-input--mono" />;
}

/** Casilla con texto a la derecha (no es un Field: la etiqueta va al lado). */
export function Checkbox({ label, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: ReactNode }) {
  return (
    <label className="cf-check">
      <input type="checkbox" {...rest} />
      <span>{label}</span>
    </label>
  );
}
