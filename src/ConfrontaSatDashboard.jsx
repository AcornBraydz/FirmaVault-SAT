import React, { useState } from 'react';

export default function ConfrontaSatDashboard({
  data,
  year,
  client,
  onDownloadExcel,
  isDownloading,
  onRefresh,
  isLoading,
}) {
  const [activeTab, setActiveTab] = useState('matriz'); // 'matriz' | 'diferencias' | 'criterio'

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

  const resumen = data?.resumen || {
    ejercicio: year,
    rfc_auditado: client?.rfc,
    total_cfdi_auditados: 0,
    ingresos_contabilidad: 0,
    ingresos_sat: 0,
    delta_ingresos_anual: 0,
    egresos_contabilidad: 0,
    egresos_sat: 0,
    delta_egresos_anual: 0,
    iva_contabilidad: 0,
    iva_sat: 0,
    delta_iva_anual: 0,
    total_discrepancias: 0,
    estatus_general: 'SIN_DATOS'
  };

  const mensual = data?.mensual || [];
  const diferencias = data?.diferencias || [];
  const hasCfdi = (resumen.total_cfdi_auditados || 0) > 0;
  const isConciliado = hasCfdi && Math.abs(resumen.delta_ingresos_anual) < 5 && Math.abs(resumen.delta_iva_anual) < 5;

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300">
      {/* Barra de Control y Acciones Superiores */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-3xl p-6 text-white shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-300 shadow-inner">
            <span className="material-symbols-outlined text-[26px]">balance</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-white tracking-tight">
                Confronta Visor del SAT vs. Contabilidad
              </h2>
              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold border ${
                !hasCfdi
                  ? 'bg-slate-700/60 text-slate-300 border-slate-600'
                  : isConciliado
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30'
                    : 'bg-rose-500/20 text-rose-300 border-rose-400/30'
              }`}>
                {!hasCfdi ? 'Sin CFDI en este Ejercicio' : isConciliado ? '100% Cuadrado' : 'Con Diferencias'}
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Auditoría preventiva de bases gravables de {client?.name} ({client?.rfc}) — Ejercicio {year}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 shadow-xs transition-all cursor-pointer disabled:opacity-50"
            title="Recalcular confronta con XMLs del contribuyente"
          >
            <span className={`material-symbols-outlined text-[16px] ${isLoading ? 'animate-spin' : ''}`}>
              refresh
            </span>
            <span>{isLoading ? 'Auditando...' : 'Actualizar'}</span>
          </button>

          <button
            type="button"
            onClick={onDownloadExcel}
            disabled={isDownloading}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white shadow-md hover:shadow-lg transition-all cursor-pointer disabled:opacity-50 active:scale-95"
          >
            {isDownloading ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <span className="material-symbols-outlined text-[18px]">table_chart</span>
            )}
            <span>Descargar Cédula Excel (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* KPI Cards: Resumen de Confronta */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Ingresos Contabilidad vs SAT */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Ingresos Facturados</span>
            <span className="material-symbols-outlined text-[18px] text-teal-600">payments</span>
          </div>
          <div>
            <div className="text-lg font-black text-slate-900 tracking-tight">
              {formatCurrency(resumen.ingresos_contabilidad)}
            </div>
            <div className="flex items-center justify-between text-[11px] mt-1.5 pt-1.5 border-t border-slate-100">
              <span className="text-slate-500">Visor SAT: {formatCurrency(resumen.ingresos_sat)}</span>
              <span className={`font-mono font-bold ${Math.abs(resumen.delta_ingresos_anual) > 5 ? 'text-rose-600' : 'text-emerald-700'}`}>
                Δ {formatCurrency(resumen.delta_ingresos_anual)}
              </span>
            </div>
          </div>
        </div>

        {/* 2. IVA Trasladado Contabilidad vs SAT */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">IVA Trasladado</span>
            <span className="material-symbols-outlined text-[18px] text-blue-600">account_balance</span>
          </div>
          <div>
            <div className="text-lg font-black text-slate-900 tracking-tight">
              {formatCurrency(resumen.iva_contabilidad)}
            </div>
            <div className="flex items-center justify-between text-[11px] mt-1.5 pt-1.5 border-t border-slate-100">
              <span className="text-slate-500">Visor SAT: {formatCurrency(resumen.iva_sat)}</span>
              <span className={`font-mono font-bold ${Math.abs(resumen.delta_iva_anual) > 5 ? 'text-rose-600' : 'text-emerald-700'}`}>
                Δ {formatCurrency(resumen.delta_iva_anual)}
              </span>
            </div>
          </div>
        </div>

        {/* 3. Gastos / Deducciones */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Deducciones CFDI</span>
            <span className="material-symbols-outlined text-[18px] text-indigo-600">shopping_cart</span>
          </div>
          <div>
            <div className="text-lg font-black text-slate-900 tracking-tight">
              {formatCurrency(resumen.egresos_contabilidad)}
            </div>
            <div className="flex items-center justify-between text-[11px] mt-1.5 pt-1.5 border-t border-slate-100">
              <span className="text-slate-500">Total Auditados: {formatNumber(resumen.total_cfdi_auditados)}</span>
              <span className="text-emerald-700 font-bold font-mono">
                {resumen.total_cfdi_emitidos || 0} Emit / {resumen.total_cfdi_recibidos || 0} Rec
              </span>
            </div>
          </div>
        </div>

        {/* 4. Diagnóstico de Discrepancia */}
        <div className={`rounded-2xl p-4 border shadow-xs flex flex-col justify-between ${
          !hasCfdi
            ? 'bg-slate-50 border-slate-200 text-slate-800'
            : isConciliado
              ? 'bg-emerald-50/50 border-emerald-200 text-emerald-950'
              : 'bg-rose-50/60 border-rose-200 text-rose-950'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-black uppercase tracking-wider">Blindaje de Auditoría</span>
            <span className="material-symbols-outlined text-[18px]">
              {!hasCfdi ? 'info' : isConciliado ? 'verified_user' : 'warning'}
            </span>
          </div>
          <div>
            <div className="text-lg font-black tracking-tight">
              {!hasCfdi
                ? 'Sin CFDI Registrados'
                : isConciliado
                  ? 'Sin Riesgo de Carta Invitación'
                  : `${resumen.total_discrepancias} Inconsistencias`}
            </div>
            <div className="text-[11px] mt-1 font-medium">
              {!hasCfdi
                ? `No hay CFDI registrados para el ejercicio ${year}.`
                : isConciliado
                  ? 'Las bases reportadas concuerdan exactamente con el Visor SAT.'
                  : 'Revisar diferencias antes del pago provisional del día 17.'}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200/80 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('matriz')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'matriz'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">calendar_view_month</span>
          <span>1. Cédula Mensual de Confronta (12 Meses)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('diferencias')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'diferencias'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">troubleshoot</span>
          <span>2. Inconsistencias y Brincos de Mes PAC ({diferencias.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('criterio')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'criterio'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">gavel</span>
          <span>3. Criterio del SAT y Defensa Fiscal</span>
        </button>
      </div>

      {/* Tab 1: Matriz de Confronta Mensual */}
      {activeTab === 'matriz' && (
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="p-5 bg-slate-50/70 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-slate-900">
                Amarre Mensual de Ingresos e Impuestos — Ejercicio {year}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Cotejo directo de ingresos acumulables y deltas para asegurar que no existan inconsistencias con la propuesta del SAT.
              </p>
            </div>
            <div className="text-xs text-slate-600 bg-white px-3 py-1.5 rounded-xl border border-slate-200 font-medium flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span>Verde: Conciliado al 100%</span>
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 ml-2" />
              <span>Rojo: Requiere aclaración contable</span>
            </div>
          </div>

          {!hasCfdi && (
            <div className="mx-5 my-4 p-4 rounded-2xl bg-amber-50/80 border border-amber-200/80 flex items-start gap-3 text-amber-900">
              <span className="material-symbols-outlined text-amber-600 text-[20px] shrink-0 mt-0.5">info</span>
              <div>
                <h4 className="text-xs font-bold text-amber-950">
                  No hay comprobantes fiscales registrados para el ejercicio {year}
                </h4>
                <p className="text-[11px] text-amber-800/90 mt-0.5">
                  Para auditar este año contra el Visor del SAT, ingresa a <strong className="font-semibold">Extracción SAT &gt; Facturas</strong> para descargar los CFDI de este periodo o sube tus archivos XML desde el panel superior.
                </p>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/80 text-slate-700 font-black border-b border-slate-200 text-[11px] uppercase tracking-wider">
                  <th className="py-3 px-4">Mes</th>
                  <th className="py-3 px-3 text-center">CFDI</th>
                  <th className="py-3 px-4 text-right">Ingresos (Conta)</th>
                  <th className="py-3 px-4 text-right">Ingresos (SAT)</th>
                  <th className="py-3 px-4 text-right">Δ Ingresos ($)</th>
                  <th className="py-3 px-4 text-right">IVA Trasl. (Conta)</th>
                  <th className="py-3 px-4 text-right">IVA Trasl. (SAT)</th>
                  <th className="py-3 px-4 text-right">Δ IVA ($)</th>
                  <th className="py-3 px-3 text-center">Semáforo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-[11.5px]">
                {mensual.map((m) => {
                  const hasDiscrepancy = m.estatus_semaforo === 'DISCREPANCIA';
                  const isWarning = m.estatus_semaforo === 'REVISION';

                  return (
                    <tr key={m.mes} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-sans font-black text-slate-900">
                        {m.nombre}
                      </td>
                      <td className="py-3 px-3 text-center font-sans font-bold text-slate-600">
                        {m.cfdi_emitidos_count}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-900 font-semibold">
                        {formatCurrency(m.ingresos_contabilidad)}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-600">
                        {formatCurrency(m.ingresos_sat)}
                      </td>
                      <td className={`py-3 px-4 text-right font-bold ${
                        Math.abs(m.delta_ingresos) > 5 ? 'text-rose-600 bg-rose-50/50' : 'text-emerald-700'
                      }`}>
                        {formatCurrency(m.delta_ingresos)}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-900">
                        {formatCurrency(m.iva_trasladado_contabilidad)}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-600">
                        {formatCurrency(m.iva_trasladado_sat)}
                      </td>
                      <td className={`py-3 px-4 text-right font-bold ${
                        Math.abs(m.delta_iva) > 5 ? 'text-rose-600 bg-rose-50/50' : 'text-emerald-700'
                      }`}>
                        {formatCurrency(m.delta_iva)}
                      </td>
                      <td className="py-3 px-3 text-center font-sans">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                          hasDiscrepancy
                            ? 'bg-rose-100 text-rose-800'
                            : isWarning
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {m.estatus_semaforo}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-900 text-white font-mono font-bold text-xs border-t-2 border-slate-800">
                  <td className="py-3.5 px-4 font-sans font-black">TOTAL ANUAL {year}</td>
                  <td className="py-3.5 px-3 text-center font-sans">{formatNumber(resumen.total_cfdi_auditados)}</td>
                  <td className="py-3.5 px-4 text-right">{formatCurrency(resumen.ingresos_contabilidad)}</td>
                  <td className="py-3.5 px-4 text-right text-slate-300">{formatCurrency(resumen.ingresos_sat)}</td>
                  <td className={`py-3.5 px-4 text-right font-black ${
                    Math.abs(resumen.delta_ingresos_anual) > 5 ? 'text-rose-300' : 'text-emerald-300'
                  }`}>
                    {formatCurrency(resumen.delta_ingresos_anual)}
                  </td>
                  <td className="py-3.5 px-4 text-right">{formatCurrency(resumen.iva_contabilidad)}</td>
                  <td className="py-3.5 px-4 text-right text-slate-300">{formatCurrency(resumen.iva_sat)}</td>
                  <td className={`py-3.5 px-4 text-right font-black ${
                    Math.abs(resumen.delta_iva_anual) > 5 ? 'text-rose-300' : 'text-emerald-300'
                  }`}>
                    {formatCurrency(resumen.delta_iva_anual)}
                  </td>
                  <td className="py-3.5 px-3 text-center font-sans">
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-emerald-300 text-[10px] font-black">
                      {resumen.estatus_general}
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Inconsistencias */}
      {activeTab === 'diferencias' && (
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="p-5 bg-slate-50/70 border-b border-slate-200/80">
            <h3 className="text-sm font-black text-slate-900">
              Inconsistencias Detectadas y Fechas de Timbrado PAC ({diferencias.length})
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              CFDI cuya fecha de emisión pertenece a un mes pero fueron certificados por el PAC en el mes subsecuente.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/80 text-slate-700 font-black border-b border-slate-200 text-[11px] uppercase tracking-wider">
                  <th className="py-3 px-4">Folio Fiscal (UUID)</th>
                  <th className="py-3 px-3">Efecto</th>
                  <th className="py-3 px-4">Fecha Emisión</th>
                  <th className="py-3 px-4">Certificación PAC</th>
                  <th className="py-3 px-4 text-right">Subtotal ($)</th>
                  <th className="py-3 px-5">Motivo de la Discrepancia</th>
                  <th className="py-3 px-3 text-center">Riesgo Fiscal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-[11.5px]">
                {diferencias.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400 font-sans text-xs">
                      No se detectaron brincos de mes ni inconsistencias entre fecha de emisión y certificación en este ejercicio.
                    </td>
                  </tr>
                ) : (
                  diferencias.map((d, i) => (
                    <tr key={d.uuid || i} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        {d.uuid}
                      </td>
                      <td className="py-3 px-3 font-sans font-bold text-slate-700">
                        {d.tipo}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {d.emision}
                      </td>
                      <td className="py-3 px-4 text-amber-900 font-bold">
                        {d.certificacion}
                      </td>
                      <td className="py-3 px-4 text-right font-black text-slate-900">
                        {formatCurrency(d.monto)}
                      </td>
                      <td className="py-3 px-5 font-sans text-slate-700 max-w-sm leading-relaxed">
                        {d.motivo}
                      </td>
                      <td className="py-3 px-3 text-center font-sans">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                          {d.riesgo}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Criterio Fiscal */}
      {activeTab === 'criterio' && (
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs p-6 flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-800 flex items-center justify-center">
              <span className="material-symbols-outlined text-[22px]">policy</span>
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900">
                Criterio Normativo del SAT sobre Fechas de Comprobantes y Declaraciones
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Fundamentos jurídicos y criterios de defensa ante Cartas Invitación por discrepancia de ingresos.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-col gap-2">
              <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-amber-700">schedule</span>
                <span>Plazo de 72 Horas para Timbrado</span>
              </h4>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Conforme a la regla 2.7.2.9 de la RMF, los PACs tienen hasta 72 horas para timbrar un comprobante. Si una factura se emite el día 31 a las 23:50 pero se timbra el día 1, el SAT suele computarla en el mes del timbrado.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-col gap-2">
              <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-amber-700">mail</span>
                <span>Cartas Invitación y Vigilancia Profunda</span>
              </h4>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                El SAT cruza sus bases mediante robots. Si tu declaración provisional difiere de sus metadatos, envía una notificación electrónica invitando a autocorregirte. Esta cédula sirve como papel de trabajo probatorio para desvirtuar la observación.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-col gap-2">
              <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-amber-700">verified</span>
                <span>Criterio de Acumulación (Art. 17 LISR)</span>
              </h4>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Los ingresos se acumulan cuando se expide el comprobante, se entrega el bien o se cobra el precio, lo que suceda primero. Tener identificadas las diferencias protege la materialidad y la correcta determinación de pagos provisionales.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
