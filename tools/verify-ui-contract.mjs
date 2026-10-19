import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appPath = path.join(root, "src", "App.tsx");
const featuresDir = path.join(root, "src", "features");
const featurePaths = fs.existsSync(featuresDir)
  ? fs.readdirSync(featuresDir).filter((name) => name.endsWith(".tsx")).map((name) => path.join(featuresDir, name))
  : [];
// App.tsx mas los componentes de src/features/: el contrato cubre toda la UI.
const sourcePaths = [appPath, ...featurePaths];
const sourceText = sourcePaths.map((file) => fs.readFileSync(file, "utf8")).join("\n");

const invokedCommands = new Set();

function visit(node) {
  if (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "invoke" &&
    node.arguments.length > 0 &&
    ts.isStringLiteralLike(node.arguments[0])
  ) {
    invokedCommands.add(node.arguments[0].text);
  }

  ts.forEachChild(node, visit);
}

for (const file of sourcePaths) {
  visit(ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX));
}

const checks = [
  ...[
    "company_create",
    "company_update",
    "app_defaults_get",
    "app_settings_get",
    "app_settings_update",
    "company_series_configure",
    "company_series_list",
    "product_upsert",
    "product_list",
    "customer_upsert",
    "invoice_draft_create",
    "invoice_issue",
    "invoice_next_number_preview",
    "invoice_list",
    "invoice_export_pdf",
    "invoice_export_json",
    "invoice_export_csv",
    "fiscal_audit_export",
    "fiscal_sidecar_capabilities_get",
    "sii_submit_sidecar_preflight",
    "ticketbai_submit_sidecar_preflight",
    "audit_list",
    "fiscal_record_list",
    "fiscal_chain_verify",
    "backup_export",
    "backup_restore",
    "verifactu_xml_draft_export",
    "verifactu_xml_anulacion_draft_export",
    "verifactu_submission_prepare",
    "verifactu_xades_sidecar_preflight",
    "verifactu_xades_sidecar_sign",
    "verifactu_transport_preflight",
    "verifactu_submit_sidecar_preflight",
    "verifactu_submit_sidecar_invoke",
    "rectification_advice",
    "invoice_due_date_set",
    "payment_register",
    "payment_delete",
    "payment_list",
    "receivables_list",
    "recurring_upsert",
    "recurring_list",
    "recurring_set_active",
    "recurring_generate_due",
    "quote_upsert",
    "quote_list",
    "quote_set_status",
    "quote_convert",
    "email_settings_get",
    "email_settings_update",
    "email_password_set",
    "email_log_list",
    "email_send_test",
    "email_send_invoice",
    "email_send_reminder",
  ].map((command) => ({
    id: `invoke:${command}`,
    ok: invokedCommands.has(command),
    detail: `Tauri command ${command} is wired from the UI.`,
  })),
  ...[
    "Rellenar demo",
    "Onboarding inicial",
    "Carpeta export",
    "Fiscalidad local",
    "Guardar onboarding",
    "Elegir carpeta",
    "Empresa emisora",
    "Empresa activa",
    "Nueva empresa",
    "Guardar emisor",
    "Cliente activo",
    "Nuevo cliente",
    "Guardar cliente",
    "Catalogo productos/servicios",
    "Producto activo",
    "Nuevo producto",
    "SKU producto",
    "Nombre producto",
    "Precio producto EUR",
    "Guardar producto",
    "Usar en linea",
    "Series de facturacion",
    "Guardar serie",
    "Usar VENDI2026XX",
    "Usar AL-XXX",
    "Usar C-XXX",
    "Usar I-XXX",
    "Editor de factura",
    "Serie de esta factura",
    "Añadir linea",
    "Dto %",
    "IRPF %",
    "Crear borrador",
    "Emitir factura",
    "Sugerir",
    "Emitir rectificativa",
    "Buscar facturas",
    "Limpiar filtros",
    "Buscar texto factura",
    "Filtro empresa factura",
    "Filtro cliente factura",
    "Filtro estado factura",
    "Filtro tipo factura",
    "Pagina facturas",
    "Anterior facturas",
    "Siguiente facturas",
    "Pagina auditoria",
    "Anterior auditoria",
    "Siguiente auditoria",
    "Pagina fiscal",
    "Anterior fiscal",
    "Siguiente fiscal",
    "Auditoria fiscal local",
    "Verificar cadena",
    "Resumen auditoria fiscal",
    "Estado cadena",
    "Registros fiscales verificados",
    "Incidencias cadena",
    "Ultimo hash por empresa",
    "Empresas con hash final",
    "Ruta informe auditoria fiscal",
    "Elegir auditoria",
    "Ruta backup SQLite",
    "Elegir backup",
    "Ruta restore backup",
    "Elegir restore",
    "Ruta PDF factura",
    "Elegir PDF",
    "Ruta JSON factura",
    "Elegir JSON",
    "Ruta CSV facturas",
    "Elegir CSV",
    "Ruta XML VERIFACTU",
    "Elegir XML",
    "Ruta XML anulacion",
    "Elegir anulacion",
    "Ruta XML firmado",
    "Elegir firmado",
    "Exportar PDF",
    "Exportar JSON",
    "Exportar CSV",
    "Exportar auditoria",
    "Canales ContaPro sidecar",
    "Resumen canales sidecar",
    "Recargar sidecar",
    "Libro SII",
    "Endpoint SII",
    "URL sidecar SII",
    "Preflight SII sidecar",
    "Territorio TicketBAI",
    "Endpoint TicketBAI",
    "URL sidecar TicketBAI",
    "Preflight TicketBAI sidecar",
    "Validar restore",
    "Exportar XML",
    "Exportar anulacion",
    "Preparar",
    "Preflight XAdES",
    "Firmar XAdES",
    "Preflight AEAT",
    "Preflight envio sidecar",
    "Enviar via sidecar",
  ].map((label) => ({
    id: `label:${label}`,
    ok: sourceText.includes(label),
    detail: `Visible fiscal workflow label '${label}' exists.`,
  })),
  ...[
    "disabled={!canDraft}",
    "disabled={!onboardingReady}",
    "disabled={!canIssue}",
    "disabled={!canRectify}",
    "disabled={!canExportXml}",
    "disabled={!xmlResult && !cancelXmlResult}",
    "disabled={!submission}",
    "disabled={!submission || !xadesPreflight?.ready}",
    "disabled={!submission || submission.signature_status !== \"signed_xades\"}",
    "disabled={!submission || !submitPreflight?.ready}",
  ].map((snippet) => ({
    id: `guard:${snippet}`,
    ok: sourceText.includes(snippet),
    detail: `UI guard '${snippet}' exists.`,
  })),
  ...[
    "sin firma ni envio",
    "external_blocked",
    "Pre-MVP local-first",
    "Configura continuar numeracion anterior",
    "discount_rate_basis_points",
    "pendiente de XAdES/envio",
    "no llama al sidecar",
    "exige XAdES real",
    "Selector tecnico R1-R5/I-S",
    "no llama a AEAT",
    "sin llamada AEAT real ni CSV",
    "gate usa sidecar falso",
    "Importado de ContaPro",
    "sin SOAP AEAT",
    "homologacion foral sigue bloqueada",
  ].map((text) => ({
    id: `limit:${text}`,
    ok: sourceText.includes(text),
    detail: `Visible limit '${text}' exists.`,
  })),
];

const failed = checks.filter((check) => !check.ok);
const summary = {
  app: "CumpleFactura",
  status: failed.length === 0 ? "passed" : "failed",
  source: sourcePaths,
  invoked_commands: [...invokedCommands].sort(),
  checks,
};

console.log(JSON.stringify(summary, null, 2));

if (failed.length > 0) {
  process.exit(1);
}
