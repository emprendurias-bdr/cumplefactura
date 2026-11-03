/**
 * Primer arranque a pantalla completa (sin barra lateral) mientras `onboarding_completed` es falso.
 * 4 pasos con Stepper: Empresa → Fiscalidad → Primera serie → Certificado y carpeta. Un Card por
 * paso con su formulario (los mismos campos que Ajustes), «Atrás» ghost y la acción del paso en
 * Menta. El último paso guarda los ajustes y abre «Nueva factura».
 */
import { useState } from "react";
import { Icon } from "../components/Icon";
import { t } from "../i18n/es";
import { go } from "../shell/useRoute";
import { AppearancePanel } from "../ui/AppearancePanel";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Hero } from "../ui/Hero";
import { Stepper } from "../ui/Stepper";
import { Toaster } from "../ui/Toast";
import type { Model } from "../useCumpleFactura";
import { CertificadoFields } from "./ajustes/AjustesCertificado";
import { CompanyFields } from "./ajustes/AjustesEmpresa";
import { FiscalFields } from "./ajustes/AjustesFiscalidad";
import { SeriesFields } from "./ajustes/AjustesSeries";

export function FirstRun({ m }: { m: Model }) {
  const [step, setStep] = useState(0);
  const steps = m.onboardingSteps.map((item, index) => ({
    label: t(`inicio.paso.${item.key}`),
    state: index === step ? ("current" as const) : item.ok && index < step ? ("done" as const) : ("future" as const),
  }));
  const back = step > 0 ? <Button variant="ghost" onClick={() => setStep(step - 1)}>{t("comun.atras")}</Button> : null;

  async function finish() {
    if (await m.saveSettings(true)) go("#/facturas/nueva");
  }

  return (
    <div className="bdr-app">
      <header className="bdr-top">
        <span className="bdr-brand">BDR<span>.</span></span>
        <span className="bdr-sep" />
        <span className="bdr-appicon" aria-hidden="true"><Icon name="receipt" size={15} /></span>
        <span className="bdr-appname">CumpleFactura</span>
        <span className="bdr-spacer" />
        <AppearancePanel />
      </header>
      <main className="bdr-main cf-firstrun" id="contenido">
        <Hero label={t("inicio.etiqueta")} title={t("inicio.titulo")} support={t("inicio.apoyo")} />
        <Stepper steps={steps} label={t("inicio.pasos")} />

        {step === 0 ? (
          <Card title={t("inicio.paso.empresa")} actions={<Button variant="ghost" size="sm" onClick={m.fillDemoData}>{m.demoSeedEnabled ? t("inicio.demoCargada") : t("inicio.demo")}</Button>}>
            <form className="cf-form-grid" onSubmit={async (e) => { if (await m.saveCompany(e)) setStep(1); }}>
              <CompanyFields m={m} />
              <div className="cf-row cf-end cf-wide">
                <Button type="submit" variant="primary">{t("inicio.guardarSeguir")}</Button>
              </div>
            </form>
          </Card>
        ) : null}

        {step === 1 ? (
          <Card title={t("inicio.paso.fiscalidad")}>
            <p className="bdr-small">{t("inicio.fiscalAyuda")}</p>
            <div className="cf-form-grid"><FiscalFields m={m} /></div>
            <div className="cf-row cf-end">{back}<Button variant="primary" onClick={() => setStep(2)}>{t("comun.siguiente")}</Button></div>
          </Card>
        ) : null}

        {step === 2 ? (
          <Card title={t("inicio.paso.serie")}>
            <form className="cf-form-grid" onSubmit={async (e) => { if (await m.configureSeries(e)) setStep(3); }}>
              <SeriesFields m={m} />
              <div className="cf-row cf-end cf-wide">{back}<Button type="submit" variant="primary">{t("inicio.guardarSerie")}</Button></div>
            </form>
          </Card>
        ) : null}

        {step === 3 ? (
          <Card title={t("inicio.paso.certificado")}>
            <div className="cf-form-grid"><CertificadoFields m={m} /></div>
            <div className="cf-row cf-end">
              {back}
              <Button variant="primary" onClick={() => void finish()} disabled={!m.onboardingReady} reason={m.onboardingReady ? null : t("inicio.faltan")}>
                {t("inicio.empezar")}
              </Button>
            </div>
          </Card>
        ) : null}
      </main>
      <Toaster />
    </div>
  );
}
