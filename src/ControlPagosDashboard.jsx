import React, { useState, useMemo } from 'react';

export default function ControlPagosDashboard({
  data,
  year,
  month,
  client,
  onDownloadExcel,
  isDownloading,
  onRefresh,
  isLoading,
}) {
  const [selectedTab, setSelectedTab] = useState('sin_rep'); // 'sin_rep' | 'todos' | 'con_rep' | 'parciales' | 'pue' | 'recibidas' | 'emitidas'
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItemForModal, setSelectedItemForModal] = useState(null);
  const [copiedUuid, setCopiedUuid] = useState('');

  const metricas = data?.metricas || {
    total_pue_emitidas: 0,
    monto_pue_emitidas: 0,
    total_ppd_emitidas: 0,
    monto_ppd_emitidas: 0,
    ppd_emitidas_cobradas: 0,
    ppd_emitidas_saldo: 0,

    total_pue_recibidas: 0,
    monto_pue_recibidas: 0,
    total_ppd_recibidas: 0,
    monto_ppd_recibidas: 0,
    ppd_recibidas_pagadas_rep: 0,
    monto_ppd_recibidas_pagadas: 0,
    ppd_recibidas_parciales: 0,
    ppd_recibidas_sin_rep: 0,
    monto_sin_rep: 0,
    iva_en_riesgo: 0,
    ppd_vencidas_legales: 0,
    pue_viciados: 0,
  };

  const pueEmitidas = (data?.pue_emitidas || []).map((x) => ({ ...x, flujo: 'Emitida', categoria: 'PUE' }));
  const ppdEmitidas = (data?.ppd_emitidas || []).map((x) => ({ ...x, flujo: 'Emitida', categoria: 'PPD' }));
  const repsEmitidas = (data?.reps_emitidas || []).map((x) => ({
    ...x,
    flujo: 'Emitida',
    categoria: 'REP',
    metodo_pago: 'REP',
    estatus: 'COMPLEMENTO DE PAGO (REP)',
    pagado: x.total || 0,
    saldo: 0,
  }));
  const pueRecibidas = (data?.pue_recibidas || []).map((x) => ({ ...x, flujo: 'Recibida', categoria: 'PUE' }));
  const ppdRecibidas = (data?.ppd_recibidas || []).map((x) => ({ ...x, flujo: 'Recibida', categoria: 'PPD' }));
  const repsRecibidas = (data?.reps_recibidas || []).map((x) => ({
    ...x,
    flujo: 'Recibida',
    categoria: 'REP',
    metodo_pago: 'REP',
    estatus: 'COMPLEMENTO DE PAGO (REP)',
    pagado: x.total || 0,
    saldo: 0,
  }));

  const allItems = useMemo(() => {
    return [...ppdRecibidas, ...pueRecibidas, ...repsRecibidas, ...ppdEmitidas, ...pueEmitidas, ...repsEmitidas];
  }, [ppdRecibidas, pueRecibidas, repsRecibidas, ppdEmitidas, pueEmitidas, repsEmitidas]);

  const counts = useMemo(() => {
    return {
      sin_rep: allItems.filter((it) => it.estatus === 'SIN REP / NO PAGADO').length,
      todos: allItems.length,
      con_rep: allItems.filter((it) => it.estatus === 'PAGADO (Con REP)' || it.metodo_pago === 'REP' || it.tipo === 'P' || it.categoria === 'REP').length,
      pue: allItems.filter((it) => it.metodo_pago === 'PUE').length,
      recibidas: allItems.filter((it) => it.flujo === 'Recibida').length,
      emitidas: allItems.filter((it) => it.flujo === 'Emitida').length,
    };
  }, [allItems]);

  const filteredItems = useMemo(() => {
    let list = allItems;
    if (selectedTab === 'sin_rep') {
      list = list.filter((it) => it.estatus === 'SIN REP / NO PAGADO');
    } else if (selectedTab === 'con_rep') {
      list = list.filter((it) => it.estatus === 'PAGADO (Con REP)' || it.metodo_pago === 'REP' || it.tipo === 'P' || it.categoria === 'REP');
    } else if (selectedTab === 'parciales') {
      list = list.filter((it) => it.estatus === 'PARCIAL');
    } else if (selectedTab === 'pue') {
      list = list.filter((it) => it.metodo_pago === 'PUE');
    } else if (selectedTab === 'recibidas') {
      list = list.filter((it) => it.flujo === 'Recibida');
    } else if (selectedTab === 'emitidas') {
      list = list.filter((it) => it.flujo === 'Emitida');
    }

    if (!searchTerm.trim()) return list;
    const term = searchTerm.toLowerCase().trim();
    return list.filter(
      (it) =>
        (it.uuid && it.uuid.toLowerCase().includes(term)) ||
        (it.emisor_rfc && it.emisor_rfc.toLowerCase().includes(term)) ||
        (it.emisor_nombre && it.emisor_nombre.toLowerCase().includes(term)) ||
        (it.receptor_rfc && it.receptor_rfc.toLowerCase().includes(term)) ||
        (it.receptor_nombre && it.receptor_nombre.toLowerCase().includes(term))
    );
  }, [allItems, selectedTab, searchTerm]);

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

  const hasCriticalRisk = metricas.ppd_recibidas_sin_rep > 0;

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300">
      {/* ========================================================================= */}
      {/* 1. BANNER INSTITUCIONAL Y PANEL DE RIESGO PUE VS PPD */}
      {/* ========================================================================= */}
      <div className="bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 text-white rounded-3xl p-6 shadow-md border border-teal-800/40 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/20 text-teal-300 text-xs font-mono font-bold uppercase tracking-wider mb-2 border border-teal-400/30">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Art. 29-A Fracc. VII CFF • Regla 2.7.1.32 RMF
            </div>
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-teal-400 text-[24px]">account_balance_wallet</span>
              Control de Pagos (PUE vs PPD) y Auditoría de REPs
            </h2>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
              Separación rigurosa de facturas de contado vs. crédito y auditoría de Complementos de Pago (REP). Identifica comprobantes PPD sin recibo de pago para proteger el acreditamiento del IVA y la deducibilidad de tus gastos.
            </p>
          </div>

          {/* Acciones Principales */}
          <div className="flex flex-col sm:flex-row lg:flex-col gap-2 shrink-0">
            <button
              type="button"
              disabled={isDownloading}
              onClick={onDownloadExcel}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-teal-600 via-teal-700 to-emerald-700 hover:from-teal-700 hover:to-emerald-800 active:scale-95 text-white text-xs font-black shadow-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              title="Descargar libro de trabajo corporativo con fórmulas de saldos insolutos"
            >
              {isDownloading ? (
                <>
                  <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Generando...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">table_chart</span>
                  <span>Descargar Matriz Excel (.xlsx)</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onRefresh}
              disabled={isLoading}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-300 text-[11px] font-bold border border-slate-700 transition-all cursor-pointer"
            >
              <span className={`material-symbols-outlined text-[15px] ${isLoading ? 'animate-spin' : ''}`}>sync</span>
              <span>Recalcular Auditoría</span>
            </button>
          </div>
        </div>

        {/* Cédula de Resumen de Riesgo Fiscal */}
        <div className="mt-5 pt-4 border-t border-slate-800/80 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/60">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Gastos PPD Sin REP</span>
            <span className="text-sm font-mono font-black text-rose-400 mt-0.5 block">
              {formatCurrency(metricas.monto_sin_rep)}
            </span>
            <span className="text-[10px] text-rose-300 font-semibold">{metricas.ppd_recibidas_sin_rep} facturas de proveedores</span>
          </div>

          <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/60">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">IVA en Riesgo de Rechazo</span>
            <span className="text-sm font-mono font-black text-amber-400 mt-0.5 block">
              {formatCurrency(metricas.iva_en_riesgo)}
            </span>
            <span className="text-[10px] text-amber-300">No acreditable sin REP oficial</span>
          </div>

          <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/60">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">PPDs con Plazo Vencido</span>
            <span className="text-sm font-mono font-black text-white mt-0.5 block">
              {metricas.ppd_vencidas_legales} comprobantes
            </span>
            <span className="text-[10px] text-slate-300">Superaron día 5 del mes sig.</span>
          </div>

          <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/60">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Cobranza Emitida PPD</span>
            <span className="text-sm font-mono font-black text-emerald-400 mt-0.5 block">
              {formatCurrency(metricas.ppd_emitidas_cobradas)}
            </span>
            <span className="text-[10px] text-emerald-300 font-semibold">Pendiente por cobrar: {formatCurrency(metricas.ppd_emitidas_saldo)}</span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. ALERTA CRÍTICA DE PROTECCIÓN ANTE AUDITORÍAS SAT */}
      {/* ========================================================================= */}
      {hasCriticalRisk && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 flex items-start justify-between gap-4 shadow-3xs">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0 mt-0.5">
              <span className="material-symbols-outlined text-[20px]">warning</span>
            </div>
            <div>
              <h4 className="text-xs font-black text-rose-950 uppercase tracking-wide">
                Riesgo de Rechazo de IVA Acreditable Detectado ({metricas.ppd_recibidas_sin_rep} Facturas)
              </h4>
              <p className="text-xs text-rose-800 mt-0.5 leading-relaxed">
                Se detectaron facturas de proveedores con método <strong>PPD</strong> por un total de <strong>{formatCurrency(metricas.monto_sin_rep)}</strong> sin su correspondiente Complemento Electrónico de Pago (REP). De acuerdo con el Art. 5 Fracc. II de la Ley del IVA, este impuesto (<strong>{formatCurrency(metricas.iva_en_riesgo)}</strong>) no podrá acreditarse en revisiones electrónicas del SAT hasta contar con el REP timbrado.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSelectedTab('sin_rep')}
            className="shrink-0 px-3 py-1.5 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold transition-all shadow-3xs cursor-pointer"
          >
            Ver Facturas Sin REP
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. BARRA DE HERRAMIENTAS: PESTAÑAS Y BÚSQUEDA */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Selector de Pestañas */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          <button
            type="button"
            onClick={() => setSelectedTab('sin_rep')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
              selectedTab === 'sin_rep'
                ? 'bg-rose-700 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span className="material-symbols-outlined text-[15px]">notification_important</span>
            <span>Sin REP / Riesgo ({counts.sin_rep})</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedTab('todos')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
              selectedTab === 'todos'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Todos ({counts.todos})
          </button>

          <button
            type="button"
            onClick={() => setSelectedTab('con_rep')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
              selectedTab === 'con_rep'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span className="material-symbols-outlined text-[15px]">check_circle</span>
            <span>Pagados con REP ({counts.con_rep})</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedTab('pue')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
              selectedTab === 'pue'
                ? 'bg-teal-700 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Contado PUE ({counts.pue})
          </button>

          <button
            type="button"
            onClick={() => setSelectedTab('recibidas')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
              selectedTab === 'recibidas'
                ? 'bg-slate-800 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Proveedores (Gastos) ({counts.recibidas})
          </button>

          <button
            type="button"
            onClick={() => setSelectedTab('emitidas')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
              selectedTab === 'emitidas'
                ? 'bg-indigo-700 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Clientes (Cobranza) ({counts.emitidas})
          </button>
        </div>

        {/* Buscador */}
        <div className="relative w-full md:w-72">
          <input
            type="text"
            placeholder="Buscar por RFC, nombre o UUID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white"
          />
          <span className="material-symbols-outlined absolute left-2.5 top-2 text-slate-400 text-[18px]">
            search
          </span>
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. TABLA INTERACTIVA DE COMPROBANTES */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4">Método</th>
                <th className="py-3 px-4">Fecha</th>
                <th className="py-3 px-4">RFC Tercero</th>
                <th className="py-3 px-4">Nombre o Razón Social</th>
                <th className="py-3 px-4 text-right">Total Factura</th>
                <th className="py-3 px-4 text-right">Pagado (REPs)</th>
                <th className="py-3 px-4 text-right">Saldo Insoluto</th>
                <th className="py-3 px-4 text-center">Estatus REP</th>
                <th className="py-3 px-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan="9" className="py-12 text-center text-slate-400">
                    {selectedTab === 'sin_rep' && counts.todos > 0 ? (
                      <div className="py-2 max-w-lg mx-auto">
                        <span className="material-symbols-outlined text-[40px] text-emerald-500 block mb-2">
                          verified_user
                        </span>
                        <p className="text-sm font-bold text-slate-800 mb-1">
                          ¡Sin Facturas en Riesgo de Rechazo Fiscal!
                        </p>
                        <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                          Para este ejercicio, el 100% de las facturas registradas son de contado (PUE) o cuentan con su pago acreditado en regla conforme al Art. 29-A CFF y Regla 2.7.1.32 RMF.
                        </p>
                        <div className="flex items-center justify-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => setSelectedTab('todos')}
                            className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all cursor-pointer shadow-xs"
                          >
                            Ver Todas ({counts.todos})
                          </button>
                          {counts.con_rep > 0 && (
                            <button
                              type="button"
                              onClick={() => setSelectedTab('con_rep')}
                              className="px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition-all cursor-pointer shadow-xs"
                            >
                              Ver Pagadas / REPs ({counts.con_rep})
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setSelectedTab('pue')}
                            className="px-3 py-1.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold transition-all cursor-pointer shadow-xs"
                          >
                            Ver Contado PUE ({counts.pue})
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-[36px] text-slate-300 block mb-2">
                          filter_alt_off
                        </span>
                        <span>No se encontraron comprobantes para el filtro seleccionado.</span>
                      </>
                    )}
                  </td>
                </tr>
              ) : (
                filteredItems.map((it, idx) => {
                  const isSinRep = it.estatus === 'SIN REP / NO PAGADO';
                  const isPagado = it.estatus === 'PAGADO (Con REP)' || it.metodo_pago === 'PUE' || it.metodo_pago === 'REP';
                  const isParcial = it.estatus === 'PARCIAL';

                  return (
                    <tr
                      key={it.uuid || idx}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isSinRep ? 'bg-rose-50/30' : ''
                      }`}
                    >
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 font-mono font-bold px-2 py-0.5 rounded text-[10px] ${
                            it.metodo_pago === 'PUE'
                              ? 'bg-teal-50 text-teal-700 border border-teal-200'
                              : (it.metodo_pago === 'REP' || it.tipo === 'P')
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                          }`}
                        >
                          {it.metodo_pago === 'REP' || it.tipo === 'P' ? 'REP' : it.metodo_pago}
                        </span>
                        <span className="block text-[9px] text-slate-400 mt-0.5 font-semibold">
                          {it.flujo}
                        </span>
                      </td>

                      <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                        {it.fecha ? it.fecha.split('T')[0] : '--'}
                        {it.dias_antiguedad > 0 && (
                          <span className="block text-[9px] text-slate-400">
                            Hace {it.dias_antiguedad} días
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-slate-800 whitespace-nowrap">
                        {it.flujo === 'Emitida' ? it.receptor_rfc : it.emisor_rfc}
                      </td>

                      <td className="py-3 px-4 font-medium text-slate-800 max-w-xs truncate">
                        {it.flujo === 'Emitida' ? it.receptor_nombre : it.emisor_nombre}
                      </td>

                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        {formatCurrency(it.total)}
                      </td>

                      <td className="py-3 px-4 text-right font-mono text-emerald-700 font-semibold">
                        {formatCurrency(it.pagado || (it.metodo_pago === 'PUE' ? it.total : 0))}
                      </td>

                      <td className="py-3 px-4 text-right font-mono font-bold">
                        <span className={it.saldo > 0 ? 'text-rose-700' : 'text-slate-400'}>
                          {formatCurrency(it.saldo || 0)}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-center">
                        {it.metodo_pago === 'PUE' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Contado (PUE)
                          </span>
                        ) : (it.metodo_pago === 'REP' || it.tipo === 'P') ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200">
                            <span className="material-symbols-outlined text-[13px] text-teal-600">receipt_long</span>
                            Complemento REP
                          </span>
                        ) : isSinRep ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                            Sin REP
                            {it.es_vencido_rep && (
                              <span className="text-[9px] font-mono text-rose-900 font-black">
                                [VENCIDO]
                              </span>
                            )}
                          </span>
                        ) : isParcial ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            Pago Parcial
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Con REP
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => copyToClipboard(it.uuid)}
                            className="p-1 rounded-lg hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors"
                            title="Copiar UUID al portapapeles"
                          >
                            <span className="material-symbols-outlined text-[15px]">
                              {copiedUuid === it.uuid ? 'check' : 'content_copy'}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedItemForModal(it)}
                            className="p-1 rounded-lg hover:bg-teal-100 text-teal-700 transition-colors"
                            title="Ver detalle del comprobante"
                          >
                            <span className="material-symbols-outlined text-[16px]">visibility</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5. MODAL DE DETALLE DEL COMPROBANTE */}
      {/* ========================================================================= */}
      {selectedItemForModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 flex flex-col gap-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-teal-600 text-[22px]">
                  receipt_long
                </span>
                <h3 className="text-sm font-black text-slate-900">
                  Detalle de Auditoría PUE / PPD
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedItemForModal(null)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Método de Pago</span>
                <span className="font-bold text-slate-900 text-sm mt-0.5 block">{selectedItemForModal.metodo_pago}</span>
                <span className="text-[10px] text-slate-500 font-medium">Forma: {selectedItemForModal.forma_pago || '99'}</span>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Estatus REP</span>
                <span className="font-bold text-slate-900 text-sm mt-0.5 block">{selectedItemForModal.estatus}</span>
                <span className="text-[10px] text-slate-500 font-medium">Flujo: {selectedItemForModal.flujo}</span>
              </div>
            </div>

            <div className="flex flex-col gap-2 text-xs bg-slate-50/70 p-4 rounded-2xl border border-slate-200/80">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Folio Fiscal (UUID):</span>
                <span className="font-mono text-slate-900 font-bold select-all text-[11px]">{selectedItemForModal.uuid}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Fecha de Emisión:</span>
                <span className="font-mono text-slate-800 font-bold">{selectedItemForModal.fecha || '--'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">RFC Emisor:</span>
                <span className="font-mono text-slate-800 font-bold">{selectedItemForModal.emisor_rfc}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">RFC Receptor:</span>
                <span className="font-mono text-slate-800 font-bold">{selectedItemForModal.receptor_rfc}</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                <span className="text-slate-700 font-bold">Subtotal:</span>
                <span className="font-mono font-bold text-slate-900">{formatCurrency(selectedItemForModal.subtotal)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-700 font-bold">IVA:</span>
                <span className="font-mono font-bold text-slate-900">{formatCurrency(selectedItemForModal.iva)}</span>
              </div>
              <div className="flex items-center justify-between text-sm pt-1 border-t border-slate-200">
                <span className="text-slate-900 font-black">Total de la Factura:</span>
                <span className="font-mono font-black text-slate-900">{formatCurrency(selectedItemForModal.total)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-emerald-800 font-bold">Monto Pagado (REPs):</span>
                <span className="font-mono font-bold text-emerald-700">{formatCurrency(selectedItemForModal.pagado)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-rose-800 font-black">Saldo Insoluto Pendiente:</span>
                <span className="font-mono font-black text-rose-700">{formatCurrency(selectedItemForModal.saldo)}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSelectedItemForModal(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
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
