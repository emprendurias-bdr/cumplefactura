/**
 * Ajustes › Empresa: datos de la empresa emisora (los del primer arranque). `CompanyFields` se
 * reutiliza en FirstRun. NIF, CP y país en mono. Guardar crea o edita según haya empresa activa.
 * «Logo para el PDF» (D1): «Elegir imagen» (JPEG/PNG) → `company_logo_set`, «Quitar» →
 * `company_logo_clear`. Se enseña el nombre del archivo guardado: el webview no tiene permiso para
 * leer la carpeta de datos (CSP `img-src 'self' asset: data:` sin protocolo de archivos activado).
 */
import { t } from "../../i18n/es";
import type { CompanyForm } from "../../types";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { Field, Input } from "../../ui/Field";
import type { Model } from "../../useCumpleFactura";
import type { Ctx } from "../ctx";

const FIELDS: { key: keyof CompanyForm; mono?: boolean; wide?: boolean; upper?: boolean; optional?: boolean }[] = [
  { key: "legal_name" },
  { key: "tax_id", mono: true, upper: true },
  { key: "address", wide: true },
  { key: "postal_code", mono: true },
  { key: "municipality" },
  { key: "province" },
  { key: "country_code", mono: true, upper: true },
  { key: "default_series", mono: true, upper: true, optional: true },
];

export function CompanyFields({ m }: { m: Model }) {
  return (
    <>
      {FIELDS.map((field) => (
        <Field key={field.key} label={t(`empresa.f.${field.key}`)} wide={field.wide}>
          <Input
            required={!field.optional}
            mono={field.mono}
            value={m.companyForm[field.key]}
            onChange={(e) => m.updateCompanyForm(field.key, field.upper ? e.target.value.toUpperCase() : e.target.value)}
          />
        </Field>
      ))}
    </>
  );
}

export function AjustesEmpresa({ m }: Ctx) {
  const logo = m.company?.logo_path ?? null;
  return (
    <>
      <Card
        title={m.company ? m.company.legal_name : t("empresa.nueva")}
        actions={m.company ? <Button variant="ghost" size="sm" onClick={m.newCompanyForm}>{t("empresa.nueva")}</Button> : null}
      >
        <form className="cf-form-grid" onSubmit={m.saveCompany}>
          <CompanyFields m={m} />
          <div className="cf-row cf-end cf-wide">
            <Button type="submit" variant="primary">{t("empresa.guardar")}</Button>
          </div>
        </form>
      </Card>
      <Card title={t("logo.titulo")}>
        <p className="bdr-small">{t("logo.ayuda")}</p>
        <div className="cf-logo">
          <span className="cf-sheet__logo m" aria-hidden="true">{logo ? t("preview.logo") : "—"}</span>
          {logo ? (
            <span className="bdr-small">
              {t("logo.actual")} <span className="m">{logo.split(/[\\/]/).pop()}</span>
            </span>
          ) : (
            <span className="bdr-small bdr-muted">{t("logo.sinLogo")}</span>
          )}
        </div>
        <div className="cf-row">
          <Button disabled={!m.company} reason={m.company ? null : t("logo.motivoEmpresa")} onClick={() => void m.pickLogo()}>{t("logo.elegir")}</Button>
          {logo && m.company ? <Button variant="ghost" onClick={() => m.company && void m.clearLogo(m.company.id)}>{t("logo.quitar")}</Button> : null}
        </div>
      </Card>
    </>
  );
}
