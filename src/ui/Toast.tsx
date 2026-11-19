/**
 * Toast (design.md §7.10): abajo a la derecha, 4 s, con acción opcional («Deshacer», «Ver factura»).
 * Lógica: un almacén mínimo fuera de React (`toast()` se puede llamar desde cualquier hook) leído
 * con `useSyncExternalStore`. Se ve uno a la vez; el nuevo sustituye al anterior. Los errores se
 * quedan 8 s para que dé tiempo a leer qué hacer. Entrada/salida en motion.css.
 * Estructura: <div class="bdr-toast is-on" role="status|alert">icono · texto · [acción]</div>.
 */
import { useSyncExternalStore } from "react";
import { TONE_ICON, type Tone } from "./status";

type ToastItem = { id: number; text: string; tone: Tone; action?: { label: string; run: () => void } };

let current: ToastItem | null = null;
let counter = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function dismissToast() {
  current = null;
  emit();
}

export function toast(text: string, tone: Tone = "ok", action?: ToastItem["action"]) {
  counter += 1;
  current = { id: counter, text, tone, action };
  clearTimeout(timer);
  timer = setTimeout(dismissToast, tone === "err" ? 8000 : 4000);
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function Toaster() {
  const item = useSyncExternalStore(subscribe, () => current);
  return (
    <div className={item ? "bdr-toast is-on" : "bdr-toast"} role={item?.tone === "err" ? "alert" : "status"} aria-live="polite">
      {item ? (
        <>
          <span aria-hidden="true" className={`cf-toast__icon cf-toast__icon--${item.tone}`}>
            {TONE_ICON[item.tone]}
          </span>
          <span>{item.text}</span>
          {item.action ? (
            <button
              type="button"
              onClick={() => {
                item.action?.run();
                dismissToast();
              }}
            >
              {item.action.label}
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
