import { DataList } from "../../shared/components";
import { useWorkspaceState } from "../../shared/context";
export function SeriesSettings() {
  const {
    configureSeries,
    seriesLabel,
    setSeriesLabel,
    seriesCode,
    setSeriesCode,
    seriesFiscalYear,
    setSeriesFiscalYear,
    seriesIncludeYear,
    setSeriesIncludeYear,
    seriesSeparator,
    setSeriesSeparator,
    seriesPadding,
    setSeriesPadding,
    seriesNextNumber,
    setSeriesNextNumber,
    company,
    selectedSeries,
    activeSeriesPreview,
    seriesConfigs,
  } = useWorkspaceState();
  return (
    <section className="panel seriesPanel">
      <div>
        <h2>Series de facturacion</h2>
        <p>
          Configura continuar numeracion anterior o crear serie nueva. Ejemplos:
          VENDI202601, AL-001, C-001, I-001.
        </p>
      </div>
      <form className="seriesForm" onSubmit={configureSeries}>
        <input
          value={seriesLabel}
          onChange={(event) => setSeriesLabel(event.target.value)}
          placeholder="Nombre"
        />
        <input
          value={seriesCode}
          onChange={(event) => setSeriesCode(event.target.value)}
          placeholder="Serie"
        />
        <label className="fieldLabel">
          Ejercicio de la serie
          <input
            type="number"
            value={seriesFiscalYear}
            onChange={(event) =>
              setSeriesFiscalYear(Number(event.target.value))
            }
          />
        </label>
        <label className="checkLine">
          <input
            type="checkbox"
            checked={seriesIncludeYear}
            onChange={(event) => setSeriesIncludeYear(event.target.checked)}
          />
          Incluir año
        </label>
        <input
          value={seriesSeparator}
          onChange={(event) => setSeriesSeparator(event.target.value)}
          placeholder="Separador"
        />
        <label className="fieldLabel">
          Dígitos del número
          <input
            type="number"
            value={seriesPadding}
            min={1}
            max={12}
            onChange={(event) => setSeriesPadding(Number(event.target.value))}
          />
        </label>
        <label className="fieldLabel">
          Siguiente número
          <input
            type="number"
            value={seriesNextNumber}
            min={1}
            onChange={(event) =>
              setSeriesNextNumber(Number(event.target.value))
            }
          />
        </label>
        <button className="primary" disabled={!company}>
          Guardar serie
        </button>
      </form>
      <div className="seriesQuick">
        <button
          type="button"
          onClick={() => {
            setSeriesLabel("Vendingsaiz Aragon");
            setSeriesCode("VENDI");
            setSeriesIncludeYear(true);
            setSeriesSeparator("");
            setSeriesPadding(2);
          }}
        >
          Usar VENDI2026XX
        </button>
        <button
          type="button"
          onClick={() => {
            setSeriesLabel("Alquiler");
            setSeriesCode("AL");
            setSeriesIncludeYear(false);
            setSeriesSeparator("-");
            setSeriesPadding(3);
          }}
        >
          Usar AL-XXX
        </button>
        <button
          type="button"
          onClick={() => {
            setSeriesLabel("Construccion");
            setSeriesCode("C");
            setSeriesIncludeYear(false);
            setSeriesSeparator("-");
            setSeriesPadding(3);
          }}
        >
          Usar C-XXX
        </button>
        <button
          type="button"
          onClick={() => {
            setSeriesLabel("Inmovilizado");
            setSeriesCode("I");
            setSeriesIncludeYear(false);
            setSeriesSeparator("-");
            setSeriesPadding(3);
          }}
        >
          Usar I-XXX
        </button>
      </div>
      <p>
        Activa:{" "}
        {selectedSeries
          ? `${selectedSeries.label} - ${selectedSeries.preview}`
          : `${activeSeriesPreview} sin configurar`}
      </p>
      <DataList
        title="Series"
        empty="Sin series configuradas"
        rows={seriesConfigs.map(
          (item) =>
            `${item.label} - ${item.preview} - siguiente ${item.next_number}`,
        )}
      />
    </section>
  );
}
