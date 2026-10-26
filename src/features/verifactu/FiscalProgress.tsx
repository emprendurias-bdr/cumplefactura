import type { FiscalProgressState } from "./progress";
export function FiscalProgress({
  state,
  compact = false,
}: {
  state: FiscalProgressState;
  compact?: boolean;
}) {
  return (
    <div
      className={`fiscal-progress ${compact ? "fiscal-progress--compact" : ""}`}
    >
      <ol aria-label="Cuatro pasos Verifactu">
        {state.steps.map((step, index) => (
          <li
            key={step.label}
            data-confirmed={step.confirmed}
            aria-label={`${index + 1}. ${step.label}: ${step.confirmed ? "confirmada" : "sin confirmar"}`}
          >
            <span className="fiscal-step-number" aria-hidden="true">
              {index + 1}
            </span>
            <span className={compact ? "sr-only" : ""}>{step.label}</span>
            {!compact && (
              <small>{step.confirmed ? "Confirmada" : "Sin confirmar"}</small>
            )}
          </li>
        ))}
      </ol>
      <span className="fiscal-progress-caption">{state.responseLabel}</span>
      {state.csv && <span className="bdr-mono">CSV {state.csv}</span>}
    </div>
  );
}
