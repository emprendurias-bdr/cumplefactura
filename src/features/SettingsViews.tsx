import { invoke } from "@tauri-apps/api/core";
import { KeyRound, QrCode, Send } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { attempt, Runner, StatusBadge } from "./shared";

type EmailSettings = {
  smtp_host: string;
  smtp_port: number;
  smtp_security: "starttls" | "tls" | "none";
  smtp_username: string;
  from_email: string;
  from_name: string;
};

type EmailSettingsView = { settings: EmailSettings; configured: boolean; password_saved: boolean };

const EMPTY: EmailSettings = {
  smtp_host: "",
  smtp_port: 587,
  smtp_security: "starttls",
  smtp_username: "",
  from_email: "",
  from_name: "",
};

export function EmailSettingsView({ run }: { run: Runner }) {
  const [form, setForm] = useState<EmailSettings>(EMPTY);
  const [view, setView] = useState<EmailSettingsView | null>(null);
  const [password, setPassword] = useState("");
  const [testTo, setTestTo] = useState("");

  useEffect(() => {
    void (async () => {
      const result = await attempt(run, "Email", () => invoke<EmailSettingsView>("email_settings_get"));
      if (result) {
        setView(result);
        if (result.configured) setForm(result.settings);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function update<K extends keyof EmailSettings>(field: K, value: EmailSettings[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const result = await attempt(run, "Guardar email", () => invoke<EmailSettingsView>("email_settings_update", { settings: form }));
    if (result) setView(result);
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault();
    const ok = await attempt(run, "Guardar contraseña SMTP", () => invoke("email_password_set", { password }).then(() => true));
    if (ok) {
      setPassword("");
      const refreshed = await attempt(run, "Email", () => invoke<EmailSettingsView>("email_settings_get"));
      if (refreshed) setView(refreshed);
    }
  }

  async function sendTest(event: FormEvent) {
    event.preventDefault();
    await attempt(run, "Email de prueba", () => invoke("email_send_test", { to: testTo }));
  }

  return (
    <>
      <section className="panel" aria-label="Servidor de correo">
        <form className="stackForm" onSubmit={save}>
          <div className="formTitle">
            <div>
              <h2>Servidor de correo (SMTP)</h2>
              <p>Las facturas salen desde tu propio correo. Gmail/Outlook requieren contraseña de aplicación.</p>
            </div>
            {view?.configured ? <StatusBadge tone="ok">Configurado</StatusBadge> : <StatusBadge tone="muted">Sin configurar</StatusBadge>}
          </div>
          <div className="formGrid four">
            <label className="fieldBlock">
              <span>Servidor</span>
              <input aria-label="Servidor SMTP" value={form.smtp_host} onChange={(e) => update("smtp_host", e.target.value)} placeholder="smtp.tudominio.es" />
            </label>
            <label className="fieldBlock">
              <span>Puerto</span>
              <input aria-label="Puerto SMTP" inputMode="numeric" value={form.smtp_port} onChange={(e) => update("smtp_port", Number(e.target.value) || 0)} />
            </label>
            <label className="fieldBlock">
              <span>Seguridad</span>
              <select aria-label="Seguridad SMTP" value={form.smtp_security} onChange={(e) => update("smtp_security", e.target.value as EmailSettings["smtp_security"])}>
                <option value="starttls">STARTTLS (587)</option>
                <option value="tls">TLS (465)</option>
                <option value="none">Sin cifrar (solo pruebas)</option>
              </select>
            </label>
            <label className="fieldBlock">
              <span>Usuario</span>
              <input aria-label="Usuario SMTP" value={form.smtp_username} onChange={(e) => update("smtp_username", e.target.value)} placeholder="facturas@tudominio.es" />
            </label>
            <label className="fieldBlock">
              <span>Email remitente</span>
              <input aria-label="Email remitente" type="email" value={form.from_email} onChange={(e) => update("from_email", e.target.value)} />
            </label>
            <label className="fieldBlock">
              <span>Nombre remitente</span>
              <input aria-label="Nombre remitente" value={form.from_name} onChange={(e) => update("from_name", e.target.value)} placeholder="Tu empresa" />
            </label>
          </div>
          <button className="primary">Guardar servidor</button>
        </form>
      </section>

      <section className="panel splitPanels" aria-label="Credenciales y prueba">
        <form className="stackForm" onSubmit={savePassword}>
          <h2>Contraseña</h2>
          <p>
            Se guarda en el almacén de credenciales del sistema (no en la base de datos) y nunca se vuelve a mostrar.{" "}
            {view?.password_saved ? <StatusBadge tone="ok">Guardada</StatusBadge> : <StatusBadge tone="muted">No guardada</StatusBadge>}
          </p>
          <label className="fieldBlock">
            <span>Contraseña SMTP</span>
            <input aria-label="Contraseña SMTP" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <button className="linkButton" disabled={!password || !view?.configured}>
            <KeyRound size={16} aria-hidden="true" />
            Guardar contraseña
          </button>
        </form>
        <form className="stackForm" onSubmit={sendTest}>
          <h2>Probar envío</h2>
          <p>Envía un correo de prueba para comprobar la configuración.</p>
          <label className="fieldBlock">
            <span>Enviar a</span>
            <input aria-label="Email de prueba" type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
          </label>
          <button className="linkButton" disabled={!testTo || !view?.configured}>
            <Send size={16} aria-hidden="true" />
            Enviar prueba
          </button>
        </form>
      </section>
    </>
  );
}

type AppSettings = {
  export_dir?: string | null;
  default_territory_flags: string[];
  onboarding_completed: boolean;
  updated_at: string;
  qr_environment?: "test" | "production";
};

export function QrSettingsView({
  settings,
  onSaved,
  run,
}: {
  settings: AppSettings | null;
  onSaved: (settings: AppSettings) => void;
  run: Runner;
}) {
  const [env, setEnv] = useState<"test" | "production">(settings?.qr_environment ?? "test");

  useEffect(() => {
    setEnv(settings?.qr_environment ?? "test");
  }, [settings?.qr_environment]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!settings) return;
    const saved = await attempt(run, "Guardar QR tributario", () =>
      invoke<AppSettings>("app_settings_update", {
        input: {
          export_dir: settings.export_dir ?? null,
          default_territory_flags: settings.default_territory_flags,
          onboarding_completed: settings.onboarding_completed,
          qr_environment: env,
        },
      }),
    );
    if (saved) onSaved(saved);
  }

  return (
    <section className="panel" aria-label="QR tributario">
      <form className="stackForm" onSubmit={save}>
        <div className="formTitle">
          <div>
            <h2>QR tributario VERI*FACTU</h2>
            <p>
              Cada factura emitida lleva al inicio un QR (35 mm, nivel M) con la URL de cotejo de la AEAT y la leyenda «Factura verificable en la sede
              electrónica de la AEAT».
            </p>
          </div>
          <QrCode size={28} aria-hidden="true" />
        </div>
        <label className="fieldBlock">
          <span>Entorno de cotejo</span>
          <select aria-label="Entorno QR" value={env} onChange={(e) => setEnv(e.target.value as "test" | "production")}>
            <option value="test">Pruebas AEAT (prewww2) — hasta homologar</option>
            <option value="production">Producción AEAT (www2)</option>
          </select>
        </label>
        <p className="noticeLine">
          Cambia a Producción solo cuando el sistema esté dado de alta y remitiendo registros a la AEAT. En pruebas, el PDF lo indica bajo el QR.
        </p>
        <button className="primary" disabled={!settings}>
          Guardar
        </button>
      </form>
    </section>
  );
}
