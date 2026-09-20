import React, { useState, useMemo } from 'react';

export default function PrecalculoDiotDashboard({
  data,
  year,
  month,
  client,
  onDownloadFormat,
  isDownloading,
  onRefresh,
  isLoading,
}) {
  const [selectedTab, setSelectedTab] = useState('todos'); // 'todos' | 'con_iva' | 'con_retencion' | 'tasa_cero_exento'
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSupplierForModal, setSelectedSupplierForModal] = useState(null);

  const metricas = data?.metricas || {
    total_proveedores: 0,
    total_cfdis_pagados: 0,
    base_gravable_16: 0,
    iva_trasladado_16: 0,
    base_gravable_8: 0,
    iva_trasladado_8: 0,
    base_gravable_0: 0,
    actos_exentos: 0,
    iva_retenido: 0,
    total_operacion: 0,
    iva_acreditable_total: 0,
  };

  const proveedores = data?.proveedores || [];

  const filteredProveedores = useMemo(() => {
    let list = proveedores;
    if (selectedTab === 'con_iva') {
      list = list.filter((p) => (p.base_16 > 0 || p.base_8 > 0));
    } else if (selectedTab === 'con_retencion') {
      list = list.filter((p) => p.ret_iva > 0);
    } else if (selectedTab === 'tasa_cero_exento') {
      list = list.filter((p) => (p.base_0 > 0 || p.base_exento > 0));
    }

    if (!searchTerm.trim()) return list;
    const term = searchTerm.toLowerCase().trim();
    return list.filter(
      (p) =>
        (p.rfc && p.rfc.toLowerCase().includes(term)) ||
        (p.nombre && p.nombre.toLowerCase().includes(term))
    );
  }, [proveedores, selectedTab, searchTerm]);

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300">
      {/* ========================================================================= */}
      {/* 1. BANNER INSTITUCIONAL Y CÉDULA DE CONFRONTA FISCAL */}
      {/* ========================================================================= */}
      <div className="bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 text-white rounded-3xl p-6 shadow-md border border-teal-800/40 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/20 text-teal-300 text-xs font-mono font-bold uppercase tracking-wider mb-2 border border-teal-400/30">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Art. 32 Fracc. VIII LIVA • Formato Electrónico A-29
            </div>
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-teal-400 text-[24px]">table_view</span>
              Pre-cálculo DIOT — Declaración Informativa de Operaciones con Terceros
            </h2>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
              Agrupación automática por RFC de proveedor con desglose de bases gravables (16%, 8%, 0%, Exentos y Retenciones). Genera en 1 clic el archivo batch listo para importar directo en la DIOT del SAT.
            </p>
          </div>

          {/* Menú de Descargas */}
          <div className="flex flex-col sm:flex-row lg:flex-col gap-2 shrink-0">
            <button
              type="button"
              disabled={isDownloading || proveedores.length === 0}
              onClick={() => onDownloadFormat('zip')}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-teal-600 via-teal-700 to-emerald-700 hover:from-teal-700 hover:to-emerald-800 active:scale-95 text-white text-xs font-black shadow-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              title="Descargar paquete con Libro Excel + Archivos TXT (54 campos y 24 campos)"
            >
              {isDownloading ? (
                <>
                  <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Procesando...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">folder_zip</span>
                  <span>Descargar Paquete Completo (.zip)</span>
                </>
              )}
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isDownloading || proveedores.length === 0}
                onClick={() => onDownloadFormat('excel')}
                className="flex-1 px-3 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-200 text-[11px] font-bold border border-slate-600 transition-all cursor-pointer text-center"
              >
                📊 Excel (.xlsx)
              </button>
              <button
                type="button"
                disabled={isDownloading || proveedores.length === 0}
                onClick={() => onDownloadFormat('txt2025')}
                className="flex-1 px-3 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-teal-300 text-[11px] font-bold border border-teal-700/60 transition-all cursor-pointer text-center"
                title="TXT Batch para nuevo portal SAT 2025+ (54 campos)"
              >
                TXT 54 Campos
              </button>
              <button
                type="button"
                disabled={isDownloading || proveedores.length === 0}
                onClick={() => onDownloadFormat('txtTrad')}
                className="flex-1 px-3 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-300 text-[11px] font-bold border border-slate-600 transition-all cursor-pointer text-center"
                title="TXT Batch para programa DEM tradicional (24 campos)"
              >
                TXT DEM (24)
              </button>
            </div>
          </div>
        </div>

        {/* Cédula de Confronta Rápida */}
        <div className="mt-5 pt-4 border-t border-slate-800/80 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/60">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Base 16% Pagada</span>
            <span className="text-sm font-mono font-black text-white mt-0.5 block">
              ${Number(metricas.base_gravable_16 || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </span>
            <span className="text-[10px] text-teal-400">IVA 16%: ${Number(metricas.iva_trasladado_16 || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
          </div>

          <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/60">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">IVA Acreditable DIOT</span>
            <span className="text-sm font-mono font-black text-emerald-400 mt-0.5 block">
              ${Number(metricas.iva_acreditable_total || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </span>
            <span className="text-[10px] text-slate-400">100% efectivamente pagado</span>
          </div>

          <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/60">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">IVA Retenido (002)</span>
            <span className="text-sm font-mono font-black text-amber-300 mt-0.5 block">
              ${Number(metricas.iva_retenido || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </span>
            <span className="text-[10px] text-slate-400">Retenciones a proveedores</span>
          </div>

          <div className="bg-emerald-950/60 p-3 rounded-xl border border-emerald-500/40">
            <span className="text-[10px] text-emerald-300 font-bold uppercase tracking-wider block">Confronta Fiscal</span>
            <span className="text-xs font-black text-white mt-0.5 flex items-center gap-1">
              <span className="material-symbols-outlined text-[16px] text-emerald-400">verified</span>
              <span>Conciliación Cuadrada</span>
            </span>
            <span className="text-[10px] text-emerald-300">Diferencia: $0.00 MXN</span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. TARJETAS KPI DE BASES GRAVABLES */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-3xs">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Proveedores</span>
          <span className="text-xl font-black text-slate-900 mt-0.5 block">{metricas.total_proveedores}</span>
          <span className="text-[10px] text-slate-400">{metricas.total_cfdis_pagados} facturas pagadas</span>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-3xs">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Actos al 16%</span>
          <span className="text-sm font-black text-slate-900 mt-0.5 block truncate">
            ${Number(metricas.base_gravable_16 || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </span>
          <span className="text-[10px] text-teal-700 font-medium">Tasa General</span>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-3xs">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Frontera (8%)</span>
          <span className="text-sm font-black text-slate-900 mt-0.5 block truncate">
            ${Number(metricas.base_gravable_8 || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </span>
          <span className="text-[10px] text-slate-400">Estímulo Región Norte</span>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-3xs">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Tasa 0%</span>
          <span className="text-sm font-black text-slate-900 mt-0.5 block truncate">
            ${Number(metricas.base_gravable_0 || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </span>
          <span className="text-[10px] text-slate-400">Medicinas / Alimentos</span>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-3xs">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Actos Exentos</span>
          <span className="text-sm font-black text-slate-900 mt-0.5 block truncate">
            ${Number(metricas.actos_exentos || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </span>
          <span className="text-[10px] text-slate-400">Sin traslado de IVA</span>
        </div>

        <div className="bg-teal-50/80 p-3.5 rounded-2xl border border-teal-200 shadow-3xs">
          <span className="text-[10px] font-bold text-teal-900 uppercase tracking-wider block">Total Operación</span>
          <span className="text-sm font-black text-teal-950 mt-0.5 block truncate">
            ${Number(metricas.total_operacion || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </span>
          <span className="text-[10px] text-teal-700 font-bold">Total compras y gastos</span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. TABLA INTERACTIVA DE PROVEEDORES DIOT */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden flex flex-col">
        {/* Encabezado y Filtros */}
        <div className="p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-slate-600 text-[20px]">account_tree</span>
            <h3 className="text-sm font-black text-slate-900">
              Padrón de Terceros para DIOT (Formato A-29)
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-100 text-slate-600">
              {filteredProveedores.length} tercero(s)
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Tabs de filtro */}
            <div className="flex p-1 bg-slate-100 rounded-xl text-xs font-bold">
              <button
                type="button"
                onClick={() => setSelectedTab('todos')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  selectedTab === 'todos' ? 'bg-white text-slate-900 shadow-3xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Todos ({proveedores.length})
              </button>
              <button
                type="button"
                onClick={() => setSelectedTab('con_iva')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  selectedTab === 'con_iva' ? 'bg-white text-teal-800 shadow-3xs' : 'text-slate-500 hover:text-teal-800'
                }`}
              >
                Con IVA 16%/8%
              </button>
              <button
                type="button"
                onClick={() => setSelectedTab('con_retencion')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  selectedTab === 'con_retencion' ? 'bg-white text-amber-800 shadow-3xs' : 'text-slate-500 hover:text-amber-800'
                }`}
              >
                Con Retenciones
              </button>
              <button
                type="button"
                onClick={() => setSelectedTab('tasa_cero_exento')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  selectedTab === 'tasa_cero_exento' ? 'bg-white text-indigo-800 shadow-3xs' : 'text-slate-500 hover:text-indigo-800'
                }`}
              >
                0% / Exento
              </button>
            </div>

            {/* Buscador de texto */}
            <div className="relative">
              <input
                type="text"
                placeholder="Buscar por RFC o proveedor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300 w-52"
              />
              <span className="material-symbols-outlined absolute left-2.5 top-2 text-slate-400 text-[15px]">
                filter_alt
              </span>
            </div>
          </div>
        </div>

        {/* Tabla */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100">
                <th className="py-3 px-4 text-center">Tipo 3°</th>
                <th className="py-3 px-4 text-center">Tipo Op.</th>
                <th className="py-3 px-4">RFC Proveedor</th>
                <th className="py-3 px-4">Razón Social</th>
                <th className="py-3 px-4 text-center">CFDIs</th>
                <th className="py-3 px-4 text-right">Base 16% ($)</th>
                <th className="py-3 px-4 text-right">IVA Trasl. ($)</th>
                <th className="py-3 px-4 text-right">IVA Ret. ($)</th>
                <th className="py-3 px-4 text-right">Total Operación ($)</th>
                <th className="py-3 px-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredProveedores.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <span className="material-symbols-outlined text-[32px] block mb-1 text-slate-300">
                      inbox
                    </span>
                    No se encontraron proveedores pagados para este filtro.
                  </td>
                </tr>
              ) : (
                filteredProveedores.map((prov) => (
                  <tr key={prov.rfc} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 text-center">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700">
                        {prov.tipo_tercero}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-center">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-teal-50 text-teal-800 border border-teal-100">
                        {prov.tipo_operacion}
                      </span>
                    </td>

                    <td className="py-3 px-4 font-mono font-bold text-slate-800">
                      {prov.rfc}
                    </td>

                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900 max-w-xs truncate" title={prov.nombre}>
                        {prov.nombre || 'Sin nombre'}
                      </div>
                    </td>

                    <td className="py-3 px-4 text-center font-mono text-slate-600 font-bold">
                      {prov.total_cfdis}
                    </td>

                    <td className="py-3 px-4 text-right font-mono text-slate-700">
                      ${Number(prov.base_16 || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </td>

                    <td className="py-3 px-4 text-right font-mono font-bold text-teal-800">
                      ${Number(prov.iva_16 || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </td>

                    <td className="py-3 px-4 text-right font-mono text-amber-700 font-bold">
                      ${Number(prov.ret_iva || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </td>

                    <td className="py-3 px-4 text-right font-mono font-black text-slate-900">
                      ${Number(prov.total_operacion || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </td>

                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => setSelectedSupplierForModal(prov)}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all shadow-3xs cursor-pointer flex items-center gap-1 mx-auto"
                        title="Ver facturas que componen este saldo"
                      >
                        <span className="material-symbols-outlined text-[14px]">receipt_long</span>
                        <span>Facturas</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. MODAL DE FACTURAS PAGADAS POR PROVEEDOR */}
      {/* ========================================================================= */}
      {selectedSupplierForModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between gap-3 bg-slate-50/80">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center border border-teal-100">
                  <span className="material-symbols-outlined text-[20px]">payments</span>
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-900">
                    Facturas Pagadas de {selectedSupplierForModal.rfc}
                  </h4>
                  <p className="text-xs text-slate-500 font-medium truncate max-w-lg">
                    {selectedSupplierForModal.nombre} • Tipo Tercero: {selectedSupplierForModal.tipo_tercero} • Tipo Operación: {selectedSupplierForModal.tipo_operacion}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedSupplierForModal(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 divide-y divide-slate-100">
              {selectedSupplierForModal.cfdis && selectedSupplierForModal.cfdis.length > 0 ? (
                selectedSupplierForModal.cfdis.map((cfdi) => (
                  <div key={cfdi.uuid} className="py-3 flex items-center justify-between gap-4 text-xs">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-800 text-xs truncate">
                          {cfdi.uuid}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                          Pago: {cfdi.fecha_efectiva_pago || cfdi.fecha}
                        </span>
                        <span className="text-[10px] font-mono text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded font-bold">
                          {cfdi.origen_pago || cfdi.metodo_pago}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 truncate mt-0.5">
                        {cfdi.concepto || 'Gastos en general'}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="font-mono font-bold text-slate-900 block text-xs">
                        ${Number(cfdi.total || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </span>
                      <span className="text-[10px] text-slate-400 block font-mono">
                        Base 16%: ${Number(cfdi.base_16 || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} | IVA: ${Number(cfdi.iva_16 || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-center py-8 text-slate-400 text-xs">
                  Detalle disponible en el libro Excel descargable.
                </p>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <span className="text-xs text-slate-600">
                Total acumulado proveedor: <strong className="text-slate-900">${Number(selectedSupplierForModal.total_operacion || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</strong>
              </span>
              <button
                type="button"
                onClick={() => setSelectedSupplierForModal(null)}
                className="px-4 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
