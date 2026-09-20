import React, { useState, useEffect, useRef } from 'react';

function getToken() {
  return localStorage.getItem('firmavault_token');
}

async function authFetch(url, options = {}) {
  const token = getToken();
  const headers = { ...options.headers };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  return fetch(url, { ...options, headers });
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  }).format(amount || 0);
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const MONTH_SHORT = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
];

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;

const yearOptions = Array.from({ length: 15 }, (_, i) => {
  const y = String(CURRENT_YEAR - i);
  return { value: y, label: i === 0 ? `${y} (Actual)` : y };
});

const monthOptions = [
  { value: 'all', label: 'Todo el año' },
  ...MONTH_NAMES.map((name, i) => ({
    value: String(i + 1),
    label: name,
  })),
];

function getItemMonth(item) {
  if (item?.Mes) return item.Mes;
  const dateStr = item?.['Fecha de Emisión'] || item?.['Fecha de EmisiÃ³n'] || item?.fecha_emision || item?.FechaEmision || '';
  const match = dateStr.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/) || dateStr.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (match) {
    let mNum = null;
    if (match[1].length === 4) {
      mNum = parseInt(match[2], 10);
    } else if (match[3].length === 4) {
      mNum = parseInt(match[2], 10);
    }
    if (mNum && mNum >= 1 && mNum <= 12) {
      return MONTH_NAMES[mNum - 1];
    }
  }
  return 'General';
}

const EXTRACTION_STEPS = [
  { step: 1, label: '1. Conexión SAT', icon: 'key' },
  { step: 2, label: '2. Búsqueda CFDI', icon: 'search' },
  { step: 3, label: '3. Descarga (.XML / .PDF)', icon: 'download' },
  { step: 4, label: '4. Reporte Excel', icon: 'table_view' },
  { step: 5, label: '5. Respaldo ZIP', icon: 'folder_zip' },
];

function resolveActivePhase(currentPhase, progress, logs, isEmitidas) {
  // 0. Paso base estrictamente monotónico según el porcentaje de avance
  const baseStep = progress < 25 ? 1 : progress < 40 ? 2 : progress < 85 ? 3 : progress < 95 ? 4 : 5;

  // 1. Si el backend envió una fase explícita, usarla (garantizando que no sea menor a baseStep)
  if (currentPhase && currentPhase.title) {
    return {
      title: currentPhase.title,
      desc: currentPhase.desc || '',
      step: Math.max(currentPhase.step || 1, baseStep),
    };
  }

  // 2. Inferir fase activa de los logs más recientes en tiempo real
  const recentLogs = (logs || []).slice(-4).reverse();
  for (const logLine of recentLogs) {
    const l = (logLine || '').toLowerCase();
    if (l.includes('descargando .xml') || l.includes('descargando xml') || l.includes('.xml guardado') || l.includes('.pdf guardado') || l.includes('descarga de comprobantes')) {
      const cleanDesc = logLine.replace(/^\[.*?\]\s*/, '').replace(/^[📥✓ℹ️⚠️❌]\s*/, '');
      return {
        title: 'Descarga de Comprobantes (.XML y .PDF)',
        desc: cleanDesc || 'Descargando archivos XML oficiales y representaciones impresas en PDF...',
        step: Math.max(3, baseStep),
      };
    }
    if (l.includes('excel') || l.includes('estructurando') || l.includes('generando archivo excel')) {
      return {
        title: 'Generación de Reporte Excel con Fórmulas',
        desc: isEmitidas
          ? 'Estructurando pestañas dinámicas por efecto (Ingresos, Pagos, Nóminas) con fórmulas contables...'
          : 'Estructurando pestañas dinámicas (Ingresos, Pagos REP, Notas de Crédito) con fórmulas contables...',
        step: Math.max(4, baseStep),
      };
    }
    if (l.includes('zip') || l.includes('comprimiendo')) {
      return {
        title: 'Empaquetado de Respaldo (.ZIP)',
        desc: 'Comprimiendo comprobantes fiscales (PDF y XML) para respaldo ante el SAT...',
        step: Math.max(5, baseStep),
      };
    }
    if (l.includes('se encontraron') || l.includes('se detectaron') || l.includes('consulta') || l.includes('búsqueda') || l.includes('portalcfdi')) {
      // PREVENCIÓN CRÍTICA DE REGRESIÓN: Si ya entramos a la etapa de descarga o superior (baseStep >= 3),
      // no debemos degradar el paso a 2 cuando el robot consulte un nuevo mes (ej. Febrero, Marzo...).
      if (baseStep >= 3) {
        const cleanDesc = logLine.replace(/^\[.*?\]\s*/, '').replace(/^[📥✓ℹ️⚠️❌🔍]\s*/, '');
        return {
          title: 'Descarga de Comprobantes (.XML y .PDF)',
          desc: cleanDesc || 'Consultando y descargando comprobantes fiscales del periodo...',
          step: baseStep,
        };
      }
      return {
        title: isEmitidas ? 'Búsqueda de Facturas Emitidas' : 'Búsqueda de Facturas Recibidas',
        desc: 'Localizando y clasificando comprobantes fiscales timbrados en el SAT...',
        step: Math.max(2, baseStep),
      };
    }
  }

  // 3. Fallback progresivo por porcentaje
  if (progress < 25) {
    return {
      title: 'Conexión al Portal del SAT',
      desc: 'Autenticando de forma segura con e.firma (.cer, .key)...',
      step: 1,
    };
  }
  if (progress < 40) {
    return {
      title: isEmitidas ? 'Búsqueda de Facturas Emitidas' : 'Búsqueda de Facturas Recibidas',
      desc: 'Localizando comprobantes fiscales timbrados del periodo...',
      step: 2,
    };
  }
  if (progress < 85) {
    return {
      title: 'Descarga de Comprobantes (.XML y .PDF)',
      desc: 'Descargando archivos XML oficiales y representaciones impresas PDF para auditoría...',
      step: 3,
    };
  }
  if (progress < 95) {
    return {
      title: 'Generación de Reporte Excel (3 Hojas)',
      desc: 'Estructurando hojas con fórmulas automáticas de Importe e IVA al 16%...',
      step: 4,
    };
  }
  return {
    title: 'Empaquetado de Respaldo (.ZIP)',
    desc: 'Comprimiendo carpeta con comprobantes (.XML y .PDF) para auditoría fiscal...',
    step: 5,
  };
}

export default function FacturasProcessor({ client, initialType = 'emitidas' }) {
  const [activeType, setActiveType] = useState(initialType); // 'emitidas' | 'recibidas'
  const [selectedYear, setSelectedYear] = useState(String(CURRENT_YEAR));
  const [selectedMonth, setSelectedMonth] = useState('all');

  // Estado del proceso automatizado
  const [jobStatus, setJobStatus] = useState('idle'); // 'idle' | 'running' | 'completed' | 'failed'
  const [progress, setProgress] = useState(0);
  const [currentPhase, setCurrentPhase] = useState(null);
  const [logs, setLogs] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  // Filtros de tabla
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'vigente' | 'cancelado'
  const [monthFilter, setMonthFilter] = useState('all'); // 'all' | 'Enero' | 'Febrero' ...
  const [currentPage, setCurrentPage] = useState(1);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [copiedField, setCopiedField] = useState(null);

  const eventSourceRef = useRef(null);
  const resultsRef = useRef(null);
  const hasAutoDownloadedRef = useRef(false);
  const itemsPerPage = 8;

  const isEmitidas = activeType === 'emitidas';
  const activePhase = resolveActivePhase(currentPhase, progress, logs, isEmitidas);

  // Sincronizar si cambia el prop initialType
  useEffect(() => {
    if (initialType) {
      setActiveType(initialType);
    }
  }, [initialType]);

  // Manejar cambio de tipo Emitidas vs Recibidas
  const handleTypeChange = (newType) => {
    if (newType === activeType || jobStatus === 'running') return;
    setActiveType(newType);
    setResult(null);
    setError('');
    setProgress(0);
    setLogs([]);
    setJobStatus('idle');
    setCurrentPage(1);
    hasAutoDownloadedRef.current = false;
  };

  // Limpieza al desmontar
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // Reconectar SSE automáticamente si la página se recarga o si el job ya estaba en ejecución
  useEffect(() => {
    let isMounted = true;
    async function checkCurrentStatus() {
      if (!client?.id) return;
      try {
        const res = await authFetch(`/api/clients/${client.id}/facturas/status`);
        const data = await res.json();
        if (!isMounted) return;
        if (data && data.status === 'running') {
          setJobStatus('running');
          setProgress((prev) => Math.max(prev, data.progress || 0));
          setLogs(data.logs || []);
          connectSSE();
        } else if (data && data.status === 'completed' && data.result) {
          setJobStatus('completed');
          setProgress(100);
          setResult(data.result);
          if (data.tipo) setActiveType(data.tipo);
          if (data.year) setSelectedYear(data.year);
          if (data.month) setSelectedMonth(data.month);
        }
      } catch (err) {
        console.warn('No se pudo checar estatus inicial de facturas:', err);
      }
    }
    checkCurrentStatus();
    return () => { isMounted = false; };
  }, [client?.id]);

  // Disparar descarga directa del archivo en el navegador
  const triggerAutoDownload = (resObj) => {
    if (!resObj?.fileId) return;
    try {
      const token = getToken() || '';
      const downloadUrl = `/api/facturas/download/${resObj.fileId}?token=${encodeURIComponent(token)}`;
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = resObj.filename || `Facturas_${activeType.toUpperCase()}_${client?.rfc}_${selectedYear}.xlsx`;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        if (document.body.contains(link)) {
          document.body.removeChild(link);
        }
      }, 300);
    } catch (err) {
      console.error('Error en descarga automática:', err);
    }
  };

  // Abrir ruta física o archivo en el sistema operativo del usuario
  const handleOpenLocalPath = async (targetPath, openFile = false) => {
    if (!targetPath) return;
    try {
      await authFetch('/api/open-path', {
        method: 'POST',
        body: JSON.stringify({ targetPath, openFile }),
      });
    } catch (e) {
      console.error('Error abriendo ruta local:', e);
    }
  };

  // Conectar con el flujo de eventos en tiempo real (Server-Sent Events)
  const connectSSE = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const token = getToken() || '';
    const sse = new EventSource(`/api/clients/${client.id}/facturas/stream?token=${encodeURIComponent(token)}`);
    eventSourceRef.current = sse;

    sse.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.status) setJobStatus(payload.status);
        if (typeof payload.progress === 'number') {
          setProgress((prev) => Math.max(prev, payload.progress));
        }
        if (payload.currentPhase) setCurrentPhase(payload.currentPhase);
        if (payload.logs && Array.isArray(payload.logs)) setLogs(payload.logs);

        if (payload.type === 'finished' && payload.result) {
          setResult(payload.result);
          setProgress(100);
          setJobStatus('completed');
          sse.close();
          if (!hasAutoDownloadedRef.current) {
            hasAutoDownloadedRef.current = true;
            triggerAutoDownload(payload.result);
          }
          setTimeout(() => {
            resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 300);
        } else if (payload.type === 'error') {
          setError(payload.error || 'Error durante la extracción del SAT');
          setJobStatus('failed');
          sse.close();
        }
      } catch (err) {
        console.error('Error parseando evento SSE:', err);
      }
    };

    sse.onerror = () => {
      // Reintento silencioso
    };
  };

  // Polling de respaldo para garantizar actualización en tiempo real ante cualquier caída de SSE
  useEffect(() => {
    let interval = null;
    if (jobStatus === 'running' && client?.id) {
      interval = setInterval(async () => {
        try {
          const res = await authFetch(`/api/clients/${client.id}/facturas/status`);
          const data = await res.json();
          if (data) {
            if (data.status) setJobStatus(data.status);
            if (typeof data.progress === 'number') {
              setProgress((prev) => Math.max(prev, data.progress));
            }
            if (data.currentPhase) setCurrentPhase(data.currentPhase);
            if (data.logs && data.logs.length > 0) setLogs(data.logs);
            if (data.status === 'completed' && data.result) {
              setResult(data.result);
              setProgress(100);
              setJobStatus('completed');
              clearInterval(interval);
              if (!hasAutoDownloadedRef.current) {
                hasAutoDownloadedRef.current = true;
                triggerAutoDownload(data.result);
              }
              setTimeout(() => {
                resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }, 300);
            } else if (data.status === 'failed') {
              setError(data.error || 'Error durante la extracción del SAT');
              clearInterval(interval);
            }
          }
        } catch (e) {}
      }, 1500);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [jobStatus, client?.id]);

  // Iniciar Extracción Automatizada
  const handleStartExtraction = async () => {
    if (!client?.id) return;
    setError('');
    setResult(null);
    setProgress(5);
    setLogs([]);
    setJobStatus('running');
    hasAutoDownloadedRef.current = false;

    try {
      const res = await authFetch(`/api/clients/${client.id}/facturas/start`, {
        method: 'POST',
        body: JSON.stringify({
          tipo: activeType,
          year: selectedYear,
          month: selectedMonth,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo iniciar la extracción de facturas.');
      }

      connectSSE();
    } catch (err) {
      setJobStatus('failed');
      setError(err.message || 'Error al conectar con el servidor.');
      setLogs((prev) => [...prev, `❌ Error: ${err.message}`]);
    }
  };

  // Detener proceso y limpiar estado
  const handleStopExtraction = async () => {
    try {
      await authFetch(`/api/clients/${client.id}/facturas/stop`, { method: 'POST' });
      await authFetch(`/api/clients/${client.id}/facturas/reset`, { method: 'POST' });
    } catch (err) {
      console.error(err);
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    setJobStatus('idle');
    setProgress(0);
    setError('');
  };

  // Reiniciar estado para una nueva consulta
  const handleReset = async () => {
    if (client?.id) {
      try {
        await authFetch(`/api/clients/${client.id}/facturas/reset`, { method: 'POST' });
      } catch (e) {}
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    setResult(null);
    setJobStatus('idle');
    setProgress(0);
    setError('');
    setCurrentPage(1);
    setMonthFilter('all');
  };

  // Descargar archivo Excel generado
  const handleDownloadExcel = async (targetResult = null) => {
    const resObj = targetResult || result;
    if (!resObj?.fileId) return;
    setIsDownloading(true);
    try {
      const token = getToken() || '';
      const downloadUrl = `/api/facturas/download/${resObj.fileId}?token=${encodeURIComponent(token)}`;
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = resObj.filename || `Facturas_${activeType.toUpperCase()}_${client?.rfc}_${selectedYear}_M${selectedMonth}.xlsx`;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        if (document.body.contains(link)) {
          document.body.removeChild(link);
        }
      }, 300);
    } catch (err) {
      console.error('Error al descargar archivo:', err);
      setError('Error al descargar el archivo generado.');
    } finally {
      setIsDownloading(false);
    }
  };

  // Descargar paquete ZIP con archivos PDF y XML de cada factura
  const handleDownloadZip = async (targetResult = null) => {
    const resObj = targetResult || result;
    if (!resObj?.zipFileId) return;
    setIsDownloadingZip(true);
    try {
      const token = getToken() || '';
      const downloadUrl = `/api/facturas/download/${resObj.zipFileId}?token=${encodeURIComponent(token)}`;
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = resObj.zipFilename || `Comprobantes_${activeType.toUpperCase()}_${client?.rfc}_${selectedYear}_PDF_XML.zip`;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        if (document.body.contains(link)) {
          document.body.removeChild(link);
        }
      }, 300);
    } catch (err) {
      console.error('Error al descargar paquete ZIP:', err);
      setError('Error al descargar la carpeta comprimida de comprobantes.');
    } finally {
      setIsDownloadingZip(false);
    }
  };

  // Copiar al portapapeles
  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedField(id);
    setTimeout(() => setCopiedField(null), 1800);
  };

  // Normalizar registros para asegurar consistencia en claves UTF-8
  const rawRegistros = result?.registros || [];
  const registros = React.useMemo(() => {
    return rawRegistros.map((item) => {
      if (!item || typeof item !== 'object') return item;
      const fecha = item['Fecha de Emisión'] || item['Fecha de EmisiÃ³n'] || item['fecha_emision'] || item['FechaEmision'] || '';
      const nombre = item['Nombre o Razón Social'] || item['Nombre o RazÃ³n Social'] || item['nombre_emisor'] || item['nombre_receptor'] || item['nombre'] || '';
      const estado = item['Estado del Comprobante'] || item['estado'] || item['Estado'] || 'Vigente';
      const efecto = item['Efecto del Comprobante'] || item['efecto'] || item['Efecto'] || 'Ingreso';
      return {
        ...item,
        'Fecha de Emisión': fecha,
        'Nombre o Razón Social': nombre,
        'Estado del Comprobante': estado,
        'Efecto del Comprobante': efecto,
      };
    });
  }, [rawRegistros]);

  // Conteo de comprobantes por mes para las pestañas de navegación
  const monthCounts = React.useMemo(() => {
    const counts = {};
    registros.forEach((item) => {
      const m = getItemMonth(item);
      counts[m] = (counts[m] || 0) + 1;
    });
    return counts;
  }, [registros]);

  // Filtrar registros según búsqueda, estado y mes activo
  const filteredRegistros = registros.filter((item) => {
    const q = searchQuery.toLowerCase().trim();
    const nombreStr = (item['Nombre o Razón Social'] || '').toLowerCase();
    const matchesSearch =
      !q ||
      item.Folio?.toLowerCase().includes(q) ||
      item.RFC?.toLowerCase().includes(q) ||
      nombreStr.includes(q);

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'vigente' && item['Estado del Comprobante']?.toLowerCase().includes('vigente')) ||
      (statusFilter === 'cancelado' && item['Estado del Comprobante']?.toLowerCase().includes('cancelado'));

    const itemMonth = getItemMonth(item);
    const matchesMonth =
      monthFilter === 'all' || itemMonth.toLowerCase() === monthFilter.toLowerCase();

    return matchesSearch && matchesStatus && matchesMonth;
  });

  // Métricas para KPIs (calculadas según el mes activo para reflejar la diferencia de mes)
  const displayedRegistrosForKpis = React.useMemo(() => {
    if (monthFilter === 'all') return registros;
    return registros.filter((r) => getItemMonth(r).toLowerCase() === monthFilter.toLowerCase());
  }, [registros, monthFilter]);

  const kpiTotal = displayedRegistrosForKpis.length;
  const kpiMonto = displayedRegistrosForKpis.reduce((acc, r) => acc + (Number(r.Total) || 0), 0);
  const kpiVigentes = displayedRegistrosForKpis.filter((r) => r['Estado del Comprobante']?.toLowerCase().includes('vigente')).length;
  const kpiCancelados = displayedRegistrosForKpis.filter((r) => r['Estado del Comprobante']?.toLowerCase().includes('cancelado')).length;

  const totalPages = Math.ceil(filteredRegistros.length / itemsPerPage) || 1;
  const paginatedRegistros = filteredRegistros.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const hasCredentials = Boolean(
    client?.hasCredentials ??
    (client?.hasCer !== false && client?.hasKey !== false && (client?.validTo || client?.certSerialNumber || client?.password || client?.rfc))
  );

  return (
    <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.03),0_1px_3px_rgba(0,0,0,0.02)] flex flex-col gap-6 relative overflow-hidden">
      {/* Barra superior de acento dinámico */}
      <div
        className={`absolute top-0 left-0 right-0 h-1 transition-all duration-500 bg-gradient-to-r ${
          isEmitidas
            ? 'from-blue-600 via-indigo-600 to-violet-600'
            : 'from-emerald-500 via-teal-500 to-cyan-600'
        }`}
      />

      {/* Header Corporativo */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border transition-colors ${
              isEmitidas
                ? 'bg-indigo-50 text-indigo-700 border-indigo-200/80'
                : 'bg-teal-50 text-teal-700 border-teal-200/80'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${isEmitidas ? 'bg-indigo-500' : 'bg-teal-500'}`} />
            {isEmitidas ? 'Facturas Emitidas (Ventas e Ingresos)' : 'Facturas Recibidas (Gastos y Compras)'}
          </span>
          <span className="text-xs text-slate-400 font-mono">
            {client?.rfc ? `Contribuyente: ${client.rfc}` : 'Módulo SAT Autónomo'}
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
          <span className="material-symbols-outlined text-[16px] text-emerald-500">verified</span>
          <span>Conexión Directa al Portal del SAT vía e.firma</span>
        </div>
      </div>

      {/* Selector Principal de Modo: Emitidas vs Recibidas */}
      <div className="bg-slate-50/90 p-2 rounded-2xl border border-slate-200/80 flex flex-col sm:flex-row gap-2">
        <button
          type="button"
          onClick={() => handleTypeChange('emitidas')}
          disabled={jobStatus === 'running'}
          className={`flex-1 p-4 rounded-xl text-left transition-all cursor-pointer border ${
            isEmitidas
              ? 'bg-white border-indigo-300 shadow-sm ring-2 ring-indigo-500/10'
              : 'bg-transparent border-transparent hover:bg-white/60 text-slate-600 opacity-80'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                  isEmitidas ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200/70 text-slate-500'
                }`}
              >
                <span className="material-symbols-outlined text-[22px]">upload</span>
              </div>
              <div>
                <h4 className={`text-sm font-extrabold ${isEmitidas ? 'text-indigo-950' : 'text-slate-700'}`}>
                  Facturas Emitidas
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5 font-medium">
                  Comprobantes emitidos a clientes • ConsultaEmisor.aspx
                </p>
              </div>
            </div>
            {isEmitidas && (
              <span className="material-symbols-outlined text-[22px] text-indigo-600">check_circle</span>
            )}
          </div>
        </button>

        <button
          type="button"
          onClick={() => handleTypeChange('recibidas')}
          disabled={jobStatus === 'running'}
          className={`flex-1 p-4 rounded-xl text-left transition-all cursor-pointer border ${
            !isEmitidas
              ? 'bg-white border-teal-300 shadow-sm ring-2 ring-teal-500/10'
              : 'bg-transparent border-transparent hover:bg-white/60 text-slate-600 opacity-80'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                  !isEmitidas ? 'bg-teal-100 text-teal-700' : 'bg-slate-200/70 text-slate-500'
                }`}
              >
                <span className="material-symbols-outlined text-[22px]">download</span>
              </div>
              <div>
                <h4 className={`text-sm font-extrabold ${!isEmitidas ? 'text-teal-950' : 'text-slate-700'}`}>
                  Facturas Recibidas
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5 font-medium">
                  Comprobantes recibidos de proveedores • ConsultaReceptor.aspx
                </p>
              </div>
            </div>
            {!isEmitidas && (
              <span className="material-symbols-outlined text-[22px] text-teal-600">check_circle</span>
            )}
          </div>
        </button>
      </div>

      {/* Título & Descripción */}
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
          Descarga Automatizada de Facturas {isEmitidas ? 'Emitidas' : 'Recibidas'} del SAT
        </h1>
        <p className="text-sm text-slate-600 leading-relaxed max-w-3xl font-normal">
          {isEmitidas
            ? `Extracción directa de comprobantes fiscales emitidos para ${client?.name || 'el contribuyente'} directamente desde el portal del SAT, generando el reporte en Excel con fórmulas contables automáticas de Importe e IVA al 16%.`
            : `Extracción directa de comprobantes fiscales recibidos de proveedores para ${client?.name || 'el contribuyente'} desde el SAT, convirtiéndolos en Excel con fórmulas contables automáticas de IVA al 16%.`}
        </p>
      </div>

      {/* Criterios de Extracción Directa */}
      <div className="bg-slate-50/80 rounded-2xl border border-slate-200/80 p-5 sm:p-6 flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-slate-500">tune</span>
            Criterios de Consulta ante el SAT
          </h3>
          <span
            className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1 rounded-full border shadow-2xs ${
              isEmitidas
                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                : 'bg-teal-50 text-teal-700 border-teal-200'
            }`}
          >
            <span className="material-symbols-outlined text-[14px]">
              {isEmitidas ? 'storefront' : 'local_shipping'}
            </span>
            {isEmitidas ? 'Tipo: Emitidas (Ventas)' : 'Tipo: Recibidas (Compras)'}
          </span>
        </div>

        {/* Selectores de Año y Mes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-700">Ejercicio Fiscal (Año)</label>
            <div className="relative">
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                disabled={jobStatus === 'running'}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 shadow-2xs appearance-none cursor-pointer"
              >
                {yearOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <span className="material-symbols-outlined absolute right-3 top-2.5 text-slate-400 pointer-events-none text-[18px]">
                expand_more
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-700">Periodo Fiscal (Mes)</label>
            <div className="relative">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                disabled={jobStatus === 'running'}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 shadow-2xs appearance-none cursor-pointer"
              >
                {monthOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <span className="material-symbols-outlined absolute right-3 top-2.5 text-slate-400 pointer-events-none text-[18px]">
                expand_more
              </span>
            </div>
          </div>
        </div>

        {/* Validación de Credenciales de e.firma */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-slate-200/70">
          <div className="flex items-center gap-2.5 text-xs text-slate-600">
            <span
              className={`material-symbols-outlined text-[18px] ${
                hasCredentials ? 'text-emerald-500' : 'text-amber-500'
              }`}
            >
              {hasCredentials ? 'key' : 'warning'}
            </span>
            <span>
              e.firma vinculada: <strong>{client?.rfc || 'Sin RFC'}</strong>{' '}
              {hasCredentials ? (
                <span className="text-emerald-600 font-semibold">• Credenciales listas</span>
              ) : (
                <span className="text-amber-600 font-semibold">• Archivos .cer/.key pendientes</span>
              )}
            </span>
          </div>

          {/* Botones de Acción */}
          <div className="flex items-center gap-3">
            {jobStatus === 'running' ? (
              <button
                type="button"
                onClick={handleStopExtraction}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95"
              >
                <span className="material-symbols-outlined text-[16px]">cancel</span>
                <span>Cancelar</span>
              </button>
            ) : null}

            <button
              type="button"
              onClick={handleStartExtraction}
              disabled={jobStatus === 'running' || !hasCredentials}
              className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50 active:scale-95 text-white ${
                isEmitidas
                  ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/20'
                  : 'bg-teal-600 hover:bg-teal-700 shadow-teal-600/20'
              }`}
            >
              {jobStatus === 'running' ? (
                <>
                  <span className="material-symbols-outlined text-[18px] animate-spin text-white">
                    progress_activity
                  </span>
                  <span>Descargando Facturas del SAT...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">cloud_download</span>
                  <span>
                    Descargar Facturas {isEmitidas ? 'Emitidas' : 'Recibidas'} del SAT
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Alerta de Error */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold rounded-2xl flex items-start gap-3">
          <span className="material-symbols-outlined text-[20px] text-rose-600 shrink-0">error</span>
          <div className="flex-1">
            <p className="font-bold">Error en la extracción:</p>
            <p className="mt-0.5 font-mono text-[11px] text-rose-700">{error}</p>
          </div>
        </div>
      )}

      {/* Indicador Minimalista y Ejecutivo de Sincronización SAT */}
      {jobStatus === 'running' && (
        <div className="bg-slate-50/90 rounded-2xl border border-slate-200/90 p-5 sm:p-6 flex flex-col gap-4 shadow-xs animate-in fade-in duration-200">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-xs shrink-0 ${
                  isEmitidas ? 'bg-indigo-600' : 'bg-teal-600'
                }`}
              >
                <span className="material-symbols-outlined text-[20px] animate-spin">
                  sync
                </span>
              </div>
              <div>
                <h4 className="text-xs font-extrabold text-slate-900 tracking-tight">
                  {activePhase.title}
                </h4>
                <p className="text-[11.5px] text-slate-500 font-medium mt-0.5">
                  {activePhase.desc}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-slate-700 bg-white border border-slate-200/90 px-3 py-1 rounded-lg shadow-3xs">
                {progress}%
              </span>
            </div>
          </div>

          {/* Barra de Progreso Minimalista */}
          <div className="w-full bg-slate-200/70 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                isEmitidas
                  ? 'bg-gradient-to-r from-blue-500 to-indigo-600'
                  : 'bg-gradient-to-r from-emerald-500 to-teal-600'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Hitos Claros y Transparentes (5 Pasos Oficiales) */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
            {EXTRACTION_STEPS.map((s) => {
              const isPast = activePhase.step > s.step || (progress === 100 && s.step === 5);
              const isCurrent = activePhase.step === s.step && progress < 100;

              return (
                <div
                  key={s.step}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold transition-all ${
                    isPast || isCurrent
                      ? 'bg-white border border-slate-200 text-slate-900 shadow-3xs'
                      : 'text-slate-400 bg-slate-100/60 border border-transparent'
                  }`}
                  title={s.label}
                >
                  <span
                    className={`material-symbols-outlined text-[15px] shrink-0 ${
                      isPast
                        ? 'text-emerald-500'
                        : isCurrent
                        ? (isEmitidas ? 'animate-spin text-indigo-600' : 'animate-spin text-teal-600')
                        : 'text-slate-300'
                    }`}
                  >
                    {isPast ? 'check_circle' : isCurrent ? 'progress_activity' : 'radio_button_unchecked'}
                  </span>
                  <span className="truncate">{s.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tarjeta de Resultados & KPIs */}
      {result && (
        <div ref={resultsRef} className="flex flex-col gap-6 pt-2 animate-in fade-in duration-300">
          {/* Banner de Éxito y Centro de Descargas */}
          <div
            className={`p-6 rounded-3xl border shadow-sm flex flex-col gap-4 transition-all ${
              isEmitidas
                ? 'bg-gradient-to-br from-indigo-50/90 via-white to-blue-50/60 border-indigo-200 text-indigo-950'
                : 'bg-gradient-to-br from-teal-50/90 via-white to-emerald-50/60 border-teal-200 text-teal-950'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-sm shrink-0 ${
                    isEmitidas ? 'bg-indigo-600' : 'bg-teal-600'
                  }`}
                >
                  <span className="material-symbols-outlined text-[28px]">verified</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                      100% Completado • Descarga Lista
                    </span>
                  </div>
                  <h3 className="text-base font-black text-slate-900 mt-1">
                    Facturas {isEmitidas ? 'Emitidas' : 'Recibidas'} extraídas exitosamente del SAT
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Periodo: <strong className="text-slate-800">{selectedMonth === 'all' ? 'Todo el año' : MONTH_NAMES[parseInt(selectedMonth, 10) - 1]} {selectedYear}</strong> • {registros.length} comprobantes procesados con fórmulas contables vivas
                  </p>
                </div>
              </div>

              {/* Botones Primarios de Descarga */}
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95"
                >
                  <span className="material-symbols-outlined text-[16px]">refresh</span>
                  <span>Nueva Consulta</span>
                </button>

                {result?.zipFileId && (
                  <button
                    type="button"
                    onClick={() => handleDownloadZip(result)}
                    disabled={isDownloadingZip}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-extrabold transition-all shadow-md cursor-pointer active:scale-95 disabled:opacity-50"
                    title="Descargar paquete ZIP con todos los XML y PDF organizados por mes"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {isDownloadingZip ? 'hourglass_top' : 'folder_zip'}
                    </span>
                    <span>
                      {isDownloadingZip ? 'Descargando...' : 'Descargar ZIP (PDF + XML)'}
                    </span>
                    {(result.archivosCount || result.archivos_count) > 0 && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/20 text-white font-bold">
                        {result.archivosCount || result.archivos_count} archivos
                      </span>
                    )}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleDownloadExcel(result)}
                  disabled={isDownloading}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold transition-all shadow-md cursor-pointer active:scale-95 disabled:opacity-50 ring-2 ring-emerald-600/20"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {isDownloading ? 'hourglass_top' : 'download'}
                  </span>
                  <span>
                    {isDownloading ? 'Descargando...' : 'Descargar Excel (.xlsx)'}
                  </span>
                </button>
              </div>
            </div>

            {/* Fila de Ubicación en Disco Local & Accesos Directos de Windows */}
            <div className="bg-white/90 rounded-2xl p-3.5 border border-slate-200/90 flex flex-wrap items-center justify-between gap-3 text-xs shadow-3xs">
              <div className="flex items-center gap-2 text-slate-700 min-w-0">
                <span className="material-symbols-outlined text-[20px] text-indigo-600 shrink-0">folder_check</span>
                <span className="truncate text-[11.5px]">
                  Guardado en tu carpeta de Descargas:{' '}
                  <strong className="font-mono text-slate-900 select-all">
                    {result.savedExcelPath || `${result.downloadsDir || 'C:\\Users\\Gio\\Downloads'}\\${result.filename}`}
                  </strong>
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleOpenLocalPath(result.savedExcelPath || result.excel_path, true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-extrabold border border-emerald-300 transition-all cursor-pointer shadow-2xs active:scale-95"
                  title="Abrir este archivo directamente en Microsoft Excel"
                >
                  <span className="material-symbols-outlined text-[16px] text-emerald-600">table_view</span>
                  <span>Abrir en Excel</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenLocalPath(result.savedExcelPath || result.downloadsDir || result.excel_path, false)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-300 transition-all cursor-pointer shadow-2xs active:scale-95"
                  title="Abrir el Explorador de archivos de Windows en la carpeta de Descargas"
                >
                  <span className="material-symbols-outlined text-[16px] text-slate-600">folder_open</span>
                  <span>Ver en Descargas</span>
                </button>
              </div>
            </div>
          </div>

          {/* Cuadrícula de Métricas Clave (KPIs) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 flex flex-col gap-1 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Total Facturas
                </span>
                {monthFilter !== 'all' && (
                  <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                    {monthFilter}
                  </span>
                )}
              </div>
              <span className="text-2xl font-black text-slate-900">
                {kpiTotal}
              </span>
              <span className="text-[10px] text-slate-400 font-medium">
                {monthFilter !== 'all' ? `Comprobantes de ${monthFilter}` : 'Comprobantes procesados'}
              </span>
            </div>

            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 flex flex-col gap-1 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Monto Facturado
                </span>
                {monthFilter !== 'all' && (
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                    {monthFilter}
                  </span>
                )}
              </div>
              <span className="text-2xl font-black text-emerald-700 truncate">
                {formatCurrency(kpiMonto)}
              </span>
              <span className="text-[10px] text-slate-400 font-medium">
                {monthFilter !== 'all' ? `Suma de ${monthFilter}` : 'Suma total de comprobantes'}
              </span>
            </div>

            <div className="bg-emerald-50/60 border border-emerald-200 rounded-2xl p-4 flex flex-col gap-1 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">
                  Comprobantes Vigentes
                </span>
                {monthFilter !== 'all' && (
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded">
                    {monthFilter}
                  </span>
                )}
              </div>
              <span className="text-2xl font-black text-emerald-800">
                {kpiVigentes}
              </span>
              <span className="text-[10px] text-emerald-600 font-medium">Activos en el SAT</span>
            </div>

            <div className="bg-rose-50/60 border border-rose-200 rounded-2xl p-4 flex flex-col gap-1 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wider">
                  Cancelados
                </span>
                {monthFilter !== 'all' && (
                  <span className="text-[10px] font-bold text-rose-700 bg-rose-100/70 px-2 py-0.5 rounded">
                    {monthFilter}
                  </span>
                )}
              </div>
              <span className="text-2xl font-black text-rose-800">
                {kpiCancelados}
              </span>
              <span className="text-[10px] text-rose-600 font-medium">Sin efectos fiscales</span>
            </div>
          </div>

          {/* Tabla Interactiva de Comprobantes */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm flex flex-col overflow-hidden">
            {/* Barra de Navegación y Selector Visual por Mes */}
            {/* Barra de Navegación y Selector Visual por Mes */}
            {(selectedMonth === 'all' || result.month === 'all') ? (
              <div className="px-4 py-3.5 sm:px-6 border-b border-slate-200/80 bg-slate-50/70 flex flex-col gap-3">
                {/* Cabecera descriptiva con estado actual */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-slate-500">calendar_month</span>
                    <span className="font-bold text-slate-800">Filtrar por Mes:</span>
                    <span className="text-slate-300">•</span>
                    <span className="text-slate-500">
                      Mostrando:{' '}
                      <strong className="text-slate-900 font-bold">
                        {monthFilter === 'all' ? 'Todo el año' : monthFilter}
                      </strong>{' '}
                      <span className="text-slate-400 font-medium">({displayedRegistrosForKpis.length} facturas)</span>
                    </span>
                  </div>

                  {monthFilter !== 'all' && (
                    <button
                      type="button"
                      onClick={() => {
                        setMonthFilter('all');
                        setCurrentPage(1);
                      }}
                      className={`inline-flex items-center gap-1 text-xs font-bold transition-colors cursor-pointer ${
                        isEmitidas ? 'text-indigo-600 hover:text-indigo-800' : 'text-teal-700 hover:text-teal-900'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[14px]">restart_alt</span>
                      Ver todo el año
                    </button>
                  )}
                </div>

                {/* Segmented Control Unificado estilo Timeline */}
                <div className="bg-slate-200/60 p-1 rounded-2xl border border-slate-200/90 flex items-stretch gap-1 overflow-x-auto scrollbar-none shadow-xs">
                  {/* Botón Todo el año */}
                  <button
                    type="button"
                    onClick={() => {
                      setMonthFilter('all');
                      setCurrentPage(1);
                    }}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-2 cursor-pointer ${
                      monthFilter === 'all'
                        ? (isEmitidas
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'bg-teal-700 text-white shadow-sm')
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                    }`}
                  >
                    <span>Todo el año</span>
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md font-bold ${
                        monthFilter === 'all'
                          ? 'bg-white/20 text-white'
                          : 'bg-white text-slate-700 shadow-3xs'
                      }`}
                    >
                      {registros.length}
                    </span>
                  </button>

                  <div className="w-px bg-slate-300/80 my-1 mx-0.5 shrink-0" />

                  {/* 12 Meses en cuadrícula equilibrada y proporcional */}
                  <div className="flex-1 grid grid-cols-12 min-w-[660px] gap-1">
                    {MONTH_NAMES.map((name, idx) => {
                      const short = MONTH_SHORT[idx];
                      const count = monthCounts[name] || 0;
                      const isSelected = monthFilter === name;
                      const hasData = count > 0;

                      return (
                        <button
                          key={name}
                          type="button"
                          disabled={!hasData}
                          onClick={() => {
                            if (!hasData) return;
                            setMonthFilter(name);
                            setCurrentPage(1);
                          }}
                          title={`${name}: ${count} comprobante(s)`}
                          className={`py-1.5 px-1 rounded-xl text-center transition-all flex flex-col items-center justify-center relative group ${
                            !hasData
                              ? 'opacity-30 cursor-not-allowed text-slate-400'
                              : isSelected
                              ? (isEmitidas
                                  ? 'bg-indigo-600 text-white shadow-sm font-bold'
                                  : 'bg-teal-700 text-white shadow-sm font-bold')
                              : 'text-slate-700 hover:bg-white hover:text-slate-900 hover:shadow-3xs cursor-pointer'
                          }`}
                        >
                          <span className="text-[11px] font-extrabold uppercase tracking-tight leading-tight">
                            {short}
                          </span>
                          <span
                            className={`text-[10px] font-mono leading-none mt-1 font-bold ${
                              isSelected
                                ? 'text-white/90'
                                : hasData
                                ? 'text-slate-500 group-hover:text-slate-900'
                                : 'text-slate-400'
                            }`}
                          >
                            {hasData ? count : '·'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="px-4 py-3 sm:px-5 border-b border-slate-200/80 bg-slate-50/70 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px] text-slate-500">calendar_today</span>
                  <span className="text-xs font-bold text-slate-700">
                    Mes Consultado: <strong className="text-slate-900">{MONTH_NAMES[parseInt(selectedMonth, 10) - 1] || selectedMonth} {selectedYear}</strong>
                  </span>
                </div>
                <span className="text-xs font-mono font-bold text-slate-600 bg-white border border-slate-200/90 px-2.5 py-1 rounded-lg shadow-3xs">
                  {registros.length} comprobante(s) encontrados
                </span>
              </div>
            )}

            {/* Barra de Filtro y Búsqueda */}
            <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/60">
              <div className="flex items-center gap-2 flex-1 min-w-[240px]">
                <span className="material-symbols-outlined text-slate-400 text-[18px]">search</span>
                <input
                  type="text"
                  placeholder="Buscar por Folio, RFC o Razón Social..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full bg-transparent text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none"
                />
              </div>

              {/* Indicador de Mes Activo y Filtro de Estado */}
              <div className="flex items-center gap-2 flex-wrap">
                {monthFilter !== 'all' && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/80">
                    <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                    <span>Mes: {monthFilter}</span>
                    <button
                      type="button"
                      onClick={() => setMonthFilter('all')}
                      title="Quitar filtro de mes y ver todo el año"
                      className="hover:text-indigo-950 cursor-pointer ml-0.5"
                    >
                      <span className="material-symbols-outlined text-[14px]">close</span>
                    </button>
                  </span>
                )}

                <div className="flex items-center gap-1.5 bg-slate-200/60 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter('all');
                      setCurrentPage(1);
                    }}
                    className={`px-3 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-all ${
                      statusFilter === 'all'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Todos ({filteredRegistros.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter('vigente');
                      setCurrentPage(1);
                    }}
                    className={`px-3 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-all ${
                      statusFilter === 'vigente'
                        ? 'bg-white text-emerald-700 shadow-2xs'
                        : 'text-slate-600 hover:text-emerald-700'
                    }`}
                  >
                    Vigentes ({kpiVigentes})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter('cancelado');
                      setCurrentPage(1);
                    }}
                    className={`px-3 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-all ${
                      statusFilter === 'cancelado'
                        ? 'bg-white text-rose-700 shadow-2xs'
                        : 'text-slate-600 hover:text-rose-700'
                    }`}
                  >
                    Cancelados ({kpiCancelados})
                  </button>
                </div>
              </div>
            </div>

            {/* Tabla */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200/80 bg-slate-50/90 text-slate-600 font-bold">
                    <th className="py-3 px-4">Folio Fiscal (UUID)</th>
                    <th className="py-3 px-4 text-center">Mes</th>
                    <th className="py-3 px-4">Fecha Emisión</th>
                    <th className="py-3 px-4">{isEmitidas ? 'Cliente / Receptor' : 'Proveedor / Emisor'}</th>
                    <th className="py-3 px-4">RFC</th>
                    <th className="py-3 px-4 text-right">Importe</th>
                    <th className="py-3 px-4 text-right">IVA al 16%</th>
                    <th className="py-3 px-4 text-right">Total</th>
                    <th className="py-3 px-4 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedRegistros.length === 0 ? (
                    <tr>
                      <td colSpan="9" className="py-8 text-center text-slate-400 font-medium">
                        No se encontraron comprobantes fiscales que coincidan con la búsqueda.
                      </td>
                    </tr>
                  ) : (
                    paginatedRegistros.map((item, idx) => {
                      const isVigente = item['Estado del Comprobante']?.toLowerCase().includes('vigente');
                      return (
                        <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 font-mono text-[11px] text-slate-700">
                            <div className="flex items-center gap-1.5">
                              <span title={item.Folio}>{item.Folio?.slice(0, 13)}...</span>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(item.Folio, `folio-${idx}`)}
                                title="Copiar folio completo"
                                className="text-slate-400 hover:text-slate-700 cursor-pointer"
                              >
                                <span className="material-symbols-outlined text-[14px]">
                                  {copiedField === `folio-${idx}` ? 'check' : 'content_copy'}
                                </span>
                              </button>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-bold ${
                                isEmitidas
                                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-100/90'
                                  : 'bg-teal-50 text-teal-700 border border-teal-100/90'
                              }`}
                            >
                              <span className="material-symbols-outlined text-[13px]">calendar_today</span>
                              {getItemMonth(item)}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                            {item['Fecha de Emisión'] || '--'}
                          </td>
                          <td className="py-3 px-4 font-semibold text-slate-900 max-w-[220px] truncate" title={item['Nombre o Razón Social']}>
                            {item['Nombre o Razón Social'] || 'Sin Nombre'}
                          </td>
                          <td className="py-3 px-4 font-mono text-[11px] text-slate-600">
                            {item.RFC || '--'}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-slate-700">
                            {formatCurrency(item.Importe)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-slate-700">
                            {formatCurrency(item['IVA al 16%'])}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                            {formatCurrency(item.Total)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                isVigente
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}
                            >
                              {item['Estado del Comprobante'] || 'Vigente'}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Paginación */}
            {totalPages > 1 && (
              <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>
                  Mostrando {(currentPage - 1) * itemsPerPage + 1} a{' '}
                  {Math.min(currentPage * itemsPerPage, filteredRegistros.length)} de{' '}
                  {filteredRegistros.length} registros
                </span>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 text-slate-700 font-bold cursor-pointer"
                  >
                    Anterior
                  </button>
                  <span className="font-mono text-slate-700 font-bold">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 text-slate-700 font-bold cursor-pointer"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
