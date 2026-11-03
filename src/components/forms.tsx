/** Piezas de formulario repetidas: campo de texto con etiqueta y formulario de ruta de exportación. */
import type { FormEvent, ReactNode } from "react";
import type { PathKey } from "../types";
import type { Model } from "../useCumpleFactura";
import { Icon } from "./Icon";

export type Field<K> = {
  key: K;
  label: string;
  aria: string;
  wide?: boolean;
  upper?: boolean;
  decimal?: boolean;
  required?: boolean;
};

/** `<label>` + `<input>` controlado; `upper` pasa el valor a mayúsculas. */
export function TextField<K extends string>({
  field,
  value,
  onChange,
}: {
  field: Field<K>;
  value: string;
  onChange: (key: K, value: string) => void;
}) {
  return (
    <label className={field.wide ? "fieldBlock wide" : "fieldBlock"}>
      <span>{field.label}</span>
      <input
        aria-label={field.aria}
        required={field.required}
        inputMode={field.decimal ? "decimal" : undefined}
        value={value}
        onChange={(event) => onChange(field.key, field.upper ? event.target.value.toUpperCase() : event.target.value)}
      />
    </label>
  );
}

/**
 * Ruta de solo lectura + botón "Elegir…" (diálogo nativo) + botón de acción, y debajo
 * el resultado o la explicación. Las rutas se eligen siempre con el diálogo del sistema.
 */
export function PathForm({
  p,
  pathKey,
  title,
  extensions,
  aria,
  pickLabel,
  submitLabel,
  onSubmit,
  disabled,
  onPick,
  placeholder,
  result,
}: {
  p: Model;
  pathKey: PathKey;
  title: string;
  extensions: string[];
  aria: string;
  pickLabel: string;
  submitLabel: string;
  onSubmit: (event: FormEvent) => void;
  disabled?: boolean;
  onPick?: () => void;
  placeholder?: string;
  result: ReactNode;
}) {
  return (
    <>
      <form className="backupForm pathForm" onSubmit={onSubmit}>
        <input aria-label={aria} value={p.paths[pathKey]} readOnly placeholder={placeholder} />
        <button
          type="button"
          className="linkButton"
          onClick={() => (onPick ? onPick() : void p.pickSavePath(title, pathKey, extensions))}
        >
          <Icon name="folderOpen" />
          {pickLabel}
        </button>
        <button className="primary" disabled={disabled}>
          {submitLabel}
        </button>
      </form>
      <p>{result}</p>
    </>
  );
}
