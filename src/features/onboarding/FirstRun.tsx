import { Button } from "@bdr/ui";
import { useState } from "react";
import { useWorkspaceState } from "../../shared/context";
import { CustomerCompanyForms } from "../customers/CustomerCompanyForms";
import { SeriesSettings } from "../settings/SeriesSettings";
import { Onboarding } from "./Onboarding";
export function FirstRun() {
  const s = useWorkspaceState();
  const [step, setStep] = useState(0);
  const names = [
    "Empresa",
    "Fiscalidad",
    "Primera serie",
    "Certificado y carpeta",
  ];
  const completed = [
    Boolean(s.company),
    s.defaultTerritoryFlags.length > 0,
    Boolean(s.selectedSeries),
    Boolean(s.exportDir.trim() && s.submitPreflight?.certificate_loaded),
  ];
  return (
    <section
      className="first-run"
      aria-label="Configuración inicial en cuatro pasos"
    >
      <h2>Prepara tu primera factura</h2>
      <nav aria-label="Pasos de configuración">
        <ol className="wizard-steps">
          {names.map((name, index) => (
            <li key={name} aria-current={step === index ? "step" : undefined}>
              <button
                type="button"
                onClick={() => setStep(index)}
                aria-label={`Paso ${index + 1}: ${name}`}
              >
                {index + 1} · {name}
                <span className="sr-only">
                  {completed[index] ? " · Comprobado" : " · Pendiente"}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <h3>
        Paso {step + 1} · {names[step]}
      </h3>
      {step === 0 && <CustomerCompanyForms section="company" />}
      {step === 1 && <Onboarding stage="fiscal" />}
      {step === 2 && <SeriesSettings />}
      {step === 3 && (
        <>
          <section className="fiscal-overview">
            <h3>Certificado</h3>
            <p>
              {s.submitPreflight?.certificate_loaded
                ? "El sidecar ha comprobado que el certificado está cargado. Revisa su vigencia en Verifactu."
                : "No comprobado. Guardar la configuración básica no acredita que puedas enviar a la AEAT."}
            </p>
            <a href="#/verifactu">Revisar conexión y certificado</a>
          </section>
          <Onboarding
            stage="export"
            submitLabel="Guardar configuración básica"
          />
        </>
      )}
      <div className="phase2-actions">
        {step > 0 && (
          <Button variant="secondary" onClick={() => setStep(step - 1)}>
            Anterior paso
          </Button>
        )}
        {step < 3 && (
          <Button onClick={() => setStep(step + 1)}>Siguiente paso</Button>
        )}
      </div>
    </section>
  );
}
