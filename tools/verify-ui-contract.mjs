// UI contract: parse src/**/*.{ts,tsx} invoke() names vs registered Tauri commands.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(root, "src");

function listSourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "_blobs" || entry.name === "node_modules") continue;
      out.push(...listSourceFiles(full));
      continue;
    }
    if (/\.(tsx?|jsx?)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const sourceFiles = listSourceFiles(srcDir);
const sourceText = sourceFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n");

const invokedCommands = new Set();

for (const file of sourceFiles) {
  const text = fs.readFileSync(file, "utf8");
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
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
  visit(sourceFile);
}

/** Accept bare identifiers or `p.`-prefixed after App section split. */
function includesGuard(snippet) {
  if (sourceText.includes(snippet)) return true;
  const variants = {
    "disabled={!canDraft}": "disabled={!p.canDraft}",
    "disabled={!onboardingReady}": "disabled={!p.onboardingReady}",
    "disabled={!canIssue}": "disabled={!p.canIssue}",
    "disabled={!canRectify}": "disabled={!p.canRectify}",
    "disabled={!canExportXml}": "disabled={!p.canExportXml}",
    "disabled={!xmlResult && !cancelXmlResult}": "disabled={!p.xmlResult && !p.cancelXmlResult}",
    "disabled={!submission}": "disabled={!p.submission}",
    "disabled={!submission || !xadesPreflight?.ready}":
      "disabled={!p.submission || !p.xadesPreflight?.ready}",
    'disabled={!submission || submission.signature_status !== "signed_xades"}':
      'disabled={!p.submission || p.submission.signature_status !== "signed_xades"}',
    "disabled={!submission || !submitPreflight?.ready}":
      "disabled={!p.submission || !p.submitPreflight?.ready}",
  };
  const alt = variants[snippet];
  return Boolean(alt && sourceText.includes(alt));
}

function includesText(text) {
  return sourceText.includes(text);
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
    ok: includesText(label),
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
    ok: includesGuard(snippet),
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
    ok: includesText(text),
    detail: `Visible limit '${text}' exists.`,
  })),
];

const failed = checks.filter((check) => !check.ok);
const summary = {
  app: "CumpleFactura",
  status: failed.length === 0 ? "passed" : "failed",
  source: srcDir,
  scanned_files: sourceFiles.map((file) => path.relative(root, file)),
  invoked_commands: [...invokedCommands].sort(),
  checks,
  failed: failed.map((check) => check.id),
};

console.log(JSON.stringify(summary, null, 2));

if (failed.length > 0) {
  process.exit(1);
}
