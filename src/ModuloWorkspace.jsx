import React, { useState, useEffect } from 'react';
import AnalisisFiscalDashboard from './AnalisisFiscalDashboard';
import RastreadorEfosDashboard from './RastreadorEfosDashboard';
import PrecalculoDiotDashboard from './PrecalculoDiotDashboard';
import ValidadorCancelacionesDashboard from './ValidadorCancelacionesDashboard';
import ControlPagosDashboard from './ControlPagosDashboard';
import ResumenNominasDashboard from './ResumenNominasDashboard';
import ConfrontaSatDashboard from './ConfrontaSatDashboard';
import ConciliacionBancariaDashboard from './ConciliacionBancariaDashboard';
import PolizasContablesDashboard from './PolizasContablesDashboard';
import {
  ALL_REGIMENES,
  GROUPED_REGIMENES,
  getRegimenInfo,
  getDefaultRegimeForRfc,
} from './satRegimenes';


const MODULE_DETAILS = {
  documentos_frecuentes: {
    category: '1. Extracción SAT',
    badge: 'Descargas Automáticas',
    title: 'Documentos Frecuentes del SAT',
    subtitle: 'Generación y obtención automatizada en tiempo real de la Opinión de Cumplimiento de Obligaciones Fiscales (Art. 32-D CFF) y la Constancia de Situación Fiscal (CSF) con validez oficial ante el SAT.',
    icon: 'description',
    accent: 'indigo',
    benefit: 'Ahorra tiempo evitando ingresar manualmente con captcha al portal del SAT cada vez que un proveedor o banco solicita la CSF o 32-D del mes.',
    actions: [
      {
        id: 'csf',
        title: 'Constancia de Situación Fiscal (CSF)',
        desc: 'Genera y descarga el PDF oficial con sellos digitales y cadena original del SAT.',
        icon: 'badge',
        statusText: 'Listo para consultar',
      },
      {
        id: '32d',
        title: 'Opinión de Cumplimiento (32-D)',
        desc: 'Consulta el estatus de obligaciones fiscales (Positiva / Negativa) emitida al día de hoy.',
        icon: 'verified',
        statusText: 'Listo para consultar',
      },
    ],
  },
  analisis_iva_isr: {
    category: '2. Papeles de Trabajo',
    badge: 'Papel de Trabajo Maestro',
    title: 'Análisis Integral de IVA e ISR',
    subtitle: 'Auditoría fiscal automatizada, determinación de pagos provisionales, cruce de IVA por flujo de efectivo, concentrado de retenciones y gráficos interactivos en Excel.',
    icon: 'calculate',
    accent: 'teal',
    benefit: 'Ajusta la Zona Fiscal, Ejercicio y Periodo en la barra de control. Al presionar "Iniciar Auditoría", se desplegará en pantalla el reporte ejecutivo con gráficos interactivos, determinación mensual y cédula de dictamen contable, con la opción de descargar el libro maestro en Excel.',
    actions: [
      {
        id: 'analisis_maestro',
        title: 'Papel de Trabajo Maestro de IVA e ISR',
        desc: 'Libro corporativo en Excel con fórmulas vivas, gráficos de auditoría nativos, cédula de dictamen contable y cuadro de firmas para el contador.',
        icon: 'table_chart',
        format: 'Excel Maestro (.xlsx) + Gráficos',
        statusText: 'Listo para Iniciar Auditoría',
      },
    ],
  },
  control_pagos: {
    category: '2. Papeles de Trabajo',
    badge: 'Reportes Contables',
    title: 'Control de Pagos (PUE vs PPD)',
    subtitle: 'Separación rigurosa de facturas de contado vs. crédito y auditoría de Complementos de Pago (REP).',
    icon: 'account_balance_wallet',
    accent: 'teal',
    benefit: 'Detecta facturas PPD que no cuentan con su Recibo Electrónico de Pago (REP), protegiendo el derecho al acreditamiento del IVA ante revisiones del SAT.',
    actions: [
      {
        id: 'conciliacion_pue_ppd',
        title: 'Matriz PUE vs PPD',
        desc: 'Clasificación de todas las facturas del periodo por método y forma de pago.',
        icon: 'swap_horiz',
        format: 'Excel (.xlsx)',
        statusText: 'Auditoría mensual',
      },
      {
        id: 'alertas_rep',
        title: 'Auditoría de Complementos REP Faltantes',
        desc: 'Identificación de facturas PPD que superan la fecha límite sin REP emitido por el proveedor.',
        icon: 'notification_important',
        format: 'Excel (.xlsx)',
        statusText: 'Protección de IVA',
      },
    ],
  },
  resumen_nominas: {
    category: '2. Papeles de Trabajo',
    badge: 'Reportes Contables',
    title: 'Resumen de Nóminas para Declarar',
    subtitle: 'Acumulado mensual automático por trabajador listo para captura directa en el portal de declaraciones del SAT.',
    icon: 'summarize',
    accent: 'teal',
    benefit: 'Elimina la captura manual calculando exactamente las tres cifras maestras del mes: Ingresos Gravados, Ingresos Exentos e ISR Retenido por Salarios.',
    actions: [
      {
        id: 'resumen_sat',
        title: 'Hoja de Trabajo de Retenciones por Salarios',
        desc: 'Suma de percepciones gravadas, exentas e impuestos retenidos con desglose por RFC de trabajador.',
        icon: 'group',
        format: 'Excel (.xlsx)',
        statusText: 'Listo para captura SAT',
      },
    ],
  },
  precalculo_diot: {
    category: '2. Papeles de Trabajo',
    badge: 'Reportes Contables',
    title: 'Pre-cálculo DIOT (Art. 32 Fracc. VIII LIVA)',
    subtitle: 'Auditoría de compras y gastos efectivamente pagados agrupados por proveedor para la Declaración Informativa de Operaciones con Terceros.',
    icon: 'table_view',
    accent: 'teal',
    benefit: 'Flujo de efectivo estricto: asignación de facturas PUE y complementos de pago (REP) con discriminación de actos al 16%, 8% (Frontera), 0%, Exentos y Retenciones. Genera el paquete oficial con archivo batch para el nuevo portal del SAT (54 campos), formato DEM tradicional (24 campos) y libro de Excel con Cédula de Confronta.',
    actions: [
      {
        id: 'diot_resumen',
        title: 'Paquete Completo DIOT (Excel + TXTs)',
        desc: 'Genera el papel de trabajo en Excel y los archivos .txt de carga masiva para el SAT (54 campos Web y 24 campos DEM).',
        icon: 'receipt_long',
        format: 'ZIP (Excel + TXTs)',
        statusText: 'Estructura SAT',
      },
    ],
  },
  validador_cancelaciones: {
    category: '3. Auditoría y Riesgo',
    badge: 'Auditoría Fiscal',
    title: 'Validador de Cancelaciones SAT',
    subtitle: 'Consulta directa contra el Web Service del SAT para verificar si proveedores cancelaron facturas silenciosamente.',
    icon: 'fact_check',
    accent: 'amber',
    benefit: 'Evita multas y discrepancias fiscales detectando facturas que fueron canceladas después de que realizaste el pago y dedujiste el gasto.',
    actions: [
      {
        id: 'auditoria_canceladas_excel',
        title: 'Dictamen de Auditoría de Cancelaciones (.xlsx)',
        desc: 'Libro Excel con matriz de riesgo, cédula de cancelaciones silenciosas, detalle en Buzón Tributario y dictamen formal.',
        icon: 'fact_check',
        format: 'Libro Excel (.xlsx)',
        statusText: 'Web Service Oficial SAT',
      },
    ],
  },
  listas_negras_efos: {
    category: '3. Auditoría y Riesgo',
    badge: 'Auditoría Fiscal',
    title: 'Rastreador de Listas Negras (EFOS - Art. 69-B)',
    subtitle: 'Cruce automático de los RFCs de proveedores contra la lista negra oficial de Empresas Facturadoras de Operaciones Simuladas.',
    icon: 'warning_amber',
    accent: 'amber',
    benefit: 'Blindaje penal y fiscal: te alerta al instante si estás recibiendo comprobantes de algún contribuyente boletinado como presunto o definitivo en el DOF.',
    actions: [
      {
        id: 'cruce_69b',
        title: 'Cruce contra Listado 69-B del DOF',
        desc: 'Contrasta todos los proveedores del ejercicio contra la base oficial del SAT y genera dictamen contable en Excel.',
        icon: 'policy',
        format: 'Libro Excel + Dictamen',
        statusText: 'Base Oficial SAT / DOF',
      },
    ],
  },
  confronta_sat: {
    category: '3. Auditoría y Riesgo',
    badge: 'Auditoría Preventiva',
    title: 'Confronta Visor del SAT vs. CFDI',
    subtitle: 'Cruce preventivo de ingresos facturados y retenciones contra la base oficial y Metadata del SAT para evitar Cartas Invitación.',
    icon: 'balance',
    accent: 'amber',
    benefit: 'Detecta en segundos si existen diferencias de ingresos o IVA entre lo que el contribuyente declaró y lo que el SAT tiene precargado en sus sistemas.',
    actions: [
      {
        id: 'confronta_sat_excel',
        title: 'Cédula de Confronta Visor SAT (.xlsx)',
        desc: 'Matriz comparativa de 12 meses con semáforo de riesgo y detalle de inconsistencias PAC.',
        icon: 'balance',
        format: 'Excel (.xlsx)',
        statusText: 'Amarre SAT Oficial',
      },
    ],
  },
  conciliacion_bancaria: {
    category: '2. Papeles de Trabajo',
    badge: 'Flujo de Efectivo',
    title: 'Conciliación Bancaria vs. CFDI',
    subtitle: 'Cotejo de depósitos y retiros bancarios contra facturas PUE y complementos REP para blindar contra la presunción de ingresos (Art. 59 Fracc. III CFF).',
    icon: 'account_balance',
    accent: 'teal',
    benefit: 'Identifica al instante depósitos sin facturar que el SAT presume como ingresos gravables y salidas bancarias sin comprobante fiscal deducible.',
    actions: [
      {
        id: 'conciliacion_bancaria_excel',
        title: 'Cédula Oficial de Conciliación Bancaria (.xlsx)',
        desc: 'Libro de trabajo con conciliación aritmética de saldos bancarios vs fiscales y cuadro de firmas.',
        icon: 'account_balance',
        format: 'Excel (.xlsx)',
        statusText: 'Art. 59 Fracc. III CFF',
      },
    ],
  },
  polizas_contables: {
    category: '2. Papeles de Trabajo',
    badge: 'Contabilidad Electrónica',
    title: 'Generador de Pólizas Contables (Anexo 24 RMF)',
    subtitle: 'Generación automática de asientos de ingresos, egresos y nóminas con folio fiscal UUID incorporado para Contpaqi y Aspel COI.',
    icon: 'menu_book',
    accent: 'teal',
    benefit: 'Elimina semanas de captura manual asociando automáticamente el UUID de 36 caracteres y RFC a cada cuenta de cargo y abono.',
    actions: [
      {
        id: 'polizas_excel',
        title: 'Libro Diario de Pólizas con UUID (.xlsx)',
        desc: 'Asientos contables estructurados con catálogo oficial del Anexo 24 de la RMF.',
        icon: 'menu_book',
        format: 'Excel / TXT / CSV',
        statusText: 'Regla 2.8.1.5 RMF',
      },
    ],
  },
};

const SAT_YEAR_LIST = ['2026', '2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018'];

const ZONE_OPTIONS = [
  { value: 'general', label: 'Zona General (16% CDMX / Edoméx / Resto País)' },
  { value: 'fronteriza_norte', label: 'Región Fronteriza Norte (Estímulo 8% / 16%)' },
  { value: 'fronteriza_sur', label: 'Región Fronteriza Sur (Estímulo 8% / 16%)' },
];

const MONTH_OPTIONS = [
  { value: '0', label: 'Todo el Año (Consolidado)' },
  { value: '1', label: 'Enero' },
  { value: '2', label: 'Febrero' },
  { value: '3', label: 'Marzo' },
  { value: '4', label: 'Abril' },
  { value: '5', label: 'Mayo' },
  { value: '6', label: 'Junio' },
  { value: '7', label: 'Julio' },
  { value: '8', label: 'Agosto' },
  { value: '9', label: 'Septiembre' },
  { value: '10', label: 'Octubre' },
  { value: '11', label: 'Noviembre' },
  { value: '12', label: 'Diciembre' },
];

const REGIME_OPTIONS = ALL_REGIMENES;

const EMPTY_ZERO_METRICS = {
  has_real_data: false,
  ingresos: 0,
  gastos: 0,
  iva_trasladado: 0,
  iva_acreditable: 0,
  saldo_iva: 0,
  utilidad_isr: 0,
  retencion_iva: 0,
  retencion_isr: 0,
  mensual: Array.from({ length: 12 }, (_, i) => ({
    mes: i + 1,
    nombre: ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][i + 1],
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
  })),
  retenciones: [],
};

export default function ModuloWorkspace({ section, client, onBackToHub, onOpenFacturas }) {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = useState('0'); // 0 = Todo el año (Consolidado)
  const [selectedZone, setSelectedZone] = useState('general');
  const [selectedRegime, setSelectedRegime] = useState(() => {
    return getDefaultRegimeForRfc(client?.rfc);
  });
  const [arrendamientoOpcion, setArrendamientoOpcion] = useState('ciega'); // 'ciega' | 'real'
  const [regimeSearch, setRegimeSearch] = useState('');

  useEffect(() => {
    if (client?.rfc) {
      setSelectedRegime(getDefaultRegimeForRfc(client.rfc));
    }
  }, [client?.rfc]);

  const [openDropdown, setOpenDropdown] = useState(null); // 'year' | 'zone' | 'month' | 'regime' | null
  const [downloadsDir, setDownloadsDir] = useState('');
  const [downloadingId, setDownloadingId] = useState(null);
  const [downloadSuccess, setDownloadSuccess] = useState(null);
  const [downloadError, setDownloadError] = useState(null);
  const [downloadElapsed, setDownloadElapsed] = useState(0);
  const [isDownloadCompleted, setIsDownloadCompleted] = useState(false);
  const [isUploadingXml, setIsUploadingXml] = useState(false);
  const [inputMethod, setInputMethod] = useState('sat'); // 'sat' | 'xml'
  const [analysisData, setAnalysisData] = useState(EMPTY_ZERO_METRICS);
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(false);
  const [efosData, setEfosData] = useState(null);
  const [isLoadingEfos, setIsLoadingEfos] = useState(false);
  const [diotData, setDiotData] = useState(null);
  const [isLoadingDiot, setIsLoadingDiot] = useState(false);
  const [cancelacionesData, setCancelacionesData] = useState(null);
  const [isLoadingCancelaciones, setIsLoadingCancelaciones] = useState(false);
  const [isLiveCheckingCancelaciones, setIsLiveCheckingCancelaciones] = useState(false);
  const [controlPagosData, setControlPagosData] = useState(null);
  const [isLoadingControlPagos, setIsLoadingControlPagos] = useState(false);
  const [nominasData, setNominasData] = useState(null);
  const [isLoadingNominas, setIsLoadingNominas] = useState(false);
  const [confrontaData, setConfrontaData] = useState(null);
  const [isLoadingConfronta, setIsLoadingConfronta] = useState(false);
  const [conciliacionData, setConciliacionData] = useState(null);
  const [isLoadingConciliacion, setIsLoadingConciliacion] = useState(false);
  const [isUploadingBank, setIsUploadingBank] = useState(false);
  const [polizasData, setPolizasData] = useState(null);
  const [isLoadingPolizas, setIsLoadingPolizas] = useState(false);
  const fileInputRef = React.useRef(null);

  // Estados para Sincronización Automática Oficial con el SAT
  const [syncState, setSyncState] = useState({
    status: 'idle',
    progress: 0,
    logs: [],
    error: null,
  });
  const [storedSyncMeta, setStoredSyncMeta] = useState(null);
  const [isSyncSuccess, setIsSyncSuccess] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncEventSourceRef = React.useRef(null);

  // Cancelar sincronización activa en el servidor y limpiar SSE
  const handleCancelSync = async () => {
    if (!client?.id) return;
    try {
      const token = localStorage.getItem('firmavault_token');
      await fetch(`/api/clients/${client.id}/analisis-iva-isr/sync-cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      console.warn('Error al cancelar sincronización:', err);
    }
    setIsSyncing(false);
    setSyncState((prev) => ({
      ...prev,
      status: 'idle',
      progress: 0,
      logs: [...prev.logs, '🛑 Sincronización cancelada por el usuario.'],
      error: null,
    }));
    if (syncEventSourceRef.current) {
      syncEventSourceRef.current.close();
    }
  };

  // Limpiar SSE y cancelar sincronización si estaba activa al salir / desmontar (ej. al hacer clic en "Volver")
  useEffect(() => {
    return () => {
      if (syncEventSourceRef.current) {
        syncEventSourceRef.current.close();
      }
      try {
        const token = localStorage.getItem('firmavault_token');
        if (token && client?.id) {
          fetch(`/api/clients/${client.id}/analisis-iva-isr/sync-cancel`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            keepalive: true,
          }).catch(() => {});
        }
      } catch (e) {}
    };
  }, [client?.id]);

  // Obtener vista previa y métricas fiscales en vivo para visualización en pantalla
  const fetchAnalysisPreview = async (overrideRegime, overrideArrendamiento) => {
    if (section !== 'analisis_iva_isr' || !client?.id) return;
    setIsLoadingAnalysis(true);
    const activeRegime = overrideRegime || selectedRegime;
    const activeArrendamiento = overrideArrendamiento || arrendamientoOpcion;
    try {
      const token = localStorage.getItem('firmavault_token');
      const res = await fetch(`/api/clients/${client.id}/analisis-iva-isr/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          year: selectedYear,
          month: selectedMonth,
          zone: selectedZone,
          regime: activeRegime,
          arrendamientoOpcion: activeArrendamiento,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.metrics) {
          setAnalysisData(data.metrics);
          if (data.metrics.has_real_data) {
            setIsSyncSuccess(true);
          }
        }
      } else {
        const errJson = await res.json().catch(() => ({}));
        console.error('Error al cargar vista previa contable:', errJson.error || res.statusText);
      }
    } catch (err) {
      console.warn('Error al cargar vista previa contable:', err);
    } finally {
      setIsLoadingAnalysis(false);
    }
  };

  useEffect(() => {
    if (section === 'analisis_iva_isr' && client?.id) {
      fetchAnalysisPreview();
    }
  }, [section, client?.id, selectedYear, selectedMonth, selectedZone, selectedRegime, arrendamientoOpcion]);

  // Cambio de Régimen Fiscal dinámico (recalcula en vivo si ya se realizó la auditoría)
  const handleRegimeChange = (newRegime) => {
    setSelectedRegime(newRegime);
    setOpenDropdown(null);
    if (analysisData?.has_real_data) {
      fetchAnalysisPreview(newRegime, arrendamientoOpcion);
    }
  };

  // Alternar Deducción Ciega (35%) vs Gastos Reales en Arrendamiento (606)
  const handleArrendamientoChange = (newOpcion) => {
    setArrendamientoOpcion(newOpcion);
    if (analysisData?.has_real_data) {
      fetchAnalysisPreview(selectedRegime, newOpcion);
    }
  };

  // Cargar vista previa del Rastreador EFOS (Art. 69-B)
  const fetchEfosPreview = async () => {
    if (section !== 'listas_negras_efos' || !client?.id) return;
    setIsLoadingEfos(true);
    try {
      const token = localStorage.getItem('firmavault_token');
      const res = await fetch(`/api/clients/${client.id}/cruce-69b/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          year: selectedYear,
          month: selectedMonth,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          setEfosData(json.data);
        }
      }
    } catch (err) {
      console.warn('Error al cargar vista previa EFOS:', err);
    } finally {
      setIsLoadingEfos(false);
    }
  };

  useEffect(() => {
    if (section === 'listas_negras_efos' && client?.id) {
      fetchEfosPreview();
    }
  }, [section, client?.id, selectedYear, selectedMonth]);

  // Cargar vista previa del Pre-cálculo DIOT (Art. 32 Fracc. VIII LIVA)
  const fetchDiotPreview = async () => {
    if (section !== 'precalculo_diot' || !client?.id) return;
    setIsLoadingDiot(true);
    try {
      const token = localStorage.getItem('firmavault_token');
      const res = await fetch(`/api/clients/${client.id}/diot/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          year: selectedYear,
          month: selectedMonth,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          setDiotData(json.data);
        }
      }
    } catch (err) {
      console.warn('Error al cargar vista previa DIOT:', err);
    } finally {
      setIsLoadingDiot(false);
    }
  };

  useEffect(() => {
    if (section === 'precalculo_diot' && client?.id) {
      fetchDiotPreview();
    }
  }, [section, client?.id, selectedYear, selectedMonth]);

  // Cargar auditoría del Validador de Cancelaciones SAT (Art. 29-A CFF)
  const fetchCancelacionesPreview = async (liveCheck = false) => {
    if (section !== 'validador_cancelaciones' || !client?.id) return;
    if (liveCheck) {
      setIsLiveCheckingCancelaciones(true);
    } else {
      setIsLoadingCancelaciones(true);
    }
    try {
      const token = localStorage.getItem('firmavault_token');
      const res = await fetch(`/api/clients/${client.id}/cancelaciones/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          year: selectedYear,
          month: selectedMonth,
          scope: 'all',
          liveCheck: Boolean(liveCheck),
          maxLive: 150,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          setCancelacionesData(json.data);
        }
      }
    } catch (err) {
      console.warn('Error al cargar auditoría de cancelaciones:', err);
    } finally {
      setIsLoadingCancelaciones(false);
      setIsLiveCheckingCancelaciones(false);
    }
  };

  useEffect(() => {
    if (section === 'validador_cancelaciones' && client?.id) {
      fetchCancelacionesPreview(false);
    }
  }, [section, client?.id, selectedYear, selectedMonth]);

  // Cargar vista previa de Control de Pagos (PUE vs PPD)
  const fetchControlPagosPreview = async () => {
    if (section !== 'control_pagos' || !client?.id) return;
    setIsLoadingControlPagos(true);
    try {
      const token = localStorage.getItem('firmavault_token');
      const res = await fetch(`/api/clients/${client.id}/control-pagos/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          year: selectedYear,
          month: selectedMonth,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        setControlPagosData(json.data || json);
      }
    } catch (err) {
      console.warn('Error al cargar vista previa de Control de Pagos:', err);
    } finally {
      setIsLoadingControlPagos(false);
    }
  };

  useEffect(() => {
    if (section === 'control_pagos' && client?.id) {
      fetchControlPagosPreview();
    }
  }, [section, client?.id, selectedYear, selectedMonth]);

  // Cargar vista previa de Resumen de Nóminas para Declarar
  const fetchNominasPreview = async () => {
    if (section !== 'resumen_nominas' || !client?.id) return;
    setIsLoadingNominas(true);
    try {
      const token = localStorage.getItem('firmavault_token');
      const res = await fetch(`/api/clients/${client.id}/resumen-nominas/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          year: selectedYear,
          month: selectedMonth,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        setNominasData(json.data || json);
      }
    } catch (err) {
      console.warn('Error al cargar vista previa de Resumen de Nóminas:', err);
    } finally {
      setIsLoadingNominas(false);
    }
  };

  useEffect(() => {
    if (section === 'resumen_nominas' && client?.id) {
      fetchNominasPreview();
    }
  }, [section, client?.id, selectedYear, selectedMonth]);

  // Cargar vista previa de Confronta Visor SAT
  const fetchConfrontaPreview = async () => {
    if (section !== 'confronta_sat' || !client?.id) return;
    setIsLoadingConfronta(true);
    try {
      const token = localStorage.getItem('firmavault_token');
      const res = await fetch(`/api/clients/${client.id}/confronta-sat/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ year: selectedYear }),
      });
      if (res.ok) {
        const json = await res.json();
        setConfrontaData(json.data || json);
      }
    } catch (err) {
      console.warn('Error al cargar vista previa de Confronta SAT:', err);
    } finally {
      setIsLoadingConfronta(false);
    }
  };

  useEffect(() => {
    if (section === 'confronta_sat' && client?.id) {
      fetchConfrontaPreview();
    }
  }, [section, client?.id, selectedYear]);

  // Cargar vista previa de Conciliación Bancaria
  const fetchConciliacionPreview = async () => {
    if (section !== 'conciliacion_bancaria' || !client?.id) return;
    setIsLoadingConciliacion(true);
    try {
      const token = localStorage.getItem('firmavault_token');
      const res = await fetch(`/api/clients/${client.id}/conciliacion-bancaria/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ year: selectedYear }),
      });
      if (res.ok) {
        const json = await res.json();
        setConciliacionData(json.data || json);
      }
    } catch (err) {
      console.warn('Error al cargar vista previa de Conciliación Bancaria:', err);
    } finally {
      setIsLoadingConciliacion(false);
    }
  };

  useEffect(() => {
    if (section === 'conciliacion_bancaria' && client?.id) {
      fetchConciliacionPreview();
    }
  }, [section, client?.id, selectedYear]);

  const handleUploadBankFile = async (file) => {
    if (!file || !client?.id) return;
    setIsUploadingBank(true);
    try {
      const token = localStorage.getItem('firmavault_token');
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/clients/${client.id}/conciliacion-bancaria/upload-estado-cuenta`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (res.ok) {
        fetchConciliacionPreview();
      }
    } catch (err) {
      console.warn('Error al subir estado de cuenta:', err);
    } finally {
      setIsUploadingBank(false);
    }
  };

  // Cargar vista previa de Pólizas Contables Anexo 24
  const fetchPolizasPreview = async () => {
    if (section !== 'polizas_contables' || !client?.id) return;
    setIsLoadingPolizas(true);
    try {
      const token = localStorage.getItem('firmavault_token');
      const res = await fetch(`/api/clients/${client.id}/polizas/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ year: selectedYear, month: selectedMonth }),
      });
      if (res.ok) {
        const json = await res.json();
        setPolizasData(json.data || json);
      }
    } catch (err) {
      console.warn('Error al cargar vista previa de Pólizas:', err);
    } finally {
      setIsLoadingPolizas(false);
    }
  };

  useEffect(() => {
    if (section === 'polizas_contables' && client?.id) {
      fetchPolizasPreview();
    }
  }, [section, client?.id, selectedYear, selectedMonth]);

  // Verificar estatus de jobs activos al entrar (manteniendo estado NO sincronizado por defecto)
  const checkSyncStatus = async () => {
    if (section !== 'analisis_iva_isr' || !client?.id) return;
    try {
      const token = localStorage.getItem('firmavault_token');
      const res = await fetch(`/api/clients/${client.id}/analisis-iva-isr/sync-status?year=${selectedYear}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        // Al entrar siempre inicia en estado NO sincronizado y con tablero limpio
        setStoredSyncMeta(null);
        setIsSyncSuccess(false);
        setAnalysisData(EMPTY_ZERO_METRICS);

        if (data.job) {
          if (data.job.status === 'running') {
            setSyncState((prev) => ({
              ...prev,
              status: 'running',
              progress: data.job.progress || 0,
              logs: data.job.logs || [],
              error: null,
            }));
            setIsSyncing(true);
            connectSyncEvents();
          } else {
            setSyncState((prev) => ({
              ...prev,
              status: 'idle',
              progress: 0,
              error: null,
            }));
            setIsSyncing(false);
          }
        }
      }
    } catch (e) {
      console.warn('Error al verificar estatus de sincronización:', e);
    }
  };

  // Conexión Server-Sent Events en tiempo real
  const connectSyncEvents = () => {
    if (syncEventSourceRef.current) {
      syncEventSourceRef.current.close();
    }
    const token = localStorage.getItem('firmavault_token');
    const sse = new EventSource(`/api/clients/${client?.id}/analisis-iva-isr/sync-events?token=${encodeURIComponent(token)}`);
    syncEventSourceRef.current = sse;

    sse.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.status) {
          const isNotRunning = data.status === 'idle' || data.status === 'completed' || data.status === 'failed' || data.status === 'stopped';
          setSyncState((prev) => ({
            ...prev,
            status: data.status,
            progress: isNotRunning ? (data.status === 'completed' ? 100 : 0) : (typeof data.progress === 'number' ? Math.max(prev.progress || 0, data.progress) : prev.progress),
            logs: data.logs ?? prev.logs,
            error: data.error ?? null,
          }));

          if (data.status === 'running') {
            setIsSyncing(true);
          } else if (data.status === 'completed') {
            setIsSyncing(false);
            setIsSyncSuccess(true);
            if (data.payload) {
              setStoredSyncMeta(data.payload);
            }
            sse.close();
          } else if (isNotRunning) {
            setIsSyncing(false);
            sse.close();
          }
        }
      } catch (err) {
        console.error('Error parseando SSE sync:', err);
      }
    };

    sse.onerror = () => {
      sse.close();
    };
  };

  // Iniciar sincronización oficial con e.firma
  const handleStartSatSync = async () => {
    if (!client?.id) return;
    if (!client?.hasCredentials) {
      setDownloadError('El contribuyente no tiene la e.firma registrada (.cer, .key y contraseña).');
      return;
    }
    setDownloadError(null);
    setIsSyncSuccess(false);
    setIsSyncing(true);
    setSyncState({
      status: 'running',
      progress: 5,
      logs: [],
      error: null,
    });

    try {
      const token = localStorage.getItem('firmavault_token');
      connectSyncEvents();

      const res = await fetch(`/api/clients/${client.id}/analisis-iva-isr/sync-sat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          year: selectedYear,
          month: selectedMonth === '0' ? 'all' : selectedMonth,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(
          errJson.error ||
          (res.status === 502 || res.status === 504 || res.status === 500
            ? 'El servidor backend (puerto 3001) no responde. Verifica que esté activo con "iniciar_servidor.bat" o "npm run dev:server".'
            : `Error al conectar con el servidor (HTTP ${res.status}).`)
        );
      }
    } catch (err) {
      setIsSyncing(false);
      setSyncState((prev) => ({
        ...prev,
        status: 'failed',
        error: err.message,
        logs: [...prev.logs, `❌ ${err.message}`],
      }));
    }
  };

  // Al entrar al módulo o cambiar parámetros, mantener limpio para que el usuario configure libremente
  useEffect(() => {
    if (section === 'analisis_iva_isr') {
      setDownloadSuccess(null);
      setIsSyncSuccess(false);
      setAnalysisData(EMPTY_ZERO_METRICS);
      setIsSyncing(false);
      setSyncState({ status: 'idle', progress: 0, logs: [], error: null });
      checkSyncStatus();
    }
  }, [section, client?.id, selectedYear, selectedMonth, selectedZone]);

  const handleResetToNewQuery = () => {
    setDownloadSuccess(null);
    setIsSyncSuccess(false);
    setStoredSyncMeta(null);
    setAnalysisData(EMPTY_ZERO_METRICS);
    setIsSyncing(false);
    setSyncState({ status: 'idle', progress: 0, logs: [], error: null });
    setDownloadError(null);
  };

  // Cerrar listas desplegables al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('[data-dropdown-container]')) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);


  const handleUploadXmlFiles = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploadingXml(true);
    setDownloadError(null);
    setDownloadSuccess(null);

    try {
      const token = localStorage.getItem('firmavault_token');
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
      }

      let uploadEndpoint = `/api/clients/${client?.id}/analisis-iva-isr/upload-xml`;
      if (section === 'resumen_nominas') {
        uploadEndpoint = `/api/clients/${client?.id}/resumen-nominas/upload-xml`;
      }

      const res = await fetch(uploadEndpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Error al subir los archivos XML/ZIP.');
      }

      const data = await res.json();
      setDownloadSuccess({
        title: 'Carga de Comprobantes XML',
        filename: `${data.count} paquete(s) XML / ZIP cargado(s)`,
        savedPath: `Almacenados para el RFC ${client?.rfc}`,
      });
      setIsSyncSuccess(true);
      // Recalcular análisis en vivo con los nuevos comprobantes
      if (section === 'analisis_iva_isr') fetchAnalysisPreview();
      if (section === 'precalculo_diot') fetchDiotPreview();
      if (section === 'listas_negras_efos') fetchEfosPreview();
      if (section === 'validador_cancelaciones') fetchCancelacionesPreview(false);
      if (section === 'control_pagos') fetchControlPagosPreview();
      if (section === 'resumen_nominas') fetchNominasPreview();
    } catch (err) {
      console.error('Error cargando XMLs:', err);
      setDownloadError(err.message || 'Error inesperado al cargar archivos.');
    } finally {
      setIsUploadingXml(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Contador de segundos en vivo durante la descarga oficial del SAT
  useEffect(() => {
    let timer;
    if (downloadingId) {
      setDownloadElapsed(0);
      setIsDownloadCompleted(false);
      timer = setInterval(() => {
        setDownloadElapsed((prev) => prev + 1);
      }, 1000);
    } else {
      setDownloadElapsed(0);
      setIsDownloadCompleted(false);
    }
    return () => clearInterval(timer);
  }, [downloadingId]);

  const details = MODULE_DETAILS[section] || MODULE_DETAILS.documentos_frecuentes;
  const isIndigo = details.accent === 'indigo';
  const isTeal = details.accent === 'teal';
  const isAmber = details.accent === 'amber';
  const isDocFrecuentes = section === 'documentos_frecuentes';

  // Obtener la carpeta de descargas predeterminada del sistema
  React.useEffect(() => {
    async function loadDownloadsDir() {
      try {
        const token = localStorage.getItem('firmavault_token');
        const res = await fetch('/api/system/downloads-dir', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.downloadsDir) {
            setDownloadsDir(data.downloadsDir);
          }
        }
      } catch (err) {
        console.warn('No se pudo obtener directorio de descargas:', err);
      }
    }
    loadDownloadsDir();
  }, []);

  // Abrir archivo o carpeta en el Explorador de Windows
  const handleOpenPath = async (targetPath) => {
    try {
      const token = localStorage.getItem('firmavault_token');
      await fetch('/api/open-path', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ targetPath }),
      });
    } catch (err) {
      console.error('Error al abrir la ruta en el explorador:', err);
    }
  };

  // Descarga interna de documentos (CSF, 32-D, Análisis IVA/ISR)
  const handleDownload = async (act) => {
    const is32d = act.id === '32d';
    const isTaxAnalysis = section === 'analisis_iva_isr' || act.id === 'iva_mensual' || act.id === 'retenciones';
    const isControlPagos = section === 'control_pagos' || act.id === 'conciliacion_pue_ppd';
    const isResumenNominas = section === 'resumen_nominas' || act.id === 'resumen_sat';
    const isEfos = section === 'listas_negras_efos' || act.id === 'cruce_69b';
    const isDiot = section === 'precalculo_diot' || act.id === 'diot_resumen' || act.id?.startsWith('diot_');
    const isCancelaciones = section === 'validador_cancelaciones' || act.id === 'auditoria_canceladas_excel' || act.id === 'auditar_canceladas';
    const isConfronta = section === 'confronta_sat' || act.id === 'confronta_sat_excel';
    const isConciliacion = section === 'conciliacion_bancaria' || act.id === 'conciliacion_bancaria_excel';
    const isPolizas = section === 'polizas_contables' || act.id === 'polizas_excel' || act.id?.startsWith('polizas_');

    setDownloadingId(act.id);
    setDownloadError(null);
    setDownloadSuccess(null);

    try {
      const token = localStorage.getItem('firmavault_token');
      let endpoint = `/api/clients/${client?.id}/csf/download`;
      let reqBody = {};

      if (is32d) {
        endpoint = `/api/clients/${client?.id}/opinion-32d/download`;
      } else if (isTaxAnalysis) {
        endpoint = `/api/clients/${client?.id}/analisis-iva-isr/download`;
        reqBody = {
          year: selectedYear,
          month: selectedMonth,
          zone: selectedZone,
          actionId: act.id,
          regime: selectedRegime,
          arrendamientoOpcion,
        };
      } else if (isControlPagos) {
        endpoint = `/api/clients/${client?.id}/control-pagos/download`;
        reqBody = { year: selectedYear, month: selectedMonth };
      } else if (isResumenNominas) {
        endpoint = `/api/clients/${client?.id}/resumen-nominas/download`;
        reqBody = { year: selectedYear, month: selectedMonth };
      } else if (isEfos) {
        endpoint = `/api/clients/${client?.id}/cruce-69b/download`;
        reqBody = { year: selectedYear, month: selectedMonth };
      } else if (isDiot) {
        endpoint = `/api/clients/${client?.id}/diot/download`;
        reqBody = { year: selectedYear, month: selectedMonth, format: act.formatType || 'zip' };
      } else if (isCancelaciones) {
        endpoint = `/api/clients/${client?.id}/cancelaciones/download`;
        reqBody = { year: selectedYear, month: selectedMonth, scope: 'all' };
      } else if (isConfronta) {
        endpoint = `/api/clients/${client?.id}/confronta-sat/download`;
        reqBody = { year: selectedYear };
      } else if (isConciliacion) {
        endpoint = `/api/clients/${client?.id}/conciliacion-bancaria/download`;
        reqBody = { year: selectedYear };
      } else if (isPolizas) {
        endpoint = `/api/clients/${client?.id}/polizas/download`;
        reqBody = { year: selectedYear, month: selectedMonth, format: act.formatType || 'excel' };
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(reqBody),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Error al generar ${act.title}`);
      }

      const data = await res.json();

      // Marcar conclusión exitosa del proceso de 3 pasos para visualización fluida del usuario
      setIsDownloadCompleted(true);
      await new Promise((resolve) => setTimeout(resolve, 800));

      // Disparar ventana emergente "Guardar como..." del navegador predeterminando la carpeta Descargas
      if (data.pdfBase64) {
        const byteCharacters = atob(data.pdfBase64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const mimeType = data.isExcel
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : data.isZip
          ? 'application/zip'
          : data.isTxt
          ? 'text/plain'
          : 'application/pdf';
        const blob = new Blob([byteArray], { type: mimeType });

        if ('showSaveFilePicker' in window) {
          try {
            const handle = await window.showSaveFilePicker({
              suggestedName: data.filename,
              startIn: 'downloads',
              types: [
                data.isExcel
                  ? {
                      description: 'Libro de Excel (*.xlsx)',
                      accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] },
                    }
                  : data.isZip
                  ? {
                      description: 'Archivo Comprimido ZIP (*.zip)',
                      accept: { 'application/zip': ['.zip'] },
                    }
                  : data.isTxt
                  ? {
                      description: 'Archivo de Texto Plano Batch (*.txt)',
                      accept: { 'text/plain': ['.txt'] },
                    }
                  : {
                      description: 'Documento PDF (*.pdf)',
                      accept: { 'application/pdf': ['.pdf'] },
                    },
              ],
            });
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
          } catch (pickerErr) {
            // Si el usuario canceló explícitamente el diálogo Guardar Como, continuar para desplegar el reporte abajo
            if (pickerErr.name === 'AbortError') {
              console.info('Ventana Guardar Como cerrada por el usuario.');
            } else {
              // Fallback a descarga directa del navegador
              const blobUrl = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = blobUrl;
              a.download = data.filename;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
            }
          }
        } else {
          // Fallback para navegadores sin showSaveFilePicker
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = data.filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        }
      }

      setDownloadSuccess({
        title: act.title,
        filename: data.filename,
        savedPath: data.savedPath,
        metrics: data.metrics,
      });
      if (data.metrics && isTaxAnalysis) {
        setAnalysisData(data.metrics);
      }
      if (isEfos) {
        fetchEfosPreview();
      }
      if (isDiot) {
        fetchDiotPreview();
      }
      if (isCancelaciones) {
        fetchCancelacionesPreview(false);
      }
      if (isControlPagos) {
        fetchControlPagosPreview();
      }
      if (isResumenNominas) {
        fetchNominasPreview();
      }

    } catch (err) {
      console.error(`Error al procesar ${act.title}:`, err);
      setDownloadError(err.message || 'Error inesperado al generar');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDownloadDiot = (format = 'zip') => {
    const titles = {
      excel: 'Papel de Trabajo DIOT en Excel',
      txt2025: 'Archivo Batch SAT 2025 (54 Campos)',
      txtTrad: 'Archivo Batch SAT DEM Tradicional (24 Campos)',
      zip: 'Paquete Completo DIOT (ZIP)',
    };
    handleDownload({
      id: `diot_${format}`,
      title: titles[format] || 'Pre-cálculo DIOT',
      formatType: format,
    });
  };

  const handleDownloadCancelaciones = () => {
    handleDownload(details.actions[0] || {
      id: 'auditoria_canceladas_excel',
      title: 'Dictamen de Auditoría de Cancelaciones (.xlsx)',
    });
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.03),0_1px_3px_rgba(0,0,0,0.02)] flex flex-col gap-6 relative overflow-hidden animate-in fade-in duration-200">
      {/* Barra superior de acento temático */}
      <div
        className={`absolute top-0 left-0 right-0 h-1 transition-all duration-500 bg-gradient-to-r ${
          isIndigo
            ? 'from-blue-600 via-indigo-600 to-violet-600'
            : isTeal
            ? 'from-teal-500 via-emerald-500 to-teal-700'
            : 'from-amber-500 via-orange-500 to-rose-600'
        }`}
      />

      {/* Header del Espacio de Trabajo */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border transition-colors ${
              isIndigo
                ? 'bg-indigo-50 text-indigo-700 border-indigo-100'
                : isTeal
                ? 'bg-teal-50 text-teal-700 border-teal-100'
                : 'bg-amber-50 text-amber-700 border-amber-100'
            }`}
          >
            <span className="material-symbols-outlined text-[15px]">{details.icon}</span>
            {details.category} • {details.badge}
          </span>
          <span className="text-xs text-slate-400 font-mono">
            {client?.rfc || 'Sin RFC'}
          </span>
        </div>
      </div>

      {/* Título & Beneficio */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
          {details.title}
        </h1>
        <p className="text-sm text-slate-600 leading-relaxed max-w-3xl mt-2 font-normal">
          {details.subtitle}
        </p>

      </div>

      {/* Panel Ejecutivo: Paso 1 - Fuente de Comprobantes y Parámetros de Auditoría */}
      {section === 'analisis_iva_isr' && (
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-[0_8px_30px_rgb(0,0,0,0.03)]">
          {/* Header del Panel */}
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-6 py-4 rounded-t-3xl flex flex-wrap items-center justify-between gap-3 text-white">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-teal-500/20 border border-teal-400/30 flex items-center justify-center text-teal-300">
                <span className="material-symbols-outlined text-[18px]">tune</span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-100">
                    Paso 1: Configuración y Sincronización Fiscal
                  </h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-400/30 font-bold">
                    Auditoría Fiscal
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 font-normal mt-0.5">
                  Configura los parámetros fiscales y presiona "Sincronizar Facturas SAT" para extraer los comprobantes oficiales con la e.firma.
                </p>
              </div>
            </div>

            {/* Alternar a subida manual de XMLs */}
            <div>
              <button
                type="button"
                onClick={() => setInputMethod((prev) => (prev === 'xml' ? 'sat' : 'xml'))}
                className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                  inputMethod === 'xml'
                    ? 'bg-teal-600 border-teal-500 text-white shadow-sm font-black'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
                title="Subir archivos XML o ZIP manualmente desde tu equipo"
              >
                <span className="material-symbols-outlined text-[16px]">
                  {inputMethod === 'xml' ? 'sync' : 'upload_file'}
                </span>
                <span>{inputMethod === 'xml' ? 'Modo SAT Automático' : 'Subir XMLs (.xml / .zip)'}</span>
              </button>
            </div>
          </div>

          {/* Cuerpo del Panel: Parámetros y Ejecución */}
          <div className="p-6 flex flex-col gap-5">
            {/* Parámetros: Ejercicio Fiscal, Zona Fiscal, Periodo y Régimen Fiscal */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 relative z-20">
              {/* 1. Ejercicio (Año) */}
              <div className="relative" data-dropdown-container>
                <label className="text-xs font-bold text-slate-700 block mb-1.5 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] text-slate-600">calendar_today</span>
                  <span>Ejercicio (Año):</span>
                </label>
                <button
                  type="button"
                  onClick={() => setOpenDropdown((prev) => (prev === 'year' ? null : 'year'))}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-400 shadow-3xs cursor-pointer transition-all hover:border-slate-300 text-left"
                >
                  <span>{selectedYear}</span>
                  <span className={`material-symbols-outlined text-[18px] text-slate-400 transition-transform duration-200 ${openDropdown === 'year' ? 'rotate-180 text-teal-600' : ''}`}>
                    expand_more
                  </span>
                </button>

                {openDropdown === 'year' && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200/90 rounded-2xl shadow-xl z-50 overflow-hidden py-1.5 animate-in fade-in zoom-in-95 duration-150 max-h-60 overflow-y-auto">
                    {SAT_YEAR_LIST.map((y) => {
                      const isSelected = selectedYear === y;
                      return (
                        <button
                          key={y}
                          type="button"
                          onClick={() => {
                            setSelectedYear(y);
                            setOpenDropdown(null);
                          }}
                          className={`w-full flex items-center justify-between px-4 py-2.5 text-xs transition-colors cursor-pointer text-left ${
                            isSelected
                              ? 'bg-teal-50 text-teal-900 font-black'
                              : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900 font-semibold'
                          }`}
                        >
                          <span>{y}</span>
                          {isSelected && (
                            <span className="material-symbols-outlined text-[16px] text-teal-600">check</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 2. Zona Fiscal */}
              <div className="relative" data-dropdown-container>
                <label className="text-xs font-bold text-slate-700 block mb-1.5 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] text-slate-600">pin_drop</span>
                  <span>Zona Fiscal:</span>
                </label>
                <button
                  type="button"
                  onClick={() => setOpenDropdown((prev) => (prev === 'zone' ? null : 'zone'))}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-400 shadow-3xs cursor-pointer transition-all hover:border-slate-300 text-left"
                >
                  <span className="truncate">{ZONE_OPTIONS.find((z) => z.value === selectedZone)?.label || selectedZone}</span>
                  <span className={`material-symbols-outlined text-[18px] text-slate-400 transition-transform duration-200 shrink-0 ml-1 ${openDropdown === 'zone' ? 'rotate-180 text-teal-600' : ''}`}>
                    expand_more
                  </span>
                </button>

                {openDropdown === 'zone' && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200/90 rounded-2xl shadow-xl z-50 overflow-hidden py-1.5 animate-in fade-in zoom-in-95 duration-150">
                    {ZONE_OPTIONS.map((opt) => {
                      const isSelected = selectedZone === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            setSelectedZone(opt.value);
                            setOpenDropdown(null);
                          }}
                          className={`w-full flex items-center justify-between px-4 py-2.5 text-xs transition-colors cursor-pointer text-left ${
                            isSelected
                              ? 'bg-teal-50 text-teal-900 font-black'
                              : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900 font-semibold'
                          }`}
                        >
                          <span className="pr-2">{opt.label}</span>
                          {isSelected && (
                            <span className="material-symbols-outlined text-[16px] text-teal-600 shrink-0">check</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 3. Periodo */}
              <div className="relative" data-dropdown-container>
                <label className="text-xs font-bold text-slate-700 block mb-1.5 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] text-slate-600">date_range</span>
                  <span>Periodo:</span>
                </label>
                <button
                  type="button"
                  onClick={() => setOpenDropdown((prev) => (prev === 'month' ? null : 'month'))}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-400 shadow-3xs cursor-pointer transition-all hover:border-slate-300 text-left"
                >
                  <span className="truncate">{MONTH_OPTIONS.find((m) => m.value === selectedMonth)?.label || selectedMonth}</span>
                  <span className={`material-symbols-outlined text-[18px] text-slate-400 transition-transform duration-200 shrink-0 ml-1 ${openDropdown === 'month' ? 'rotate-180 text-teal-600' : ''}`}>
                    expand_more
                  </span>
                </button>

                {openDropdown === 'month' && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200/90 rounded-2xl shadow-xl z-50 overflow-hidden py-1.5 animate-in fade-in zoom-in-95 duration-150 max-h-60 overflow-y-auto">
                    {MONTH_OPTIONS.map((opt) => {
                      const isSelected = selectedMonth === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            setSelectedMonth(opt.value);
                            setOpenDropdown(null);
                          }}
                          className={`w-full flex items-center justify-between px-4 py-2.5 text-xs transition-colors cursor-pointer text-left ${
                            isSelected
                              ? 'bg-teal-50 text-teal-900 font-black'
                              : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900 font-semibold'
                          }`}
                        >
                          <span>{opt.label}</span>
                          {isSelected && (
                            <span className="material-symbols-outlined text-[16px] text-teal-600 shrink-0">check</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 4. Régimen Fiscal (19 Regímenes Oficiales del SAT) */}
              <div className="relative" data-dropdown-container>
                <label className="text-xs font-bold text-slate-700 block mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px] text-teal-700">account_balance</span>
                    <span>Régimen Fiscal SAT:</span>
                  </span>
                  <span className="text-[10px] font-mono font-black px-1.5 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200">
                    {getRegimenInfo(selectedRegime).tipoPersona === 'Moral' ? 'Persona Moral' : 'Persona Física'}
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => setOpenDropdown((prev) => (prev === 'regime' ? null : 'regime'))}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-400 shadow-3xs cursor-pointer transition-all hover:border-slate-300 text-left"
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="font-mono text-[11px] font-black px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200 shrink-0">
                      {getRegimenInfo(selectedRegime).code}
                    </span>
                    <span className="truncate">{getRegimenInfo(selectedRegime).nombre}</span>
                  </div>
                  <span className={`material-symbols-outlined text-[18px] text-slate-400 transition-transform duration-200 shrink-0 ml-1 ${openDropdown === 'regime' ? 'rotate-180 text-teal-600' : ''}`}>
                    expand_more
                  </span>
                </button>

                {openDropdown === 'regime' && (
                  <div className="absolute right-0 top-full mt-1.5 w-[340px] sm:w-[440px] max-w-[92vw] bg-white border border-slate-200/95 rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
                    {/* Buscador de Régimen */}
                    <div className="p-2.5 border-b border-slate-100 bg-slate-50/80">
                      <div className="relative">
                        <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
                          search
                        </span>
                        <input
                          type="text"
                          value={regimeSearch}
                          onChange={(e) => setRegimeSearch(e.target.value)}
                          placeholder="Buscar por clave o nombre (ej. 626, arrendamiento)..."
                          className="w-full pl-9 pr-7 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium"
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                        />
                        {regimeSearch && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setRegimeSearch(''); }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          >
                            <span className="material-symbols-outlined text-[16px]">close</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Lista Agrupada y Scrolleable */}
                    <div className="max-h-[340px] overflow-y-auto divide-y divide-slate-100 py-1">
                      {/* 1. Personas Morales */}
                      {GROUPED_REGIMENES.morales.filter(r =>
                        !regimeSearch ||
                        r.code.includes(regimeSearch) ||
                        r.nombre.toLowerCase().includes(regimeSearch.toLowerCase()) ||
                        r.subtitulo.toLowerCase().includes(regimeSearch.toLowerCase())
                      ).length > 0 && (
                        <div>
                          <div className="px-3.5 py-1.5 bg-slate-50 text-[11px] font-black tracking-wider uppercase text-slate-500 flex items-center justify-between sticky top-0 z-10 border-b border-slate-100">
                            <span className="flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-[15px] text-indigo-700">domain</span>
                              Personas Morales (Empresas)
                            </span>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200/70 text-slate-700">
                              {GROUPED_REGIMENES.morales.length} {GROUPED_REGIMENES.morales.length === 1 ? 'Régimen' : 'Regímenes'}
                            </span>
                          </div>
                          {GROUPED_REGIMENES.morales
                            .filter(r =>
                              !regimeSearch ||
                              r.code.includes(regimeSearch) ||
                              r.nombre.toLowerCase().includes(regimeSearch.toLowerCase()) ||
                              r.subtitulo.toLowerCase().includes(regimeSearch.toLowerCase())
                            )
                            .map((opt) => {
                              const isSelected = selectedRegime === opt.code || selectedRegime === opt.value;
                              return (
                                <button
                                  key={opt.code}
                                  type="button"
                                  onClick={() => handleRegimeChange(opt.code)}
                                  className={`w-full flex items-start gap-2.5 px-3.5 py-2.5 text-xs transition-colors cursor-pointer text-left ${
                                    isSelected
                                      ? 'bg-indigo-50 text-indigo-900 font-bold'
                                      : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900 font-medium'
                                  }`}
                                >
                                  <span className={`font-mono text-[10px] font-black px-1.5 py-0.5 rounded border shrink-0 mt-0.5 ${
                                    isSelected ? 'bg-indigo-600 text-white border-indigo-700' : 'bg-slate-100 text-slate-700 border-slate-200'
                                  }`}>
                                    {opt.code}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs font-bold leading-tight">{opt.nombre}</div>
                                    <div className="text-[10px] text-slate-500 leading-snug mt-0.5 line-clamp-1">{opt.subtitulo}</div>
                                  </div>
                                  {isSelected && (
                                    <span className="material-symbols-outlined text-[18px] text-indigo-600 shrink-0 mt-0.5">check</span>
                                  )}
                                </button>
                              );
                            })}
                        </div>
                      )}

                      {/* 2. Personas Físicas */}
                      {GROUPED_REGIMENES.fisicas.filter(r =>
                        !regimeSearch ||
                        r.code.includes(regimeSearch) ||
                        r.nombre.toLowerCase().includes(regimeSearch.toLowerCase()) ||
                        r.subtitulo.toLowerCase().includes(regimeSearch.toLowerCase())
                      ).length > 0 && (
                        <div>
                          <div className="px-3.5 py-1.5 bg-slate-50 text-[11px] font-black tracking-wider uppercase text-slate-500 flex items-center justify-between sticky top-0 z-10 border-b border-slate-100">
                            <span className="flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-[15px] text-teal-700">person</span>
                              Personas Físicas (Individuos)
                            </span>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200/70 text-slate-700">
                              {GROUPED_REGIMENES.fisicas.length} Regímenes
                            </span>
                          </div>
                          {GROUPED_REGIMENES.fisicas
                            .filter(r =>
                              !regimeSearch ||
                              r.code.includes(regimeSearch) ||
                              r.nombre.toLowerCase().includes(regimeSearch.toLowerCase()) ||
                              r.subtitulo.toLowerCase().includes(regimeSearch.toLowerCase())
                            )
                            .map((opt) => {
                              const isSelected = selectedRegime === opt.code || selectedRegime === opt.value;
                              return (
                                <button
                                  key={opt.code}
                                  type="button"
                                  onClick={() => handleRegimeChange(opt.code)}
                                  className={`w-full flex items-start gap-2.5 px-3.5 py-2.5 text-xs transition-colors cursor-pointer text-left ${
                                    isSelected
                                      ? 'bg-teal-50 text-teal-900 font-bold'
                                      : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900 font-medium'
                                  }`}
                                >
                                  <span className={`font-mono text-[10px] font-black px-1.5 py-0.5 rounded border shrink-0 mt-0.5 ${
                                    isSelected ? 'bg-teal-600 text-white border-teal-700' : 'bg-slate-100 text-slate-700 border-slate-200'
                                  }`}>
                                    {opt.code}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs font-bold leading-tight">{opt.nombre}</div>
                                    <div className="text-[10px] text-slate-500 leading-snug mt-0.5 line-clamp-1">{opt.subtitulo}</div>
                                  </div>
                                  {isSelected && (
                                    <span className="material-symbols-outlined text-[18px] text-teal-600 shrink-0 mt-0.5">check</span>
                                  )}
                                </button>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Toggle Deducción Ciega vs Gastos Reales para Arrendamiento (606) */}
            {selectedRegime === '606' && (
              <div className="p-3.5 sm:p-4 rounded-2xl border border-amber-200 bg-amber-50/70 flex flex-wrap items-center justify-between gap-3 animate-in fade-in duration-200">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-100 border border-amber-300 text-amber-900 flex items-center justify-center shrink-0 shadow-3xs">
                    <span className="material-symbols-outlined text-[20px]">home_work</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-amber-950">Modalidad de Deducción — Arrendamiento (Art. 115 LISR)</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-200/80 text-amber-900 font-bold">Opcional</span>
                    </div>
                    <p className="text-[11px] text-amber-800/90 mt-0.5">
                      {arrendamientoOpcion === 'ciega'
                        ? 'Deducción Ciega del 35% sobre ingresos sin comprobantes para ISR. El IVA acreditable se calcula con facturas de gastos reales.'
                        : 'Gastos Reales comprobados con CFDI (mantenimiento, predial, intereses, salarios).'}
                    </p>
                  </div>
                </div>
                <div className="inline-flex p-1 bg-amber-100/90 rounded-xl border border-amber-300 text-xs font-bold shadow-3xs">
                  <button
                    type="button"
                    onClick={() => handleArrendamientoChange('ciega')}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      arrendamientoOpcion === 'ciega'
                        ? 'bg-amber-700 text-white shadow-xs font-black'
                        : 'text-amber-900 hover:bg-amber-200/60'
                    }`}
                  >
                    Deducción Ciega (35%)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleArrendamientoChange('real')}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      arrendamientoOpcion === 'real'
                        ? 'bg-amber-700 text-white shadow-xs font-black'
                        : 'text-amber-900 hover:bg-amber-200/60'
                    }`}
                  >
                    Gastos Reales
                  </button>
                </div>
              </div>
            )}

            {/* Acción y Estado según el método seleccionado */}
            {inputMethod === 'sat' ? (
              <div className="p-4 sm:p-5 rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50/80 via-indigo-50/50 to-blue-50/80 flex flex-wrap items-center justify-between gap-4 transition-all">
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 border border-blue-300 text-blue-800 flex items-center justify-center shrink-0 shadow-3xs">
                    <span className="material-symbols-outlined text-[22px]">cloud_sync</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-black uppercase px-2 py-0.5 rounded border bg-blue-100 text-blue-900 border-blue-300">
                        Conexión Oficial SAT
                      </span>
                      {downloadSuccess ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-teal-800 bg-teal-100/90 border border-teal-300 px-2 py-0.5 rounded-md animate-in fade-in">
                          <span className="material-symbols-outlined text-[13px] text-teal-700">task_alt</span>
                          Auditoría y Libro Contable Concluidos
                        </span>
                      ) : isSyncSuccess ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-100/90 border border-emerald-300 px-2 py-0.5 rounded-md animate-in fade-in">
                          <span className="material-symbols-outlined text-[13px] text-emerald-700">check_circle</span>
                          Sincronización con el SAT completada con éxito
                        </span>
                      ) : syncState.error ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-800 bg-rose-100/90 border border-rose-300 px-2 py-0.5 rounded-md animate-in fade-in">
                          <span className="material-symbols-outlined text-[13px] text-rose-700">error</span>
                          {syncState.error}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-slate-700 mt-1 font-medium">
                      {downloadSuccess
                        ? 'Auditoría fiscal concluida y libro contable en Excel generado exitosamente.'
                        : isSyncSuccess
                        ? 'Comprobantes oficiales recién sincronizados con éxito. Ya puedes iniciar la auditoría en el Tablero Ejecutivo.'
                        : 'Conecta de forma automática con el portal del SAT mediante la e.firma para descargar todas las facturas emitidas y recibidas.'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    disabled={isSyncing || !client?.hasCredentials}
                    onClick={handleStartSatSync}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer active:scale-95 shadow-xs bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                    title={client?.hasCredentials ? 'Descargar comprobantes emitidos y recibidos oficiales del SAT' : 'Se requiere e.firma (.cer, .key y contraseña)'}
                  >
                    <span className={`material-symbols-outlined text-[17px] ${isSyncing ? 'animate-spin' : ''}`}>
                      {isSyncing ? 'sync' : 'bolt'}
                    </span>
                    <span>
                      {isSyncing
                        ? `Sincronizando con el SAT (${syncState.progress || 5}%)...`
                        : 'Sincronizar Facturas SAT'}
                    </span>
                  </button>

                  {isSyncing && (
                    <button
                      type="button"
                      onClick={handleCancelSync}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-rose-200 bg-white hover:bg-rose-50 text-rose-700 hover:text-rose-800 text-xs font-bold transition-all shadow-3xs cursor-pointer active:scale-95 shrink-0"
                      title="Cancelar la sincronización en curso"
                    >
                      <span className="material-symbols-outlined text-[16px] text-rose-600">cancel</span>
                      <span>Cancelar</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-4 sm:p-5 rounded-2xl border border-teal-200 bg-gradient-to-r from-teal-50/80 via-emerald-50/50 to-teal-50/80 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-teal-100 border border-teal-300 text-teal-800 flex items-center justify-center shrink-0 shadow-3xs">
                    <span className="material-symbols-outlined text-[22px]">upload_file</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-black uppercase px-2 py-0.5 rounded border bg-teal-100 text-teal-900 border-teal-300">
                        Carga Manual de Comprobantes
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 mt-1 font-medium">
                      Sube paquetes de facturas en formato <strong className="text-slate-950 font-bold">.xml</strong> o comprimidos en <strong className="text-slate-950 font-bold">.zip</strong> de tu equipo.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleUploadXmlFiles}
                    multiple
                    accept=".xml,.zip"
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={isUploadingXml}
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-teal-700 to-emerald-700 hover:from-teal-800 hover:to-emerald-800 text-white text-xs font-black transition-all shadow-xs cursor-pointer active:scale-95 disabled:opacity-50 shrink-0"
                  >
                    <span className="material-symbols-outlined text-[18px]">upload_file</span>
                    <span>{isUploadingXml ? 'Subiendo comprobantes...' : 'Seleccionar Archivos (.xml / .zip)'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Aviso de error discreto y elegante en la parte inferior si ocurre una falla */}
            {syncState.status === 'failed' && syncState.error && (
              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start justify-between gap-3 animate-in fade-in duration-200 shadow-3xs">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-rose-100 border border-rose-300 text-rose-700 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="material-symbols-outlined text-[18px]">error</span>
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-rose-950">Aviso del Portal del SAT</h4>
                    <p className="text-xs text-rose-700 mt-0.5 leading-relaxed font-medium">
                      {syncState.error}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSyncState((prev) => ({ ...prev, status: 'idle', error: null }))}
                  className="text-rose-400 hover:text-rose-800 p-1 rounded-lg transition-colors cursor-pointer shrink-0"
                  title="Cerrar aviso"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Selector Compacto de Ejercicio y Parámetros (para los demás módulos: control_pagos, resumen_nominas, etc.) */}
      {!isDocFrecuentes && section !== 'analisis_iva_isr' && (
        <div className="bg-slate-50/70 p-5 rounded-2xl border border-slate-200/70 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-slate-500 text-[20px]">tune</span>
            <div>
              <h3 className="text-xs font-bold text-slate-800">Parámetros de Ejecución</h3>
              <p className="text-[11px] text-slate-500">Contribuyente activo: {client?.name}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {(section === 'control_pagos' || section === 'resumen_nominas' || section === 'listas_negras_efos' || section === 'precalculo_diot' || section === 'validador_cancelaciones' || section === 'polizas_contables' || section === 'confronta_sat') && (
              <>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleUploadXmlFiles}
                  multiple
                  accept=".xml,.zip"
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={isUploadingXml}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-teal-200 bg-teal-50/70 hover:bg-teal-100 text-teal-800 text-xs font-bold transition-all shadow-3xs cursor-pointer disabled:opacity-50"
                  title="Carga manual de archivos .xml o paquetes .zip"
                >
                  <span className="material-symbols-outlined text-[16px] text-teal-700">upload_file</span>
                  <span>{isUploadingXml ? 'Subiendo...' : 'Subir XMLs (.xml / .zip)'}</span>
                </button>
              </>
            )}

            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-600">Ejercicio:</label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300 shadow-3xs cursor-pointer"
              >
                {(section === 'listas_negras_efos' || section === 'validador_cancelaciones') && (
                  <option value="0">Todos los Años (Consolidado)</option>
                )}
                {[2026, 2025, 2024, 2023, 2022].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            {(section === 'control_pagos' || section === 'resumen_nominas' || section === 'listas_negras_efos' || section === 'precalculo_diot' || section === 'validador_cancelaciones' || section === 'polizas_contables') && (
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-slate-600">Periodo:</label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300 shadow-3xs cursor-pointer"
                >
                  <option value="0">Todo el Año (Consolidado)</option>
                  <option value="1">Enero</option>
                  <option value="2">Febrero</option>
                  <option value="3">Marzo</option>
                  <option value="4">Abril</option>
                  <option value="5">Mayo</option>
                  <option value="6">Junio</option>
                  <option value="7">Julio</option>
                  <option value="8">Agosto</option>
                  <option value="9">Septiembre</option>
                  <option value="10">Octubre</option>
                  <option value="11">Noviembre</option>
                  <option value="12">Diciembre</option>
                </select>
              </div>
            )}

            {details?.actions?.[0] && (
              <button
                type="button"
                disabled={downloadingId === details.actions[0]?.id || isSyncing}
                onClick={() => handleDownload(details.actions[0])}
                title="Descargar libro de trabajo o reporte oficial"
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-teal-700 via-teal-800 to-emerald-800 hover:from-teal-800 hover:to-emerald-900 active:scale-95 text-white text-xs font-black shadow-sm hover:shadow transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
              >
                {downloadingId === details.actions[0]?.id ? (
                  <>
                    <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Procesando...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">play_circle</span>
                    <span>
                      {section === 'listas_negras_efos'
                        ? 'Iniciar Cruce 69-B y Descargar Excel'
                        : section === 'precalculo_diot'
                        ? 'Descargar Paquete DIOT (ZIP)'
                        : section === 'validador_cancelaciones'
                        ? 'Descargar Dictamen de Cancelaciones (.xlsx)'
                        : section === 'control_pagos'
                        ? 'Descargar Matriz PUE vs PPD (.xlsx)'
                        : section === 'resumen_nominas'
                        ? 'Descargar Resumen Nóminas (.xlsx)'
                        : section === 'confronta_sat'
                        ? 'Descargar Cédula de Confronta SAT (.xlsx)'
                        : section === 'conciliacion_bancaria'
                        ? 'Descargar Cédula de Conciliación (.xlsx)'
                        : section === 'polizas_contables'
                        ? 'Descargar Pólizas Contables'
                        : 'Iniciar Auditoría y Descargar Excel'}
                    </span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Notificación Dinámica de Descarga en curso del SAT (Paleta de Colores del Proyecto) */}
      {downloadingId && (() => {
        const isDone = isDownloadCompleted;
        const currentStep = isDone ? 3 : downloadElapsed < 3 ? 1 : downloadElapsed < 6 ? 2 : 3;
        const docName = downloadingId === '32d'
          ? 'Opinión de Cumplimiento (32-D)'
          : downloadingId === 'csf'
          ? 'Constancia de Situación Fiscal (CSF)'
          : downloadingId === 'cruce_69b' || section === 'listas_negras_efos'
          ? 'Auditoría de Listas Negras EFOS (Art. 69-B)'
          : section === 'precalculo_diot' || downloadingId?.startsWith('diot')
          ? 'Pre-cálculo DIOT y Archivos SAT'
          : section === 'validador_cancelaciones' || downloadingId === 'auditoria_canceladas_excel'
          ? 'Dictamen de Cancelaciones SAT (Art. 29-A)'
          : 'Papel de Trabajo de Análisis de IVA e ISR';

        const isDoneStep1 = isDone || currentStep > 1;
        const isActiveStep1 = !isDoneStep1 && currentStep === 1;

        const isDoneStep2 = isDone || currentStep > 2;
        const isActiveStep2 = !isDoneStep2 && currentStep === 2;

        const isDoneStep3 = isDone;
        const isActiveStep3 = !isDoneStep3 && currentStep === 3;

        let progressPercent = 15;
        if (isDone) {
          progressPercent = 100;
        } else if (currentStep === 1) {
          progressPercent = Math.min(38, Math.max(15, 15 + downloadElapsed * 10));
        } else if (currentStep === 2) {
          progressPercent = Math.min(75, Math.max(40, 40 + (downloadElapsed - 2) * 12));
        } else {
          progressPercent = Math.min(96, Math.max(78, 78 + (downloadElapsed - 5) * 4));
        }

        return (
          <div className="bg-gradient-to-br from-indigo-50/80 via-blue-50/40 to-slate-50 border border-indigo-200/90 rounded-3xl p-5 shadow-sm relative overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
            {/* Barra superior con gradiente del proyecto */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 animate-pulse" />

            <div className="flex flex-col gap-4">
              {/* Encabezado Principal de Estado */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-indigo-100">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${isDone ? 'bg-emerald-600 text-white' : 'bg-indigo-600 text-white'}`}>
                    {isDone ? (
                      <span className="material-symbols-outlined text-[22px]">verified</span>
                    ) : (
                      <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${isDone ? 'bg-emerald-500' : 'bg-indigo-600 animate-ping'}`} />
                      <span className="text-[10px] font-mono font-bold tracking-widest text-indigo-700 uppercase">
                        {isDone ? 'DOCUMENTO EMITIDO CON ÉXITO' : 'PROCESO DE EXTRACCIÓN OFICIAL SAT'}
                      </span>
                    </div>
                    <h4 className="text-sm font-black text-slate-900 mt-0.5">
                      {isDone ? `${docName} Generado` : `Generando ${docName}`}
                    </h4>
                  </div>
                </div>

                <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-indigo-100 text-indigo-900 shadow-3xs">
                  <span className="material-symbols-outlined text-indigo-600 text-[16px]">schedule</span>
                  <span className="font-mono text-xs font-bold">
                    {downloadElapsed}s transcurridos
                  </span>
                </div>
              </div>

              {/* Visual Pipeline de 3 Pasos (Paleta Oficial del Proyecto) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Paso 1 */}
                <div
                  className={`p-3.5 rounded-2xl border transition-all duration-300 ${
                    isActiveStep1
                      ? 'bg-white border-indigo-500 text-indigo-950 shadow-md ring-2 ring-indigo-500/20'
                      : isDoneStep1
                      ? 'bg-emerald-50/90 border-emerald-300 text-emerald-900'
                      : 'bg-white/60 border-slate-200 text-slate-400 opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">Paso 1</span>
                    {isDoneStep1 ? (
                      <span className="material-symbols-outlined text-[16px] text-emerald-600">check_circle</span>
                    ) : isActiveStep1 ? (
                      <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping" />
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-slate-300" />
                    )}
                  </div>
                  <div className="text-xs font-bold text-slate-900">1. Conexión SAT</div>
                  <div className="text-[11px] text-slate-600 mt-0.5 truncate">Estableciendo túnel TLS</div>
                </div>

                {/* Paso 2 */}
                <div
                  className={`p-3.5 rounded-2xl border transition-all duration-300 ${
                    isActiveStep2
                      ? 'bg-white border-indigo-500 text-indigo-950 shadow-md ring-2 ring-indigo-500/20'
                      : isDoneStep2
                      ? 'bg-emerald-50/90 border-emerald-300 text-emerald-900'
                      : 'bg-white/60 border-slate-200 text-slate-400 opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">Paso 2</span>
                    {isDoneStep2 ? (
                      <span className="material-symbols-outlined text-[16px] text-emerald-600">check_circle</span>
                    ) : isActiveStep2 ? (
                      <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping" />
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-slate-300" />
                    )}
                  </div>
                  <div className="text-xs font-bold text-slate-900">2. Firma Criptográfica</div>
                  <div className="text-[11px] text-slate-600 mt-0.5 truncate">Validación e.firma SAML</div>
                </div>

                {/* Paso 3 */}
                <div
                  className={`p-3.5 rounded-2xl border transition-all duration-300 ${
                    isActiveStep3
                      ? 'bg-white border-indigo-500 text-indigo-950 shadow-md ring-2 ring-indigo-500/20'
                      : isDoneStep3
                      ? 'bg-emerald-50/90 border-emerald-300 text-emerald-900'
                      : 'bg-white/60 border-slate-200 text-slate-400 opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">Paso 3</span>
                    {isDoneStep3 ? (
                      <span className="material-symbols-outlined text-[16px] text-emerald-600">check_circle</span>
                    ) : isActiveStep3 ? (
                      <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping" />
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-slate-300" />
                    )}
                  </div>
                  <div className="text-xs font-bold text-slate-900">3. Emisión Oficial</div>
                  <div className="text-[11px] text-slate-600 mt-0.5 truncate">Sello digital y PDF</div>
                </div>
              </div>

              {/* Mensaje de Estado Detallado */}
              <div className="p-3.5 rounded-2xl bg-white border border-indigo-100 flex items-center gap-3 shadow-3xs">
                <span className={`material-symbols-outlined text-[18px] shrink-0 ${isDone ? 'text-emerald-600' : 'text-indigo-600 animate-spin'}`}>
                  {isDone ? 'verified' : 'sync'}
                </span>
                <p className="text-xs font-medium text-slate-700 leading-relaxed">
                  {isDone
                    ? '¡Documento oficial obtenido exitosamente con sello digital y código QR!'
                    : currentStep === 1
                    ? 'Estableciendo conexión segura con los servidores del SAT (login.siat.sat.gob.mx)...'
                    : currentStep === 2
                    ? 'Autenticando credenciales criptográficas mediante e.firma (.cer, .key y token SAML 2.0)...'
                    : 'Generando documento fiscal oficial con sello digital, cadena original y código QR...'}
                </p>
              </div>

              {/* Barra de Progreso */}
              <div className="w-full bg-slate-200/80 h-2 rounded-full overflow-hidden p-0.5 border border-indigo-100">
                <div
                  className="bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-500 h-full rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {/* Pie con Garantía de Seguridad */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 pt-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-emerald-600 text-[15px]">lock</span>
                  <span className="font-medium">Conexión directa SSL 256-bit sin intermediarios</span>
                </div>
                <div className="text-slate-400 text-[10px] font-mono">
                  Contribuyente: {client?.rfc}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Notificación de Éxito al Descargar + Cédula de Dictamen Contable Rápida (para otros módulos) */}
      {downloadSuccess && section !== 'analisis_iva_isr' && (
        <div className="bg-emerald-50/80 border border-emerald-200 rounded-3xl p-5 sm:p-6 flex flex-col gap-4 animate-in fade-in slide-in-from-top-1 duration-200 shadow-sm">
          <div className="flex items-center justify-between gap-4 border-b border-emerald-200/60 pb-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="material-symbols-outlined text-emerald-600 text-[22px] shrink-0">verified</span>
              <div>
                <h4 className="text-xs font-bold text-emerald-950">
                  {downloadSuccess.title} — Generado Exitosamente
                </h4>
                <p className="text-[11px] text-emerald-800/80 font-mono truncate">
                  {downloadSuccess.filename}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setDownloadSuccess(null)}
                className="p-1.5 rounded-xl text-emerald-700 hover:bg-emerald-200/60 transition-colors cursor-pointer"
                title="Cerrar"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
          </div>

          {/* Cédula de Dictamen Rápido en Pantalla para el Contador */}
          {downloadSuccess.metrics && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
              <div className="bg-white/90 p-3.5 rounded-2xl border border-emerald-100 shadow-3xs">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Ingresos Facturados</span>
                <span className="text-sm font-black text-slate-900 mt-0.5 block">
                  ${Number(downloadSuccess.metrics.ingresos || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </span>
                <span className="text-[10px] text-slate-400">Subtotal comprobantes emitidos</span>
              </div>

              <div className="bg-white/90 p-3.5 rounded-2xl border border-emerald-100 shadow-3xs">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Gastos Deducibles</span>
                <span className="text-sm font-black text-slate-900 mt-0.5 block">
                  ${Number(downloadSuccess.metrics.gastos || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </span>
                <span className="text-[10px] text-slate-400">Subtotal comprobantes recibidos</span>
              </div>

              <div className={`p-3.5 rounded-2xl border shadow-3xs ${
                Number(downloadSuccess.metrics.saldo_iva) > 0
                  ? 'bg-rose-50/70 border-rose-200 text-rose-950'
                  : 'bg-emerald-50/90 border-emerald-200 text-emerald-950'
              }`}>
                <span className="text-[10px] font-bold uppercase tracking-wider block opacity-75">
                  {Number(downloadSuccess.metrics.saldo_iva) > 0 ? 'IVA a Cargo (Pagar)' : 'Saldo a Favor IVA'}
                </span>
                <span className="text-sm font-black mt-0.5 block">
                  ${Math.abs(Number(downloadSuccess.metrics.saldo_iva || 0)).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </span>
                <span className="text-[10px] opacity-75">Trasladado vs Acreditable</span>
              </div>

              <div className="bg-white/90 p-3.5 rounded-2xl border border-emerald-100 shadow-3xs">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Utilidad Fiscal ISR</span>
                <span className="text-sm font-black text-slate-900 mt-0.5 block">
                  ${Number(downloadSuccess.metrics.utilidad_isr || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </span>
                <span className="text-[10px] text-slate-400">Base para pago provisional</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Banner de Error si falló */}
      {downloadError && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-center justify-between gap-3 text-rose-800 text-xs">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-rose-600 text-[18px]">error</span>
            <span>{downloadError}</span>
          </div>
          <button
            type="button"
            onClick={() => setDownloadError(null)}
            className="p-1 rounded hover:bg-rose-100 text-rose-600 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      )}

      {/* Tarjetas de Operaciones Disponibles en otros módulos */}
      {section === 'documentos_frecuentes' && (
        <div className={`grid grid-cols-1 ${details.actions.length > 1 ? 'md:grid-cols-2' : ''} gap-4`}>
          {details.actions.map((act) => {
            const isDownloadCard = isDocFrecuentes || act.format?.includes('PDF Oficial') || act.format?.includes('Excel');
            const isCurrentDownloading = downloadingId === act.id;

            return (
              <div
                key={act.id}
                className="p-5 rounded-2xl border border-slate-200/90 bg-white shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between gap-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      isIndigo
                        ? 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                        : isTeal
                        ? 'bg-teal-50 text-teal-700 border border-teal-100'
                        : 'bg-amber-50 text-amber-700 border border-amber-100'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[20px]">{act.icon}</span>
                  </div>
                  {act.format && (
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200/80">
                      {act.format}
                    </span>
                  )}
                </div>

                <div>
                  <h3 className="text-sm font-black text-slate-900">{act.title}</h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">{act.desc}</p>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] font-medium text-emerald-700 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    {act.statusText}
                  </span>

                  <button
                    type="button"
                    disabled={isCurrentDownloading}
                    onClick={() => {
                      if (isDownloadCard) {
                        handleDownload(act);
                      } else {
                        alert(`Operación "${act.title}" seleccionada para ${client?.name} (${selectedYear}). Este reporte utiliza los XMLs descargados en el Módulo 1.`);
                      }
                    }}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white shadow-xs transition-all cursor-pointer active:scale-95 disabled:opacity-75 disabled:cursor-not-allowed ${
                      isIndigo
                        ? 'bg-indigo-600 hover:bg-indigo-700'
                        : isTeal
                        ? 'bg-teal-700 hover:bg-teal-800'
                        : 'bg-slate-900 hover:bg-slate-800'
                    }`}
                  >
                    {isCurrentDownloading ? (
                      <>
                        <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                        <span>Procesando...</span>
                      </>
                    ) : isDownloadCard ? (
                      <>
                        <span className="material-symbols-outlined text-[17px]">download</span>
                        <span>Descargar</span>
                      </>
                    ) : (
                      <>
                        <span>Ejecutar Reporte</span>
                        <span className="material-symbols-outlined text-[15px]">arrow_forward</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tablero y Gráficos Interactivos de Auditoría Fiscal en Pantalla */}
      {section === 'analisis_iva_isr' && (
        isLoadingAnalysis ? (
          <div className="bg-white rounded-3xl border border-slate-200/90 p-12 text-center flex flex-col items-center justify-center gap-3 shadow-3xs animate-in fade-in duration-200">
            <span className="inline-block w-8 h-8 border-3 border-teal-600 border-t-transparent rounded-full animate-spin" />
            <h4 className="text-sm font-black text-slate-900 mt-2">
              Auditando comprobantes y calculando impuestos...
            </h4>
            <p className="text-xs text-slate-500 max-w-sm font-normal">
              Procesando base de datos de facturas para {client?.rfc} (Ejercicio {selectedYear}).
            </p>
          </div>
        ) : analysisData ? (
          <AnalisisFiscalDashboard
            data={analysisData}
            year={selectedYear}
            month={selectedMonth}
            zone={selectedZone}
            regime={selectedRegime}
            onChangeRegime={handleRegimeChange}
            arrendamientoOpcion={arrendamientoOpcion}
            onChangeArrendamientoOpcion={handleArrendamientoChange}
            client={client}
            onDownloadExcel={() => handleDownload(details.actions[0])}
            isDownloading={downloadingId === details.actions[0]?.id}
            onRefresh={() => fetchAnalysisPreview(selectedRegime, arrendamientoOpcion)}
            onStartAudit={() => fetchAnalysisPreview(selectedRegime, arrendamientoOpcion)}
            isLoading={isLoadingAnalysis}
            onStartSatSync={handleStartSatSync}
            isSyncing={isSyncing || isUploadingXml}
            storedSyncMeta={storedSyncMeta}
            isSyncSuccess={isSyncSuccess}
            downloadSuccess={downloadSuccess}
            onCloseDownloadSuccess={() => setDownloadSuccess(null)}
            onResetToNewQuery={handleResetToNewQuery}
          />
        ) : !downloadingId ? (
          <div className="bg-gradient-to-b from-slate-50/90 to-slate-100/50 rounded-3xl border border-dashed border-slate-200/90 p-8 sm:p-12 text-center flex flex-col items-center justify-center gap-4 animate-in fade-in duration-200">
            <div className="w-14 h-14 rounded-2xl bg-white text-teal-700 flex items-center justify-center border border-slate-200 shadow-3xs">
              <span className="material-symbols-outlined text-[28px]">query_stats</span>
            </div>
            <div className="max-w-md">
              <h4 className="text-base font-black text-slate-900 tracking-tight">
                Análisis Integral de IVA e ISR — 100% Cifras Reales
              </h4>
              <p className="text-xs text-slate-600 mt-1.5 leading-relaxed font-normal">
                {storedSyncMeta ? (
                  <>Se detectaron facturas oficiales sincronizadas para este ejercicio. Puedes presionar <strong className="text-teal-800 font-bold">"Iniciar Auditoría"</strong> para consultar el dictamen y descargar el libro contable.</>
                ) : (
                  <>Este módulo opera con cifras 100% reales sin datos simulados. Sincroniza las facturas emitidas y recibidas de <strong>{client?.name}</strong> desde el portal oficial del SAT o carga los XMLs directamente.</>
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 mt-1">
              <button
                type="button"
                onClick={handleStartSatSync}
                disabled={isSyncing || !client?.hasCredentials}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white text-xs font-black shadow-sm hover:shadow transition-all cursor-pointer active:scale-95 disabled:opacity-50"
              >
                <span className={`material-symbols-outlined text-[17px] ${isSyncing ? 'animate-spin' : ''}`}>
                  {isSyncing ? 'sync' : 'cloud_sync'}
                </span>
                <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar Facturas del SAT (Automático)'}</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingXml}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold transition-all shadow-3xs cursor-pointer active:scale-95"
              >
                <span className="material-symbols-outlined text-[17px] text-teal-700">upload_file</span>
                <span>Cargar XMLs / ZIPs</span>
              </button>

              <button
                type="button"
                onClick={() => handleDownload(details.actions[0])}
                disabled={downloadingId === details.actions[0]?.id}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-teal-300 bg-teal-50 hover:bg-teal-100 text-teal-900 text-xs font-bold transition-all shadow-3xs cursor-pointer active:scale-95"
              >
                <span className="material-symbols-outlined text-[17px]">table_chart</span>
                <span>Generar Excel Maestro</span>
              </button>
            </div>
          </div>
        ) : null
      )}

      {/* Tablero y Auditoría Interactiva de Listas Negras EFOS (Art. 69-B) */}
      {section === 'listas_negras_efos' && (
        isLoadingEfos && !efosData ? (
          <div className="bg-white rounded-3xl border border-slate-200/90 p-12 text-center flex flex-col items-center justify-center gap-3 shadow-3xs animate-in fade-in duration-200">
            <span className="inline-block w-8 h-8 border-3 border-amber-600 border-t-transparent rounded-full animate-spin" />
            <h4 className="text-sm font-black text-slate-900 mt-2">
              Cruzando proveedores contra listado oficial 69-B del SAT...
            </h4>
            <p className="text-xs text-slate-500 max-w-sm font-normal">
              Auditando comprobantes recibidos para {client?.rfc} (Periodo {selectedYear === '0' ? 'Consolidado' : selectedYear}).
            </p>
          </div>
        ) : (
          <RastreadorEfosDashboard
            data={efosData}
            year={selectedYear}
            month={selectedMonth}
            client={client}
            onDownloadExcel={() => handleDownload(details.actions[0])}
            isDownloading={downloadingId === details.actions[0]?.id}
            onRefresh={fetchEfosPreview}
            isLoading={isLoadingEfos}
          />
        )
      )}

      {/* Tablero y Auditoría Interactiva de Pre-cálculo DIOT (Art. 32 Fracc. VIII LIVA) */}
      {section === 'precalculo_diot' && (
        isLoadingDiot && !diotData ? (
          <div className="bg-white rounded-3xl border border-slate-200/90 p-12 text-center flex flex-col items-center justify-center gap-3 shadow-3xs animate-in fade-in duration-200">
            <span className="inline-block w-8 h-8 border-3 border-teal-600 border-t-transparent rounded-full animate-spin" />
            <h4 className="text-sm font-black text-slate-900 mt-2">
              Analizando flujo de efectivo y agrupando proveedores para DIOT...
            </h4>
            <p className="text-xs text-slate-500 max-w-sm font-normal">
              Auditando CFDI de egresos y complementos de pago para {client?.rfc} (Periodo {selectedMonth === '0' ? 'Todo el Año' : `Mes ${selectedMonth}`}, {selectedYear}).
            </p>
          </div>
        ) : (
          <PrecalculoDiotDashboard
            data={diotData}
            year={selectedYear}
            month={selectedMonth}
            client={client}
            onDownloadFormat={handleDownloadDiot}
            isDownloading={Boolean(downloadingId)}
            onRefresh={fetchDiotPreview}
            isLoading={isLoadingDiot}
          />
        )
      )}

      {/* Tablero y Auditoría Interactiva de Validador de Cancelaciones SAT (Art. 29-A CFF) */}
      {section === 'validador_cancelaciones' && (
        isLoadingCancelaciones && !cancelacionesData ? (
          <div className="bg-white rounded-3xl border border-slate-200/90 p-12 text-center flex flex-col items-center justify-center gap-3 shadow-3xs animate-in fade-in duration-200">
            <span className="inline-block w-8 h-8 border-3 border-amber-600 border-t-transparent rounded-full animate-spin" />
            <h4 className="text-sm font-black text-slate-900 mt-2">
              Auditando comprobantes contra el Web Service del SAT...
            </h4>
            <p className="text-xs text-slate-500 max-w-sm font-normal">
              Cotejando CFDI emitidos y recibidos para {client?.rfc} ({selectedMonth === '0' ? 'Todo el Año' : `Mes ${selectedMonth}`}, {selectedYear === '0' ? 'Consolidado' : selectedYear}).
            </p>
          </div>
        ) : (
          <ValidadorCancelacionesDashboard
            data={cancelacionesData}
            year={selectedYear}
            month={selectedMonth}
            scope="all"
            client={client}
            onDownloadExcel={handleDownloadCancelaciones}
            isDownloading={Boolean(downloadingId)}
            onRefresh={() => fetchCancelacionesPreview(false)}
            onLiveCheck={() => fetchCancelacionesPreview(true)}
            isLoading={isLoadingCancelaciones}
            isLiveChecking={isLiveCheckingCancelaciones}
          />
        )
      )}

      {/* Tablero y Auditoría Interactiva de Control de Pagos (PUE vs PPD) */}
      {section === 'control_pagos' && (
        isLoadingControlPagos && !controlPagosData ? (
          <div className="bg-white rounded-3xl border border-slate-200/90 p-12 text-center flex flex-col items-center justify-center gap-3 shadow-3xs animate-in fade-in duration-200">
            <span className="inline-block w-8 h-8 border-3 border-teal-600 border-t-transparent rounded-full animate-spin" />
            <h4 className="text-sm font-black text-slate-900 mt-2">
              Conciliando facturas PUE vs PPD y auditando complementos REP...
            </h4>
            <p className="text-xs text-slate-500 max-w-sm font-normal">
              Auditando comprobantes fiscales para {client?.rfc} (Periodo {selectedMonth === '0' ? 'Todo el Año' : `Mes ${selectedMonth}`}, {selectedYear}).
            </p>
          </div>
        ) : (
          <ControlPagosDashboard
            data={controlPagosData}
            year={selectedYear}
            month={selectedMonth}
            client={client}
            onDownloadExcel={() => handleDownload(details.actions[0])}
            isDownloading={downloadingId === details.actions[0]?.id}
            onRefresh={fetchControlPagosPreview}
            isLoading={isLoadingControlPagos}
          />
        )
      )}

      {/* Tablero y Auditoría Interactiva de Resumen de Nóminas para Declarar */}
      {section === 'resumen_nominas' && (
        isLoadingNominas && !nominasData ? (
          <div className="bg-white rounded-3xl border border-slate-200/90 p-12 text-center flex flex-col items-center justify-center gap-3 shadow-3xs animate-in fade-in duration-200">
            <span className="inline-block w-8 h-8 border-3 border-teal-600 border-t-transparent rounded-full animate-spin" />
            <h4 className="text-sm font-black text-slate-900 mt-2">
              Extrayendo percepciones, deducciones y retenciones de nómina...
            </h4>
            <p className="text-xs text-slate-500 max-w-sm font-normal">
              Auditando CFDI de nómina para {client?.rfc} (Ejercicio {selectedYear}).
            </p>
          </div>
        ) : (
          <ResumenNominasDashboard
            data={nominasData}
            year={selectedYear}
            month={selectedMonth}
            client={client}
            onDownloadExcel={() => handleDownload(details.actions[0])}
            isDownloading={downloadingId === details.actions[0]?.id}
            onRefresh={fetchNominasPreview}
            isLoading={isLoadingNominas}
          />
        )
      )}

      {/* Tablero y Auditoría de Confronta Visor del SAT vs. CFDI */}
      {section === 'confronta_sat' && (
        isLoadingConfronta && !confrontaData ? (
          <div className="bg-white rounded-3xl border border-slate-200/90 p-12 text-center flex flex-col items-center justify-center gap-3 shadow-3xs animate-in fade-in duration-200">
            <span className="inline-block w-8 h-8 border-3 border-amber-600 border-t-transparent rounded-full animate-spin" />
            <h4 className="text-sm font-black text-slate-900 mt-2">
              Cruzando bases de datos de contabilidad vs. Visor del SAT...
            </h4>
            <p className="text-xs text-slate-500 max-w-sm font-normal">
              Auditando deltas de ingresos y retenciones para {client?.rfc} (Ejercicio {selectedYear}).
            </p>
          </div>
        ) : (
          <ConfrontaSatDashboard
            data={confrontaData}
            year={selectedYear}
            client={client}
            onDownloadExcel={() => handleDownload(details.actions[0])}
            isDownloading={downloadingId === details.actions[0]?.id}
            onRefresh={fetchConfrontaPreview}
            isLoading={isLoadingConfronta}
          />
        )
      )}

      {/* Tablero y Auditoría de Conciliación Bancaria vs. CFDI */}
      {section === 'conciliacion_bancaria' && (
        isLoadingConciliacion && !conciliacionData ? (
          <div className="bg-white rounded-3xl border border-slate-200/90 p-12 text-center flex flex-col items-center justify-center gap-3 shadow-3xs animate-in fade-in duration-200">
            <span className="inline-block w-8 h-8 border-3 border-teal-600 border-t-transparent rounded-full animate-spin" />
            <h4 className="text-sm font-black text-slate-900 mt-2">
              Conciliando estados de cuenta bancarios contra CFDI PUE y REP...
            </h4>
            <p className="text-xs text-slate-500 max-w-sm font-normal">
              Auditando flujo de efectivo y presunciones Art. 59 CFF para {client?.rfc} (Ejercicio {selectedYear}).
            </p>
          </div>
        ) : (
          <ConciliacionBancariaDashboard
            data={conciliacionData}
            year={selectedYear}
            client={client}
            onDownloadExcel={() => handleDownload(details.actions[0])}
            isDownloading={downloadingId === details.actions[0]?.id}
            onRefresh={fetchConciliacionPreview}
            isLoading={isLoadingConciliacion}
            onUploadBankFile={handleUploadBankFile}
            isUploadingBank={isUploadingBank}
          />
        )
      )}

      {/* Tablero y Generador de Pólizas Contables Anexo 24 RMF */}
      {section === 'polizas_contables' && (
        isLoadingPolizas && !polizasData ? (
          <div className="bg-white rounded-3xl border border-slate-200/90 p-12 text-center flex flex-col items-center justify-center gap-3 shadow-3xs animate-in fade-in duration-200">
            <span className="inline-block w-8 h-8 border-3 border-teal-600 border-t-transparent rounded-full animate-spin" />
            <h4 className="text-sm font-black text-slate-900 mt-2">
              Generando asientos contables y asociando folios fiscales UUID...
            </h4>
            <p className="text-xs text-slate-500 max-w-sm font-normal">
              Estructurando pólizas de ingresos, egresos y nómina para {client?.rfc} (Periodo {selectedMonth === '0' ? 'Todo el Año' : `Mes ${selectedMonth}`}, {selectedYear}).
            </p>
          </div>
        ) : (
          <PolizasContablesDashboard
            data={polizasData}
            year={selectedYear}
            month={selectedMonth}
            client={client}
            onDownloadFormat={(fmt) => handleDownload({ ...details.actions[0], formatType: fmt })}
            isDownloading={downloadingId === details.actions[0]?.id}
            onRefresh={fetchPolizasPreview}
            isLoading={isLoadingPolizas}
          />
        )
      )}

    </div>
  );
}
