import React, { useState, useMemo } from 'react';

export default function ResumenNominasDashboard({
  data,
  year,
  month,
  client,
  onDownloadExcel,
  isDownloading,
  onRefresh,
  isLoading,
}) {
  const [activeTab, setActiveTab] = useState('declaracion'); // 'declaracion' | 'trabajadores' | 'guia'
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedMonth, setCopiedMonth] = useState(null);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 2,
    }).format(amount || 0);
  };

  const formatNumber = (num) => {
    return new Intl.NumberFormat('es-MX').format(num || 0);
  };

  const m = data?.totales || data?.metricas || {};
  const totales = {
    total_percepciones: m.total_percepciones || 0,
    gravado: m.gravado ?? m.total_gravado ?? 0,
    exento: m.exento ?? m.total_exento ?? 0,
    isr_retenido: m.isr_retenido ?? m.total_isr_retenido ?? 0,
    subsidio_empleo: m.subsidio_empleo ?? m.total_subsidio_empleo ?? 0,
    isr_neto_a_pagar: m.isr_neto_a_pagar || 0,
    seguridad_social: m.seguridad_social || 0,
  };

  const mensual = data?.mensual || [];
  const trabajadores = data?.trabajadores || [];
  const totalRecibos = data?.total_recibos || data?.metricas?.total_recibos || 0;
  const totalTrabajadores = data?.total_trabajadores || data?.metricas?.total_trabajadores || trabajadores.length || 0;

  // Filtered workers
  const filteredTrabajadores = useMemo(() => {
    if (!searchTerm.trim()) return trabajadores;
    const term = searchTerm.toLowerCase();
    return trabajadores.filter(
      (t) =>
        t.rfc?.toLowerCase().includes(term) ||
        t.nombre?.toLowerCase().includes(term) ||
        t.curp?.toLowerCase().includes(term)
    );
  }, [trabajadores, searchTerm]);

  // Copy monthly row figures to clipboard for SAT portal direct capture
  const handleCopyMonthFigures = (m) => {
    const text = `DECLARACIÓN SAT ${m.nombre.toUpperCase()} ${year}
RFC Patrón: ${client?.rfc || ''}
Total Percepciones: ${formatCurrency(m.percepciones)}
Ingresos Gravados: ${formatCurrency(m.gravado)}
Ingresos Exentos: ${formatCurrency(m.exento)}
ISR Retenido por Salarios: ${formatCurrency(m.isr)}
Subsidio para el Empleo (SPE): ${formatCurrency(m.subsidio)}
ISR Neto a Enterar al SAT: ${formatCurrency(m.isr_neto)}
Retención IMSS: ${formatCurrency(m.imss)}`;

    navigator.clipboard.writeText(text);
    setCopiedMonth(m.mes);
    setTimeout(() => setCopiedMonth(null), 2500);
  };

  const hasData = totalRecibos > 0;

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300">
      {/* Barra de Control y Acciones Superiores */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-3xl p-6 text-white shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-teal-500/20 border border-teal-400/30 flex items-center justify-center text-teal-300 shadow-inner">
            <span className="material-symbols-outlined text-[26px]">badge</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-white tracking-tight">
                Resumen de Nóminas para Declarar
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-teal-500/20 text-teal-300 border border-teal-400/30">
                Art. 96 LISR
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Cédula de Retenciones por Salarios y Subsidio al Empleo para {client?.name} ({client?.rfc}) — Ejercicio {year}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 shadow-xs transition-all cursor-pointer disabled:opacity-50"
            title="Recalcular métricas de nómina desde XMLs"
          >
            <span className={`material-symbols-outlined text-[16px] ${isLoading ? 'animate-spin' : ''}`}>
              refresh
            </span>
            <span>{isLoading ? 'Calculando...' : 'Actualizar'}</span>
          </button>

          <button
            type="button"
            onClick={onDownloadExcel}
            disabled={isDownloading || !hasData}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white shadow-md hover:shadow-lg transition-all cursor-pointer disabled:opacity-50 active:scale-95"
          >
            {isDownloading ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <span className="material-symbols-outlined text-[18px]">table_view</span>
            )}
            <span>Descargar Papel de Trabajo (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* KPI Cards: Las 6 Cifras Maestras para Declaración SAT */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
        {/* 1. Total Percepciones */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Percepciones</span>
            <span className="material-symbols-outlined text-[18px] text-blue-600">payments</span>
          </div>
          <div>
            <div className="text-lg font-black text-slate-900 tracking-tight">
              {formatCurrency(totales.total_percepciones)}
            </div>
            <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1 font-medium">
              <span>{formatNumber(totalRecibos)} CFDI procesados</span>
            </div>
          </div>
        </div>

        {/* 2. Ingresos Gravados */}
        <div className="bg-white rounded-2xl p-4 border border-teal-200 bg-gradient-to-b from-teal-50/30 to-white shadow-xs hover:border-teal-300 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between text-teal-800 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Ingresos Gravados</span>
            <span className="material-symbols-outlined text-[18px] text-teal-600">check_circle</span>
          </div>
          <div>
            <div className="text-lg font-black text-teal-900 tracking-tight">
              {formatCurrency(totales.gravado)}
            </div>
            <div className="text-[10px] text-teal-700 mt-1 font-semibold">
              Base gravable Art. 96 LISR
            </div>
          </div>
        </div>

        {/* 3. Ingresos Exentos */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Ingresos Exentos</span>
            <span className="material-symbols-outlined text-[18px] text-emerald-600">verified</span>
          </div>
          <div>
            <div className="text-lg font-black text-slate-900 tracking-tight">
              {formatCurrency(totales.exento)}
            </div>
            <div className="text-[10px] text-emerald-700 mt-1 font-semibold">
              Exenciones Art. 93 LISR
            </div>
          </div>
        </div>

        {/* 4. ISR Retenido Bruto */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">ISR Retenido (Bruto)</span>
            <span className="material-symbols-outlined text-[18px] text-rose-600">request_quote</span>
          </div>
          <div>
            <div className="text-lg font-black text-slate-900 tracking-tight">
              {formatCurrency(totales.isr_retenido)}
            </div>
            <div className="text-[10px] text-slate-500 mt-1 font-medium">
              Sumatoria de retenciones
            </div>
          </div>
        </div>

        {/* 5. Subsidio al Empleo (SPE) */}
        <div className="bg-white rounded-2xl p-4 border border-amber-200 bg-gradient-to-b from-amber-50/20 to-white shadow-xs hover:border-amber-300 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between text-amber-800 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Subsidio Empleo (SPE)</span>
            <span className="material-symbols-outlined text-[18px] text-amber-600">savings</span>
          </div>
          <div>
            <div className="text-lg font-black text-amber-900 tracking-tight">
              {formatCurrency(totales.subsidio_empleo)}
            </div>
            <div className="text-[10px] text-amber-700 mt-1 font-semibold">
              Clave 002 OtroPago
            </div>
          </div>
        </div>

        {/* 6. ISR Neto a Enterar al SAT */}
        <div className="bg-gradient-to-br from-teal-900 via-teal-950 to-slate-900 text-white rounded-2xl p-4 shadow-md border border-teal-700/50 flex flex-col justify-between">
          <div className="flex items-center justify-between text-teal-300 mb-2">
            <span className="text-[11px] font-black uppercase tracking-wider">ISR Neto a Declarar</span>
            <span className="material-symbols-outlined text-[18px] text-emerald-400">account_balance</span>
          </div>
          <div>
            <div className="text-xl font-black text-emerald-300 tracking-tight">
              {formatCurrency(totales.isr_neto_a_pagar)}
            </div>
            <div className="text-[10px] text-teal-200 mt-1 font-bold">
              Línea de captura SAT
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200/80 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('declaracion')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'declaracion'
              ? 'bg-teal-700 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">summarize</span>
          <span>1. Declaración SAT Mensual ({mensual.length} meses)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('trabajadores')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'trabajadores'
              ? 'bg-teal-700 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">groups</span>
          <span>2. Cédula por Trabajador ({trabajadores.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('guia')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'guia'
              ? 'bg-teal-700 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">help_outline</span>
          <span>3. Guía de Captura SAT</span>
        </button>
      </div>

      {/* Zero State if no data */}
      {!hasData && (
        <div className="bg-gradient-to-b from-slate-50 to-slate-100/60 rounded-3xl border border-dashed border-slate-200 p-12 text-center flex flex-col items-center justify-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-white text-teal-700 flex items-center justify-center border border-slate-200 shadow-sm">
            <span className="material-symbols-outlined text-[32px]">folder_off</span>
          </div>
          <div className="max-w-md">
            <h4 className="text-base font-black text-slate-900">
              No se han encontrado comprobantes de nómina para {year}
            </h4>
            <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
              Para generar el resumen automático, asegúrate de haber ejecutado la herramienta{' '}
              <strong className="text-slate-800 font-bold">"Recibos de Nómina"</strong> (Módulo 1) para descargar los CFDI de nómina de los trabajadores, o coloca los archivos XML en el repositorio del contribuyente.
            </p>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-black shadow-sm transition-all cursor-pointer active:scale-95"
          >
            <span className="material-symbols-outlined text-[17px]">sync</span>
            <span>Verificar y Buscar XMLs Ahora</span>
          </button>
        </div>
      )}

      {/* Tab 1: Declaración SAT Mensual Acumulada */}
      {hasData && activeTab === 'declaracion' && (
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="p-5 bg-slate-50/70 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-slate-900">
                Cédula Mensual de Retenciones por Salarios — Ejercicio {year}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Cifras listas para transcribir al formulario oficial de Declaraciones y Pagos del SAT.
              </p>
            </div>
            <div className="text-xs text-slate-600 bg-white px-3 py-1.5 rounded-xl border border-slate-200 font-medium">
              💡 Haz clic en <span className="font-bold text-teal-700">Copiar</span> en cualquier mes para copiar el desglose al portapapeles.
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/80 text-slate-700 font-black border-b border-slate-200 text-[11px] uppercase tracking-wider">
                  <th className="py-3 px-4">Mes</th>
                  <th className="py-3 px-3 text-center">CFDI</th>
                  <th className="py-3 px-4 text-right">Total Percepciones</th>
                  <th className="py-3 px-4 text-right text-teal-800">Ingreso Gravado</th>
                  <th className="py-3 px-4 text-right text-slate-700">Ingreso Exento</th>
                  <th className="py-3 px-4 text-right text-rose-800">ISR Retenido</th>
                  <th className="py-3 px-4 text-right text-amber-800">Subsidio (SPE)</th>
                  <th className="py-3 px-4 text-right text-emerald-800 font-black bg-emerald-50/50">
                    ISR Neto a Enterar
                  </th>
                  <th className="py-3 px-4 text-right text-blue-800">Ret. IMSS</th>
                  <th className="py-3 px-3 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-[11.5px]">
                {mensual.map((m) => {
                  const hasMonthData = m.recibos > 0;
                  const isCopied = copiedMonth === m.mes;

                  return (
                    <tr
                      key={m.mes}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        hasMonthData ? '' : 'opacity-40'
                      }`}
                    >
                      <td className="py-3 px-4 font-sans font-black text-slate-900">
                        {m.nombre}
                      </td>
                      <td className="py-3 px-3 text-center font-sans font-bold text-slate-600">
                        {m.recibos > 0 ? formatNumber(m.recibos) : '—'}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-900 font-semibold">
                        {formatCurrency(m.percepciones)}
                      </td>
                      <td className="py-3 px-4 text-right text-teal-900 font-bold">
                        {formatCurrency(m.gravado)}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-600">
                        {formatCurrency(m.exento)}
                      </td>
                      <td className="py-3 px-4 text-right text-rose-700 font-semibold">
                        {formatCurrency(m.isr)}
                      </td>
                      <td className="py-3 px-4 text-right text-amber-800">
                        {formatCurrency(m.subsidio)}
                      </td>
                      <td className="py-3 px-4 text-right font-black text-emerald-800 bg-emerald-50/40">
                        {formatCurrency(m.isr_neto)}
                      </td>
                      <td className="py-3 px-4 text-right text-blue-900">
                        {formatCurrency(m.imss)}
                      </td>
                      <td className="py-3 px-3 text-center font-sans">
                        {hasMonthData && (
                          <button
                            type="button"
                            onClick={() => handleCopyMonthFigures(m)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                              isCopied
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : 'bg-white hover:bg-teal-50 text-teal-700 border-teal-200'
                            }`}
                            title="Copiar datos del mes al portapapeles"
                          >
                            <span className="material-symbols-outlined text-[13px]">
                              {isCopied ? 'check' : 'content_copy'}
                            </span>
                            <span>{isCopied ? '¡Copiado!' : 'Copiar'}</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-900 text-white font-mono font-bold text-xs border-t-2 border-slate-800">
                  <td className="py-3.5 px-4 font-sans font-black">TOTAL ANUAL {year}</td>
                  <td className="py-3.5 px-3 text-center font-sans">{formatNumber(totalRecibos)}</td>
                  <td className="py-3.5 px-4 text-right">{formatCurrency(totales.total_percepciones)}</td>
                  <td className="py-3.5 px-4 text-right text-teal-300">{formatCurrency(totales.gravado)}</td>
                  <td className="py-3.5 px-4 text-right text-slate-300">{formatCurrency(totales.exento)}</td>
                  <td className="py-3.5 px-4 text-right text-rose-300">{formatCurrency(totales.isr_retenido)}</td>
                  <td className="py-3.5 px-4 text-right text-amber-300">{formatCurrency(totales.subsidio_empleo)}</td>
                  <td className="py-3.5 px-4 text-right text-emerald-300 font-black bg-slate-800">
                    {formatCurrency(totales.isr_neto_a_pagar)}
                  </td>
                  <td className="py-3.5 px-4 text-right text-blue-300">{formatCurrency(totales.seguridad_social)}</td>
                  <td className="py-3.5 px-3"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Cédula por Trabajador */}
      {hasData && activeTab === 'trabajadores' && (
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="p-5 bg-slate-50/70 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-slate-900">
                Padrón Nominal de Trabajadores ({trabajadores.length})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Desglose anual acumulado por empleado para conciliar con la Constancia de Sueldos y Salarios.
              </p>
            </div>

            <div className="relative w-72">
              <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-[18px]">
                search
              </span>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por Nombre, RFC o CURP..."
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white font-medium"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/80 text-slate-700 font-black border-b border-slate-200 text-[11px] uppercase tracking-wider">
                  <th className="py-3 px-4">Trabajador / RFC</th>
                  <th className="py-3 px-3">CURP</th>
                  <th className="py-3 px-2 text-center">CFDI</th>
                  <th className="py-3 px-4 text-right">Percepciones</th>
                  <th className="py-3 px-4 text-right text-teal-800">Gravado</th>
                  <th className="py-3 px-4 text-right text-slate-600">Exento</th>
                  <th className="py-3 px-4 text-right text-rose-800">ISR Retenido</th>
                  <th className="py-3 px-4 text-right text-amber-800">Subsidio SPE</th>
                  <th className="py-3 px-4 text-right text-emerald-800 font-bold">ISR Neto</th>
                  <th className="py-3 px-4 text-right text-blue-800">IMSS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-[11.5px]">
                {filteredTrabajadores.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-slate-400 font-sans text-xs">
                      No se encontraron trabajadores que coincidan con "{searchTerm}".
                    </td>
                  </tr>
                ) : (
                  filteredTrabajadores.map((t, idx) => (
                    <tr key={t.rfc || idx} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-sans">
                        <div className="font-bold text-slate-900">{t.nombre || 'Sin nombre'}</div>
                        <div className="font-mono text-[10px] text-teal-700 font-semibold">{t.rfc}</div>
                      </td>
                      <td className="py-3 px-3 font-mono text-[10.5px] text-slate-500">
                        {t.curp || '—'}
                      </td>
                      <td className="py-3 px-2 text-center font-sans font-bold text-slate-700">
                        {t.recibos}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-slate-900">
                        {formatCurrency(t.percepciones)}
                      </td>
                      <td className="py-3 px-4 text-right text-teal-900 font-semibold">
                        {formatCurrency(t.gravado)}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-600">
                        {formatCurrency(t.exento)}
                      </td>
                      <td className="py-3 px-4 text-right text-rose-700 font-semibold">
                        {formatCurrency(t.isr)}
                      </td>
                      <td className="py-3 px-4 text-right text-amber-800">
                        {formatCurrency(t.subsidio)}
                      </td>
                      <td className="py-3 px-4 text-right font-black text-emerald-800">
                        {formatCurrency(t.isr_neto)}
                      </td>
                      <td className="py-3 px-4 text-right text-blue-900">
                        {formatCurrency(t.imss)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Guía de Captura SAT */}
      {activeTab === 'guia' && (
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs p-6 flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
              <span className="material-symbols-outlined text-[22px]">assignment_turned_in</span>
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900">
                Paso a Paso Oficial: Captura de Retenciones por Salarios en el SAT
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Sigue esta secuencia para presentar tu declaración mensual sin diferencias ni inconsistencias.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-col gap-2">
              <div className="w-7 h-7 rounded-lg bg-teal-700 text-white flex items-center justify-center font-black text-xs">
                1
              </div>
              <h4 className="text-xs font-bold text-slate-900">Acceso al Portal SAT</h4>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Ingresa con RFC y Contraseña a <span className="font-mono text-teal-800 font-semibold">sat.gob.mx</span> &gt; Declaraciones &gt; Presenta tus pagos provisionales o definitivos.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-col gap-2">
              <div className="w-7 h-7 rounded-lg bg-teal-700 text-white flex items-center justify-center font-black text-xs">
                2
              </div>
              <h4 className="text-xs font-bold text-slate-900">Seleccionar Obligación</h4>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Marca la casilla <strong className="text-slate-800 font-semibold">"ISR retenciones por salarios"</strong> para el ejercicio y periodo a declarar.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-col gap-2">
              <div className="w-7 h-7 rounded-lg bg-teal-700 text-white flex items-center justify-center font-black text-xs">
                3
              </div>
              <h4 className="text-xs font-bold text-slate-900">Capturar Cifras</h4>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Copia las cifras exactas de la pestaña <strong className="text-teal-700 font-semibold">"Declaración SAT"</strong>: Total de Ingresos Gravados, Exentos e ISR retenido.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-col gap-2">
              <div className="w-7 h-7 rounded-lg bg-teal-700 text-white flex items-center justify-center font-black text-xs">
                4
              </div>
              <h4 className="text-xs font-bold text-slate-900">Acreditar Subsidio</h4>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                En el campo <span className="font-mono text-amber-800 font-semibold">Subsidio para el empleo causado</span>, captura el monto indicado para obtener el mismo <strong>ISR a Pagar</strong>.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
