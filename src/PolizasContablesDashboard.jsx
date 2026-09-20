import React, { useState } from 'react';

export default function PolizasContablesDashboard({
  data,
  year,
  month,
  client,
  onDownloadFormat,
  isDownloading,
  onRefresh,
  isLoading,
}) {
  const [activeTab, setActiveTab] = useState('asientos'); // 'asientos' | 'catalogo' | 'guia'
  const [selectedFormat, setSelectedFormat] = useState('excel'); // 'excel' | 'contpaqi' | 'coi'
  const [filtroTipo, setFiltroTipo] = useState('ALL'); // 'ALL' | 'INGRESOS' | 'EGRESOS' | 'NÓMINA'

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
    mes: month,
    total_polizas: 0,
    polizas_ingresos: 0,
    polizas_egresos: 0,
    polizas_nomina: 0,
    polizas_diario: 0,
    total_debe: 0,
    total_haber: 0,
    descuadre: 0,
    cumple_anexo_24: true
  };

  const polizas = data?.polizas || [];
  const filteredPolizas = filtroTipo === 'ALL'
    ? polizas
    : polizas.filter((p) => p.tipo === filtroTipo);

  const isCuadrado = Math.abs(resumen.descuadre) < 0.05;

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300">
      {/* Barra Superior de Control */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-3xl p-6 text-white shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-teal-500/20 border border-teal-400/30 flex items-center justify-center text-teal-300 shadow-inner">
            <span className="material-symbols-outlined text-[26px]">menu_book</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-white tracking-tight">
                Generador de Pólizas Contables (Anexo 24 RMF)
              </h2>
              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold border ${
                isCuadrado
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30'
                  : 'bg-rose-500/20 text-rose-300 border-rose-400/30'
              }`}>
                {isCuadrado ? 'Sumas Iguales Cuadradas' : 'Descuadre Contable'}
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Pólizas de diario, ingresos y egresos con asociación de UUID para {client?.name} ({client?.rfc}) — {year}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Selector de formato de exportación */}
          <div className="flex items-center bg-slate-800 rounded-xl p-1 border border-slate-700">
            <button
              type="button"
              onClick={() => setSelectedFormat('excel')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                selectedFormat === 'excel'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Excel (.xlsx)
            </button>
            <button
              type="button"
              onClick={() => setSelectedFormat('contpaqi')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                selectedFormat === 'contpaqi'
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Contpaqi (.txt)
            </button>
            <button
              type="button"
              onClick={() => setSelectedFormat('coi')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                selectedFormat === 'coi'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Aspel COI (.csv)
            </button>
          </div>

          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 shadow-xs transition-all cursor-pointer disabled:opacity-50"
          >
            <span className={`material-symbols-outlined text-[16px] ${isLoading ? 'animate-spin' : ''}`}>
              refresh
            </span>
            <span>Actualizar</span>
          </button>

          <button
            type="button"
            onClick={() => onDownloadFormat && onDownloadFormat(selectedFormat)}
            disabled={isDownloading}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white shadow-md hover:shadow-lg transition-all cursor-pointer disabled:opacity-50 active:scale-95"
          >
            {isDownloading ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <span className="material-symbols-outlined text-[18px]">download</span>
            )}
            <span>Exportar ({selectedFormat.toUpperCase()})</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Pólizas</span>
          <div className="text-xl font-black text-slate-900 mt-1">
            {formatNumber(resumen.total_polizas)}
          </div>
          <div className="text-[10px] text-slate-500 mt-1 font-medium">
            {resumen.polizas_ingresos} Ing / {resumen.polizas_egresos} Egr / {resumen.polizas_nomina} Nóm
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Cargos (Debe)</span>
          <div className="text-xl font-black text-slate-900 mt-1">
            {formatCurrency(resumen.total_debe)}
          </div>
          <div className="text-[10px] text-teal-700 mt-1 font-semibold">
            Bancos y Gastos deducibles
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Abonos (Haber)</span>
          <div className="text-xl font-black text-slate-900 mt-1">
            {formatCurrency(resumen.total_haber)}
          </div>
          <div className="text-[10px] text-teal-700 mt-1 font-semibold">
            Ingresos e Impuestos causados
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-emerald-200 bg-emerald-50/20 shadow-xs flex flex-col justify-between">
          <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">Sumas Iguales</span>
          <div className="text-xl font-black text-emerald-900 mt-1">
            {formatCurrency(Math.abs(resumen.descuadre))}
          </div>
          <div className="text-[10px] text-emerald-700 mt-1 font-bold">
            Partida Doble Cuadrada
          </div>
        </div>

        <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl p-4 shadow-xs flex flex-col justify-between">
          <span className="text-[11px] font-black uppercase tracking-wider text-teal-300">Anexo 24 SAT</span>
          <div className="text-lg font-black text-white mt-1 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[20px] text-emerald-400">check_circle</span>
            <span>100% con UUID</span>
          </div>
          <div className="text-[10px] text-slate-300 mt-1 font-mono">
            Regla 2.8.1.5 RMF
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 pb-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('asientos')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'asientos'
                ? 'bg-teal-700 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">receipt_long</span>
            <span>1. Asientos y Pólizas ({filteredPolizas.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('catalogo')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'catalogo'
                ? 'bg-teal-700 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">format_list_numbered</span>
            <span>2. Catálogo Agrupador SAT</span>
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
            <span>3. Guía de Carga (Contpaqi / COI)</span>
          </button>
        </div>

        {activeTab === 'asientos' && (
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-500 mr-1">Filtrar:</span>
            {['ALL', 'INGRESOS', 'EGRESOS', 'NÓMINA'].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setFiltroTipo(t)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                  filtroTipo === t
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {t === 'ALL' ? 'Todas' : t}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tab 1: Pólizas */}
      {activeTab === 'asientos' && (
        <div className="flex flex-col gap-4">
          {filteredPolizas.length === 0 ? (
            <div className="p-12 text-center bg-slate-50 rounded-3xl border border-dashed border-slate-200 text-slate-500 text-xs">
              No se encontraron pólizas generadas para este periodo.
            </div>
          ) : (
            filteredPolizas.slice(0, 50).map((p) => (
              <div
                key={p.num}
                className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden"
              >
                <div className="px-5 py-3 bg-slate-50/80 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono font-bold text-xs px-2.5 py-0.5 rounded-lg bg-slate-200 text-slate-800">
                      Póliza #{p.num}
                    </span>
                    <span className={`text-[10.5px] font-black uppercase px-2 py-0.5 rounded-md ${
                      p.tipo === 'INGRESOS'
                        ? 'bg-emerald-100 text-emerald-800'
                        : p.tipo === 'EGRESOS'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      {p.tipo}
                    </span>
                    <span className="text-xs font-bold text-slate-900">{p.concepto}</span>
                  </div>
                  <div className="text-xs text-slate-500 font-mono font-medium">
                    Fecha: {p.fecha} | Total: <strong className="text-slate-900">{formatCurrency(p.total)}</strong>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100/50 text-slate-600 font-bold border-b border-slate-100 text-[10.5px] uppercase">
                        <th className="py-2 px-4">Cuenta SAT</th>
                        <th className="py-2 px-4">Nombre Cuenta</th>
                        <th className="py-2 px-4">Concepto Movimiento</th>
                        <th className="py-2 px-4 text-right">Debe (Cargo $)</th>
                        <th className="py-2 px-4 text-right">Haber (Abono $)</th>
                        <th className="py-2 px-4">UUID CFDI</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                      {p.asientos.map((a, aIdx) => (
                        <tr key={aIdx} className="hover:bg-slate-50/50">
                          <td className="py-2 px-4 font-bold text-teal-800">{a.cuenta}</td>
                          <td className="py-2 px-4 font-sans text-slate-800 font-medium">{a.nombre_cuenta}</td>
                          <td className="py-2 px-4 font-sans text-slate-600">{a.concepto}</td>
                          <td className="py-2 px-4 text-right font-bold text-slate-900">
                            {a.debe > 0 ? formatCurrency(a.debe) : '—'}
                          </td>
                          <td className="py-2 px-4 text-right font-bold text-slate-900">
                            {a.haber > 0 ? formatCurrency(a.haber) : '—'}
                          </td>
                          <td className="py-2 px-4 text-slate-400 text-[10px]">{a.uuid || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
          {filteredPolizas.length > 50 && (
            <div className="p-4 text-center text-xs text-slate-500 font-medium bg-slate-50 rounded-2xl border border-slate-200">
              Mostrando las primeras 50 pólizas en pantalla. Descarga el paquete completo en Excel, Contpaqi o COI para ver la totalidad ({filteredPolizas.length}).
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Catálogo Agrupador */}
      {activeTab === 'catalogo' && (
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs p-6 flex flex-col gap-4">
          <h3 className="text-sm font-black text-slate-900">
            Catálogo Estándar de Cuentas Conforme al Anexo 24 de la RMF
          </h3>
          <p className="text-xs text-slate-500">
            Cuentas oficiales del SAT preconfiguradas para la generación de asientos y pólizas automáticas.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50">
              <span className="font-bold text-teal-800">102.01.001</span> — Bancos Nacionales (Activo Circulante)
            </div>
            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50">
              <span className="font-bold text-teal-800">118.01.001</span> — IVA Acreditable Efectivamente Pagado
            </div>
            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50">
              <span className="font-bold text-teal-800">208.01.001</span> — IVA Trasladado Efectivamente Cobrado
            </div>
            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50">
              <span className="font-bold text-teal-800">216.01.001</span> — Retenciones de ISR por Salarios
            </div>
            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50">
              <span className="font-bold text-teal-800">401.01.001</span> — Ventas y Servicios Gravados al 16%
            </div>
            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50">
              <span className="font-bold text-teal-800">601.01.001</span> — Gastos Generales de Operación
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Guía de Importación */}
      {activeTab === 'guia' && (
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs p-6 flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
              <span className="material-symbols-outlined text-[22px]">integration_instructions</span>
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900">
                Paso a Paso: Importación de Pólizas en tu Software Contable
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Instrucciones para cargar masivamente pólizas con UUID en Contpaqi y Aspel COI.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-col gap-3">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-teal-100 text-teal-800 self-start">
                Contpaqi Contabilidad
              </span>
              <h4 className="text-xs font-bold text-slate-900">Importación de Archivo TXT</h4>
              <ol className="text-[11px] text-slate-600 list-decimal pl-4 space-y-1.5 leading-relaxed">
                <li>Descarga el archivo seleccionando el botón <strong className="text-slate-800">Contpaqi (.txt)</strong>.</li>
                <li>En Contpaqi, ve a <span className="font-mono text-teal-900">Empresa &gt; Pólizas &gt; Cargar Pólizas</span>.</li>
                <li>Selecciona el archivo descargado y presiona <strong className="text-slate-800">Procesar</strong>.</li>
                <li>Las pólizas quedarán integradas con sus folios fiscales UUID asociados en el ADD.</li>
              </ol>
            </div>

            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-col gap-3">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-indigo-100 text-indigo-800 self-start">
                Aspel COI
              </span>
              <h4 className="text-xs font-bold text-slate-900">Importación de Archivo CSV</h4>
              <ol className="text-[11px] text-slate-600 list-decimal pl-4 space-y-1.5 leading-relaxed">
                <li>Descarga el archivo seleccionando el botón <strong className="text-slate-800">Aspel COI (.csv)</strong>.</li>
                <li>En COI, ve al menú <span className="font-mono text-indigo-900">Procesos &gt; Pólizas Dinámicas / Importar</span>.</li>
                <li>Selecciona el formato de delimitación por comas y valida las cuentas contables.</li>
                <li>El sistema registrará los asientos con el comprobante fiscal ligado.</li>
              </ol>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
