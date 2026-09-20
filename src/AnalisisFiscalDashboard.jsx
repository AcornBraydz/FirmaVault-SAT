import React, { useState } from 'react';
import { getRegimenInfo, normalizarRegimenCode } from './satRegimenes';

const MESES_NOMBRES = [
  '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export const SAT_FORMAS_PAGO = {
  '01': 'Efectivo (01)',
  '02': 'Cheque (02)',
  '03': 'Transferencia (03)',
  '04': 'Tarjeta Crédito (04)',
  '05': 'Monedero (05)',
  '06': 'Dinero Electrónico (06)',
  '08': 'Vales despensa (08)',
  '12': 'Dación en pago (12)',
  '13': 'Pago por subrogación (13)',
  '14': 'Pago por consignación (14)',
  '15': 'Condonación (15)',
  '17': 'Compensación (17)',
  '23': 'Novación (23)',
  '24': 'Confusión (24)',
  '25': 'Remisión de deuda (25)',
  '26': 'Prescripción o caducidad (26)',
  '27': 'A satisfacción del acreedor (27)',
  '28': 'Tarjeta Débito (28)',
  '29': 'Tarjeta Servicios (29)',
  '30': 'Aplicación anticipos (30)',
  '31': 'Intermediario pagos (31)',
  '99': 'Por definir (99)',
};

export const getFormaPagoLabel = (code, metodoPago = 'PUE') => {
  const m = String(metodoPago || 'PUE').toUpperCase().trim();
  if (!code || code === 'SIN_XML' || code === 'sin_xml' || code === 'SD' || code === 'sd') {
    if (m.includes('REP')) return 'Bancarizado (REP)';
    if (m.includes('EGRESO')) return 'Nota de Crédito';
    if (m.includes('NÓMINA') || m.includes('NOMINA')) return 'Nómina (99)';
    return m === 'PPD' ? 'Crédito (PPD)' : 'Contado (PUE)';
  }
  if (code === 'REP' || code === 'rep') return 'Bancarizado (REP)';
  if (code === 'EGRESO' || code === 'egreso') return 'Nota de Crédito';
  const c = String(code).trim().padStart(2, '0');
  return SAT_FORMAS_PAGO[c] || (code === '99' ? 'Por definir (99)' : `Forma ${code}`);
};

export default function AnalisisFiscalDashboard({
  data,
  year,
  month,
  zone,
  regime = '612',
  onChangeRegime,
  arrendamientoOpcion = 'ciega',
  onChangeArrendamientoOpcion,
  client,
  onDownloadExcel,
  isDownloading,
  onRefresh,
  isLoading,
  onStartSatSync,
  storedSyncMeta,
  isSyncSuccess,
  onStartAudit,
  downloadSuccess,
  onCloseDownloadSuccess,
  onResetToNewQuery,
  isSyncing = false,
}) {
  const [activeTab, setActiveTab] = useState('resumen'); // 'resumen' | 'iva' | 'retenciones' | 'gastos_detalle'
  const [hoveredMonth, setHoveredMonth] = useState(null);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [infoTab, setInfoTab] = useState('iva'); // 'iva' | 'nomina' | 'flujo' | 'isr' | 'auditoria'
  const [gastosSearch, setGastosSearch] = useState('');
  const [gastosFilterCat, setGastosFilterCat] = useState('todos'); // 'todos' | 'deducible' | 'efos' | 'gasolina_efectivo' | 'efectivo_2k' | 'riesgo' | 'exento' | 'nomina'
  const [gastosFilterMes, setGastosFilterMes] = useState('todos');
  const [selectedGastoModal, setSelectedGastoModal] = useState(null);

  if (!data) {
    return null;
  }

  const hasRealData = Boolean(
    downloadSuccess ||
    (data?.has_real_data && (
      Number(data?.ingresos || 0) > 0 ||
      Number(data?.gastos || 0) > 0 ||
      Number(data?.total_recibidas || 0) > 0 ||
      Number(data?.total_emitidas || 0) > 0 ||
      (Array.isArray(data?.mensual) && data.mensual.some((m) => (m.gastos || 0) > 0 || (m.ingresos || 0) > 0))
    ))
  );
  const canRunAudit = Boolean(isSyncSuccess || downloadSuccess || storedSyncMeta || hasRealData || true);
  const hasAudited = hasRealData;

  const rawIngresos = Number(data?.ingresos || 0);
  const rawGastos = Number(data?.gastos || 0);
  const rawIvaTrasladado = Number(data?.iva_trasladado || 0);
  const rawIvaAcreditable = Number(data?.iva_acreditable || 0);
  const rawSaldoIva = Number(data?.saldo_iva || 0);
  const rawUtilidadIsr = Number(data?.utilidad_isr || 0);
  const rawRetIva = Number(data?.retencion_iva || 0);
  const rawRetIsr = Number(data?.retencion_isr || 0);

  // Si no hay datos sincronizados para este ejercicio, todas las cifras deben estar en blanco / $0.00
  const ingresos = hasRealData ? rawIngresos : 0;
  const gastos = hasRealData ? rawGastos : 0;
  const iva_trasladado = hasRealData ? rawIvaTrasladado : 0;
  const iva_acreditable = hasRealData ? rawIvaAcreditable : 0;
  const saldo_iva = hasRealData ? rawSaldoIva : 0;
  const utilidad_isr = hasRealData ? rawUtilidadIsr : 0;
  const retencion_iva = hasRealData ? rawRetIva : 0;
  const retencion_isr = hasRealData ? rawRetIsr : 0;

  // Lógica y variables de los 4 Regímenes Autorizados
  const regCode = normalizarRegimenCode(regime || data?.regime || '612');
  const regInfo = getRegimenInfo(regCode);
  const isResico = regCode === '626';
  const isArrendamiento = regCode === '606';
  const isResicoPM = regCode === 'resico_pm';
  const isPMGeneral = regCode === '601';

  const resicoData = data?.resico || null;
  const resicoNeto = isResico ? Number(resicoData?.isr_neto ?? 0) : 0;
  const resicoDeterminado = isResico ? Number(resicoData?.isr_determinado ?? resicoData?.isr_causado ?? 0) : 0;
  const resicoTasa = isResico ? Number(resicoData?.tasa ?? 0) : 0;
  const resicoRetencion = isResico ? Number(resicoData?.retencion_isr_acreditable ?? retencion_isr) : 0;

  const rawMensual = Array.isArray(data?.mensual) ? data.mensual : [];
  const mensual = hasRealData
    ? rawMensual
    : Array.from({ length: 12 }, (_, i) => ({
        mes: i + 1,
        nombre: MESES_NOMBRES[i + 1] || `Mes ${i + 1}`,
        ingresos: 0,
        ventas_16: 0,
        ventas_8: 0,
        gastos: 0,
        compras_16: 0,
        compras_8: 0,
        iva_trasladado: 0,
        iva_acreditable: 0,
        saldo_iva: 0,
        ret_iva: 0,
        ret_isr: 0,
        utilidad_isr: 0,
      }));

  const retenciones = hasRealData && Array.isArray(data?.retenciones) ? data.retenciones : [];
  const rawDetalleGastos = Array.isArray(data?.detalle_gastos) ? data.detalle_gastos : [];
  const detalleGastos = hasRealData ? rawDetalleGastos : [];

  // Etiquetado dinámico y redondeo de Diferencia IVA
  const roundedSaldoIva = Math.round(Number(saldo_iva || 0) * 100) / 100;
  const isIvaACargo = hasRealData && roundedSaldoIva > 0;
  const isIvaAFavor = hasRealData && roundedSaldoIva < 0;
  const isIvaCero = hasRealData && roundedSaldoIva === 0;

  const margenUtilidad = hasRealData && ingresos > 0 ? ((utilidad_isr / ingresos) * 100).toFixed(1) : '0.0';
  const monthNum = parseInt(month, 10) || 0;
  const periodoLabel = monthNum > 0 ? `${MESES_NOMBRES[monthNum]} ${year}` : `Ejercicio ${year} (Consolidado Anual)`;

  // Máximos para escalar gráficos SVG
  const maxIva = Math.max(...mensual.map((m) => Math.max(m.iva_trasladado || 0, m.iva_acreditable || 0)), 5000);
  const maxMonto = Math.max(...mensual.map((m) => Math.max(m.ingresos || 0, m.gastos || 0)), 10000);

  const formatMoney = (amount) => {
    return '$' + Number(amount || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Helper para renderizar celda de Diferencia IVA con color y etiqueta dinámica estricta
  const renderDiferenciaIvaBadge = (monto, isLarge = false) => {
    const val = Number(monto || 0);
    const rounded = Math.round(val * 100) / 100;
    if (rounded > 0) {
      return (
        <span
          className={`inline-block ${
            isLarge
              ? 'px-3 py-1 rounded-lg text-xs font-black bg-rose-600 text-white shadow-xs'
              : 'px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          A Cargo: {formatMoney(rounded)}
        </span>
      );
    }
    if (rounded < 0) {
      return (
        <span
          className={`inline-block ${
            isLarge
              ? 'px-3 py-1 rounded-lg text-xs font-black bg-emerald-600 text-white shadow-xs'
              : 'px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200'
          }`}
        >
          A Favor: {formatMoney(Math.abs(rounded))}
        </span>
      );
    }
    return (
      <span
        className={`inline-block ${
          isLarge
            ? 'px-3 py-1 rounded-lg text-xs font-black bg-slate-700 text-white'
            : 'px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200'
        }`}
      >
        $0.00
      </span>
    );
  };

  // Conteos y filtros analíticos para la auditoría de gastos
  const countGastosDeducibles = detalleGastos.filter((g) => g.categoria === 'deducible').length;
  const countGastosCondicionados = detalleGastos.filter((g) => g.categoria === 'condicionado_bancarizacion').length;
  const countGastosExentos = detalleGastos.filter((g) => g.categoria === 'exento').length;
  const countGastosRep = detalleGastos.filter((g) => g.categoria === 'rep').length;
  const countGastosEgreso = detalleGastos.filter((g) => g.categoria === 'egreso').length;
  const countGastosNomina = detalleGastos.filter((g) => g.categoria === 'nomina').length;
  const countGastosEfos = detalleGastos.filter((g) => g.categoria === 'efos').length;
  const countGastosGasolina = detalleGastos.filter((g) => g.categoria === 'gasolina_efectivo').length;
  const countGastosEfectivo2k = detalleGastos.filter((g) => g.categoria === 'efectivo_2k').length;
  const countGastosRiesgo = detalleGastos.filter(
    (g) => g.categoria === 'riesgo' || g.categoria === 'efos' || g.categoria === 'gasolina_efectivo' || g.categoria === 'efectivo_2k'
  ).length;

  const efosDetectados = hasRealData && Array.isArray(data?.efos_detectados) ? data.efos_detectados : [];

  const filteredGastos = detalleGastos.filter((g) => {
    if (gastosFilterMes !== 'todos' && Number(g.mes) !== Number(gastosFilterMes)) return false;
    if (gastosFilterCat !== 'todos') {
      if (gastosFilterCat === 'deducible' && g.categoria !== 'deducible') return false;
      if (gastosFilterCat === 'condicionado_bancarizacion' && g.categoria !== 'condicionado_bancarizacion') return false;
      if (gastosFilterCat === 'efos' && g.categoria !== 'efos') return false;
      if (gastosFilterCat === 'gasolina_efectivo' && g.categoria !== 'gasolina_efectivo') return false;
      if (gastosFilterCat === 'efectivo_2k' && g.categoria !== 'efectivo_2k') return false;
      if (gastosFilterCat === 'riesgo' && !(g.categoria === 'riesgo' || g.categoria === 'efos' || g.categoria === 'gasolina_efectivo' || g.categoria === 'efectivo_2k')) return false;
      if (gastosFilterCat === 'exento' && g.categoria !== 'exento') return false;
      if (gastosFilterCat === 'rep' && g.categoria !== 'rep') return false;
      if (gastosFilterCat === 'egreso' && g.categoria !== 'egreso') return false;
      if (gastosFilterCat === 'nomina' && g.categoria !== 'nomina') return false;
    }
    if (gastosSearch.trim()) {
      const q = gastosSearch.toLowerCase();
      const match =
        (g.nombre || '').toLowerCase().includes(q) ||
        (g.rfc || '').toLowerCase().includes(q) ||
        (g.uuid || '').toLowerCase().includes(q) ||
        (g.decision || '').toLowerCase().includes(q) ||
        (g.fundamento || '').toLowerCase().includes(q) ||
        (g.forma_pago || '').toLowerCase().includes(q) ||
        (g.forma_pago_nombre || '').toLowerCase().includes(q) ||
        (g.metodo_pago || '').toLowerCase().includes(q) ||
        getFormaPagoLabel(g.forma_pago, g.metodo_pago).toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  const regimeLabel = regInfo.nombre;

  return (
    <div className="bg-white rounded-3xl border border-slate-200/90 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6 sm:p-8 flex flex-col gap-7 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* 1. Header Ejecutivo Superior de Nivel Top Tier */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-50 border border-teal-200/90 text-teal-800 flex items-center justify-center shadow-3xs">
              <span className="material-symbols-outlined text-[22px]">verified</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-black uppercase tracking-widest text-teal-700 bg-teal-50/80 px-2.5 py-0.5 rounded-md border border-teal-200/60">
                  DICTAMEN FISCAL EN TIEMPO REAL
                </span>
                <span className={`w-1.5 h-1.5 rounded-full ${canRunAudit ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-950 tracking-tight mt-0.5">
                Tablero Ejecutivo de Impuestos (IVA e ISR)
              </h2>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-2 flex flex-wrap items-center gap-2">
            <span>Periodo:</span>
            <strong className="text-slate-800 font-bold bg-slate-100 px-2 py-0.5 rounded-md text-[11px]">{periodoLabel}</strong>
            <span className="text-slate-300">•</span>
            <span>Contribuyente:</span>
            <strong className="text-slate-800 font-bold font-mono bg-slate-100 px-2 py-0.5 rounded-md text-[11px]">{client?.rfc}</strong>
            <span className="text-slate-300">•</span>
            <span>Régimen:</span>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold border ${
              isResico ? 'bg-teal-50 text-teal-900 border-teal-300' :
              isArrendamiento ? 'bg-amber-50 text-amber-900 border-amber-300' :
              isResicoPM ? 'bg-indigo-50 text-indigo-900 border-indigo-300' :
              'bg-slate-100 text-slate-800 border-slate-200'
            }`}>
              <span className="font-mono font-black">{regInfo.shortLabel}</span>
              <span className="text-[9px] font-black px-1 rounded bg-white/80">
                {regInfo.tipoPersona === 'Moral' ? 'PM' : 'PF'}
              </span>
              {isArrendamiento && (
                <button
                  type="button"
                  onClick={() => onChangeArrendamientoOpcion && onChangeArrendamientoOpcion(arrendamientoOpcion === 'ciega' ? 'real' : 'ciega')}
                  className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-200/90 hover:bg-amber-300 text-amber-950 transition-colors cursor-pointer ml-0.5 inline-flex items-center gap-1 border border-amber-300"
                  title="Clic para alternar entre Deducción Ciega 35% y Gastos Reales"
                >
                  <span className="material-symbols-outlined text-[13px]">swap_horiz</span>
                  <span>{arrendamientoOpcion === 'ciega' ? 'Deducción Ciega 35%' : 'Gastos Reales'}</span>
                </button>
              )}
            </span>
            <span className="text-slate-300">•</span>
            <span>Zona Fiscal:</span>
            <span className="text-slate-600 font-medium text-[11px]">{zone === 'general' ? 'Tasa General (16%)' : 'Región Fronteriza (8%)'}</span>
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowInfoModal(true)}
            className="w-10 h-10 rounded-xl border border-slate-200/90 bg-white hover:bg-teal-50/70 hover:border-teal-300 text-slate-500 hover:text-teal-800 flex items-center justify-center transition-all shadow-3xs hover:shadow-xs cursor-pointer active:scale-95 group shrink-0"
            title="Criterios de Auditoría y Metodología Fiscal de Cálculo (Manual del Auditor)"
          >
            <span className="material-symbols-outlined text-[20px] text-slate-400 group-hover:text-teal-700 transition-colors">
              info
            </span>
          </button>

          <button
            key="btn-run-audit"
            type="button"
            onClick={(!isSyncing && canRunAudit) ? (onRefresh || onStartAudit) : undefined}
            disabled={isSyncing || !canRunAudit || isLoading}
            className={`inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black select-none shrink-0 ${
              (!isSyncing && canRunAudit)
                ? 'bg-gradient-to-r from-teal-700 via-teal-800 to-emerald-800 hover:from-teal-800 hover:to-emerald-900 text-white cursor-pointer active:scale-95 shadow-sm hover:shadow'
                : 'bg-slate-100 border border-slate-200/90 text-slate-400 cursor-not-allowed shadow-none'
            }`}
            title={(!isSyncing && canRunAudit) ? 'Iniciar auditoría y determinar impuestos en pantalla' : 'Primero debes sincronizar las facturas del SAT'}
          >
            <span className={`material-symbols-outlined text-[18px] ${isLoading ? 'animate-spin' : ''}`}>
              {isLoading ? 'sync' : (!isSyncing && canRunAudit) ? 'play_circle' : 'lock'}
            </span>
            <span>{isLoading ? 'Auditando...' : 'Iniciar Auditoría'}</span>
          </button>
        </div>
      </div>

      {/* ALERTA CRÍTICA: PROVEEDORES LISTA NEGRA EFOS (ART. 69-B CFF) */}
      {hasRealData && efosDetectados.length > 0 && (
        <div className="bg-rose-50 border-2 border-rose-500 rounded-2xl p-5 shadow-sm flex flex-col gap-3 animate-in fade-in duration-300">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <span className="material-symbols-outlined text-[24px]">gavel</span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-black uppercase px-2 py-0.5 rounded bg-rose-200 text-rose-900 border border-rose-400">
                    RIESGO PENAL Y FISCAL • ART. 69-B CFF
                  </span>
                  <span className="text-xs font-bold text-rose-700">Estatus Oficial: DEFINITIVO</span>
                </div>
                <h3 className="text-base font-black text-rose-950 mt-0.5">
                  Alerta Crítica: {efosDetectados.length} Comprobante(s) de Empresa Facturadora de Operaciones Simuladas (EFOS)
                </h3>
              </div>
            </div>
            <span className="px-3 py-1 bg-rose-600 text-white font-bold text-xs rounded-xl shadow-xs shrink-0">
              Gastos e IVA Excluidos al 100%
            </span>
          </div>

          <p className="text-xs text-rose-900/90 leading-relaxed font-medium">
            El sistema contrastó el RFC emisor de los comprobantes recibidos contra el <strong>Listado Completo del Art. 69-B del CFF</strong> publicado por el SAT. Los siguientes proveedores fueron dictaminados formalmente como <strong>EFOS Definitivos</strong>. Para proteger al contribuyente de consecuencias penales por defraudación y multas, estos comprobantes fueron <strong>excluidos al 100% de los gastos deducibles y del acreditamiento de IVA</strong>:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
            {efosDetectados.map((efo, idx) => (
              <div key={idx} className="bg-white p-3 rounded-xl border border-rose-300 shadow-3xs flex flex-col gap-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-black text-rose-700">{efo.rfc}</span>
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                    Definitivo
                  </span>
                </div>
                <div className="font-bold text-slate-800 truncate" title={efo.nombre}>{efo.nombre || 'EMPRESA EFOS'}</div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono mt-0.5 pt-1 border-t border-slate-100">
                  <span>Monto: {formatMoney(efo.total)}</span>
                  <span className="text-rose-600 font-bold">No Deducible</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}



      {/* 2. Tarjetas KPI de Resumen Ejecutivo con Acabado Top Tier */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Ingresos Totales */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between gap-3 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-600" />
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Ingresos Facturados</span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <span className="material-symbols-outlined text-[16px]">trending_up</span>
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-slate-950 font-mono tracking-tight">{formatMoney(ingresos)}</div>
            <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
              <span className="font-semibold text-slate-700">Subtotal CFDI emitidos</span> (base gravable)
            </div>
          </div>
        </div>

        {/* KPI 2: Gastos Deducibles */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between gap-3 relative overflow-hidden group">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-slate-500 to-slate-700" />
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Gastos Deducibles</span>
            <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
              <span className="material-symbols-outlined text-[16px]">receipt_long</span>
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-slate-950 font-mono tracking-tight">{formatMoney(gastos)}</div>
            <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
              <span className="font-semibold text-slate-700">
                {isResico ? 'Compras y gastos con IVA' : 'Compras y gastos recibidos'}
              </span>
              <span>{isResico ? '(acreditables para IVA)' : 'deducibles'}</span>
            </div>
          </div>
        </div>

        {/* KPI 3: Saldo Neto IVA (Etiquetado Dinámico: A Cargo, A Favor o Cero) */}
        <div className={`p-5 rounded-2xl border shadow-xs transition-all flex flex-col justify-between gap-3 relative overflow-hidden ${
          isIvaACargo
            ? 'bg-rose-50/40 border-rose-200/90 text-rose-950'
            : isIvaAFavor
            ? 'bg-emerald-50/50 border-emerald-200/90 text-emerald-950'
            : 'bg-slate-50/70 border-slate-200/90 text-slate-900'
        }`}>
          <div className={`absolute top-0 left-0 right-0 h-1 ${
            isIvaACargo ? 'bg-rose-600' : isIvaAFavor ? 'bg-emerald-600' : 'bg-slate-400'
          }`} />
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider opacity-85">
              {isIvaACargo
                ? 'IVA a Cargo por Pagar'
                : isIvaAFavor
                ? 'Saldo a Favor de IVA'
                : 'Diferencia de IVA en Ceros'}
            </span>
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
              isIvaACargo
                ? 'bg-rose-100 text-rose-700'
                : isIvaAFavor
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-slate-200 text-slate-700'
            }`}>
              <span className="material-symbols-outlined text-[16px]">
                {isIvaACargo ? 'account_balance' : isIvaAFavor ? 'savings' : 'check_circle'}
              </span>
            </div>
          </div>
          <div>
            <div className="text-2xl font-black font-mono tracking-tight">
              {isIvaCero ? '$0.00' : formatMoney(Math.abs(saldo_iva))}
            </div>
            <div className="text-[11px] opacity-80 mt-1 flex items-center gap-1 font-medium">
              <span>
                {isIvaACargo
                  ? 'Monto a enterar en declaración mensual'
                  : isIvaAFavor
                  ? 'Saldo acreditable para meses futuros'
                  : 'Sin impuesto a cargo ni saldo a favor'}
              </span>
            </div>
          </div>
        </div>

        {/* KPI 4: ISR según Régimen Fiscal */}
        {isResico ? (
          <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between gap-3 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-teal-500 to-emerald-600" />
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">ISR RESICO a Enterar</span>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-teal-50 text-teal-800 border border-teal-200">
                Tasa {resicoTasa ? `${(resicoTasa * 100).toFixed(2)}%` : '1% - 2.5%'}
              </span>
            </div>
            <div>
              <div className="text-2xl font-black text-slate-950 font-mono tracking-tight">{formatMoney(resicoNeto)}</div>
              <div className="text-[11px] text-slate-500 mt-1 flex flex-col gap-0.5">
                <span className="font-semibold text-slate-700">Art. 113-E (Sin deducción de gastos para ISR)</span>
                <span className="text-[10px] text-slate-400">
                  Retención 1.25% disminuida: {formatMoney(resicoRetencion)}
                </span>
              </div>
            </div>
          </div>
        ) : isArrendamiento ? (
          <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between gap-3 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 to-orange-600" />
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Base ISR Arrendamiento</span>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-50 text-amber-900 border border-amber-200">
                {arrendamientoOpcion === 'ciega' ? 'Deducción Ciega 35%' : 'Gastos Reales'}
              </span>
            </div>
            <div>
              <div className="text-2xl font-black text-slate-950 font-mono tracking-tight">{formatMoney(utilidad_isr)}</div>
              <div className="text-[11px] text-slate-500 mt-1 flex flex-col gap-0.5">
                <span className="font-semibold text-slate-700">Art. 115 LISR</span>
                <span className="text-[10px] text-slate-500">
                  {arrendamientoOpcion === 'ciega'
                    ? `Deducción Ciega: ${formatMoney(ingresos * 0.35)} (sin comprobantes)`
                    : `Deducción comprobada: ${formatMoney(gastos)}`}
                </span>
              </div>
            </div>
          </div>
        ) : isResicoPM ? (
          <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between gap-3 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 to-blue-600" />
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Utilidad Fiscal RESICO PM</span>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-indigo-50 text-indigo-900 border border-indigo-200">
                {margenUtilidad}% Margen
              </span>
            </div>
            <div>
              <div className="text-2xl font-black text-slate-950 font-mono tracking-tight">{formatMoney(utilidad_isr)}</div>
              <div className="text-[11px] text-slate-500 mt-1 flex flex-col gap-0.5">
                <span className="font-semibold text-slate-700">Flujo de Efectivo Puro</span>
                <span className="text-[10px] text-slate-400">
                  Cobrado menos Pagado (Título VII Cap. XII LISR)
                </span>
              </div>
            </div>
          </div>
        ) : isPMGeneral ? (
          <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between gap-3 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-600 to-indigo-700" />
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">ISR Provisional PM (Art. 14)</span>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-blue-50 text-blue-900 border border-blue-200">
                CU: {((data?.regimen_calc?.coeficiente_utilidad || 0.20) * 100).toFixed(2)}%
              </span>
            </div>
            <div>
              <div className="text-2xl font-black text-slate-950 font-mono tracking-tight">
                {formatMoney(data?.regimen_calc?.isr_determinado ?? (ingresos * (data?.regimen_calc?.coeficiente_utilidad || 0.20) * 0.30))}
              </div>
              <div className="text-[11px] text-slate-500 mt-1 flex flex-col gap-0.5">
                <span className="font-semibold text-slate-700">Tasa Corporativa 30% (Art. 9 LISR)</span>
                <span className="text-[10px] text-slate-400">
                  Base Estimada: {formatMoney(data?.regimen_calc?.base_isr ?? (ingresos * (data?.regimen_calc?.coeficiente_utilidad || 0.20)))} • Gastos acreditan IVA
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between gap-3 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-teal-500 to-emerald-600" />
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Utilidad Fiscal ISR</span>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-teal-50 text-teal-800 border border-teal-200">
                {margenUtilidad}% Margen
              </span>
            </div>
            <div>
              <div className="text-2xl font-black text-slate-950 font-mono tracking-tight">{formatMoney(utilidad_isr)}</div>
              <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                <span className="font-semibold text-slate-700">Base preliminar</span> para pagos provisionales
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. Gráficos Interactivos de Auditoría Financiera (SVG Responsivo Top Tier) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-1">
        {/* Gráfico 1: Flujo de IVA Mensual */}
        <div className="p-6 rounded-3xl border border-slate-200/90 bg-slate-50/50 flex flex-col justify-between gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-600" />
                <h3 className="text-sm font-black text-slate-900 tracking-tight">
                  Flujo Mensual de IVA (Cobrado vs Pagado)
                </h3>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Cruce directo de IVA Trasladado (ventas) contra IVA Acreditable (compras)
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-bold bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-3xs">
              <span className="flex items-center gap-1.5 text-indigo-900">
                <span className="w-2.5 h-2.5 rounded bg-indigo-600 inline-block" /> Trasladado
              </span>
              <span className="flex items-center gap-1.5 text-teal-900">
                <span className="w-2.5 h-2.5 rounded bg-teal-600 inline-block" /> Acreditable
              </span>
            </div>
          </div>

          {/* Gráfico SVG interactivo */}
          <div className="h-48 w-full flex flex-col justify-end relative">
            {!hasRealData && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-50/60 backdrop-blur-[1px] rounded-2xl">
                <span className="material-symbols-outlined text-slate-300 text-[26px]">bar_chart</span>
                <p className="text-[11px] font-bold text-slate-500 mt-1">Sin movimientos de IVA registrados ($0.00)</p>
                <p className="text-[10px] text-slate-400">Sincroniza en el Paso 1 para visualizar gráficas</p>
              </div>
            )}
            <div className={`w-full flex items-end ${mensual.length === 1 ? 'justify-center max-w-xs mx-auto' : 'justify-between gap-1 sm:gap-2.5'} h-40 border-b border-slate-200/90 pb-1 relative`}>
              {/* Línea de referencia al 50% */}
              <div className="absolute top-1/2 left-0 right-0 border-b border-dashed border-slate-200 pointer-events-none" />

              {mensual.map((m) => {
                const hTras = maxIva > 0 ? (m.iva_trasladado / maxIva) * 100 : 0;
                const hAcred = maxIva > 0 ? (m.iva_acreditable / maxIva) * 100 : 0;
                const isSelected = monthNum === m.mes || mensual.length === 1;

                return (
                  <div
                    key={m.mes}
                    onMouseEnter={() => setHoveredMonth(m)}
                    onMouseLeave={() => setHoveredMonth(null)}
                    className={`${mensual.length === 1 ? 'w-44' : 'flex-1'} h-full flex flex-col justify-end items-center group relative cursor-pointer ${
                      isSelected ? 'ring-2 ring-indigo-500/40 rounded-t bg-indigo-50/20' : ''
                    }`}
                  >
                    <div className="w-full flex items-end justify-center gap-1 sm:gap-1.5 h-full px-1">
                      {/* Barra Trasladado */}
                      <div
                        style={{ height: hasRealData && m.iva_trasladado > 0 ? `${Math.max(hTras, 4)}%` : '0%' }}
                        className="w-1/2 bg-gradient-to-t from-indigo-700 to-indigo-500 rounded-t-[4px] transition-all duration-300 group-hover:brightness-110 group-hover:shadow-md"
                      />
                      {/* Barra Acreditable */}
                      <div
                        style={{ height: hasRealData && m.iva_acreditable > 0 ? `${Math.max(hAcred, 4)}%` : '0%' }}
                        className="w-1/2 bg-gradient-to-t from-teal-700 to-teal-500 rounded-t-[4px] transition-all duration-300 group-hover:brightness-110 group-hover:shadow-md"
                      />
                    </div>

                    {/* Tooltip flotante Top Tier */}
                    {hoveredMonth?.mes === m.mes && (
                      <div className="absolute bottom-full mb-2 z-30 backdrop-blur-md bg-slate-950/95 text-white p-3 rounded-2xl text-[11px] whitespace-nowrap shadow-2xl border border-slate-800 pointer-events-none animate-in fade-in zoom-in-95 duration-150">
                        <div className="font-bold text-amber-300 border-b border-slate-800 pb-1 mb-1.5 flex items-center justify-between gap-4">
                          <span>{m.nombre} {year}</span>
                          <span className="text-[10px] font-mono text-slate-400">CFDI Nivel 4.0</span>
                        </div>
                        <div className="flex justify-between gap-4 text-slate-300">
                          <span>IVA Trasladado (16%):</span>
                          <strong className="font-mono text-white">{formatMoney(m.iva_trasladado)}</strong>
                        </div>
                        <div className="flex justify-between gap-4 text-slate-300">
                          <span>IVA Acreditable:</span>
                          <strong className="font-mono text-white">{formatMoney(m.iva_acreditable)}</strong>
                        </div>
                        <div className={`flex justify-between gap-4 pt-1.5 mt-1 border-t border-slate-800 font-bold ${
                          m.saldo_iva > 0 ? 'text-rose-400' : 'text-emerald-400'
                        }`}>
                          <span>{m.saldo_iva > 0 ? 'IVA a Cargo:' : 'Saldo a Favor:'}</span>
                          <span className="font-mono">{formatMoney(Math.abs(m.saldo_iva))}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Etiquetas de Meses en X */}
            <div className={`flex ${mensual.length === 1 ? 'justify-center max-w-xs mx-auto' : 'justify-between'} w-full pt-2`}>
              {mensual.map((m) => (
                <span
                  key={m.mes}
                  className={`${mensual.length === 1 ? 'w-44' : 'flex-1'} text-[10px] font-bold text-center uppercase tracking-wider ${
                    monthNum === m.mes || mensual.length === 1 ? 'text-indigo-700 font-black' : 'text-slate-400'
                  }`}
                >
                  {mensual.length === 1 ? `${m.nombre} ${year}` : m.nombre.slice(0, 3)}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Gráfico 2: Ingresos vs Gastos Deducibles */}
        <div className="p-6 rounded-3xl border border-slate-200/90 bg-slate-50/50 flex flex-col justify-between gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-600" />
                <h3 className="text-sm font-black text-slate-900 tracking-tight">
                  Volumen Comercial (Ingresos vs Gastos)
                </h3>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Comportamiento de facturación y nivel de deducciones autorizadas
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-bold bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-3xs">
              <span className="flex items-center gap-1.5 text-blue-900">
                <span className="w-2.5 h-2.5 rounded bg-blue-600 inline-block" /> Ingresos
              </span>
              <span className="flex items-center gap-1.5 text-slate-900">
                <span className="w-2.5 h-2.5 rounded bg-slate-500 inline-block" /> Gastos
              </span>
            </div>
          </div>

          {/* Gráfico SVG interactivo */}
          <div className="h-48 w-full flex flex-col justify-end relative">
            {!hasRealData && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-50/60 backdrop-blur-[1px] rounded-2xl">
                <span className="material-symbols-outlined text-slate-300 text-[26px]">query_stats</span>
                <p className="text-[11px] font-bold text-slate-500 mt-1">Sin ingresos ni gastos registrados ($0.00)</p>
                <p className="text-[10px] text-slate-400">Sincroniza en el Paso 1 para visualizar el flujo</p>
              </div>
            )}
            <div className={`w-full flex items-end ${mensual.length === 1 ? 'justify-center max-w-xs mx-auto' : 'justify-between gap-1 sm:gap-2.5'} h-40 border-b border-slate-200/90 pb-1 relative`}>
              {/* Línea de referencia al 50% */}
              <div className="absolute top-1/2 left-0 right-0 border-b border-dashed border-slate-200 pointer-events-none" />

              {mensual.map((m) => {
                const hIng = maxMonto > 0 ? (m.ingresos / maxMonto) * 100 : 0;
                const hGas = maxMonto > 0 ? (m.gastos / maxMonto) * 100 : 0;
                const isSelected = monthNum === m.mes || mensual.length === 1;

                return (
                  <div
                    key={m.mes}
                    onMouseEnter={() => setHoveredMonth(m)}
                    onMouseLeave={() => setHoveredMonth(null)}
                    className={`${mensual.length === 1 ? 'w-44' : 'flex-1'} h-full flex flex-col justify-end items-center group relative cursor-pointer ${
                      isSelected ? 'ring-2 ring-blue-500/40 rounded-t bg-blue-50/20' : ''
                    }`}
                  >
                    <div className="w-full flex items-end justify-center gap-1 sm:gap-1.5 h-full px-1">
                      {/* Barra Ingresos */}
                      <div
                        style={{ height: hasRealData && m.ingresos > 0 ? `${Math.max(hIng, 4)}%` : '0%' }}
                        className="w-1/2 bg-gradient-to-t from-blue-700 to-blue-500 rounded-t-[4px] transition-all duration-300 group-hover:brightness-110 group-hover:shadow-md"
                      />
                      {/* Barra Gastos */}
                      <div
                        style={{ height: hasRealData && m.gastos > 0 ? `${Math.max(hGas, 4)}%` : '0%' }}
                        className="w-1/2 bg-gradient-to-t from-slate-700 to-slate-500 rounded-t-[4px] transition-all duration-300 group-hover:brightness-110 group-hover:shadow-md"
                      />
                    </div>

                    {/* Tooltip flotante */}
                    {hoveredMonth?.mes === m.mes && (
                      <div className="absolute bottom-full mb-2 z-30 backdrop-blur-md bg-slate-950/95 text-white p-3 rounded-2xl text-[11px] whitespace-nowrap shadow-2xl border border-slate-800 pointer-events-none animate-in fade-in zoom-in-95 duration-150">
                        <div className="font-bold text-amber-300 border-b border-slate-800 pb-1 mb-1.5 flex items-center justify-between gap-4">
                          <span>{m.nombre} {year}</span>
                          <span className="text-[10px] font-mono text-slate-400">Flujo Comercial</span>
                        </div>
                        <div className="flex justify-between gap-4 text-slate-300">
                          <span>Ingresos Facturados:</span>
                          <strong className="font-mono text-white">{formatMoney(m.ingresos)}</strong>
                        </div>
                        <div className="flex justify-between gap-4 text-slate-300">
                          <span>Gastos Deducibles:</span>
                          <strong className="font-mono text-white">{formatMoney(m.gastos)}</strong>
                        </div>
                        <div className="flex justify-between gap-4 pt-1.5 mt-1 border-t border-slate-800 font-bold text-teal-400">
                          <span>Utilidad del Mes:</span>
                          <span className="font-mono">{formatMoney(m.utilidad_isr)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Etiquetas de Meses en X */}
            <div className={`flex ${mensual.length === 1 ? 'justify-center max-w-xs mx-auto' : 'justify-between'} w-full pt-2`}>
              {mensual.map((m) => (
                <span
                  key={m.mes}
                  className={`${mensual.length === 1 ? 'w-44' : 'flex-1'} text-[10px] font-bold text-center uppercase tracking-wider ${
                    monthNum === m.mes || mensual.length === 1 ? 'text-blue-700 font-black' : 'text-slate-400'
                  }`}
                >
                  {mensual.length === 1 ? `${m.nombre} ${year}` : m.nombre.slice(0, 3)}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 4. Selector de Pestañas de Nivel Corporativo (Linear / macOS Style) */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-3">
        <div className="bg-slate-100/90 p-1.5 rounded-2xl flex items-center gap-1 border border-slate-200/80 shadow-inner">
          <button
            type="button"
            onClick={() => setActiveTab('resumen')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'resumen'
                ? 'bg-white text-slate-950 shadow-xs font-black'
                : 'text-slate-600 hover:text-slate-900 font-semibold'
            }`}
          >
            1. Resumen Mensual Flujo de Efectivo
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('iva')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'iva'
                ? 'bg-white text-slate-950 shadow-xs font-black'
                : 'text-slate-600 hover:text-slate-900 font-semibold'
            }`}
          >
            2. Determinación Detallada de IVA
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('retenciones')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'retenciones'
                ? 'bg-white text-slate-950 shadow-xs font-black'
                : 'text-slate-600 hover:text-slate-900 font-semibold'
            }`}
          >
            3. Concentrado de Retenciones ({retenciones.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('gastos_detalle')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'gastos_detalle'
                ? 'bg-white text-slate-950 shadow-xs font-black'
                : 'text-slate-600 hover:text-slate-900 font-semibold'
            }`}
          >
            <span>4. Auditoría de Gastos y Decisiones</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono font-bold ${
              activeTab === 'gastos_detalle' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              {detalleGastos.length}
            </span>
          </button>
        </div>

        <span className="text-[11px] font-mono text-slate-500">
          Mostrando datos auditados para {periodoLabel}
        </span>
      </div>

      {/* 5. Tablas Detalladas según Pestaña Activa */}
      <div className="border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs bg-white">
        {/* PESTAÑA 1: Resumen Mensual */}
        {activeTab === 'resumen' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-900 text-white font-bold text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-4 text-center">Mes</th>
                  <th className="py-3.5 px-4 text-right">Subtotal Ingresos</th>
                  <th className="py-3.5 px-4 text-right">IVA Trasladado</th>
                  <th className="py-3.5 px-4 text-right">
                    {isResico ? 'Gastos c/ IVA' : isArrendamiento && arrendamientoOpcion === 'ciega' ? 'Gastos Reales (p/ IVA)' : 'Subtotal Gastos'}
                  </th>
                  <th className="py-3.5 px-4 text-right">IVA Acreditable</th>
                  <th className="py-3.5 px-4 text-right">Ret. IVA Sufrida</th>
                  <th className="py-3.5 px-4 text-center">Diferencia IVA</th>
                  <th className="py-3.5 px-4 text-right">
                    {regInfo.colHeader || (isResico ? 'ISR RESICO a Pagar' : 'Utilidad Fiscal ISR')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {mensual.map((m) => {
                  return (
                    <tr key={m.mes} className="hover:bg-slate-50/90 transition-colors">
                      <td className="py-2.5 px-4 text-center">
                        <span className="bg-slate-100 text-slate-800 font-bold px-2.5 py-0.5 rounded-lg text-xs font-sans">
                          {m.nombre}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right font-medium">{formatMoney(m.ingresos)}</td>
                      <td className="py-2.5 px-4 text-right text-indigo-700 font-semibold">{formatMoney(m.iva_trasladado)}</td>
                      <td className="py-2.5 px-4 text-right font-medium">{formatMoney(m.gastos)}</td>
                      <td className="py-2.5 px-4 text-right text-teal-700 font-semibold">{formatMoney(m.iva_acreditable)}</td>
                      <td className="py-2.5 px-4 text-right text-amber-800">{formatMoney(m.ret_iva)}</td>
                      <td className="py-2.5 px-4 text-center font-sans">
                        {renderDiferenciaIvaBadge(m.saldo_iva)}
                      </td>
                      {isResico ? (
                        <td className="py-2.5 px-4 text-right font-bold text-slate-900">
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold bg-teal-50 text-teal-800 border border-teal-200">
                              {((m.resico?.tasa || 0) * 100).toFixed(2)}%
                            </span>
                            <span className="font-mono">{formatMoney(m.resico?.isr_neto ?? 0)}</span>
                          </div>
                        </td>
                      ) : isPMGeneral ? (
                        <td className="py-2.5 px-4 text-right font-bold text-slate-900">
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold bg-blue-50 text-blue-800 border border-blue-200">
                              30% s/CU
                            </span>
                            <span className="font-mono">{formatMoney(m.regimen_calc?.isr_determinado ?? (m.ingresos * 0.20 * 0.30))}</span>
                          </div>
                        </td>
                      ) : (
                        <td className="py-2.5 px-4 text-right font-bold text-slate-900">{formatMoney(m.utilidad_isr)}</td>
                      )}
                    </tr>
                  );
                })}
                {/* Fila Total Dinámica */}
                <tr className="bg-slate-100 font-black text-slate-950 border-t-2 border-slate-900">
                  <td className="py-3.5 px-4 text-center font-sans font-black tracking-wider uppercase">
                    {monthNum > 0 || mensual.length === 1 ? `TOTAL ${mensual[0]?.nombre?.toUpperCase() || ''}` : 'TOTAL ANUAL'}
                  </td>
                  <td className="py-3.5 px-4 text-right text-slate-950">{formatMoney(ingresos)}</td>
                  <td className="py-3.5 px-4 text-right text-indigo-950">{formatMoney(iva_trasladado)}</td>
                  <td className="py-3.5 px-4 text-right text-slate-950">{formatMoney(gastos)}</td>
                  <td className="py-3.5 px-4 text-right text-teal-950">{formatMoney(iva_acreditable)}</td>
                  <td className="py-3.5 px-4 text-right text-amber-950">{formatMoney(retencion_iva)}</td>
                  <td className="py-3.5 px-4 text-center font-sans">
                    {renderDiferenciaIvaBadge(saldo_iva, true)}
                  </td>
                  <td className="py-3.5 px-4 text-right text-teal-950 font-black">
                    {formatMoney(
                      isResico
                        ? resicoNeto
                        : isPMGeneral
                        ? (data?.regimen_calc?.isr_determinado ?? (ingresos * 0.20 * 0.30))
                        : utilidad_isr
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* PESTAÑA 2: Determinación Detallada de IVA */}
        {activeTab === 'iva' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-indigo-950 text-white font-bold text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-3 text-center">Periodo</th>
                  <th className="py-3.5 px-3 text-right">Ventas 16%</th>
                  <th className="py-3.5 px-3 text-right">IVA Tras. 16%</th>
                  <th className="py-3.5 px-3 text-right">Compras 16%</th>
                  <th className="py-3.5 px-3 text-right">IVA Acred. 16%</th>
                  <th className="py-3.5 px-3 text-right">Ret. IVA Sufridas</th>
                  <th className="py-3.5 px-3 text-center">Determinación Neta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {mensual.map((m) => {
                  return (
                    <tr key={m.mes} className="hover:bg-slate-50/90 transition-colors">
                      <td className="py-2.5 px-3 text-center font-sans font-bold">{m.nombre}</td>
                      <td className="py-2.5 px-3 text-right">{formatMoney(m.ventas_16 || m.ingresos)}</td>
                      <td className="py-2.5 px-3 text-right text-indigo-700 font-bold">{formatMoney(m.iva_trasladado)}</td>
                      <td className="py-2.5 px-3 text-right">{formatMoney(m.compras_16 || m.gastos)}</td>
                      <td className="py-2.5 px-3 text-right text-teal-700 font-bold">{formatMoney(m.iva_acreditable)}</td>
                      <td className="py-2.5 px-3 text-right text-amber-800">{formatMoney(m.ret_iva)}</td>
                      <td className="py-2.5 px-3 text-center font-sans">
                        {renderDiferenciaIvaBadge(m.saldo_iva)}
                      </td>
                    </tr>
                  );
                })}
                {/* Fila Total Tab 2 */}
                <tr className="bg-indigo-50/70 font-black text-slate-950 border-t-2 border-indigo-900">
                  <td className="py-3.5 px-3 text-center font-sans font-black tracking-wider uppercase">
                    {monthNum > 0 || mensual.length === 1 ? `TOTAL ${mensual[0]?.nombre?.toUpperCase() || ''}` : 'TOTAL ANUAL'}
                  </td>
                  <td className="py-3.5 px-3 text-right">{formatMoney(ingresos)}</td>
                  <td className="py-3.5 px-3 text-right text-indigo-950 font-black">{formatMoney(iva_trasladado)}</td>
                  <td className="py-3.5 px-3 text-right">{formatMoney(gastos)}</td>
                  <td className="py-3.5 px-3 text-right text-teal-950 font-black">{formatMoney(iva_acreditable)}</td>
                  <td className="py-3.5 px-3 text-right text-amber-950">{formatMoney(retencion_iva)}</td>
                  <td className="py-3.5 px-3 text-center font-sans">
                    {renderDiferenciaIvaBadge(saldo_iva, true)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* PESTAÑA 3: Concentrado de Retenciones */}
        {activeTab === 'retenciones' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-amber-950 text-white font-bold text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-4 text-center">Tipo</th>
                  <th className="py-3.5 px-4 text-center">RFC Tercero</th>
                  <th className="py-3.5 px-4">Razón Social</th>
                  <th className="py-3.5 px-4 text-right">Subtotal</th>
                  <th className="py-3.5 px-4 text-right">Retención ISR</th>
                  <th className="py-3.5 px-4 text-right">Retención IVA</th>
                  <th className="py-3.5 px-4 text-center">CFDIs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {retenciones.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400 font-sans">
                      Sin registros de retención de ISR o IVA en el periodo seleccionado
                    </td>
                  </tr>
                ) : (
                  retenciones.map((r, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/90 transition-colors">
                      <td className="py-2.5 px-4 text-center font-sans">
                        <span className={`inline-block px-2.5 py-0.5 rounded-md text-[10px] font-bold ${
                          r.tipo.includes('Emitida') ? 'bg-blue-50 text-blue-800' : 'bg-amber-50 text-amber-800'
                        }`}>
                          {r.tipo}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-center font-bold text-slate-900">{r.rfc}</td>
                      <td className="py-2.5 px-4 font-sans truncate max-w-xs">{r.nombre}</td>
                      <td className="py-2.5 px-4 text-right">{formatMoney(r.subtotal)}</td>
                      <td className="py-2.5 px-4 text-right text-amber-800 font-bold bg-amber-50/30">{formatMoney(r.ret_isr)}</td>
                      <td className="py-2.5 px-4 text-right text-amber-800 font-bold bg-amber-50/30">{formatMoney(r.ret_iva)}</td>
                      <td className="py-2.5 px-4 text-center font-sans">{r.count}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* PESTAÑA 4: Auditoría de Gastos y Decisiones Fiscales */}
        {activeTab === 'gastos_detalle' && (
          <div className="flex flex-col animate-in fade-in duration-200">
            {/* Cabecera y Filtros de la Cédula Analítica */}
            <div className="p-5 bg-slate-50/90 border-b border-slate-200/90 flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-800" />
                    <h3 className="text-sm font-black text-slate-900 tracking-tight">
                      Cédula Analítica de Comprobantes de Gastos y Criterios Fiscales
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Auditoría comprobante por comprobante conforme al Art. 27 LISR y Art. 5 LIVA. Haz clic en cualquier fila para abrir la Ficha Técnica.
                  </p>
                </div>

                {/* Resumen de Contadores */}
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                    {countGastosDeducibles} Deducibles
                  </span>
                  {countGastosCondicionados > 0 && (
                    <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-900 border border-amber-300 flex items-center gap-1 font-semibold">
                      <span className="material-symbols-outlined text-[14px] text-amber-700">account_balance</span>
                      {countGastosCondicionados} Sujetos a Bancarización
                    </span>
                  )}
                  {countGastosRep > 0 && (
                    <span className="px-2.5 py-1 rounded-lg bg-teal-50 text-teal-800 border border-teal-200 flex items-center gap-1 font-semibold">
                      <span className="material-symbols-outlined text-[14px] text-teal-700">sync_alt</span>
                      {countGastosRep} Pagos (REP)
                    </span>
                  )}
                  {countGastosEgreso > 0 && (
                    <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-800 border border-indigo-200 flex items-center gap-1 font-semibold">
                      <span className="material-symbols-outlined text-[14px] text-indigo-700">receipt_long</span>
                      {countGastosEgreso} Notas de Crédito
                    </span>
                  )}
                  {countGastosEfos > 0 && (
                    <span className="px-2.5 py-1 rounded-lg bg-rose-100 text-rose-900 border border-rose-400 flex items-center gap-1 animate-pulse font-black">
                      <span className="material-symbols-outlined text-[14px] text-rose-700">gavel</span>
                      {countGastosEfos} EFOS Definitivos
                    </span>
                  )}
                  {countGastosGasolina > 0 && (
                    <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-900 border border-amber-300 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px] text-amber-700">local_gas_station</span>
                      {countGastosGasolina} Gasolina Efectivo
                    </span>
                  )}
                  {countGastosEfectivo2k > 0 && (
                    <span className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-800 border border-rose-200 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
                      {countGastosEfectivo2k} Efectivo &gt; $2k
                    </span>
                  )}
                  {countGastosRiesgo > 0 && countGastosEfos === 0 && countGastosGasolina === 0 && countGastosEfectivo2k === 0 && (
                    <span className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-800 border border-rose-200 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse" />
                      {countGastosRiesgo} No Deducibles
                    </span>
                  )}
                  {countGastosExentos > 0 && (
                    <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-800 border border-blue-200 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                      {countGastosExentos} Exentos IVA
                    </span>
                  )}
                  {countGastosNomina > 0 && (
                    <span className="px-2.5 py-1 rounded-lg bg-purple-50 text-purple-800 border border-purple-200 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-600" />
                      {countGastosNomina} Nóminas
                    </span>
                  )}
                </div>
              </div>

              {/* Barra de Controles: Búsqueda y Filtros de Categoría */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="relative flex-1 min-w-[240px] max-w-md">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
                    search
                  </span>
                  <input
                    type="text"
                    value={gastosSearch}
                    onChange={(e) => setGastosSearch(e.target.value)}
                    placeholder="Buscar por Proveedor, RFC o UUID..."
                    className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all shadow-3xs"
                  />
                  {gastosSearch && (
                    <button
                      type="button"
                      onClick={() => setGastosSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-[16px] cursor-pointer"
                    >
                      ×
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  {[
                    { id: 'todos', label: `Todos (${detalleGastos.length})` },
                    { id: 'deducible', label: `Deducibles (${countGastosDeducibles})` },
                    ...(countGastosCondicionados > 0 ? [{ id: 'condicionado_bancarizacion', label: `Sujetos a Bancarización (${countGastosCondicionados})` }] : []),
                    ...(countGastosEfos > 0 ? [{ id: 'efos', label: `EFOS Art. 69-B (${countGastosEfos})` }] : []),
                    ...(countGastosGasolina > 0 ? [{ id: 'gasolina_efectivo', label: `Gasolina Efectivo (${countGastosGasolina})` }] : []),
                    ...(countGastosEfectivo2k > 0 ? [{ id: 'efectivo_2k', label: `Efectivo > $2k (${countGastosEfectivo2k})` }] : []),
                    ...(countGastosRiesgo > 0 ? [{ id: 'riesgo', label: `No Deducibles (${countGastosRiesgo})` }] : []),
                    ...(countGastosExentos > 0 ? [{ id: 'exento', label: `Exentos IVA (${countGastosExentos})` }] : []),
                    ...(countGastosRep > 0 ? [{ id: 'rep', label: `Pagos REP (${countGastosRep})` }] : []),
                    ...(countGastosEgreso > 0 ? [{ id: 'egreso', label: `Notas Crédito (${countGastosEgreso})` }] : []),
                    ...(countGastosNomina > 0 ? [{ id: 'nomina', label: `Nóminas (${countGastosNomina})` }] : []),
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setGastosFilterCat(cat.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        gastosFilterCat === cat.id
                          ? 'bg-slate-900 text-white shadow-2xs'
                          : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200/90'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}

                  {/* Filtro de Mes */}
                  {monthNum === 0 && (
                    <select
                      value={gastosFilterMes}
                      onChange={(e) => setGastosFilterMes(e.target.value)}
                      className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 focus:outline-none cursor-pointer shadow-3xs"
                    >
                      <option value="todos">Todos los meses</option>
                      {Array.from({ length: 12 }, (_, i) => (
                        <option key={i + 1} value={i + 1}>
                          {MESES_NOMBRES[i + 1]}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            </div>

            {/* Tabla de Comprobantes Auditados */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-900 text-white font-bold text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="py-3.5 px-3 text-center">Fecha / Mes</th>
                    <th className="py-3.5 px-3 text-left">Emisor / Proveedor</th>
                    <th className="py-3.5 px-3 text-center">Método / Pago</th>
                    <th className="py-3.5 px-3 text-right">Subtotal</th>
                    <th className="py-3.5 px-3 text-right">IVA</th>
                    <th className="py-3.5 px-3 text-right">Total</th>
                    <th className="py-3.5 px-4 text-left">Decisión Fiscal y Fundamento</th>
                    <th className="py-3.5 px-2 text-center">Ficha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {filteredGastos.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400 font-sans">
                        <span className="material-symbols-outlined text-[32px] text-slate-300 block mb-1">search_off</span>
                        {detalleGastos.length === 0
                          ? 'Sin comprobantes de compras o gastos en el periodo analizado'
                          : 'No se encontraron gastos con los filtros aplicados'}
                      </td>
                    </tr>
                  ) : (
                    filteredGastos.map((g, idx) => {
                      const isEfos = g.categoria === 'efos';
                      const isGasolina = g.categoria === 'gasolina_efectivo';
                      const isEfectivo2k = g.categoria === 'efectivo_2k';
                      const isCondicionado = g.categoria === 'condicionado_bancarizacion';
                      const isEgreso = g.categoria === 'egreso';
                      const isRiesgo = g.categoria === 'riesgo' || isEfos || isGasolina || isEfectivo2k;
                      const isNomina = g.categoria === 'nomina';
                      const isExento = g.categoria === 'exento';
                      const isRep = g.categoria === 'rep';

                      return (
                        <tr
                          key={g.uuid || idx}
                          onClick={() => setSelectedGastoModal(g)}
                          className={`hover:bg-slate-50/90 transition-colors cursor-pointer ${
                            isEfos ? 'bg-rose-100/40' :
                            isRiesgo ? 'bg-rose-50/20' :
                            isCondicionado ? 'bg-amber-50/20' :
                            isEgreso ? 'bg-indigo-50/20' :
                            isRep ? 'bg-teal-50/25' :
                            idx % 2 === 1 ? 'bg-slate-50/30' : ''
                          }`}
                        >
                          <td className="py-2.5 px-3 text-center font-sans">
                            <span className="font-bold text-slate-800 block text-[11px]">{g.fecha || '-'}</span>
                            <span className="text-[10px] text-slate-400 font-medium">{g.mes_nombre}</span>
                          </td>
                          <td className="py-2.5 px-3 font-sans max-w-xs">
                            <div className="font-bold text-slate-900 truncate text-[11px]" title={g.nombre}>
                              {g.nombre || 'PROVEEDOR NO IDENTIFICADO'}
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-mono mt-0.5">
                              <span className={isEfos ? 'font-black text-rose-700' : ''}>RFC: {g.rfc || 'XEXX010101000'}</span>
                              <span className="text-slate-300">•</span>
                              <span className="truncate text-slate-400 max-w-[100px]" title={g.uuid}>
                                {g.uuid ? `${g.uuid.slice(0, 8)}...` : ''}
                              </span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-center font-sans">
                            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                              g.metodo_pago.includes('REP') ? 'bg-teal-100 text-teal-800' :
                              g.metodo_pago.includes('Egreso') ? 'bg-indigo-100 text-indigo-800' :
                              g.metodo_pago === 'PUE' ? 'bg-blue-50 text-blue-800' : 'bg-amber-50 text-amber-800'
                            }`}>
                              {g.metodo_pago}
                            </span>
                            <span className={`block text-[10px] font-mono mt-0.5 ${
                              isGasolina || isEfectivo2k ? 'font-black text-rose-700' :
                              isCondicionado ? 'font-bold text-amber-700' : 'text-slate-500'
                            }`}>
                              {g.forma_pago_nombre || getFormaPagoLabel(g.forma_pago, g.metodo_pago)}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-700">
                            {isRep ? (
                              <div>
                                <span className="text-slate-400 font-medium">$0.00</span>
                                <span className="block text-[9px] font-sans text-slate-400">Sin impacto</span>
                              </div>
                            ) : (
                              formatMoney(g.subtotal)
                            )}
                          </td>
                          <td className={`py-2.5 px-3 text-right font-bold ${
                            isRiesgo ? 'text-slate-400 line-through' :
                            g.iva_16 > 0 ? 'text-teal-800' : 'text-slate-400'
                          }`}>
                            {isRep ? (
                              <div>
                                <span className="text-slate-400 font-medium">$0.00</span>
                                <span className="block text-[9px] font-sans text-slate-400">Acred. en PPD</span>
                              </div>
                            ) : (
                              formatMoney(g.iva_16 + g.iva_8)
                            )}
                          </td>
                          <td className={`py-2.5 px-3 text-right font-black ${isEgreso ? 'text-indigo-800' : isRep ? 'text-teal-800' : 'text-slate-950'}`}>
                            {isRep ? (
                              <div>
                                <span className="text-teal-700 font-black">$0.00</span>
                                <span className="block text-[9px] font-sans font-bold text-teal-600 uppercase tracking-tight">No duplica</span>
                              </div>
                            ) : (
                              formatMoney(g.total)
                            )}
                          </td>
                          <td className="py-2.5 px-4 font-sans">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-bold border ${
                                  isEfos ? 'bg-rose-100 text-rose-900 border-rose-400' :
                                  isGasolina ? 'bg-amber-100 text-amber-950 border-amber-300' :
                                  isEfectivo2k ? 'bg-rose-50 text-rose-800 border-rose-200' :
                                  isCondicionado ? 'bg-amber-50 text-amber-900 border-amber-300' :
                                  isEgreso ? 'bg-indigo-50 text-indigo-900 border-indigo-200' :
                                  isRiesgo ? 'bg-rose-50 text-rose-800 border-rose-200' :
                                  isNomina ? 'bg-purple-50 text-purple-800 border-purple-200' :
                                  isExento ? 'bg-blue-50 text-blue-800 border-blue-200' :
                                  isRep ? 'bg-teal-50 text-teal-800 border-teal-200' :
                                  'bg-emerald-50 text-emerald-800 border-emerald-200'
                                }`}>
                                  <span className="material-symbols-outlined text-[13px]">
                                    {isEfos ? 'gavel' :
                                     isGasolina ? 'local_gas_station' :
                                     isCondicionado ? 'account_balance' :
                                     isEgreso ? 'assignment_return' :
                                     isRiesgo ? 'warning' :
                                     isNomina ? 'badge' :
                                     isExento ? 'school' :
                                     isRep ? 'sync_alt' : 'check_circle'}
                                  </span>
                                  <span>{g.decision}</span>
                                </span>
                                <span className="text-[10px] font-mono text-slate-500 font-semibold">{g.fundamento}</span>
                              </div>
                              <p className="text-[11px] text-slate-500 leading-tight line-clamp-1" title={g.explicacion}>
                                {g.explicacion}
                              </p>
                            </div>
                          </td>
                          <td className="py-2.5 px-2 text-center">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedGastoModal(g);
                              }}
                              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
                              title="Ver ficha técnica completa del comprobante"
                            >
                              <span className="material-symbols-outlined text-[17px]">open_in_new</span>
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
        )}
      </div>

      {/* 6. Cédula de Dictamen Fiscal Oficial y Notas Contables (Estilo Top Tier) */}
      {hasAudited && (
        <div className="bg-slate-50/80 rounded-3xl border border-slate-200/90 p-6 flex flex-col gap-5 animate-in fade-in duration-300">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
            <div className="flex items-center gap-2.5 text-slate-900 font-black text-sm">
              <span className="material-symbols-outlined text-slate-700 text-[20px]">gavel</span>
              <span>Cédula de Dictamen Contable y Conclusiones Fiscales</span>
            </div>
            <span className="text-[10px] font-mono text-slate-400 font-bold uppercase">
              Normas de Información Financiera (NIF D-4 y NIF A-2)
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-3xs">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">1. Estatus Definitivo de IVA</span>
              <span className={`font-black text-sm mt-1 block ${
                isIvaACargo ? 'text-rose-600' : isIvaAFavor ? 'text-emerald-600' : 'text-slate-700'
              }`}>
                {isIvaACargo
                  ? 'IVA a Cargo por Enterar al SAT'
                  : isIvaAFavor
                  ? 'Saldo a Favor Sujeto a Acreditamiento'
                  : 'Sin Impuesto a Cargo ni a Favor ($0.00)'}
              </span>
              <span className="text-xs font-mono font-bold text-slate-700 mt-0.5 block">
                {isIvaCero ? '$0.00' : formatMoney(Math.abs(saldo_iva))}
              </span>
              <span className="text-[10px] text-slate-400 mt-1 block">Conforme al Art. 5 LIVA (Flujo Efectivo)</span>
            </div>

            {/* Box 2: ISR según Régimen */}
            {isResico ? (
              <div className="bg-white p-4 rounded-2xl border border-teal-200 shadow-3xs">
                <span className="text-[10px] font-bold text-teal-700 uppercase tracking-wider block">2. ISR Mensual RESICO (Art. 113-E)</span>
                <span className="font-black text-sm text-slate-900 mt-1 block">
                  ISR Neto a Enterar: {formatMoney(resicoNeto)}
                </span>
                <span className="text-xs font-bold text-teal-800 mt-0.5 block">
                  Tasa: {resicoTasa ? (resicoTasa * 100).toFixed(2) + '%' : '1% - 2.5%'} | ISR Det: {formatMoney(resicoDeterminado)} | Ret: {formatMoney(resicoRetencion)}
                </span>
                <span className="text-[10px] text-slate-400 mt-1 block">Art. 113-E y 113-J LISR (Gastos no deducibles para ISR, acreditan IVA)</span>
              </div>
            ) : isArrendamiento ? (
              <div className="bg-white p-4 rounded-2xl border border-amber-200 shadow-3xs">
                <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider block">2. Base ISR Arrendamiento (Art. 115)</span>
                <span className="font-black text-sm text-slate-900 mt-1 block">Base Gravable: {formatMoney(utilidad_isr)}</span>
                <span className="text-xs font-bold text-amber-900 mt-0.5 block">
                  {arrendamientoOpcion === 'ciega'
                    ? `Deducción Ciega: ${formatMoney(ingresos * 0.35)} (35% sin comprobantes)`
                    : `Deducción Real Comprobada: ${formatMoney(gastos)}`}
                </span>
                <span className="text-[10px] text-slate-400 mt-1 block">Art. 115 LISR ({arrendamientoOpcion === 'ciega' ? 'Deducción Ciega 35%' : 'Gastos Reales'})</span>
              </div>
            ) : isResicoPM ? (
              <div className="bg-white p-4 rounded-2xl border border-indigo-200 shadow-3xs">
                <span className="text-[10px] font-bold text-indigo-800 uppercase tracking-wider block">2. Flujo Acumulado RESICO PM</span>
                <span className="font-black text-sm text-slate-900 mt-1 block">Utilidad Fiscal: {formatMoney(utilidad_isr)}</span>
                <span className="text-xs font-bold text-indigo-900 mt-0.5 block">Margen Flujo: {margenUtilidad}% | Cobrado menos Pagado</span>
                <span className="text-[10px] text-slate-400 mt-1 block">Título VII Cap. XII LISR (Arts. 206-215 Flujo Puro)</span>
              </div>
            ) : (
              <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-3xs">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">2. Utilidad Fiscal Flujo (Art. 100-110)</span>
                <span className="font-black text-sm text-slate-900 mt-1 block">Base Gravable: {formatMoney(utilidad_isr)}</span>
                <span className="text-xs font-bold text-slate-700 mt-0.5 block">Margen Utilidad: {margenUtilidad}% | Cobrado menos Pagado</span>
                <span className="text-[10px] text-slate-400 mt-1 block">Arts. 100 a 110 LISR (Act. Empresarial y Profesional)</span>
              </div>
            )}

            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-3xs">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">3. Retenciones Sufridas Acreditables</span>
              <span className="font-black text-sm text-amber-800 mt-1 block">Total Acreditable: {formatMoney(retencion_iva + retencion_isr)}</span>
              <span className="text-xs font-bold text-slate-700 mt-0.5 block">ISR: {formatMoney(retencion_isr)} | IVA: {formatMoney(retencion_iva)}</span>
              <span className="text-[10px] text-slate-400 mt-1 block">Art. 1-A LIVA y Art. 113-J LISR</span>
            </div>
          </div>
        </div>
      )}

      {/* 7. Papel de Trabajo Maestro de IVA e ISR — Descarga de Libro Contable Excel */}
      {(downloadSuccess || hasAudited) && (
        <div className={`border rounded-3xl p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300 shadow-sm ${
          downloadSuccess
            ? 'bg-emerald-50/80 border-emerald-200/90'
            : 'bg-white border-slate-200/90'
        }`}>
          <div className="flex items-center gap-3.5 min-w-0">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-3xs ${
              downloadSuccess
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-teal-50 text-teal-700 border border-teal-200'
            }`}>
              <span className="material-symbols-outlined text-[24px]">
                {downloadSuccess ? 'verified' : 'table_chart'}
              </span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h4 className={`text-sm font-black ${downloadSuccess ? 'text-emerald-950' : 'text-slate-900'}`}>
                  {downloadSuccess?.title || 'Papel de Trabajo Maestro de IVA e ISR'}
                  {downloadSuccess ? ' — Generado Exitosamente' : ''}
                </h4>
                {downloadSuccess && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300">
                    <span className="material-symbols-outlined text-[12px]">check</span> Guardado
                  </span>
                )}
              </div>
              <p className={`text-[11px] font-mono truncate mt-0.5 ${
                downloadSuccess ? 'text-emerald-800/80' : 'text-slate-500'
              }`}>
                {downloadSuccess?.filename || `Analisis_Integral_IVA_e_ISR_${client?.rfc || 'NOPA890313A48'}_${year}_${monthNum > 0 ? MESES_NOMBRES[monthNum] : 'Anual'}.xlsx`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onDownloadExcel}
              disabled={isDownloading || !hasRealData}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-teal-700 via-teal-800 to-emerald-800 hover:from-teal-800 hover:to-emerald-900 text-white text-xs font-black transition-all shadow-sm hover:shadow cursor-pointer active:scale-95 disabled:opacity-50"
              title="Descargar libro contable maestro en formato Excel (.xlsx)"
            >
              <span className={`material-symbols-outlined text-[18px] ${isDownloading ? 'animate-spin' : ''}`}>
                {isDownloading ? 'sync' : 'download'}
              </span>
              <span>
                {isDownloading
                  ? 'Generando y Descargando Excel...'
                  : downloadSuccess
                  ? 'Descargar Nuevamente (.xlsx)'
                  : 'Descargar Excel Maestro (.xlsx)'}
              </span>
            </button>

            {downloadSuccess && onCloseDownloadSuccess && (
              <button
                type="button"
                onClick={onCloseDownloadSuccess}
                className="p-2 rounded-xl text-emerald-700 hover:bg-emerald-200/60 transition-colors cursor-pointer"
                title="Cerrar notificación de descarga"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL EJECUTIVO: CRITERIOS DE AUDITORÍA Y METODOLOGÍA FISCAL DE CÁLCULO   */}
      {/* ========================================================================= */}
      {showInfoModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200"
          onClick={() => setShowInfoModal(false)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl border border-slate-200/90 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header del Modal */}
            <div className="px-6 py-5 bg-gradient-to-r from-slate-900 via-slate-950 to-teal-950 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-2xl bg-teal-500/20 border border-teal-400/40 text-teal-300 flex items-center justify-center shadow-inner">
                  <span className="material-symbols-outlined text-[24px]">gavel</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono font-black uppercase tracking-widest text-teal-300 bg-teal-950/90 px-2 py-0.5 rounded border border-teal-500/40">
                      MANUAL DEL AUDITOR FISCAL
                    </span>
                    <span className="text-slate-400 text-xs hidden sm:inline">• Ley del IVA, Ley del ISR y CFF</span>
                  </div>
                  <h3 className="text-lg font-black text-white tracking-tight mt-0.5">
                    Criterios de Auditoría y Metodología de Cálculo
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowInfoModal(false)}
                className="w-9 h-9 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                title="Cerrar ventana informativa"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Pestañas de Navegación del Modal */}
            <div className="flex items-center gap-1.5 px-6 py-2.5 bg-slate-50 border-b border-slate-200/80 overflow-x-auto select-none shrink-0">
              {[
                { id: 'iva', label: '1. Determinación de IVA', icon: 'account_balance' },
                { id: 'nomina', label: '2. Nóminas y Exentos', icon: 'payments' },
                { id: 'flujo', label: '3. Flujo (PUE vs PPD)', icon: 'swap_horiz' },
                { id: 'isr', label: '4. Base ISR y Retenciones', icon: 'percent' },
                { id: 'auditoria', label: '5. Auditoría & Excel', icon: 'verified' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setInfoTab(tab.id)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                    infoTab === tab.id
                      ? 'bg-white text-teal-950 border border-slate-300 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  <span className={`material-symbols-outlined text-[17px] ${infoTab === tab.id ? 'text-teal-700' : 'text-slate-400'}`}>
                    {tab.icon}
                  </span>
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Cuerpo del Modal con scroll fluido */}
            <div className="p-6 sm:p-8 overflow-y-auto flex flex-col gap-6 text-slate-800">
              {/* TAB 1: IVA */}
              {infoTab === 'iva' && (
                <div className="flex flex-col gap-5 animate-in fade-in duration-150">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
                    <div>
                      <h4 className="text-base font-black text-slate-900">
                        Determinación Definitiva de Impuesto al Valor Agregado (IVA)
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Cálculo mensual definitivo por Flujo de Efectivo conforme a la Ley del IVA.
                      </p>
                    </div>
                    <span className="text-[11px] font-mono font-bold text-teal-800 bg-teal-50 px-2.5 py-1 rounded-lg border border-teal-200">
                      Arts. 1, 1-A, 1-B, 4 y 5 LIVA
                    </span>
                  </div>

                  {/* Fórmula de Cálculo */}
                  <div className="p-4 rounded-2xl bg-slate-900 text-slate-100 border border-slate-800 shadow-sm font-mono">
                    <div className="text-[10px] text-teal-400 font-bold uppercase tracking-wider mb-1">Fórmula Legal Aplicada:</div>
                    <div className="text-sm font-bold text-white tracking-wide overflow-x-auto py-1">
                      Saldo Neto IVA = (IVA Trasladado 16% + 8%) - (IVA Acreditable 16% + 8%) - Retenciones Sufridas de IVA
                    </div>
                  </div>

                  {/* Explicación de Criterios */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-2xl bg-rose-50/50 border border-rose-200/80 flex flex-col gap-2">
                      <div className="flex items-center gap-2 text-rose-900 font-bold text-xs">
                        <span className="material-symbols-outlined text-[18px] text-rose-600">arrow_upward</span>
                        <span>Resultado &gt; $0.00: IVA a Cargo</span>
                      </div>
                      <p className="text-xs text-rose-950/80 leading-relaxed">
                        Cuando el IVA efectivamente cobrado a clientes supera al IVA pagado a proveedores y retenciones, resulta un <strong>impuesto definitivo a pagar al SAT</strong> que debe enterarse a más tardar el día 17 del mes inmediato posterior.
                      </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-emerald-50/50 border border-emerald-200/80 flex flex-col gap-2">
                      <div className="flex items-center gap-2 text-emerald-900 font-bold text-xs">
                        <span className="material-symbols-outlined text-[18px] text-emerald-600">arrow_downward</span>
                        <span>Resultado &lt; $0.00: Saldo a Favor</span>
                      </div>
                      <p className="text-xs text-emerald-950/80 leading-relaxed">
                        Cuando el IVA acreditable pagado es mayor que el trasladado, se genera un <strong>Saldo a Favor</strong> del contribuyente, el cual podrá acreditarse en declaraciones posteriores o solicitarse en devolución conforme a los Arts. 22 y 23 del CFF.
                      </p>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/90 text-xs text-slate-700 space-y-2">
                    <div className="font-bold text-slate-900 flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px] text-teal-700">rule</span>
                      Criterios Estrictos de Validación de Comprobantes:
                    </div>
                    <ul className="list-disc list-inside space-y-1 text-slate-600 pl-1">
                      <li><strong>Exclusión de Facturas Canceladas:</strong> Todo CFDI con estado "Cancelado" en los registros del SAT se descarta automáticamente para evitar contingencias fiscales.</li>
                      <li><strong>Zonas Fronterizas (Tasa 8%):</strong> Si se activa la zona fronteriza, el sistema audita el Decreto de Estímulos Fiscales aplicando la tasa efectiva del 8% (50% de crédito fiscal sobre el 16%).</li>
                      <li><strong>Acreditamiento Directo de Retenciones:</strong> Las retenciones de IVA que los clientes personas morales hayan retenido se disminuyen directamente del impuesto a cargo (Art. 1-A LIVA).</li>
                    </ul>
                  </div>
                </div>
              )}

              {/* TAB 2: NOMINA Y EXENTOS */}
              {infoTab === 'nomina' && (
                <div className="flex flex-col gap-5 animate-in fade-in duration-150">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
                    <div>
                      <h4 className="text-base font-black text-slate-900">
                        Tratamiento de CFDI de Nómina y Servicios Exentos
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Protección contra saldos artificiales: no todo CFDI lleva IVA ni toda nómina es deducción comercial.
                      </p>
                    </div>
                    <span className="text-[11px] font-mono font-bold text-teal-800 bg-teal-50 px-2.5 py-1 rounded-lg border border-teal-200">
                      Arts. 14, 15 LIVA y Art. 94 LISR
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Nómina */}
                    <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200 flex flex-col gap-2.5">
                      <div className="flex items-center gap-2 text-amber-950 font-bold text-xs">
                        <span className="material-symbols-outlined text-[18px] text-amber-700">badge</span>
                        <span>CFDI de Nómina (Sueldos y Salarios): Sin IVA</span>
                      </div>
                      <p className="text-xs text-amber-900/90 leading-relaxed">
                        Conforme a los Arts. 14 y 15 de la LIVA, la subordinación laboral <strong>NO es un acto o actividad gravada con IVA</strong>.
                      </p>
                      <div className="text-[11px] bg-white/80 p-2.5 rounded-xl border border-amber-200 text-amber-950">
                        <strong>Regla del Sistema:</strong> El sistema asigna <strong>IVA = $0.00</strong> y <strong>Subtotal = Total</strong>. Nunca divide entre 1.16, evitando generar un IVA acreditable falso e ilegal ante el SAT.
                      </div>
                    </div>

                    {/* Colegiaturas y Educación */}
                    <div className="p-4 rounded-2xl bg-blue-50/60 border border-blue-200 flex flex-col gap-2.5">
                      <div className="flex items-center gap-2 text-blue-950 font-bold text-xs">
                        <span className="material-symbols-outlined text-[18px] text-blue-700">school</span>
                        <span>Colegiaturas y Enseñanza: Exentas de IVA</span>
                      </div>
                      <p className="text-xs text-blue-900/90 leading-relaxed">
                        El <strong>Art. 15 Fracción IV de la LIVA</strong> establece que los servicios de enseñanza particular con autorización o RVOE están <strong>exentos de IVA</strong>.
                      </p>
                      <div className="text-[11px] bg-white/80 p-2.5 rounded-xl border border-blue-200 text-blue-950">
                        <strong>Regla del Sistema:</strong> Institutos, colegios, escuelas y universidades se auditan con <strong>IVA = $0.00</strong>, registrándose en el rubro de compras/gastos exentos.
                      </div>
                    </div>
                  </div>

                  {/* Criterio Persona Física Empleada */}
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/90 flex flex-col gap-2 text-xs text-slate-700">
                    <div className="font-bold text-slate-900 flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px] text-indigo-700">psychology</span>
                      Distinción Contable: Nómina Recibida vs. Nómina Emitida
                    </div>
                    <p className="leading-relaxed text-slate-600">
                      Cuando un contribuyente Persona Física recibe un recibo de nómina de un patrón (por ejemplo, del <strong>IMSS</strong> o una empresa), en el portal del SAT aparece clasificado bajo <em>"Facturas Recibidas"</em>. Sin embargo, para efectos fiscales de ISR, dicho comprobante <strong>es un ingreso por sueldos percibidos (Capítulo I LISR)</strong> y no un gasto operativo de su negocio. El sistema lo etiqueta debidamente para no deducir ilegalmente el propio sueldo del contribuyente.
                    </p>
                  </div>
                </div>
              )}

              {/* TAB 3: FLUJO DE EFECTIVO */}
              {infoTab === 'flujo' && (
                <div className="flex flex-col gap-5 animate-in fade-in duration-150">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
                    <div>
                      <h4 className="text-base font-black text-slate-900">
                        Flujo de Efectivo: Facturas PUE vs. Facturas PPD con REP
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        El IVA solo se traslada y se acredita en el mes en que efectivamente se cobra o se paga.
                      </p>
                    </div>
                    <span className="text-[11px] font-mono font-bold text-teal-800 bg-teal-50 px-2.5 py-1 rounded-lg border border-teal-200">
                      Art. 1-B LIVA & RMF 2.7.1.32 / 2.7.1.35
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs flex flex-col gap-2">
                      <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
                        <span className="px-2 py-0.5 rounded bg-teal-100 text-teal-800 font-mono text-[10px]">PUE</span>
                        <span>Pago en Una Sola Exhibición</span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Conforme a la regla 2.7.1.32 de la RMF, las facturas emitidas o recibidas con método <strong>PUE</strong> se consideran pagadas dentro del mismo mes calendario de su expedición. Se integran de inmediato al cálculo mensual.
                      </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs flex flex-col gap-2">
                      <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
                        <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 font-mono text-[10px]">PPD + REP</span>
                        <span>Pago en Parcialidades o Diferido</span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Las facturas con método <strong>PPD</strong> <strong>NO causan efectos fiscales en su fecha de emisión</strong>. Quedan en suspensión hasta que se emite el <strong>Complemento de Recepción de Pagos (REP - CFDI Tipo 'P')</strong>.
                      </p>
                    </div>
                  </div>

                  {/* Motor de Vinculación de REP */}
                  <div className="p-4 rounded-2xl bg-teal-50/60 border border-teal-200 flex flex-col gap-2 text-xs text-teal-950">
                    <div className="font-bold flex items-center gap-1.5 text-teal-900">
                      <span className="material-symbols-outlined text-[16px]">sync_alt</span>
                      Motor Algorítmico de Vinculación de Pagos (Complementos REP):
                    </div>
                    <p className="leading-relaxed text-teal-900/90">
                      El motor de auditoría recorre cada Complemento de Pago, extrae el nodo <code className="bg-white/80 px-1.5 py-0.5 rounded font-mono text-[11px] border border-teal-300">DoctoRelacionado</code> con su <code className="bg-white/80 px-1.5 py-0.5 rounded font-mono text-[11px] border border-teal-300">IdDocumento</code> (UUID de la factura original), y devenga el IVA trasladado/acreditable y la base gravable <strong>en la fecha exacta del cobro/pago bancario</strong>, calculando la proporción exacta si hubo abonos parciales.
                    </p>
                  </div>
                </div>
              )}

              {/* TAB 4: BASE ISR Y RETENCIONES */}
              {infoTab === 'isr' && (
                <div className="flex flex-col gap-5 animate-in fade-in duration-150">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
                    <div>
                      <h4 className="text-base font-black text-slate-900">
                        Utilidad Fiscal Preliminar para ISR y Retenciones de Terceros
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Base acumulable y concentración analítica de retenciones para pagos provisionales.
                      </p>
                    </div>
                    <span className="text-[11px] font-mono font-bold text-teal-800 bg-teal-50 px-2.5 py-1 rounded-lg border border-teal-200">
                      Arts. 106, 111, 113-J LISR
                    </span>
                  </div>

                  {/* Fórmulas ISR según Régimen */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-2xl bg-slate-900 text-slate-100 border border-slate-800 shadow-sm font-mono">
                      <div className="text-[10px] text-teal-400 font-bold uppercase tracking-wider mb-1">612 · Act. Empresarial y Profesional:</div>
                      <div className="text-xs font-bold text-white tracking-wide overflow-x-auto py-1">
                        Utilidad = Ingresos Cobrados - Deducciones Pagadas
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1 font-mono">
                        Margen (%) = (Utilidad Fiscal / Ingresos) × 100
                      </div>
                    </div>

                    <div className="p-4 rounded-2xl bg-teal-950 text-slate-100 border border-teal-800 shadow-sm font-mono">
                      <div className="text-[10px] text-teal-300 font-bold uppercase tracking-wider mb-1">626 · RESICO Personas Físicas:</div>
                      <div className="text-xs font-bold text-teal-200 tracking-wide overflow-x-auto py-1">
                        ISR = Ingresos Cobrados × Tasa (1% a 2.5%) - Ret. 1.25%
                      </div>
                      <div className="text-[11px] text-teal-300/80 mt-1 font-mono">
                        Art. 113-E: Gastos no deducibles p/ ISR (sí acreditan IVA)
                      </div>
                    </div>

                    <div className="p-4 rounded-2xl bg-amber-950 text-slate-100 border border-amber-800 shadow-sm font-mono">
                      <div className="text-[10px] text-amber-300 font-bold uppercase tracking-wider mb-1">606 · Arrendamiento (Art. 115 LISR):</div>
                      <div className="text-xs font-bold text-amber-200 tracking-wide overflow-x-auto py-1">
                        Ciega: Utilidad = Ingresos - (35% Ciega + Predial)
                      </div>
                      <div className="text-[11px] text-amber-300/80 mt-1 font-mono">
                        Opción: Gastos Reales de mantenimiento con CFDI
                      </div>
                    </div>

                    <div className="p-4 rounded-2xl bg-indigo-950 text-slate-100 border border-indigo-800 shadow-sm font-mono">
                      <div className="text-[10px] text-indigo-300 font-bold uppercase tracking-wider mb-1">RESICO Personas Morales:</div>
                      <div className="text-xs font-bold text-indigo-200 tracking-wide overflow-x-auto py-1">
                        Utilidad = Ingresos Cobrados - Gastos e Inv. Pagados
                      </div>
                      <div className="text-[11px] text-indigo-300/80 mt-1 font-mono">
                        Título VII Cap. XII: Flujo de efectivo acumulado
                      </div>
                    </div>
                  </div>

                  {/* Concentrado de Retenciones */}
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/90 flex flex-col gap-3 text-xs text-slate-700">
                    <div className="font-bold text-slate-900 flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px] text-amber-700">account_tree</span>
                      Concentrado y Acreditamiento de Retenciones Sufridas:
                    </div>
                    <p className="text-slate-600 leading-relaxed">
                      El sistema audita de manera exhaustiva todos los nodos de retención y agrupa los importes acumulados por RFC de cada cliente o proveedor:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                      <div className="bg-white p-3 rounded-xl border border-slate-200 text-center">
                        <div className="text-[10px] font-bold text-slate-500 uppercase">RESICO PF</div>
                        <div className="text-base font-black text-slate-900 mt-0.5">1.25% ISR</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">Art. 113-J LISR</div>
                      </div>
                      <div className="bg-white p-3 rounded-xl border border-slate-200 text-center">
                        <div className="text-[10px] font-bold text-slate-500 uppercase">Honorarios Profesionales</div>
                        <div className="text-base font-black text-slate-900 mt-0.5">10.0% ISR</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">Art. 106 LISR</div>
                      </div>
                      <div className="bg-white p-3 rounded-xl border border-slate-200 text-center">
                        <div className="text-[10px] font-bold text-slate-500 uppercase">Retención Personas Morales</div>
                        <div className="text-base font-black text-slate-900 mt-0.5">2/3 o 100% IVA</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">Art. 1-A LIVA</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 5: AUDITORIA & EXCEL */}
              {infoTab === 'auditoria' && (
                <div className="flex flex-col gap-5 animate-in fade-in duration-150">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
                    <div>
                      <h4 className="text-base font-black text-slate-900">
                        Auditoría de Requisitos Fiscales y Papel de Trabajo Excel (.xlsx)
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Detección preventiva de riesgos de deducibilidad, EFOS del Art. 69-B del CFF y fórmulas contables nativas vivas.
                      </p>
                    </div>
                    <span className="text-[11px] font-mono font-bold text-teal-800 bg-teal-50 px-2.5 py-1 rounded-lg border border-teal-200">
                      Art. 27 LISR & Art. 69-B CFF
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 rounded-2xl bg-rose-100/60 border border-rose-300 flex flex-col gap-2">
                      <div className="flex items-center gap-2 text-rose-950 font-bold text-xs">
                        <span className="material-symbols-outlined text-[18px] text-rose-700">gavel</span>
                        <span>Lista Negra EFOS (Art. 69-B)</span>
                      </div>
                      <p className="text-xs text-rose-900 leading-relaxed">
                        Cruce automático contra el listado oficial del SAT de Empresas Facturadoras de Operaciones Simuladas. Si un proveedor es <strong>"Definitivo"</strong>, se excluye al 100% de deducciones e IVA.
                      </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-300 flex flex-col gap-2">
                      <div className="flex items-center gap-2 text-amber-950 font-bold text-xs">
                        <span className="material-symbols-outlined text-[18px] text-amber-700">local_gas_station</span>
                        <span>Combustible en Efectivo</span>
                      </div>
                      <p className="text-xs text-amber-900 leading-relaxed">
                        Claves del SAT iniciadas en <code className="font-mono bg-white px-1 rounded">151015</code> pagadas en efectivo (<code className="font-mono bg-white px-1 rounded">01</code>) son 100% no deducibles sin importar el monto.
                      </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-rose-50/60 border border-rose-200 flex flex-col gap-2">
                      <div className="flex items-center gap-2 text-rose-900 font-bold text-xs">
                        <span className="material-symbols-outlined text-[18px] text-rose-600">warning</span>
                        <span>Efectivo &gt; $2,000 MXN</span>
                      </div>
                      <p className="text-xs text-rose-950/80 leading-relaxed">
                        Conforme al <strong>Art. 27 Fracc. III LISR</strong>, compras o gastos generales pagados en efectivo que superen los $2,000.00 MXN se excluyen de la deducibilidad y del IVA acreditable.
                      </p>
                    </div>
                  </div>

                  {/* Fórmulas vivas de Excel */}
                  <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs flex flex-col gap-3 text-xs text-slate-700">
                    <div className="font-bold text-slate-900 flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px] text-emerald-700">table_view</span>
                      El Papel de Trabajo en Excel incluye 5 Cédulas con Fórmulas Vivas:
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-600">
                      <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                        <strong>Pestaña 1 (Resumen):</strong> Fórmulas dinámicas <code className="font-mono text-teal-800">=(C9+D9)-(F9+G9)-H9</code> y totales anuales automáticos con <code className="font-mono text-teal-800">=SUM(...)</code>.
                      </div>
                      <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                        <strong>Pestaña 2 (IVA):</strong> Cédula analítica completa desglosada a tasa 16%, 8%, 0% y exentas.
                      </div>
                      <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                        <strong>Pestaña 3 (Retenciones):</strong> Concentrado acumulado por RFC tercero para cotejo rápido.
                      </div>
                      <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                        <strong>Pestañas 4 y 5 (Auxiliares):</strong> Detalle comprobante por comprobante con UUID, método de pago y notas de auditoría.
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-500 italic mt-1">
                      Incluye dictamen fiscal con espacios para firma autógrafa y número de cédula del Contador Público Titular.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer del Modal */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="text-xs text-slate-500 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-teal-700">verified</span>
                <span>Motor contable verificado conforme al Código Fiscal de la Federación.</span>
              </div>
              <div className="flex items-center gap-2.5">
                <a
                  href="/api/documentacion-tecnica-pdf"
                  download="Documentacion_Tecnica_Extraccion_CFDI_SAT.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-50 hover:bg-teal-100/80 text-teal-800 border border-teal-200 text-xs font-bold transition-all shadow-3xs cursor-pointer active:scale-95"
                  title="Descargar documento PDF técnico para comprobación ante contadores y auditores"
                >
                  <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span>
                  <span>Descargar Dictamen PDF</span>
                </a>

                <button
                  type="button"
                  onClick={() => setShowInfoModal(false)}
                  className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black transition-all shadow-xs hover:shadow cursor-pointer active:scale-95"
                >
                  Entendido / Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: FICHA TÉCNICA Y AUDITORÍA DETALLADA DE UN GASTO INDIVIDUAL        */}
      {/* ========================================================================= */}
      {selectedGastoModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200"
          onClick={() => setSelectedGastoModal(null)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl border border-slate-200/90 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Ficha Técnica */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-teal-500/20 border border-teal-400/40 text-teal-300 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[22px]">receipt</span>
                </div>
                <div>
                  <span className="text-[10px] font-mono font-black uppercase tracking-widest text-teal-300">
                    FICHA TÉCNICA DE AUDITORÍA CFDI
                  </span>
                  <h3 className="text-base font-black text-white truncate max-w-md mt-0.5">
                    {selectedGastoModal.nombre}
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedGastoModal(null)}
                className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Contenido Ficha Técnica */}
            <div className="p-6 overflow-y-auto flex flex-col gap-5 text-slate-800 text-xs">
              {/* Datos Generales */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">RFC Emisor</span>
                  <span className="font-mono font-bold text-slate-900 text-xs mt-0.5 block">{selectedGastoModal.rfc}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Fecha Emisión</span>
                  <span className="font-bold text-slate-900 text-xs mt-0.5 block">{selectedGastoModal.fecha}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Método Pago</span>
                  <span className="font-bold text-slate-900 text-xs mt-0.5 block">{selectedGastoModal.metodo_pago}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Forma Pago</span>
                  <span className="font-bold text-slate-900 text-xs mt-0.5 block">
                    {selectedGastoModal.forma_pago_nombre || getFormaPagoLabel(selectedGastoModal.forma_pago, selectedGastoModal.metodo_pago)}
                  </span>
                </div>
              </div>

              {/* UUID */}
              <div className="p-3 bg-slate-100 rounded-xl font-mono text-[11px] flex items-center justify-between text-slate-700">
                <span className="text-slate-500 text-[10px] uppercase font-bold">UUID:</span>
                <span className="select-all font-bold">{selectedGastoModal.uuid}</span>
              </div>

              {/* Importes */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 text-right">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Subtotal</span>
                  <span className="text-base font-black text-slate-900 font-mono mt-0.5 block">{formatMoney(selectedGastoModal.subtotal)}</span>
                  {selectedGastoModal.categoria === 'rep' && (
                    <span className="text-[9px] text-teal-700 font-medium font-sans block mt-0.5">Sin impacto en gasto</span>
                  )}
                </div>
                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 text-right">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">IVA Trasladado</span>
                  <span className={`text-base font-black font-mono mt-0.5 block ${selectedGastoModal.iva_16 > 0 ? 'text-teal-800' : 'text-slate-400'}`}>
                    {formatMoney(selectedGastoModal.iva_16 + selectedGastoModal.iva_8)}
                  </span>
                  {selectedGastoModal.categoria === 'rep' && (
                    <span className="text-[9px] text-teal-700 font-medium font-sans block mt-0.5">Acreditado con PPD</span>
                  )}
                </div>
                <div className="bg-slate-900 text-white p-3.5 rounded-2xl text-right">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Total Factura</span>
                  <span className="text-base font-black font-mono mt-0.5 block">{formatMoney(selectedGastoModal.total)}</span>
                  {selectedGastoModal.categoria === 'rep' && (
                    <span className="text-[9px] text-teal-300 font-medium font-sans block mt-0.5">Control REP (No duplica)</span>
                  )}
                </div>
              </div>

              {/* Decisión de Auditoría Tomada por el Motor */}
              <div className={`p-4 rounded-2xl border flex flex-col gap-2.5 ${
                selectedGastoModal.categoria === 'efos' ? 'bg-rose-100/90 border-rose-400 text-rose-950' :
                selectedGastoModal.categoria === 'gasolina_efectivo' ? 'bg-amber-100/90 border-amber-300 text-amber-950' :
                selectedGastoModal.categoria === 'efectivo_2k' ? 'bg-rose-50/90 border-rose-300 text-rose-950' :
                selectedGastoModal.categoria === 'condicionado_bancarizacion' ? 'bg-amber-50/90 border-amber-300 text-amber-950' :
                selectedGastoModal.categoria === 'egreso' ? 'bg-indigo-50/90 border-indigo-300 text-indigo-950' :
                selectedGastoModal.categoria === 'riesgo' ? 'bg-rose-50/60 border-rose-200 text-rose-950' :
                selectedGastoModal.categoria === 'nomina' ? 'bg-purple-50/60 border-purple-200 text-purple-950' :
                selectedGastoModal.categoria === 'exento' ? 'bg-blue-50/60 border-blue-200 text-blue-950' :
                selectedGastoModal.categoria === 'rep' ? 'bg-teal-50/60 border-teal-200 text-teal-950' :
                'bg-emerald-50/60 border-emerald-200 text-emerald-950'
              }`}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider font-mono">
                    DICTAMEN DEL MOTOR CONTABLE
                  </span>
                  <span className="font-bold text-xs">{selectedGastoModal.fundamento}</span>
                </div>
                <div className="text-sm font-black flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[18px]">
                    {selectedGastoModal.categoria === 'efos' ? 'gavel' :
                     selectedGastoModal.categoria === 'gasolina_efectivo' ? 'local_gas_station' :
                     selectedGastoModal.categoria === 'efectivo_2k' || selectedGastoModal.categoria === 'riesgo' ? 'warning' :
                     selectedGastoModal.categoria === 'condicionado_bancarizacion' ? 'account_balance' :
                     selectedGastoModal.categoria === 'egreso' ? 'assignment_return' :
                     selectedGastoModal.categoria === 'nomina' ? 'badge' :
                     selectedGastoModal.categoria === 'exento' ? 'school' :
                     selectedGastoModal.categoria === 'rep' ? 'sync_alt' : 'verified'}
                  </span>
                  <span>{selectedGastoModal.decision}</span>
                </div>
                <p className="text-xs leading-relaxed opacity-90">
                  {selectedGastoModal.explicacion}
                </p>
              </div>
            </div>

            {/* Footer Ficha */}
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200/80 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setSelectedGastoModal(null)}
                className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all cursor-pointer"
              >
                Cerrar Ficha
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
