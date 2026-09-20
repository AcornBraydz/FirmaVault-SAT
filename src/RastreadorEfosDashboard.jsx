import React, { useState, useMemo } from 'react';

export default function RastreadorEfosDashboard({
  data,
  year,
  month,
  client,
  onDownloadExcel,
  isDownloading,
  onRefresh,
  isLoading,
}) {
  const [selectedTab, setSelectedTab] = useState('todos'); // 'todos' | 'riesgo' | 'conformes'
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSupplierForModal, setSelectedSupplierForModal] = useState(null);

  // Consulta individual de RFC
  const [singleRfcQuery, setSingleRfcQuery] = useState('');
  const [isSearchingRfc, setIsSearchingRfc] = useState(false);
  const [singleRfcResult, setSingleRfcResult] = useState(null);
  const [singleRfcError, setSingleRfcError] = useState(null);

  const metricas = data?.metricas || {
    total_proveedores: 0,
    total_conformes: 0,
    total_definitivos: 0,
    total_presuntos: 0,
    total_cfdis_auditados: 0,
    subtotal_auditado: 0,
    iva_auditado: 0,
    total_auditado: 0,
    monto_total_en_riesgo: 0,
    tasa_cumplimiento: 100,
  };

  const dictamen = data?.dictamen || {
    estatus: 'CONFORME',
    color: '#059669',
    titulo: 'DICTAMEN FISCAL: CUMPLIMIENTO FAVORABLE',
    texto: 'Auditoría preventiva completada sin detección de proveedores en listas negras.',
  };

  const provsDefinitivos = data?.proveedores_definitivos || [];
  const provsPresuntos = data?.proveedores_presuntos || [];
  const provsConformes = data?.proveedores_conformes || [];

  const allSuppliers = useMemo(() => {
    return [...provsDefinitivos, ...provsPresuntos, ...provsConformes];
  }, [provsDefinitivos, provsPresuntos, provsConformes]);

  const suppliersEnRiesgo = useMemo(() => {
    return [...provsDefinitivos, ...provsPresuntos];
  }, [provsDefinitivos, provsPresuntos]);

  // Filtrado por tab y búsqueda
  const filteredSuppliers = useMemo(() => {
    let list = allSuppliers;
    if (selectedTab === 'riesgo') {
      list = suppliersEnRiesgo;
    } else if (selectedTab === 'conformes') {
      list = provsConformes;
    }

    if (!searchTerm.trim()) return list;
    const term = searchTerm.toLowerCase().trim();
    return list.filter(
      (s) =>
        (s.rfc && s.rfc.toLowerCase().includes(term)) ||
        (s.nombre_cfdi && s.nombre_cfdi.toLowerCase().includes(term)) ||
        (s.nombre_oficial_sat && s.nombre_oficial_sat.toLowerCase().includes(term))
    );
  }, [allSuppliers, suppliersEnRiesgo, provsConformes, selectedTab, searchTerm]);

  // Consulta individual de RFC contra el SAT 69-B
  const handleSearchSingleRfc = async (e) => {
    e.preventDefault();
    if (!singleRfcQuery.trim() || !client?.id) return;

    setIsSearchingRfc(true);
    setSingleRfcError(null);
    setSingleRfcResult(null);

    try {
      const token = localStorage.getItem('firmavault_token');
      const res = await fetch(`/api/clients/${client.id}/cruce-69b/lookup-rfc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ rfc: singleRfcQuery.trim() }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error al consultar RFC');
      }

      const resData = await res.json();
      setSingleRfcResult(resData);
    } catch (err) {
      setSingleRfcError(err.message || 'Error al conectar con la base de datos EFOS');
    } finally {
      setIsSearchingRfc(false);
    }
  };

  const isRiesgoCritico = metricas.total_definitivos > 0;
  const isAlertaPresunto = !isRiesgoCritico && metricas.total_presuntos > 0;

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300">
      {/* ========================================================================= */}
      {/* 1. BARRA SUPERIOR DE BÚSQUEDA RÁPIDA DE CUALQUIER RFC */}
      {/* ========================================================================= */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-3xl p-5 sm:p-6 shadow-md border border-slate-700/60 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 text-[10px] font-mono font-bold uppercase tracking-wider mb-1.5 border border-indigo-400/30">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Base Oficial DOF + SAT (14,123 Registros)
            </div>
            <h3 className="text-base font-black text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-400 text-[20px]">search_check</span>
              Validador Exprés de RFC (Artículo 69-B)
            </h3>
            <p className="text-xs text-slate-300 mt-0.5">
              Consulta en tiempo real si cualquier proveedor o tercero está boletinado como presunto o definitivo.
            </p>
          </div>

          <form onSubmit={handleSearchSingleRfc} className="flex items-center gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <input
                type="text"
                placeholder="RFC a consultar (ej. AAA120730823)"
                value={singleRfcQuery}
                onChange={(e) => setSingleRfcQuery(e.target.value.toUpperCase())}
                maxLength={13}
                className="w-full pl-9 pr-3 py-2 bg-slate-800/90 border border-slate-600 rounded-xl text-xs font-mono font-bold text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-inner"
              />
              <span className="material-symbols-outlined absolute left-2.5 top-2.5 text-slate-400 text-[16px]">
                badge
              </span>
            </div>
            <button
              type="submit"
              disabled={isSearchingRfc || !singleRfcQuery.trim()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-bold rounded-xl transition-all shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0 flex items-center gap-1.5"
            >
              {isSearchingRfc ? (
                <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <span className="material-symbols-outlined text-[16px]">search</span>
              )}
              <span>Verificar</span>
            </button>
          </form>
        </div>

        {/* Resultado de búsqueda rápida */}
        {singleRfcResult && (
          <div className="mt-4 pt-4 border-t border-slate-700/80 animate-in fade-in duration-200">
            {singleRfcResult.isEfos ? (
              <div className="bg-rose-950/80 border border-rose-500/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-rose-200">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-rose-400 text-[24px] shrink-0 mt-0.5">
                    dangerous
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-white text-sm">
                        {singleRfcResult.rfc}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-rose-600 text-white">
                        {singleRfcResult.efosInfo.situacion}
                      </span>
                    </div>
                    <p className="text-xs text-rose-100 font-medium mt-0.5">
                      {singleRfcResult.efosInfo.nombre}
                    </p>
                    <p className="text-[11px] text-rose-300 font-mono mt-1">
                      Oficio DOF: {singleRfcResult.efosInfo.oficio_dof || 'N/A'} | Publicación DOF: {singleRfcResult.efosInfo.fecha_publicacion_dof || 'N/A'}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-[11px] font-bold text-rose-300 bg-rose-900/60 px-3 py-1 rounded-lg border border-rose-700 block text-center">
                    🚨 FACTURAS NO DEDUCIBLES
                  </span>
                </div>
              </div>
            ) : (
              <div className="bg-emerald-950/80 border border-emerald-500/80 rounded-2xl p-4 flex items-center justify-between gap-3 text-emerald-200">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-emerald-400 text-[24px]">
                    verified
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-white text-sm">
                        {singleRfcResult.rfc}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-emerald-600 text-white">
                        CONFORME (LIMPIO)
                      </span>
                    </div>
                    <p className="text-xs text-emerald-200 mt-0.5">
                      El RFC NO se encuentra en la lista negra del Artículo 69-B del CFF (SAT/DOF).
                    </p>
                  </div>
                </div>
                <span className="text-[11px] font-bold text-emerald-300 bg-emerald-900/60 px-3 py-1 rounded-lg border border-emerald-700">
                  ✅ CUMPLIMIENTO CONFORME
                </span>
              </div>
            )}
          </div>
        )}

        {singleRfcError && (
          <div className="mt-3 p-3 rounded-xl bg-rose-900/50 border border-rose-700 text-rose-200 text-xs">
            {singleRfcError}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 2. DICTAMEN OFICIAL Y SEMÁFORO DE AUDITORÍA */}
      {/* ========================================================================= */}
      <div
        className={`rounded-3xl p-6 border shadow-sm transition-all ${
          isRiesgoCritico
            ? 'bg-rose-50/90 border-rose-300 text-rose-950'
            : isAlertaPresunto
            ? 'bg-amber-50/90 border-amber-300 text-amber-950'
            : 'bg-emerald-50/90 border-emerald-300 text-emerald-950'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${
                isRiesgoCritico
                  ? 'bg-rose-600 text-white'
                  : isAlertaPresunto
                  ? 'bg-amber-600 text-white'
                  : 'bg-emerald-600 text-white'
              }`}
            >
              <span className="material-symbols-outlined text-[28px]">
                {isRiesgoCritico ? 'gavel' : isAlertaPresunto ? 'warning' : 'verified_user'}
              </span>
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                    isRiesgoCritico
                      ? 'bg-rose-200 text-rose-800'
                      : isAlertaPresunto
                      ? 'bg-amber-200 text-amber-800'
                      : 'bg-emerald-200 text-emerald-800'
                  }`}
                >
                  {dictamen.estatus}
                </span>
                <span className="text-xs font-mono font-bold text-slate-600">
                  Periodo: {data?.periodo || (year ? `Ejercicio ${year}` : 'Consolidado')}
                </span>
              </div>

              <h2 className="text-base font-black mt-1 text-slate-950">
                {dictamen.titulo}
              </h2>
              <p className="text-xs text-slate-700 mt-1 leading-relaxed max-w-4xl font-normal">
                {dictamen.texto}
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:items-end gap-2 shrink-0">
            <button
              type="button"
              onClick={onDownloadExcel}
              disabled={isDownloading}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-95 text-white text-xs font-black shadow-sm transition-all cursor-pointer disabled:opacity-60"
            >
              {isDownloading ? (
                <>
                  <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Generando Libro Excel...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">download</span>
                  <span>Descargar Auditoría Oficial (.xlsx)</span>
                </>
              )}
            </button>
            <span className="text-[10px] text-slate-500 font-mono">
              Incluye cédula de dictamen y firmas
            </span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. TARJETAS KPI DE AUDITORÍA */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Proveedores Auditados */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-3xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Proveedores Totales
            </span>
            <span className="material-symbols-outlined text-slate-400 text-[18px]">group</span>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-slate-900">
              {metricas.total_proveedores}
            </span>
            <span className="text-[11px] text-slate-500 block mt-0.5">
              {metricas.total_cfdis_auditados} comprobantes recibidos
            </span>
          </div>
        </div>

        {/* Proveedores Conformes */}
        <div className="bg-emerald-50/60 p-4 rounded-2xl border border-emerald-200/80 shadow-3xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">
              100% Conformes
            </span>
            <span className="material-symbols-outlined text-emerald-600 text-[18px]">check_circle</span>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-emerald-900">
              {metricas.total_conformes}
            </span>
            <span className="text-[11px] text-emerald-700 font-bold block mt-0.5">
              {metricas.tasa_cumplimiento}% Cumplimiento Limpio
            </span>
          </div>
        </div>

        {/* EFOS Definitivos */}
        <div
          className={`p-4 rounded-2xl border shadow-3xs flex flex-col justify-between ${
            metricas.total_definitivos > 0
              ? 'bg-rose-50 border-rose-300 text-rose-950'
              : 'bg-white border-slate-200/90 text-slate-900'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">
              EFOS Definitivos
            </span>
            <span
              className={`material-symbols-outlined text-[18px] ${
                metricas.total_definitivos > 0 ? 'text-rose-600' : 'text-slate-400'
              }`}
            >
              error
            </span>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black">{metricas.total_definitivos}</span>
            <span className="text-[11px] opacity-80 block mt-0.5">
              {metricas.total_definitivos > 0 ? '🚨 Delito Fiscal / No Deducible' : 'Sin alertas críticas'}
            </span>
          </div>
        </div>

        {/* EFOS Presuntos */}
        <div
          className={`p-4 rounded-2xl border shadow-3xs flex flex-col justify-between ${
            metricas.total_presuntos > 0
              ? 'bg-amber-50 border-amber-300 text-amber-950'
              : 'bg-white border-slate-200/90 text-slate-900'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">
              EFOS Presuntos
            </span>
            <span
              className={`material-symbols-outlined text-[18px] ${
                metricas.total_presuntos > 0 ? 'text-amber-600' : 'text-slate-400'
              }`}
            >
              warning_amber
            </span>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black">{metricas.total_presuntos}</span>
            <span className="text-[11px] opacity-80 block mt-0.5">
              {metricas.total_presuntos > 0 ? '⚠️ En periodo probatorio' : 'Sin alertas preventivas'}
            </span>
          </div>
        </div>

        {/* Monto Total en Riesgo */}
        <div
          className={`col-span-2 lg:col-span-1 p-4 rounded-2xl border shadow-3xs flex flex-col justify-between ${
            metricas.monto_total_en_riesgo > 0
              ? 'bg-rose-100/70 border-rose-300 text-rose-950'
              : 'bg-slate-50 border-slate-200/90 text-slate-900'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">
              Monto en Riesgo
            </span>
            <span className="material-symbols-outlined text-[18px] text-slate-400">payments</span>
          </div>
          <div className="mt-2">
            <span className="text-xl font-black block truncate">
              ${Number(metricas.monto_total_en_riesgo || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </span>
            <span className="text-[11px] opacity-80 block mt-0.5">
              Subtotal + IVA auditado
            </span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. TABLA INTERACTIVA DE PROVEEDORES AUDITADOS */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden flex flex-col">
        {/* Cabecera de la tabla y controles */}
        <div className="p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-slate-600 text-[20px]">domain</span>
            <h3 className="text-sm font-black text-slate-900">
              Padrón de Proveedores Auditados
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-100 text-slate-600">
              {filteredSuppliers.length} proveedor(es)
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Tabs de estado */}
            <div className="flex p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => setSelectedTab('todos')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  selectedTab === 'todos' ? 'bg-white text-slate-900 shadow-3xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Todos ({allSuppliers.length})
              </button>
              <button
                type="button"
                onClick={() => setSelectedTab('riesgo')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                  selectedTab === 'riesgo' ? 'bg-white text-rose-700 shadow-3xs' : 'text-slate-500 hover:text-rose-700'
                }`}
              >
                <span>🚨 En Riesgo</span>
                <span className="text-[10px] font-mono font-bold">({suppliersEnRiesgo.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedTab('conformes')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  selectedTab === 'conformes' ? 'bg-white text-emerald-700 shadow-3xs' : 'text-slate-500 hover:text-emerald-700'
                }`}
              >
                Conformes ({provsConformes.length})
              </button>
            </div>

            {/* Buscador dentro de la tabla */}
            <div className="relative">
              <input
                type="text"
                placeholder="Filtrar por RFC o Razón Social..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300 w-56"
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
                <th className="py-3 px-4">RFC Emisor</th>
                <th className="py-3 px-4">Razón Social</th>
                <th className="py-3 px-4 text-center">CFDIs</th>
                <th className="py-3 px-4 text-right">Subtotal</th>
                <th className="py-3 px-4 text-right">Total Facturado</th>
                <th className="py-3 px-4 text-center">Situación Art. 69-B</th>
                <th className="py-3 px-4">Acción Legal</th>
                <th className="py-3 px-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredSuppliers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <span className="material-symbols-outlined text-[32px] block mb-1 text-slate-300">
                      rule_folder
                    </span>
                    No se encontraron proveedores para este filtro.
                  </td>
                </tr>
              ) : (
                filteredSuppliers.map((prov) => {
                  const isDef = prov.es_definitivo;
                  const isPres = prov.es_presunto;

                  return (
                    <tr
                      key={prov.rfc}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isDef ? 'bg-rose-50/40' : isPres ? 'bg-amber-50/40' : ''
                      }`}
                    >
                      <td className="py-3 px-4 font-mono font-bold text-slate-800">
                        {prov.rfc}
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 max-w-xs truncate" title={prov.nombre_cfdi}>
                          {prov.nombre_cfdi || 'Sin nombre'}
                        </div>
                        {prov.nombre_oficial_sat && prov.nombre_oficial_sat !== prov.nombre_cfdi && (
                          <div className="text-[10px] text-slate-400 truncate max-w-xs" title={prov.nombre_oficial_sat}>
                            SAT: {prov.nombre_oficial_sat}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center font-mono font-bold text-slate-700">
                        {prov.total_cfdis}
                      </td>

                      <td className="py-3 px-4 text-right font-mono text-slate-600">
                        ${Number(prov.subtotal || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </td>

                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        ${Number(prov.total || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </td>

                      <td className="py-3 px-4 text-center">
                        {isDef ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
                            Definitivo
                          </span>
                        ) : isPres ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
                            Presunto
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Conforme
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-[11px]">
                        {isDef ? (
                          <span className="text-rose-700 font-bold">
                            Reversar deducción e IVA
                          </span>
                        ) : isPres ? (
                          <span className="text-amber-700 font-medium">
                            Integrar materialidad
                          </span>
                        ) : (
                          <span className="text-slate-500">
                            Sin riesgo / Deducible
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => setSelectedSupplierForModal(prov)}
                          className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all shadow-3xs cursor-pointer flex items-center gap-1 mx-auto"
                          title="Ver comprobantes de este proveedor"
                        >
                          <span className="material-symbols-outlined text-[14px]">receipt_long</span>
                          <span>Facturas</span>
                        </button>
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
      {/* 5. MODAL DE COMPROBANTES POR PROVEEDOR */}
      {/* ========================================================================= */}
      {selectedSupplierForModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between gap-3 bg-slate-50/80">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center border border-indigo-100">
                  <span className="material-symbols-outlined text-[20px]">receipt_long</span>
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-900">
                    Comprobantes Emitidos por {selectedSupplierForModal.rfc}
                  </h4>
                  <p className="text-xs text-slate-500 font-medium truncate max-w-lg">
                    {selectedSupplierForModal.nombre_cfdi}
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
                          {cfdi.fecha}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                          {cfdi.metodo_pago}
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
                        Subtotal: ${Number(cfdi.subtotal || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-center py-8 text-slate-400 text-xs">
                  Detalle de facturas disponible en el libro Excel descargable.
                </p>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                Total acumulado: <strong className="text-slate-900">${Number(selectedSupplierForModal.total || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</strong>
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
