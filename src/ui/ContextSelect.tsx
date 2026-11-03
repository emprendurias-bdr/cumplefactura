/**
 * ContextSelect (design.md §7.13): selector de contexto de la barra superior (Empresa · Serie),
 * fondo --bg y radio 10 px. Cambiar de contexto no cambia de sección (la ruta no se toca).
 * Estructura: <label class="cf-ctx"><span class="bdr-label">Empresa</span><select class="bdr-ctx">.
 */
type Option = { value: string; label: string };

type Props = { label: string; value: string; options: Option[]; onChange: (value: string) => void; empty: string };

export function ContextSelect({ label, value, options, onChange, empty }: Props) {
  return (
    <label className="cf-ctx">
      <span className="bdr-label">{label}</span>
      <select className="bdr-ctx" value={value} onChange={(event) => onChange(event.target.value)} disabled={options.length === 0}>
        {options.length === 0 ? <option value="">{empty}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
