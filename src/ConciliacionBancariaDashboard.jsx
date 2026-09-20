import React, { useState, useRef } from 'react';

export default function ConciliacionBancariaDashboard({
  data,
  year,
  client,
  onDownloadExcel,
  isDownloading,
  onRefresh,
  isLoading,
  onUploadBankFile,
  isUploadingBank,
}) {
  const [activeTab, setActiveTab] = useState('depositos'); // 'depositos' | 'retiros' | 'cedula'
  const fileInputRef = useRef(null);

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
    rfc: client?.rfc,
    has_bank_file: false,
    total_movimientos_banco: 0,
    total_depositos_bancarios: 0,
    total_retiros_bancarios: 0,
    depositos_conciliados_monto: 0,
    depositos_conciliados_count: 0,
    depositos_sin_cfdi_monto: 0,
    depositos_sin_cfdi_count: 0,
    retiros_conciliados_monto: 0,
    retiros_conciliados_count: 0,
    retiros_sin_cfdi_monto: 0,
    retiros_sin_cfdi_count: 0,
    efectividad_conciliacion: 100,
    riesgo_discrepancia_art59: 'BAJO'
  };

  const depositosConciliados = data?.depositos_conciliados || [];
  const depositosSinCfdi = data?.depositos_sin_cfdi || [];
  const retirosConciliados = data?.retiros_conciliados || [];
  const retirosSinCfdi = data?.retiros_sin_cfdi || [];

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file && onUploadBankFile) {
      onUploadBankFile(file);
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300">
      {/* Barra de Control y Acciones Superiores */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-3xl p-6 text-white shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-teal-500/20 border border-teal-400/30 flex items-center justify-center text-teal-300 shadow-inner">
            <span className="material-symbols-outlined text-[26px]">account_balance</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-white tracking-tight">
                Conciliación Bancaria vs. CFDI (Flujo de Efectivo)
              </h2>
              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold border ${
                resumen.riesgo_discrepancia_art59 === 'BAJO'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30'
                  : 'bg-rose-500/20 text-rose-300 border-rose-400/30'
              }`}>
                Riesgo Art. 59 CFF: {resumen.riesgo_discrepancia_art59}
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Auditoría de estados de cuenta vs. facturas PUE y complementos REP para {client?.name} ({client?.rfc}) — {year}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".xlsx,.xls,.csv"
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploadingBank}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-teal-600 hover:bg-teal-500 text-white shadow-xs transition-all cursor-pointer disabled:opacity-50"
            title="Subir Estado de Cuenta Bancario en Excel o CSV"
          >
            <span className="material-symbols-outlined text-[16px]">upload_file</span>
            <span>{isUploadingBank ? 'Subiendo...' : 'Subir Estado de Cuenta'}</span>
          </button>

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
            onClick={onDownloadExcel}
            disabled={isDownloading}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white shadow-md hover:shadow-lg transition-all cursor-pointer disabled:opacity-50 active:scale-95"
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

      {/* KPI Cards: Flujo Bancario vs CFDI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Depósitos Totales Bancarios */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Depósitos Bancarios</span>
            <span className="material-symbols-outlined text-[18px] text-teal-600">arrow_downward</span>
          </div>
          <div>
            <div className="text-lg font-black text-slate-900 tracking-tight">
              {formatCurrency(resumen.total_depositos_bancarios)}
            </div>
            <div className="text-[10px] text-slate-500 mt-1 flex items-center justify-between font-medium">
              <span>{formatNumber(resumen.depositos_conciliados_count + resumen.depositos_sin_cfdi_count)} movimientos</span>
              <span className="text-teal-700 font-bold">Flujo Entrada</span>
            </div>
          </div>
        </div>

        {/* 2. Depósitos con Factura */}
        <div className="bg-white rounded-2xl p-4 border border-emerald-200 bg-gradient-to-b from-emerald-50/20 to-white shadow-xs hover:border-emerald-300 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between text-emerald-800 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Amparados con CFDI</span>
            <span className="material-symbols-outlined text-[18px] text-emerald-600">check_circle</span>
          </div>
          <div>
            <div className="text-lg font-black text-emerald-900 tracking-tight">
              {formatCurrency(resumen.depositos_conciliados_monto)}
            </div>
            <div className="text-[10px] text-emerald-700 mt-1 font-semibold">
              {formatNumber(resumen.depositos_conciliados_count)} depósitos conciliados con PUE/REP
            </div>
          </div>
        </div>

        {/* 3. Depósitos SIN Factura (Riesgo Art 59 CFF) */}
        <div className={`rounded-2xl p-4 border shadow-xs transition-all flex flex-col justify-between ${
          resumen.depositos_sin_cfdi_monto > 0
            ? 'bg-rose-50/70 border-rose-300 text-rose-950'
            : 'bg-white border-slate-200/80 text-slate-900'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Depósitos Sin CFDI</span>
            <span className="material-symbols-outlined text-[18px] text-rose-600">warning</span>
          </div>
          <div>
            <div className="text-lg font-black tracking-tight text-rose-700">
              {formatCurrency(resumen.depositos_sin_cfdi_monto)}
            </div>
            <div className="text-[10px] text-rose-800 mt-1 font-bold">
              {resumen.depositos_sin_cfdi_count} depósitos (Riesgo presunción fiscal)
            </div>
          </div>
        </div>

        {/* 4. Retiros / Gastos Deducibles */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Retiros Bancarios</span>
            <span className="material-symbols-outlined text-[18px] text-blue-600">arrow_upward</span>
          </div>
          <div>
            <div className="text-lg font-black text-slate-900 tracking-tight">
              {formatCurrency(resumen.total_retiros_bancarios)}
            </div>
            <div className="text-[10px] text-slate-500 mt-1 flex items-center justify-between font-medium">
              <span>{resumen.retiros_sin_cfdi_count} sin CFDI</span>
              <span className="text-emerald-700 font-bold">{formatCurrency(resumen.retiros_conciliados_monto)} deducibles</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200/80 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('depositos')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'depositos'
              ? 'bg-teal-700 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">payments</span>
          <span>1. Depósitos Bancarios vs. Facturación ({depositosConciliados.length + depositosSinCfdi.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('retiros')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'retiros'
              ? 'bg-teal-700 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">shopping_bag</span>
          <span>2. Retiros y Gastos vs. Deducciones ({retirosConciliados.length + retirosSinCfdi.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('cedula')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'cedula'
              ? 'bg-teal-700 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">assignment</span>
          <span>3. Cédula Dictamen de Flujo de Efectivo</span>
        </button>
      </div>

      {/* Tab 1: Depósitos */}
      {activeTab === 'depositos' && (
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="p-5 bg-slate-50/70 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-slate-900">
                Auditoría de Entradas de Dinero y Conciliación Fiscal
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Cotejo de abonos bancarios contra facturas PUE y complementos REP para prevenir presunciones del SAT (Art. 59 CFF).
              </p>
            </div>
            {depositosSinCfdi.length > 0 && (
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[15px]">warning</span>
                {depositosSinCfdi.length} depósitos sin factura emitida
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/80 text-slate-700 font-black border-b border-slate-200 text-[11px] uppercase tracking-wider">
                  <th className="py-3 px-4">Fecha Banco</th>
                  <th className="py-3 px-5">Concepto en Estado de Cuenta</th>
                  <th className="py-3 px-4 text-right">Depósito ($)</th>
                  <th className="py-3 px-4">Folio Fiscal CFDI Match</th>
                  <th className="py-3 px-4">Cliente / Receptor</th>
                  <th className="py-3 px-3 text-center">Estatus Fiscal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-[11.5px]">
                {depositosConciliados.concat(depositosSinCfdi).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400 font-sans text-xs">
                      No hay depósitos bancarios registrados. Sube el estado de cuenta en Excel o CSV para conciliar.
                    </td>
                  </tr>
                ) : (
                  depositosConciliados.concat(depositosSinCfdi).map((m, idx) => (
                    <tr key={idx} className={`hover:bg-slate-50/80 transition-colors ${
                      !m.conciliado ? 'bg-rose-50/30' : ''
                    }`}>
                      <td className="py-3 px-4 font-sans font-medium text-slate-600">
                        {m.fecha_str}
                      </td>
                      <td className="py-3 px-5 font-sans font-bold text-slate-900 max-w-xs truncate">
                        {m.concepto}
                      </td>
                      <td className="py-3 px-4 text-right font-black text-slate-900">
                        {formatCurrency(m.deposito)}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-teal-800">
                        {m.cfdi_match ? m.cfdi_match.uuid : '— Sin CFDI vinculado —'}
                      </td>
                      <td className="py-3 px-4 font-sans text-slate-700">
                        {m.cfdi_match ? m.cfdi_match.receptor : 'Pendiente de Facturar'}
                      </td>
                      <td className="py-3 px-3 text-center font-sans">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10.5px] font-bold ${
                          m.conciliado
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800 border border-rose-200'
                        }`}>
                          {m.conciliado ? 'Amparado (PUE/REP)' : 'Riesgo Discrepancia'}
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

      {/* Tab 2: Retiros */}
      {activeTab === 'retiros' && (
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="p-5 bg-slate-50/70 border-b border-slate-200/80">
            <h3 className="text-sm font-black text-slate-900">
              Auditoría de Salidas de Dinero y Gastos Deducibles
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Identificación de retiros amparados con CFDI de proveedor vs. salidas no deducibles por falta de factura.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/80 text-slate-700 font-black border-b border-slate-200 text-[11px] uppercase tracking-wider">
                  <th className="py-3 px-4">Fecha</th>
                  <th className="py-3 px-5">Concepto Bancario</th>
                  <th className="py-3 px-4 text-right">Retiro / Cargo ($)</th>
                  <th className="py-3 px-4">UUID CFDI Proveedor</th>
                  <th className="py-3 px-4">Proveedor Emisor</th>
                  <th className="py-3 px-3 text-center">Estatus Deducibilidad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-[11.5px]">
                {retirosConciliados.concat(retirosSinCfdi).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400 font-sans text-xs">
                      No hay retiros bancarios para mostrar. Sube el estado de cuenta para conciliar gastos.
                    </td>
                  </tr>
                ) : (
                  retirosConciliados.concat(retirosSinCfdi).map((m, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-sans text-slate-600">{m.fecha_str}</td>
                      <td className="py-3 px-5 font-sans font-bold text-slate-900">{m.concepto}</td>
                      <td className="py-3 px-4 text-right font-black text-rose-700">{formatCurrency(m.retiro)}</td>
                      <td className="py-3 px-4 font-mono text-teal-800">{m.cfdi_match?.uuid || '— Sin comprobante —'}</td>
                      <td className="py-3 px-4 font-sans text-slate-700">{m.cfdi_match?.emisor || 'Gasto no deducible'}</td>
                      <td className="py-3 px-3 text-center font-sans">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10.5px] font-bold ${
                          m.conciliado ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {m.conciliado ? 'Deducción Amparada' : 'Sin Factura'}
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

      {/* Tab 3: Cédula Dictamen */}
      {activeTab === 'cedula' && (
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs p-6 flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
              <span className="material-symbols-outlined text-[22px]">verified</span>
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900">
                Dictamen Fiscal de Flujo de Efectivo (Art. 59 Fracc. III CFF)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Resumen analítico para justificar discrepancias entre estados de cuenta y declaraciones ante auditorías del SAT.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-col gap-2">
              <h4 className="text-xs font-bold text-slate-900">Presunción Legal de Ingresos (Art. 59 CFF)</h4>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                El SAT presume como ingresos acumulables gravables todo depósito bancario que no corresponda a los comprobantes de la contabilidad. Identificar a tiempo los depósitos sin CFDI permite solicitar comprobantes a clientes o registrar préstamos y aportaciones debidamente protocolizadas.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-col gap-2">
              <h4 className="text-xs font-bold text-slate-900">Requisito de Salida Efectiva para IVA</h4>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Para tener derecho al acreditamiento del IVA (Art. 5 Fracc. I LIVA), el impuesto debe haber sido efectivamente pagado en el mes de que se trate mediante cheque nominativo, traspaso de cuentas o tarjeta corporativa a nombre del contribuyente.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
