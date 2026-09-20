import React from 'react';

/**
 * SatJourneyTracker
 * Componente de rastreo ejecutivo, compacto y minimalista.
 * Diseñado con estética SaaS de nivel corporativo para visualizar las 4 fases de extracción:
 * 1. Autenticación e.firma
 * 2. Conexión Portal SAT
 * 3. Auditoría de Nóminas
 * 4. Generación de Paquete ZIP & Excel
 */
export default function SatJourneyTracker({
  jobStatus = 'idle',
  progress = 0,
  client,
  selectedYear,
  selectedFormat = 'both',
  isAuthStarted,
  isAuthSuccess,
  isSatReady,
  isExtractionDone,
  isCompleted,
  jobResult,
}) {
  const currentFormat = jobResult?.format || selectedFormat || 'both';
  const isXml = currentFormat === 'xml';
  const isPdf = currentFormat === 'pdf';
  const isBoth = currentFormat === 'both';
  // Determinar la fase activa (1 a 4)
  let currentPhase = 1;
  if (isCompleted) {
    currentPhase = 4;
  } else if (isExtractionDone) {
    currentPhase = 4;
  } else if (isSatReady) {
    currentPhase = 3;
  } else if (isAuthSuccess) {
    currentPhase = 2;
  } else if (isAuthStarted) {
    currentPhase = 1;
  }

  // Porcentaje general para la barra conectora (0% a 100%)
  let pipelinePercent = 12;
  if (isCompleted) {
    pipelinePercent = 100;
  } else if (isExtractionDone) {
    pipelinePercent = 90;
  } else if (isSatReady) {
    // Fase 3: mapear progress (0 a 100) al rango 45% - 85%
    pipelinePercent = Math.min(88, 40 + (progress / 100) * 48);
  } else if (isAuthSuccess) {
    pipelinePercent = 38;
  } else if (isAuthStarted) {
    pipelinePercent = 16;
  }

  const steps = [
    {
      num: '01',
      name: 'Autenticación e.firma',
      icon: 'vpn_key',
      isDone: isAuthSuccess,
      isActive: !isAuthSuccess && isAuthStarted,
      statusLabel: isAuthSuccess
        ? 'Credenciales Aceptadas'
        : isAuthStarted
        ? 'Validando llaves...'
        : 'En espera',
    },
    {
      num: '02',
      name: 'Portal SAT',
      icon: 'account_balance',
      isDone: isSatReady,
      isActive: !isSatReady && isAuthSuccess,
      statusLabel: isSatReady
        ? 'ConsultaReceptor OK'
        : isAuthSuccess
        ? 'Conectando túnel...'
        : 'En espera',
    },
    {
      num: '03',
      name: 'Auditoría Nóminas',
      icon: 'receipt_long',
      isDone: isExtractionDone,
      isActive: !isExtractionDone && isSatReady,
      statusLabel: isExtractionDone
        ? '12 Meses Auditados'
        : isSatReady
        ? `Extrayendo (${progress}%)`
        : 'En espera',
    },
    {
      num: '04',
      name: isXml ? 'Paquete ZIP (XML)' : isPdf ? 'Paquete ZIP (PDF)' : 'Paquete ZIP (PDF + XML + Excel)',
      icon: 'inventory_2',
      isDone: isCompleted,
      isActive: !isCompleted && isExtractionDone,
      statusLabel: isCompleted
        ? 'Listo para Descarga'
        : isExtractionDone
        ? 'Empacando archivos...'
        : 'En espera',
    },
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden flex flex-col transition-all duration-300">
      {/* 1. CABECERA EJECUTIVA Y COMPACTA */}
      <div className="bg-slate-900 text-white px-5 py-3.5 sm:px-6 sm:py-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center text-emerald-400 shrink-0">
            <span className={`material-symbols-outlined text-[19px] ${jobStatus === 'running' && !isCompleted ? 'animate-spin' : ''}`}>
              {isCompleted ? 'verified' : jobStatus === 'running' ? 'progress_activity' : 'tune'}
            </span>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-400">
                {isCompleted ? 'Proceso Completado' : 'Extracción en Tiempo Real'}
              </span>
              <span className="text-slate-500 text-xs hidden sm:inline">•</span>
              <span className="text-xs text-slate-300 font-mono hidden sm:inline">
                {client?.rfc || 'RFC'} • Ejercicio {selectedYear}
              </span>
            </div>

            <h3 className="text-sm sm:text-base font-bold text-white tracking-tight leading-tight mt-0.5">
              {isCompleted
                ? 'Extracción Fiscal Concluida Exitosamente'
                : currentPhase === 3
                ? `Extrayendo y auditando nóminas: ${progress}% completado`
                : currentPhase === 2
                ? 'Conectando con el Portal de Consulta SAT...'
                : 'Validando e.firma y credenciales fiscales...'}
            </h3>
          </div>
        </div>

        {/* Badge de Progreso */}
        <div className="flex items-center gap-2">
          {isCompleted ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              <span className="material-symbols-outlined text-[14px]">check_circle</span>
              100% LISTO
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold bg-slate-800 text-slate-200 border border-slate-700">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              {progress}% EN PROCESO
            </span>
          )}
        </div>
      </div>

      {/* 2. PIPELINE MINIMALISTA: LÍNEA DE PROGRESO CONECTORA */}
      <div className="px-5 sm:px-6 pt-4 pb-2 bg-slate-50/50 border-b border-slate-100">
        <div className="relative w-full h-1.5 bg-slate-200/80 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-indigo-600 transition-all duration-500 ease-out"
            style={{ width: `${pipelinePercent}%` }}
          />
        </div>
      </div>

      {/* 3. LAS 4 FASES COMPACTAS Y MINIMALISTAS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 p-3.5 sm:p-4 bg-white">
        {steps.map((st) => {
          let cardStyle = 'bg-slate-50/60 border-slate-200/70 text-slate-400';
          let iconBoxStyle = 'bg-slate-100 text-slate-400 border border-slate-200/60';
          let numStyle = 'text-slate-400';
          let titleStyle = 'text-slate-600';
          let statusStyle = 'text-slate-400';

          if (st.isDone) {
            cardStyle = 'bg-emerald-50/50 border-emerald-200/90 text-emerald-950 shadow-2xs';
            iconBoxStyle = 'bg-emerald-600 text-white shadow-xs';
            numStyle = 'text-emerald-700';
            titleStyle = 'text-slate-900 font-bold';
            statusStyle = 'text-emerald-700 font-medium';
          } else if (st.isActive) {
            cardStyle = 'bg-indigo-50/60 border-indigo-200 ring-1 ring-indigo-500/20 text-indigo-950 shadow-2xs';
            iconBoxStyle = 'bg-indigo-600 text-white shadow-xs animate-pulse';
            numStyle = 'text-indigo-600';
            titleStyle = 'text-slate-900 font-bold';
            statusStyle = 'text-indigo-600 font-semibold';
          }

          return (
            <div
              key={st.num}
              className={`p-2.5 sm:p-3 rounded-xl border transition-all duration-200 flex items-center gap-3 ${cardStyle}`}
            >
              {/* Icono compacto */}
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-transform ${iconBoxStyle}`}>
                <span className="material-symbols-outlined text-[17px]">
                  {st.isDone ? 'check' : st.icon}
                </span>
              </div>

              {/* Información de la fase */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className={`text-[9.5px] font-mono font-bold uppercase tracking-wider ${numStyle}`}>
                    Paso {st.num}
                  </span>
                  {st.isDone && (
                    <span className="material-symbols-outlined text-[13px] text-emerald-600 shrink-0">
                      verified
                    </span>
                  )}
                  {st.isActive && (
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-ping shrink-0" />
                  )}
                </div>
                <h4 className={`text-xs truncate ${titleStyle}`}>
                  {st.name}
                </h4>
                <p className={`text-[11px] truncate leading-tight mt-0.5 ${statusStyle}`}>
                  {st.statusLabel}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * SatDeliveryCompletedCard
 * Tarjeta de Entrega Final estilo "¡Llegó tu Pedido!"
 * Aparece AL FINAL (debajo de la Matriz de los 12 meses) cuando la extracción se completa.
 */
export function SatDeliveryCompletedCard({
  client,
  selectedYear,
  jobResult,
  selectedFormat = 'both',
  onDownloadZip,
  onReset,
}) {
  const currentFormat = jobResult?.format || selectedFormat || 'both';
  const isXml = currentFormat === 'xml';
  const isPdf = currentFormat === 'pdf';
  const isBoth = currentFormat === 'both';

  const totalNominas = jobResult?.total_nominas || 0;
  const totalDescargas = jobResult?.total_descargas || 0;
  const cancelados = Math.max(0, totalNominas - totalDescargas);
  const finalYear = jobResult?.year || selectedYear;
  const reporteName = jobResult?.excel_path
    ? jobResult.excel_path.split(/[/\\]/).pop()
    : (isBoth ? `Reporte_${client?.rfc || 'RFC'}_${finalYear}.xlsx` : null);

  const titleText = isXml
    ? '¡Tu Paquete de Comprobantes XML está Listo!'
    : isPdf
    ? '¡Tu Paquete de Comprobantes PDF está Listo!'
    : '¡Tu Paquete de Nóminas y Reporte está Listo!';

  const descText = isXml
    ? 'Se completó la recolección de comprobantes en formato XML. El archivo ZIP consolidado con todos los XMLs está listo para tu descarga.'
    : isPdf
    ? 'Se completó la recolección de comprobantes en formato PDF. El archivo ZIP consolidado con todas las representaciones impresas está listo para tu descarga.'
    : 'Se completó la recolección de comprobantes. El reporte detallado en Excel y el archivo ZIP consolidado con todos los comprobantes (PDFs + XMLs) están listos para tu descarga.';

  const buttonText = isXml
    ? 'Descargar Paquete ZIP (XML)'
    : isPdf
    ? 'Descargar Paquete ZIP (PDF)'
    : 'Descargar Paquete ZIP (PDF + XML + Excel)';

  const badgeIncludedText = isXml
    ? `${totalDescargas} XMLs incluidos`
    : isPdf
    ? `${totalDescargas} PDFs incluidos`
    : `${totalDescargas} Comprobantes + Excel`;

  const kpiDescargasLabel = isXml
    ? 'XMLs Descargados'
    : isPdf
    ? 'PDFs Descargados'
    : 'Comprobantes Descargados';

  return (
    <div className="bg-gradient-to-br from-emerald-50/90 via-white to-teal-50/60 border border-emerald-300/90 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col gap-5 animate-in fade-in zoom-in-95 duration-300">
      <div className="flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 sm:w-18 sm:h-18 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-600/30 shrink-0 relative">
            <span className="material-symbols-outlined text-[36px]">card_giftcard</span>
            <div className="absolute -top-1 -right-1 text-base">🎉</div>
            <div className="absolute -bottom-1 -left-1 text-base">✨</div>
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300 mb-1">
              <span className="material-symbols-outlined text-[15px] text-emerald-700">check_circle</span>
              <span>PASO 4: ENTREGA COMPLETADA</span>
            </div>
            <h4 className="text-xl sm:text-2xl font-black text-slate-900 leading-tight">
              {titleText}
            </h4>
            <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-2xl leading-relaxed">
              {descText}
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onDownloadZip}
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-extrabold shadow-lg shadow-emerald-600/25 transition-all cursor-pointer active:scale-95"
          >
            <span className="material-symbols-outlined text-[20px]">download</span>
            <span>{buttonText}</span>
          </button>

          {onReset && (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1.5 px-4 py-3 rounded-2xl bg-white hover:bg-slate-50 border border-emerald-200 text-slate-700 hover:text-slate-900 text-xs font-bold transition-all shadow-2xs cursor-pointer active:scale-95"
              title="Limpiar y preparar para una nueva extracción"
            >
              <span className="material-symbols-outlined text-[17px] text-emerald-600">refresh</span>
              <span>Nueva Consulta</span>
            </button>
          )}

          <span className="text-xs font-semibold text-slate-500">
            {badgeIncludedText}
          </span>
        </div>
      </div>

      {/* Mini KPIs de la entrega final */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-emerald-200/80">
        <div className="bg-white/90 rounded-xl border border-emerald-200/80 p-3 shadow-2xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Nóminas</span>
          <p className="text-lg font-extrabold text-slate-900 mt-0.5 font-mono">{totalNominas}</p>
        </div>
        <div className="bg-white/90 rounded-xl border border-emerald-200/80 p-3 shadow-2xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{kpiDescargasLabel}</span>
          <p className="text-lg font-extrabold text-emerald-600 mt-0.5 font-mono">{totalDescargas}</p>
        </div>
        <div className="bg-white/90 rounded-xl border border-emerald-200/80 p-3 shadow-2xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">CFDI Cancelados</span>
          <p className="text-lg font-extrabold text-amber-600 mt-0.5 font-mono">{cancelados}</p>
        </div>
        <div className="bg-white/90 rounded-xl border border-emerald-200/80 p-3 shadow-2xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            {isBoth ? 'Reporte Excel' : 'Formato Solicitado'}
          </span>
          {isBoth ? (
            <p className="text-xs font-bold text-indigo-600 mt-1 truncate" title={reporteName}>
              {reporteName}
            </p>
          ) : (
            <p className="text-xs font-bold text-emerald-700 mt-1 flex items-center gap-1 truncate">
              <span className="material-symbols-outlined text-[15px]">verified</span>
              <span>{isXml ? 'XML' : 'PDF'}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
