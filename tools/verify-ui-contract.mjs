// UI contract: invoke() names in src/**/*.{ts,tsx} vs Tauri commands registered in src-tauri/src/lib.rs,
// plus visible labels, guards and limits of the fiscal workflow.
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

/** Las pantallas reciben un hook por dominio (`m`, `vf`, `docs`, `rec`); se compara sin ese prefijo. */
const unprefixedSource = sourceText.replace(/\b(?:p|m|vf|docs|rec)\./g, "");

function includesGuard(snippet) {
  return unprefixedSource.includes(snippet);
}

function includesText(text) {
  return sourceText.includes(text);
}

const checks = [
  ...[
    "company_create",
    "company_update",
    "company_list",
    "app_defaults_get",
    "app_settings_get",
    "app_settings_update",
    "company_series_configure",
    "company_series_list",
    "product_upsert",
    "product_list",
    "customer_upsert",
    "customer_list",
    "invoice_draft_create",
    "invoice_issue",
    "invoice_next_number_preview",
    "invoice_list",
    "invoice_export_pdf",
    "invoice_export_json",
    "invoice_export_csv",
    "fiscal_audit_export",
    "audit_list",
    "fiscal_record_list",
    "fiscal_chain_verify",
    "backup_export",
    "backup_restore",
    "verifactu_xml_draft_export",
    "verifactu_xml_anulacion_draft_export",
    "verifactu_submit_preflight",
    "verifactu_submit",
    "verifactu_submission_list",
    "rectification_advice",
    "commercial_document_list",
    "commercial_document_get",
    "commercial_document_save_draft",
    "commercial_document_delete_draft",
    "commercial_document_send",
    "commercial_document_set_status",
    "commercial_document_derive",
    "commercial_document_to_invoice_draft",
    "commercial_document_pdf",
    "recurring_list",
    "recurring_save",
    "recurring_set_active",
    "recurring_delete",
    "recurring_generate_due",
    "recurring_preview",
  ].map((command) => ({
    id: `invoke:${command}`,
    ok: invokedCommands.has(command),
    detail: `Tauri command ${command} is wired from the UI.`,
  })),
  // Textos visibles del flujo (viven en src/i18n/es.ts).
  ...[
    "Prepara CumpleFactura",
    "Rellenar con datos de ejemplo",
    "Guardar y seguir",
    "Guardar serie y seguir",
    "Empezar a facturar",
    "Elegir carpeta",
    "Guardar empresa",
    "Nueva empresa",
    "Nuevo cliente",
    "Guardar cliente",
    "Nuevo producto",
    "Guardar producto",
    "Usar en factura",
    "Guardar serie",
    "Usar {ejemplo}",
    "Nueva factura",
    "Factura para",
    "Serie de esta factura",
    "Se numerará",
    "Añadir línea",
    "Dto. %",
    "IRPF %",
    "Guardar borrador",
    "Emitir factura",
    "¿Emitir la factura {n}?",
    "Lo entiendo",
    "Emitiendo…",
    "Ver propuesta",
    "Emitir rectificativa",
    "la causa jurídica la decides tú",
    "Buscar facturas",
    "Más filtros",
    "Limpiar",
    "Envío AEAT",
    "Anterior",
    "Siguiente",
    "Comprobar integridad",
    "Cadena de registros",
    "Conexión y certificado",
    "Envíos a la AEAT",
    "Exportar XML",
    "Comprobación previa",
    "Enviar a la AEAT",
    "Contraseña del certificado",
    "Solo durante esta sesión",
    "Recordar en este equipo",
    "Pendiente de aprobar",
    "Sin confirmar",
    "Reintentar",
    "Herramientas técnicas",
    "Certificado vault",
    "Exportar auditoría",
    "Exportar CSV",
    "Exportar JSON",
    "Descargar PDF",
    "Crear copia de seguridad",
    "Validar copia",
    "Restaurar",
    "Entorno del QR de la factura",
    "Factura verificable en la sede electrónica de la AEAT.",
    "Presupuestos, proformas y albaranes.",
    "Facturas que se repiten.",
    "Facturar juntos",
    "Convertir en factura",
    "Generar ahora",
    "Nueva plantilla",
    "Se guarda en este equipo.",
    "Vista previa · PDF",
  ].map((label) => ({
    id: `label:${label}`,
    ok: includesText(label),
    detail: `Visible workflow label '${label}' exists.`,
  })),
  ...[
    "disabled={!canDraft}",
    "disabled={!onboardingReady}",
    "disabled={!canIssue}",
    "disabled={!issued}",
    "disabled={!canPreflight || !pkgForThis}",
    "disabled={!canSubmit || !pkgForThis}",
    "disabled={!validated}",
    "disabled={reason !== null}",
  ].map((snippet) => ({
    id: `guard:${snippet}`,
    ok: includesGuard(snippet),
    detail: `UI guard '${snippet}' exists.`,
  })),
  ...[
    "Esta versión no envía sola.",
    "No se envía a la AEAT al emitir",
    "sin llamada AEAT real ni CSV",
    "el gate no llama a AEAT",
    "Solo el sidecar local con HMAC y certificado puede llamar a la AEAT",
    "Más seguro: nadie puede leerla después de cerrar la app.",
    "Documento sin valor fiscal",
    "Nunca se emite nada sola.",
    "Comprueba con tu asesor",
    "discount_rate_basis_points",
  ].map((text) => ({
    id: `limit:${text}`,
    ok: includesText(text),
    detail: `Visible limit '${text}' exists.`,
  })),
];

// La contraseña del certificado vive solo en memoria: nunca en el almacenamiento del navegador.
checks.push({
  id: "secret:certificate_password_not_in_web_storage",
  ok: !/(localStorage|sessionStorage)[^\n]*[Pp]assword|[Pp]assword[^\n]*(localStorage|sessionStorage)/.test(sourceText),
  detail: "certificate password is never written to localStorage/sessionStorage.",
});

// Registro Rust: cada comando invocado existe y cada comando registrado se usa.
const libRs = fs.readFileSync(path.join(root, "src-tauri", "src", "lib.rs"), "utf8");
const registeredCommands = new Set([...libRs.matchAll(/commands::\w+::(\w+)/g)].map((match) => match[1]));
const notRegistered = [...invokedCommands].filter((command) => !registeredCommands.has(command));
const notInvoked = [...registeredCommands].filter((command) => !invokedCommands.has(command));
checks.push(
  {
    id: "registry:invoked_commands_are_registered",
    ok: notRegistered.length === 0,
    detail: `UI invokes only registered commands. Missing: ${notRegistered.join(", ") || "none"}.`,
  },
  {
    id: "registry:registered_commands_are_invoked",
    ok: notInvoked.length === 0,
    detail: `Every registered command is used by the UI. Unused: ${notInvoked.join(", ") || "none"}.`,
  },
);

const failed = checks.filter((check) => !check.ok);
const summary = {
  app: "CumpleFactura",
  status: failed.length === 0 ? "passed" : "failed",
  source: srcDir,
  scanned_files: sourceFiles.map((file) => path.relative(root, file)),
  invoked_commands: [...invokedCommands].sort(),
  registered_commands: [...registeredCommands].sort(),
  checks,
  failed: failed.map((check) => check.id),
};

console.log(JSON.stringify(summary, null, 2));

if (failed.length > 0) {
  process.exit(1);
}
