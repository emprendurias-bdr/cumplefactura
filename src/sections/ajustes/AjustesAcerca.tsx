/**
 * Ajustes › Acerca de: identificación del sistema informático (nombre, versión, fabricante y NIF)
 * y texto completo de la declaración responsable (Orden HAC/1177/2024 art. 15.3). Todo sale de
 * `src/legal/declaracion.ts`, que lee el documento legal al compilar, salvo la versión: la del
 * binario (`getVersion()`, la misma que va en el XML a la AEAT). Si es borrador, tiene datos
 * PENDIENTE o es de otra versión, un aviso lo dice antes del texto. Solo lectura.
 */
import { getVersion } from "@tauri-apps/api/app";
import { Fragment, useEffect, useState } from "react";
import { t } from "../../i18n/es";
import { declaracion, plain } from "../../legal/declaracion";
import { otraVersion } from "../../legal/declaracionParse";
import { Callout } from "../../ui/Callout";
import { Card } from "../../ui/Card";

/** Negritas `**…**` como <strong>; el resto, texto plano. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split("**").map((part, i) => (i % 2 ? <strong key={i}>{plain(part)}</strong> : <Fragment key={i}>{plain(part)}</Fragment>))}
    </>
  );
}

/** Bloques separados por línea en blanco; dentro, las líneas «- » seguidas forman una lista y el resto párrafos. */
function Declaracion({ text }: { text: string }) {
  const blocks: { list: boolean; lines: string[] }[] = [];
  for (const block of text.split(/\n{2,}/)) {
    let current: { list: boolean; lines: string[] } | null = null;
    for (const line of block.split("\n")) {
      const list = line.startsWith("- ");
      if (!current || current.list !== list) blocks.push((current = { list, lines: [] }));
      current.lines.push(list ? line.slice(2) : line);
    }
  }
  return (
    <div className="cf-prose">
      {blocks.map((block, i) =>
        block.list ? (
          <ul key={i}>
            {block.lines.map((line, j) => (
              <li key={j}><Inline text={line} /></li>
            ))}
          </ul>
        ) : (
          <p key={i}><Inline text={block.lines.join(" ")} /></p>
        ),
      )}
    </div>
  );
}

export function AjustesAcerca() {
  const { nombre, version: declarada, productor, nif, provisional, text } = declaracion;
  // Versión instalada. Fuera de Tauri (navegador, mock de pruebas) falla y se queda «Sin dato», sin aviso.
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    getVersion().then((v) => vivo && setVersion(v), () => undefined);
    return () => {
      vivo = false;
    };
  }, []);
  return (
    <>
      {provisional ? <Callout tone="warn" title={t("acerca.borrador")}>{t("acerca.borradorAyuda")}</Callout> : null}
      {otraVersion(version, declarada) ? (
        <Callout tone="warn" title={t("acerca.otraVersion")}>{t("acerca.otraVersionAyuda", { declarada: declarada ?? "", instalada: version ?? "" })}</Callout>
      ) : null}
      <Card title={t("acerca.sistema")}>
        <dl className="cf-dl">
          <dt>{t("acerca.nombre")}</dt>
          <dd>{nombre ?? t("acerca.sinDato")}</dd>
          <dt>{t("acerca.version")}</dt>
          <dd className="cf-mono">{version ?? t("acerca.sinDato")}</dd>
          <dt>{t("acerca.fabricante")}</dt>
          <dd>{productor ?? t("acerca.sinDato")}</dd>
          <dt>{t("acerca.nif")}</dt>
          <dd className="cf-mono">{nif ?? t("acerca.sinDato")}</dd>
        </dl>
      </Card>
      <Card title={t("acerca.declaracion")}>
        <Declaracion text={text} />
      </Card>
    </>
  );
}
