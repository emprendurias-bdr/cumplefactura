/**
 * Stepper (design.md §7.8): pastillas numeradas. Hecha = ok, actual = --p-activo, futura = neu;
 * `warn`/`error` solo para la respuesta de la AEAT (aceptada con errores / rechazada).
 * Nunca se colorea un paso que no ha ocurrido: el estado lo calcula `lib/progress.ts` con evidencia.
 * `compact` pinta solo los puntos (columna Verifactu de la lista) con el texto accesible.
 */
import type { StepState } from "../lib/progress";

export type Step = { label: string; state: StepState };

const STATE_CLASS: Record<StepState, string> = {
  done: "is-done",
  current: "is-current",
  future: "",
  warn: "cf-step--warn",
  error: "cf-step--err",
};

const STATE_ICON: Record<StepState, string> = { done: "✓", current: "", future: "", warn: "!", error: "✕" };

export function Stepper({ steps, label, compact }: { steps: Step[]; label: string; compact?: boolean }) {
  if (compact) {
    return (
      <span className="cf-dots" role="img" aria-label={`${label}: ${steps.map((s) => `${s.label} ${s.state}`).join(", ")}`}>
        {steps.map((step) => (
          <span key={step.label} className={`cf-dot cf-dot--${step.state}`} />
        ))}
      </span>
    );
  }
  return (
    <ol className="bdr-steps" aria-label={label}>
      {steps.map((step, index) => (
        <li
          key={step.label}
          className={["bdr-step", STATE_CLASS[step.state]].filter(Boolean).join(" ")}
          aria-current={step.state === "current" ? "step" : undefined}
        >
          <span className="cf-step__n">{STATE_ICON[step.state] || index + 1}</span> {step.label}
        </li>
      ))}
    </ol>
  );
}
