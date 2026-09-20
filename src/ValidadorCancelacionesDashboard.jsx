import React, { useState, useMemo } from 'react';

export default function ValidadorCancelacionesDashboard({
  data,
  year,
  month,
  scope = 'all',
  client,
  onDownloadExcel,
  isDownloading,
  onRefresh,
  onLiveCheck,
  isLoading,
  isLiveChecking,
}) {
  const [selectedTab, setSelectedTab] = useState('todos'); // 'todos' | 'canceladas' | 'en_proceso' | 'vigentes' | 'recibidas' | 'emitidas'
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItemForModal, setSelectedItemForModal] = useState(null);
  const [copiedUuid, setCopiedUuid] = useState('');

  const summary = data || {
    total_auditados: 0,
    total_importe: 0,
    total_vigentes: 0,
    monto_vigente: 0,
    total_canceladas: 0,
    monto_canceladas: 0,
    total_en_proceso: 0,
    monto_en_proceso: 0,
    discrepancias_criticas: 0,
    monto_en_riesgo: 0,
    iva_en_riesgo: 0,
    tasa_integridad: 100,
    desglose_cancelabilidad: {
      cancelable_con_aceptacion: { count: 0, total: 0 },
      cancelable_sin_aceptacion: { count: 0, total: 0 },
      no_cancelable: { count: 0, total: 0 },
      no_especificado: { count: 0, total: 0 },
    },
    top_proveedores_riesgo: [],
    timestamp_auditoria: '',
    items: [],
  };

  const items = summary.items || [];

  const filteredItems = useMemo(() => {
    let list = items;
    if (selectedTab === 'canceladas') {
      list = list.filter((it) => it.sat_estado?.toLowerCase().includes('cancelad'));
    } else if (selectedTab === 'en_proceso') {
      list = list.filter(
        (it) =>
          it.estatus_cancelacion?.toLowerCase().includes('proceso') ||
          it.sat_estado?.toLowerCase().includes('proceso')
      );
    } else if (selectedTab === 'vigentes') {
      list = list.filter((it) => it.sat_estado?.toLowerCase() === 'vigente');
    } else if (selectedTab === 'recibidas') {
      list = list.filter((it) => it.flujo?.includes('Recibida'));
    } else if (selectedTab === 'emitidas') {
      list = list.filter((it) => it.flujo?.includes('Emitida'));
    }

    if (!searchTerm.trim()) return list;
    const term = searchTerm.toLowerCase().trim();
    return list.filter(
      (it) =>
        it.uuid?.toLowerCase().includes(term) ||
        it.rfc_emisor?.toLowerCase().includes(term) ||
        it.nombre_emisor?.toLowerCase().includes(term) ||
        it.rfc_receptor?.toLowerCase().includes(term) ||
        it.nombre_receptor?.toLowerCase().includes(term) ||
        String(it.total).includes(term)
    );
  }, [items, selectedTab, searchTerm]);

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedUuid(text);
    setTimeout(() => setCopiedUuid(''), 2000);
  };

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 2,
    }).format(val || 0);
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300">
      {/* ========================================================================= */}
      {/* 1. BANNER INSTITUCIONAL Y PANEL DE CONTROL DE AUDITORÍA */}
      {/* ========================================================================= */}
      <div className="bg-gradient-to-r from-slate-900 via-amber-950 to-slate-900 text-white rounded-3xl p-6 shadow-md border border-amber-800/40 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-mono font-bold uppercase tracking-wider mb-2 border border-amber-400/30">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              Art. 29-A CFF • Web Service Oficial SAT en Tiempo Real
            </div>
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-400 text-[24px]">fact_check</span>
              Validador de Cancelaciones SAT (Auditoría de Estatus CFDI)
            </h2>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
              Cotejo directo contra el Web Service del SAT para detectar facturas canceladas silenciosamente por proveedores, monitorear solicitudes activas en Buzón Tributario y proteger la deducibilidad de tus gastos.
            </p>
            {summary.timestamp_auditoria && (
              <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-2">
                <span className="material-symbols-outlined text-[14px] text-teal-400">schedule</span>
                Última auditoría: <strong className="text-slate-200">{summary.timestamp_auditoria}</strong>
              </div>
            )}
          </div>

          {/* Acciones Principales */}
          <div className="flex flex-col sm:flex-row lg:flex-col gap-2 shrink-0">
            <button
              type="button"
              disabled={isLiveChecking || isLoading}
              onClick={onLiveCheck}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 via-amber-700 to-amber-800 hover:from-amber-700 hover:to-amber-900 active:scale-95 text-white text-xs font-black shadow-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              title="Realiza consultas concurrentes multihilo contra el Web Service del SAT"
            >
              {isLiveChecking ? (
                <>
                  <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Consultando SAT en Vivo...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">wifi_tethering</span>
                  <span>Verificar SAT en Tiempo Real</span>
                </>
              )}
            </button>

            <button
              type="button"
              disabled={isDownloading || items.length === 0}
              onClick={onDownloadExcel}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 active:scale-95 text-slate-200 text-xs font-bold border border-slate-600 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              title="Descargar libro Excel multi-hoja con dictamen de auditoría y análisis de riesgo"
            >
              {isDownloading ? (
                <>
                  <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Generando Dictamen...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[16px] text-emerald-400">download</span>
                  <span>Descargar Dictamen Excel (.xlsx)</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Cédula de Alerta Rápida en el Banner */}
        {summary.discrepancias_criticas > 0 && (
          <div className="mt-4 p-3.5 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-start gap-3 animate-in fade-in">
            <span className="material-symbols-outlined text-rose-400 text-[22px] shrink-0 mt-0.5">warning</span>
            <div>
              <h4 className="text-xs font-black text-rose-200 uppercase tracking-wide">
                ¡Atención! Se detectaron {summary.discrepancias_criticas} cancelaciones silenciosas
              </h4>
              <p className="text-[11px] text-rose-100/90 mt-0.5 leading-normal">
                Existen comprobantes que en tus registros contables figuran como vigentes, pero en el portal del SAT ya se encuentran <strong className="underline">CANCELADOS</strong> por el emisor. Riesgo de rechazo fiscal por <strong className="text-white">{formatCurrency(summary.monto_en_riesgo)}</strong> (IVA afectado: {formatCurrency(summary.iva_en_riesgo)}).
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 2. TARJETAS KPI DE RIESGO Y CONTROL FISCAL */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {/* Total Auditados */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-3xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Auditados</span>
            <span className="material-symbols-outlined text-[20px] text-slate-600">receipt_long</span>
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 tracking-tight">
              {summary.total_auditados.toLocaleString('es-MX')}
            </div>
            <div className="text-[11px] text-slate-500 font-medium mt-0.5 truncate">
              {formatCurrency(summary.total_importe)}
            </div>
          </div>
        </div>

        {/* Comprobantes Vigentes */}
        <div className="bg-white rounded-2xl p-4 border border-emerald-200 shadow-3xs flex flex-col justify-between bg-gradient-to-b from-white to-emerald-50/20">
          <div className="flex items-center justify-between text-emerald-600 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Vigentes (SAT)</span>
            <span className="material-symbols-outlined text-[20px]">verified</span>
          </div>
          <div>
            <div className="text-2xl font-black text-emerald-700 tracking-tight">
              {summary.total_vigentes.toLocaleString('es-MX')}
            </div>
            <div className="text-[11px] text-emerald-600 font-medium mt-0.5 truncate">
              {formatCurrency(summary.monto_vigente)} • {summary.tasa_integridad}% Conforme
            </div>
          </div>
        </div>

        {/* Canceladas Detectadas */}
        <div className={`bg-white rounded-2xl p-4 border shadow-3xs flex flex-col justify-between ${summary.total_canceladas > 0 ? 'border-rose-300 bg-rose-50/30' : 'border-slate-200'}`}>
          <div className="flex items-center justify-between text-rose-600 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Canceladas</span>
            <span className="material-symbols-outlined text-[20px]">cancel</span>
          </div>
          <div>
            <div className="text-2xl font-black text-rose-700 tracking-tight">
              {summary.total_canceladas.toLocaleString('es-MX')}
            </div>
            <div className="text-[11px] text-rose-600 font-medium mt-0.5 truncate">
              {formatCurrency(summary.monto_canceladas)}
            </div>
          </div>
        </div>

        {/* En Proceso de Cancelación */}
        <div className={`bg-white rounded-2xl p-4 border shadow-3xs flex flex-col justify-between ${summary.total_en_proceso > 0 ? 'border-amber-300 bg-amber-50/30' : 'border-slate-200'}`}>
          <div className="flex items-center justify-between text-amber-600 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">En Proceso (SAT)</span>
            <span className="material-symbols-outlined text-[20px]">pending_actions</span>
          </div>
          <div>
            <div className="text-2xl font-black text-amber-700 tracking-tight">
              {summary.total_en_proceso.toLocaleString('es-MX')}
            </div>
            <div className="text-[11px] text-amber-700 font-medium mt-0.5 truncate">
              {formatCurrency(summary.monto_en_proceso)} • Plazo 72h
            </div>
          </div>
        </div>

        {/* Monto Fiscal en Riesgo */}
        <div className={`col-span-2 md:col-span-3 lg:col-span-1 bg-white rounded-2xl p-4 border shadow-3xs flex flex-col justify-between ${summary.monto_en_riesgo > 0 ? 'border-rose-400 bg-rose-500/5' : 'border-emerald-200 bg-emerald-50/10'}`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-[11px] font-bold uppercase tracking-wider ${summary.monto_en_riesgo > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
              Riesgo Fiscal Neto
            </span>
            <span className={`material-symbols-outlined text-[20px] ${summary.monto_en_riesgo > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
              {summary.monto_en_riesgo > 0 ? 'crisis_alert' : 'shield_with_heart'}
            </span>
          </div>
          <div>
            <div className={`text-xl font-black tracking-tight ${summary.monto_en_riesgo > 0 ? 'text-rose-800' : 'text-emerald-800'}`}>
              {formatCurrency(summary.monto_en_riesgo)}
            </div>
            <div className={`text-[11px] font-medium mt-0.5 truncate ${summary.monto_en_riesgo > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
              IVA en peligro: {formatCurrency(summary.iva_en_riesgo)}
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. BARRA DE FILTROS Y BÚSQUEDA INSTANTÁNEA */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-3 shadow-3xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Tabs de Filtro */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setSelectedTab('todos')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              selectedTab === 'todos'
                ? 'bg-slate-900 text-white shadow-3xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Todos ({items.length})
          </button>

          <button
            type="button"
            onClick={() => setSelectedTab('canceladas')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              selectedTab === 'canceladas'
                ? 'bg-rose-600 text-white shadow-3xs'
                : 'text-rose-700 bg-rose-50 hover:bg-rose-100/80'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            Canceladas ({summary.total_canceladas})
          </button>

          <button
            type="button"
            onClick={() => setSelectedTab('en_proceso')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              selectedTab === 'en_proceso'
                ? 'bg-amber-600 text-white shadow-3xs'
                : 'text-amber-700 bg-amber-50 hover:bg-amber-100/80'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            En Proceso ({summary.total_en_proceso})
          </button>

          <button
            type="button"
            onClick={() => setSelectedTab('vigentes')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              selectedTab === 'vigentes'
                ? 'bg-emerald-700 text-white shadow-3xs'
                : 'text-emerald-700 bg-emerald-50/80 hover:bg-emerald-100/80'
            }`}
          >
            Vigentes ({summary.total_vigentes})
          </button>

          <button
            type="button"
            onClick={() => setSelectedTab('recibidas')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              selectedTab === 'recibidas'
                ? 'bg-indigo-900 text-white shadow-3xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Solo Gastos
          </button>

          <button
            type="button"
            onClick={() => setSelectedTab('emitidas')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              selectedTab === 'emitidas'
                ? 'bg-indigo-900 text-white shadow-3xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Solo Ingresos
          </button>
        </div>

        {/* Buscador de comprobante */}
        <div className="relative w-full sm:w-72 shrink-0">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
            search
          </span>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por UUID, RFC o Proveedor..."
            className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. TABLA AUDITORA DE COMPROBANTES FISCALES */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-3xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white border-b border-slate-800 text-[11px] font-bold uppercase tracking-wider">
                <th className="py-3 px-4">Estatus SAT</th>
                <th className="py-3 px-3">Flujo</th>
                <th className="py-3 px-3">Folio Fiscal (UUID)</th>
                <th className="py-3 px-3">Fecha</th>
                <th className="py-3 px-4">Emisor / Proveedor</th>
                <th className="py-3 px-3">Cancelabilidad</th>
                <th className="py-3 px-3 text-right">IVA ($)</th>
                <th className="py-3 px-4 text-right">Total ($)</th>
                <th className="py-3 px-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 font-medium">
                    <span className="material-symbols-outlined text-[36px] text-slate-300 block mb-2">
                      search_off
                    </span>
                    No se encontraron comprobantes con los filtros actuales.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item, idx) => {
                  const isCancelado = item.sat_estado?.toLowerCase().includes('cancelad');
                  const isEnProceso =
                    item.estatus_cancelacion?.toLowerCase().includes('proceso') ||
                    item.sat_estado?.toLowerCase().includes('proceso');
                  const isSilenciosa = item.tipo_riesgo === 'DISCREPANCIA_CRITICA';

                  return (
                    <tr
                      key={item.uuid || idx}
                      className={`hover:bg-slate-50/90 transition-colors ${
                        isSilenciosa
                          ? 'bg-rose-50/30 font-medium'
                          : isCancelado
                          ? 'bg-rose-50/15'
                          : isEnProceso
                          ? 'bg-amber-50/20'
                          : ''
                      }`}
                    >
                      {/* Estatus SAT Badge */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {isCancelado ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-rose-100 text-rose-800 border border-rose-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse" />
                            CANCELADO
                          </span>
                        ) : isEnProceso ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-amber-100 text-amber-800 border border-amber-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
                            EN PROCESO
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                            VIGENTE
                          </span>
                        )}
                      </td>

                      {/* Flujo */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            item.flujo?.includes('Recibida')
                              ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/60'
                              : 'bg-teal-50 text-teal-700 border border-teal-200/60'
                          }`}
                        >
                          {item.flujo?.includes('Recibida') ? 'Gasto' : 'Ingreso'}
                        </span>
                      </td>

                      {/* Folio Fiscal (UUID) */}
                      <td className="py-3 px-3 font-mono text-[11px] text-slate-800 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span title={item.uuid}>{item.uuid?.slice(0, 8)}...{item.uuid?.slice(-4)}</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(item.uuid)}
                            className="text-slate-400 hover:text-slate-700 transition-colors"
                            title="Copiar Folio Fiscal"
                          >
                            <span className="material-symbols-outlined text-[14px]">
                              {copiedUuid === item.uuid ? 'done' : 'content_copy'}
                            </span>
                          </button>
                        </div>
                      </td>

                      {/* Fecha */}
                      <td className="py-3 px-3 text-slate-500 whitespace-nowrap text-[11px]">
                        {item.fecha?.split('T')[0] || item.fecha}
                      </td>

                      {/* Emisor / Proveedor */}
                      <td className="py-3 px-4 max-w-xs truncate">
                        <div className="font-bold text-slate-900 leading-tight">{item.rfc_emisor}</div>
                        <div className="text-[11px] text-slate-500 truncate" title={item.nombre_emisor}>
                          {item.nombre_emisor || '—'}
                        </div>
                      </td>

                      {/* Cancelabilidad */}
                      <td className="py-3 px-3 whitespace-nowrap text-[11px]">
                        <span className="text-slate-600 font-medium">
                          {item.es_cancelable || 'No especificado'}
                        </span>
                        {item.estatus_cancelacion && (
                          <div className="text-[10px] text-amber-700 font-bold">
                            {item.estatus_cancelacion}
                          </div>
                        )}
                      </td>

                      {/* IVA */}
                      <td className="py-3 px-3 text-right font-mono text-slate-600 whitespace-nowrap">
                        {formatCurrency(item.iva_trasladado)}
                      </td>

                      {/* Total */}
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                        {formatCurrency(item.total)}
                      </td>

                      {/* Acciones */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setSelectedItemForModal(item)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 text-xs font-bold transition-all cursor-pointer"
                          title="Ver desglose fiscal y recomendación del SAT"
                        >
                          <span className="material-symbols-outlined text-[14px]">visibility</span>
                          Detalle
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer con conteo de registros */}
        <div className="p-3.5 bg-slate-50 border-t border-slate-200/90 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-500 gap-2">
          <div>
            Mostrando <strong>{filteredItems.length}</strong> de <strong>{items.length}</strong> comprobantes auditados.
          </div>
          <div className="flex items-center gap-4 text-[11px]">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" /> Vigente ({summary.total_vigentes})
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500" /> Cancelado ({summary.total_canceladas})
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500" /> En Proceso ({summary.total_en_proceso})
            </span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5. MODAL DE INSPECCIÓN PROFUNDA DEL CFDI */}
      {/* ========================================================================= */}
      {selectedItemForModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 relative max-h-[90vh] flex flex-col">
            {/* Encabezado del Modal */}
            <div className="flex items-start justify-between pb-4 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                      selectedItemForModal.sat_estado?.toLowerCase().includes('cancelad')
                        ? 'bg-rose-100 text-rose-800'
                        : selectedItemForModal.sat_estado?.toLowerCase().includes('proceso')
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    Estatus SAT: {selectedItemForModal.sat_estado?.toUpperCase()}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    {selectedItemForModal.flujo}
                  </span>
                </div>
                <h3 className="text-base font-black text-slate-900 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-amber-500 text-[20px]">
                    verified_user
                  </span>
                  Inspección y Dictamen de Comprobante Fiscal
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedItemForModal(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center text-sm font-bold transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Cuerpo del Modal con Scroll */}
            <div className="overflow-y-auto py-4 space-y-4 text-xs pr-1">
              {/* Alerta de Diagnóstico */}
              <div
                className={`p-3.5 rounded-2xl border flex items-start gap-2.5 ${
                  selectedItemForModal.tipo_riesgo === 'DISCREPANCIA_CRITICA'
                    ? 'bg-rose-50 border-rose-300 text-rose-900'
                    : selectedItemForModal.tipo_riesgo === 'EN_PROCESO'
                    ? 'bg-amber-50 border-amber-300 text-amber-900'
                    : 'bg-emerald-50 border-emerald-300 text-emerald-900'
                }`}
              >
                <span className="material-symbols-outlined text-[20px] shrink-0 mt-0.5">
                  {selectedItemForModal.tipo_riesgo === 'DISCREPANCIA_CRITICA'
                    ? 'error'
                    : selectedItemForModal.tipo_riesgo === 'EN_PROCESO'
                    ? 'alarm'
                    : 'check_circle'}
                </span>
                <div>
                  <div className="font-black text-xs uppercase tracking-wide">
                    Diagnóstico: {selectedItemForModal.alerta_desc}
                  </div>
                  <div className="text-[11px] mt-1 leading-relaxed">
                    {selectedItemForModal.sat_estado?.toLowerCase().includes('cancelad')
                      ? 'Recomendación Contable: Este comprobante no puede ser considerado para acreditamiento de IVA ni deducción de ISR. Se debe solicitar al proveedor emitir la refacturación correspondiente relacionando el UUID cancelado mediante el tipo de relación 04 (Sustitución de CFDI previos).'
                      : selectedItemForModal.sat_estado?.toLowerCase().includes('proceso')
                      ? 'Recomendación Contable: Existe una solicitud de cancelación vigente. Si el comprobante ampara una operación real ya pagada, ingresa inmediatamente al Buzón Tributario del SAT y selecciona RECHAZAR CANCELACIÓN dentro de las 72 horas hábiles.'
                      : 'Recomendación Contable: El comprobante está debidamente timbrado y vigente. Cumple con los requisitos de deducibilidad previstos en el Artículo 27 de la LISR y acreditamiento de la LIVA.'}
                  </div>
                </div>
              </div>

              {/* Datos Generales */}
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                    Folio Fiscal (UUID)
                  </span>
                  <div className="font-mono text-slate-800 font-bold select-all break-all">
                    {selectedItemForModal.uuid}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                    Fecha de Emisión
                  </span>
                  <div className="font-medium text-slate-800">
                    {selectedItemForModal.fecha || 'No disponible'}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                    Emisor (Proveedor)
                  </span>
                  <div className="font-bold text-slate-900">{selectedItemForModal.rfc_emisor}</div>
                  <div className="text-slate-600">{selectedItemForModal.nombre_emisor}</div>
                </div>

                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                    Receptor (Cliente)
                  </span>
                  <div className="font-bold text-slate-900">{selectedItemForModal.rfc_receptor}</div>
                  <div className="text-slate-600">{selectedItemForModal.nombre_receptor}</div>
                </div>
              </div>

              {/* Desglose de Importes */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                  Desglose de Operación e Impuestos
                </span>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="bg-white p-2 rounded-xl border border-slate-200">
                    <span className="text-[10px] text-slate-500 block">Subtotal</span>
                    <strong className="text-slate-800 font-mono text-xs">
                      {formatCurrency(selectedItemForModal.subtotal)}
                    </strong>
                  </div>
                  <div className="bg-white p-2 rounded-xl border border-slate-200">
                    <span className="text-[10px] text-slate-500 block">IVA Trasladado</span>
                    <strong className="text-slate-800 font-mono text-xs">
                      {formatCurrency(selectedItemForModal.iva_trasladado)}
                    </strong>
                  </div>
                  <div className="bg-white p-2 rounded-xl border border-slate-200">
                    <span className="text-[10px] text-slate-500 block">Retenciones</span>
                    <strong className="text-slate-800 font-mono text-xs">
                      {formatCurrency((selectedItemForModal.ret_isr || 0) + (selectedItemForModal.ret_iva || 0))}
                    </strong>
                  </div>
                  <div className="bg-slate-900 text-white p-2 rounded-xl">
                    <span className="text-[10px] text-slate-300 block">Total CFDI</span>
                    <strong className="font-mono text-xs">
                      {formatCurrency(selectedItemForModal.total)}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Metadatos Técnicos del SAT */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                  Metadatos Oficiales del Web Service SAT
                </span>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <strong className="text-slate-600">Es Cancelable:</strong>{' '}
                    <span className="font-medium text-slate-900">{selectedItemForModal.es_cancelable}</span>
                  </div>
                  <div>
                    <strong className="text-slate-600">Estatus Cancelación:</strong>{' '}
                    <span className="font-medium text-slate-900">{selectedItemForModal.estatus_cancelacion || 'Ninguno'}</span>
                  </div>
                  <div>
                    <strong className="text-slate-600">Código de Respuesta SAT:</strong>{' '}
                    <span className="font-medium text-slate-900">{selectedItemForModal.codigo_sat}</span>
                  </div>
                  <div>
                    <strong className="text-slate-600">Validación EFOS (SAT):</strong>{' '}
                    <span className={`font-bold ${selectedItemForModal.sat_efos === '200' ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {selectedItemForModal.sat_efos === '200' ? '200 (Sin incidencia de lista negra)' : '100 (Boletinado Art. 69-B)'}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <strong className="text-slate-600">Modo de Verificación:</strong>{' '}
                    <span className="font-medium text-slate-900">{selectedItemForModal.modo_verificacion}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer del Modal */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => copyToClipboard(selectedItemForModal.uuid)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">content_copy</span>
                {copiedUuid === selectedItemForModal.uuid ? '¡Copiado!' : 'Copiar UUID'}
              </button>
              <button
                type="button"
                onClick={() => setSelectedItemForModal(null)}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors cursor-pointer"
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
