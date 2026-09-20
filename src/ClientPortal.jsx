import React, { useState, useEffect, useRef, useMemo } from 'react';
import SatJourneyTracker, { SatDeliveryCompletedCard } from './SatJourneyTracker';
import FacturasProcessor from './FacturasProcessor';
import ContribuyenteHub from './ContribuyenteHub';
import ModuloWorkspace from './ModuloWorkspace';
import { MODULES_CONFIG } from './modulesConfig';

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

function CustomSelect({ label, value, onChange, options, icon }) {
  const [isOpen, setIsOpen] = useState(false);
  const selectRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (e) => {
      if (selectRef.current && !selectRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const selectedOption = options.find((o) => o.value === value) || options[0];

  return (
    <div className="flex flex-col gap-1.5 relative" ref={selectRef}>
      {label && <label className="text-xs font-semibold text-slate-700">{label}</label>}

      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full px-3.5 py-2.5 rounded-xl bg-white border text-xs font-semibold flex items-center justify-between transition-all duration-150 cursor-pointer shadow-2xs ${
          isOpen
            ? 'border-slate-400 ring-2 ring-slate-900/5 text-slate-900 shadow-sm'
            : 'border-slate-200 text-slate-800 hover:border-slate-300 hover:bg-slate-50/50'
        }`}
      >
        <div className="flex items-center gap-2 truncate">
          {icon && (
            <span className="material-symbols-outlined text-[17px] text-slate-400 shrink-0">
              {icon}
            </span>
          )}
          <span className="truncate">{selectedOption?.label}</span>
        </div>

        <span
          className={`material-symbols-outlined text-[18px] text-slate-400 transition-transform duration-200 shrink-0 ml-2 ${
            isOpen ? 'rotate-180 text-slate-700' : ''
          }`}
        >
          expand_more
        </span>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-white/95 backdrop-blur-xl rounded-xl shadow-[0_14px_36px_-4px_rgba(0,0,0,0.15),0_0_0_1px_rgba(0,0,0,0.06)] border border-slate-200/90 p-1.5 z-40 animate-in fade-in zoom-in-95 duration-150 max-h-60 overflow-y-auto">
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`w-full px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-between transition-all duration-150 cursor-pointer text-left ${
                  isSelected
                    ? 'bg-slate-900 text-white font-bold shadow-2xs'
                    : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100/80'
                }`}
              >
                <span className="truncate">{option.label}</span>
                {isSelected && (
                  <span className="material-symbols-outlined text-[16px] text-emerald-400 ml-2 shrink-0">
                    check
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const MONTH_NAMES = [
  "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
  "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"
];

export const CURRENT_YEAR = new Date().getFullYear();

export const yearOptions = Array.from(
  { length: Math.max(1, CURRENT_YEAR - 2010 + 1) },
  (_, idx) => {
    const y = String(CURRENT_YEAR - idx);
    let label = y;
    if (idx === 0) label = `${y} (Actual)`;
    else if (y === '2014') label = `${y} (Inicio Nómina CFDI)`;
    else if (y === '2010') label = `${y} (Límite Histórico SAT CFDI)`;
    return { value: y, label };
  }
);

/**
 * LiveClock
 * Reloj ejecutivo en tiempo real con fecha en español y hora en HH:MM:SS
 */
export function LiveClock() {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formattedDate = currentTime.toLocaleDateString('es-MX', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const formattedTime = currentTime.toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  return (
    <div className="hidden lg:inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100/90 border border-slate-200/80 text-slate-700 shadow-2xs select-none">
      <span className="material-symbols-outlined text-[16px] text-indigo-600 animate-pulse">
        schedule
      </span>
      <span className="text-[11px] font-medium capitalize text-slate-600">
        {formattedDate}
      </span>
      <span className="text-slate-300">•</span>
      <span className="text-[11px] font-mono font-bold text-slate-900 tracking-tight">
        {formattedTime}
      </span>
    </div>
  );
}

export const formatOptions = [
  { value: 'pdf', label: 'PDF' },
  { value: 'xml', label: 'XML' },
  { value: 'both', label: 'PDF + XML' },
];

function MonthCard({ name, status, desc, index = 0 }) {
  const isPartial = desc && desc.includes('/') && (() => {
    const parts = desc.split(' ')[0].split('/');
    return parts.length === 2 && parts[0] !== parts[1];
  })();

  const monthNumber = String(index + 1).padStart(2, '0');
  const formattedName = name ? name.charAt(0).toUpperCase() + name.slice(1).toLowerCase() : '';

  let cardBg = 'bg-white hover:bg-slate-50/70 border-slate-200/90 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.03)] hover:shadow-md hover:border-slate-300';
  let accentBar = 'bg-slate-200';
  let badgeEl = null;
  let mainContent = null;
  let footerTag = null;

  if (status === 'processing') {
    cardBg = 'bg-gradient-to-b from-indigo-50/80 via-white to-white border-indigo-300 shadow-md ring-2 ring-indigo-500/15';
    accentBar = 'bg-indigo-500 animate-pulse';
    badgeEl = (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider bg-indigo-100 text-indigo-700 border border-indigo-200 shadow-2xs">
        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping"></span>
        ACTIVO
      </span>
    );
    mainContent = (
      <div className="flex items-center gap-2.5 py-1">
        <div className="w-7 h-7 rounded-lg bg-indigo-100/70 text-indigo-600 flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold text-indigo-900 truncate">Descargando...</p>
          <p className="text-[10px] text-indigo-600 truncate">Extrayendo CFDI SAT</p>
        </div>
      </div>
    );
    footerTag = (
      <div className="flex items-center justify-between text-[10px] font-medium text-indigo-600 pt-1.5 border-t border-indigo-100/70">
        <span>Conexión abierta</span>
        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
      </div>
    );
  } else if (status === 'success') {
    cardBg = isPartial
      ? 'bg-gradient-to-b from-amber-50/50 via-white to-white border-amber-200/90 shadow-xs hover:border-amber-300 hover:shadow-md'
      : 'bg-gradient-to-b from-emerald-50/40 via-white to-white border-emerald-200/90 shadow-xs hover:border-emerald-300 hover:shadow-md';
    accentBar = isPartial ? 'bg-amber-500' : 'bg-emerald-500';
    badgeEl = (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider border shadow-2xs ${
        isPartial
          ? 'bg-amber-100/90 text-amber-800 border-amber-200'
          : 'bg-emerald-100/90 text-emerald-800 border-emerald-200'
      }`}>
        <span className="material-symbols-outlined text-[13px]">
          {isPartial ? 'warning' : 'check_circle'}
        </span>
        {isPartial ? 'PARCIAL' : 'COMPLETADO'}
      </span>
    );
    mainContent = (
      <div className="flex items-center gap-2.5 py-1">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 shadow-2xs ${
          isPartial
            ? 'bg-amber-100/80 text-amber-700'
            : 'bg-emerald-100/80 text-emerald-700'
        }`}>
          <span className="material-symbols-outlined text-[16px]">receipt_long</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black text-slate-900 truncate font-mono">
            {desc || 'Listo'}
          </p>
          <p className="text-[10px] text-slate-500 truncate">
            {isPartial ? 'Comprobantes (1 cancelado)' : 'Comprobantes fiscales'}
          </p>
        </div>
      </div>
    );
    footerTag = (
      <div className="flex items-center justify-between text-[10px] font-medium text-slate-500 pt-1.5 border-t border-slate-100">
        <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
          <span className="material-symbols-outlined text-[12px]">done_all</span>
          PDF + XML
        </span>
        <span className="text-slate-400 font-mono text-[9.5px]">SAT TIMBRADO</span>
      </div>
    );
  } else if (status === 'info') {
    cardBg = 'bg-slate-50/50 hover:bg-slate-50 border-slate-200/70 shadow-2xs';
    accentBar = 'bg-slate-300';
    badgeEl = (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wider bg-slate-100 text-slate-500 border border-slate-200">
        SIN DATOS
      </span>
    );
    mainContent = (
      <div className="flex items-center gap-2.5 py-1">
        <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-[15px]">folder_off</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold text-slate-600 truncate">0 Recibos</p>
          <p className="text-[10px] text-slate-400 truncate">Sin comprobantes timbrados</p>
        </div>
      </div>
    );
    footerTag = (
      <div className="flex items-center justify-between text-[10px] font-medium text-slate-400 pt-1.5 border-t border-slate-100">
        <span>Periodo vacío</span>
        <span className="font-mono text-[9.5px]">0 REGISTROS</span>
      </div>
    );
  } else if (status === 'error') {
    cardBg = 'bg-gradient-to-b from-rose-50/50 via-white to-white border-rose-200 shadow-2xs';
    accentBar = 'bg-rose-500';
    badgeEl = (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider bg-rose-100 text-rose-700 border border-rose-200">
        <span className="material-symbols-outlined text-[12px]">error</span>
        ERROR
      </span>
    );
    mainContent = (
      <div className="flex items-center gap-2.5 py-1">
        <div className="w-7 h-7 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-[15px]">warning</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold text-rose-800 truncate">Fallo en descarga</p>
          <p className="text-[10px] text-rose-500 truncate">{desc || 'Reintento pendiente'}</p>
        </div>
      </div>
    );
    footerTag = (
      <div className="flex items-center justify-between text-[10px] font-medium text-rose-600 pt-1.5 border-t border-rose-100">
        <span>Error en sesión SAT</span>
        <span className="font-mono text-[9.5px]">REINTENTAR</span>
      </div>
    );
  } else {
    // pending (En espera)
    cardBg = 'bg-white hover:bg-slate-50/50 border-slate-200/80 shadow-2xs hover:border-slate-300 hover:shadow-xs';
    accentBar = 'bg-slate-200 group-hover:bg-indigo-300';
    badgeEl = (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wider bg-slate-100/90 text-slate-500 border border-slate-200/60">
        <span className="material-symbols-outlined text-[12px] text-slate-400">schedule</span>
        EN ESPERA
      </span>
    );
    mainContent = (
      <div className="flex items-center gap-2.5 py-1">
        <div className="w-7 h-7 rounded-lg bg-slate-50 border border-slate-100 text-slate-400 flex items-center justify-center shrink-0 group-hover:bg-slate-100 transition-colors">
          <span className="material-symbols-outlined text-[15px]">hourglass_empty</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold text-slate-700 truncate">En cola de escaneo</p>
          <p className="text-[10px] text-slate-400 truncate">Listo para procesar</p>
        </div>
      </div>
    );
    footerTag = (
      <div className="flex items-center justify-between text-[10px] font-medium text-slate-400 pt-1.5 border-t border-slate-100/80">
        <span>Periodo mensual</span>
        <span className="font-mono text-[9.5px] text-slate-400">CFDI NÓMINA</span>
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border p-3.5 flex flex-col justify-between gap-2.5 transition-all duration-200 group ${cardBg}`}
    >
      {/* Barra superior de acento */}
      <div className={`absolute top-0 left-0 right-0 h-[2px] ${accentBar} transition-colors`} />

      {/* Fila Superior: Número + Mes + Badge */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono font-extrabold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200/70 shadow-3xs">
            {monthNumber}
          </span>
          <h4 className="text-xs font-black text-slate-900 tracking-tight">
            {formattedName}
          </h4>
        </div>
        <div>{badgeEl}</div>
      </div>

      {/* Área Central: Métrica y Estado */}
      <div>{mainContent}</div>

      {/* Franja Inferior: Metadatos */}
      <div>{footerTag}</div>
    </div>
  );
}

export default function ClientPortal({ client, onBack, onLogout }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSidebarPinned, setIsSidebarPinned] = useState(() => {
    try {
      return localStorage.getItem('firmavault_sidebar_pinned') === 'true';
    } catch (_) {
      return false;
    }
  });

  const toggleSidebarPin = () => {
    setIsSidebarPinned((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('firmavault_sidebar_pinned', String(next));
      } catch (_) {}
      return next;
    });
  };

  const [openAccordion, setOpenAccordion] = useState('extraccion'); // 'extraccion' | 'papeles' | 'auditoria' | null
  const [activeSection, setActiveSection] = useState('overview'); // 'overview' | 'nominas' | 'facturas' | etc.
  const [facturasKey, setFacturasKey] = useState(0);
  const [selectedYear, setSelectedYear] = useState(String(CURRENT_YEAR));
  const selectedType = 'nominas';
  const [selectedFormat, setSelectedFormat] = useState('both');
  const [selectedRole, setSelectedRole] = useState('emisor'); // 'emisor' (Patrón) | 'receptor' (Empleado)

  // Estado del Motor de Extracción
  const [jobStatus, setJobStatus] = useState('idle'); // 'idle' | 'running' | 'completed' | 'failed'
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState([]);
  const [monthStatus, setMonthStatus] = useState(
    Array(12).fill(null).map(() => ({ status: 'pending', desc: '--' }))
  );
  const [jobResult, setJobResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  const menuContainerRef = useRef(null);
  const menuButtonRef = useRef(null);
  const eventSourceRef = useRef(null);
  const deliveryCardRef = useRef(null);

  // Cargar estado inicial o reconectar ÚNICAMENTE si hay un proceso en ejecución
  useEffect(() => {
    if (!client?.id) return;

    let isMounted = true;
    authFetch(`/api/clients/${client.id}/nominas/status`)
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted || !data) return;
        // Solo si la extracción está activamente corriendo en el background se reconecta
        if (data.status === 'running') {
          if (data.year) setSelectedYear(String(data.year));
          setJobStatus('running');
          setProgress(data.progress || 0);
          if (data.logs) setLogs(data.logs);
          if (data.monthStatus) setMonthStatus(data.monthStatus);
          connectSSE();
        } else {
          // Si no está corriendo (incluso si hubo una descarga previa),
          // la pantalla inicia 100% limpia y lista para una nueva consulta
          setJobStatus('idle');
          setProgress(0);
          setLogs([]);
          setMonthStatus(Array(12).fill(null).map(() => ({ status: 'pending', desc: '--' })));
          setJobResult(null);
          setErrorMessage('');
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [client?.id]);

  const handleResetState = async () => {
    setJobStatus('idle');
    setProgress(0);
    setLogs([]);
    setMonthStatus(Array(12).fill(null).map(() => ({ status: 'pending', desc: '--' })));
    setJobResult(null);
    setErrorMessage('');
    try {
      await authFetch(`/api/clients/${client.id}/nominas/reset`, { method: 'POST' });
    } catch (_) {}
  };

  const connectSSE = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const token = getToken() || '';
    const sse = new EventSource(`/api/clients/${client.id}/nominas/stream?token=${encodeURIComponent(token)}`);
    eventSourceRef.current = sse;

    sse.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.year) setSelectedYear(String(payload.year));
        if (payload.result?.year) setSelectedYear(String(payload.result.year));
        if (payload.status) setJobStatus(payload.status);
        if (typeof payload.progress === 'number') setProgress(payload.progress);
        if (payload.monthStatus) setMonthStatus(payload.monthStatus);
        if (payload.logs) setLogs(payload.logs);
        if (payload.result) setJobResult(payload.result);
        if (payload.error) setErrorMessage(payload.error);

        if (payload.status === 'completed' || payload.status === 'failed') {
          sse.close();
        }
      } catch (err) {
        console.error('Error parseando evento SSE:', err);
      }
    };

    sse.onerror = () => {
      // Intento silencioso de reconexión o cierre si terminó
    };
  };

  const handleStartExtraction = async () => {
    setErrorMessage('');
    setJobResult(null);
    setProgress(0);
    setLogs([`Iniciando extracción automatizada de nóminas para el ejercicio ${selectedYear}...`]);
    setMonthStatus(Array(12).fill(null).map(() => ({ status: 'pending', desc: '--' })));
    setJobStatus('running');

    try {
      const res = await authFetch(`/api/clients/${client.id}/nominas/start`, {
        method: 'POST',
        body: JSON.stringify({ 
          year: selectedYear,
          format: selectedFormat,
          type: selectedType,
          role: selectedRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al iniciar la extracción en el SAT.');
      }
      connectSSE();
    } catch (err) {
      setJobStatus('failed');
      setErrorMessage(err.message);
      setLogs((prev) => [...prev, `❌ Error: ${err.message}`]);
    }
  };

  const handleStopExtraction = async () => {
    try {
      await authFetch(`/api/clients/${client.id}/nominas/stop`, { method: 'POST' });
      setJobStatus('failed');
      setErrorMessage('Extracción detenida por el usuario.');
    } catch (err) {
      console.error(err);
    }
  };

  const handleDownloadZip = () => {
    const token = getToken() || '';
    const currentFormat = jobResult?.format || selectedFormat || 'both';
    const downloadUrl = `/api/clients/${client.id}/nominas/download?year=${selectedYear}&format=${currentFormat}&token=${encodeURIComponent(token)}`;
    window.open(downloadUrl, '_blank');
  };

  // Close sidebar drawer on outside click
  useEffect(() => {
    if (!isMenuOpen) return;
    const handlePointerDown = (event) => {
      if (
        menuContainerRef.current &&
        !menuContainerRef.current.contains(event.target) &&
        (!menuButtonRef.current || !menuButtonRef.current.contains(event.target))
      ) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isMenuOpen]);

  // Handle ESC key to close drawer
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsMenuOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const toggleAccordion = (id) => {
    setOpenAccordion((prev) => (prev === id ? null : id));
  };

  const handleToggleMenu = (e) => {
    e.stopPropagation();
    setIsMenuOpen((prev) => {
      const next = !prev;
      if (next && !openAccordion) {
        setOpenAccordion('extraccion');
      }
      return next;
    });
  };

  // Módulos e ítems activos para el breadcrumb superior e indicadores visuales
  const activeModule = useMemo(() => {
    if (activeSection === 'overview') return null;
    return MODULES_CONFIG.find((mod) => mod.items.some((i) => i.id === activeSection)) || null;
  }, [activeSection]);

  const activeItem = useMemo(() => {
    if (activeSection === 'overview') return null;
    for (const mod of MODULES_CONFIG) {
      const it = mod.items.find((i) => i.id === activeSection);
      if (it) return it;
    }
    return null;
  }, [activeSection]);

  const activeModuleTitle = useMemo(() => {
    if (activeSection === 'overview') return 'Portal del Cliente';
    return activeModule?.title || 'Herramientas';
  }, [activeSection, activeModule]);

  const activeItemTitle = useMemo(() => {
    if (activeSection === 'overview') return 'Hub Principal';
    return activeItem?.title || 'Operaciones';
  }, [activeSection, activeItem]);

  // Hitos de telemetría y seguridad del SAT
  const isAuthStarted = logs.some(
    (l) =>
      l.includes('Iniciando extracción') ||
      l.includes('Usando navegador') ||
      l.includes('Conectando al portal del SAT') ||
      l.includes('Autenticando con e.firma') ||
      l.includes('Validando credenciales')
  );

  const isAuthSuccess = logs.some(
    (l) =>
      l.includes('Autenticación exitosa') ||
      l.includes('ConsultaReceptor') ||
      l.includes('Consultando CFDI') ||
      l.includes('recibos de nómina') ||
      l.includes('Descargado') ||
      l.includes('Descargando') ||
      l.includes('Sin comprobantes')
  );

  const isSatReady = logs.some(
    (l) =>
      l.includes('Comprobantes Recibidos') ||
      l.includes('ConsultaReceptor') ||
      l.includes('Consultando CFDI') ||
      l.includes('recibos de nómina') ||
      l.includes('Descargado') ||
      l.includes('Descargando')
  );

  const isExtractionDone =
    progress === 100 ||
    logs.some(
      (l) =>
        l.includes('Generando reporte Excel') ||
        l.includes('Proceso finalizado con éxito') ||
        l.includes('Comprimiendo') ||
        l.includes('ZIP')
    );

  const isCompleted =
    jobStatus === 'completed' ||
    logs.some((l) => l.includes('Proceso finalizado') || l.includes('ZIP'));

  // Auto-scroll suave a la tarjeta de entrega final cuando termina el proceso
  useEffect(() => {
    if (isCompleted && deliveryCardRef.current) {
      const timer = setTimeout(() => {
        deliveryCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [isCompleted]);

  const isMoral = client?.rfc && client.rfc.length === 12;
  const initials = client?.name
    ? client.name
        .split(' ')
        .filter(Boolean)
        .map((n) => n[0])
        .join('')
        .substring(0, 2)
        .toUpperCase()
    : 'CL';

  return (
    <div className={`min-h-screen bg-slate-50/60 flex flex-col relative transition-all duration-300 ${isSidebarPinned ? 'xl:pl-84 sm:xl:pl-96' : ''}`}>
      {/* SIDEBAR DRAWER (ESTILO STRIPE / LINEAR / VERCEL CON MODO FIJO EN ESCRITORIO) */}
      {/* Backdrop (solo activo en móvil/tablet o si el menú no está anclado en pantalla) */}
      <div
        className={`fixed inset-0 bg-slate-950/45 backdrop-blur-xs z-50 transition-opacity duration-300 ease-out ${
          isSidebarPinned
            ? 'xl:hidden ' + (isMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none')
            : (isMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none')
        }`}
        onClick={() => setIsMenuOpen(false)}
        aria-hidden="true"
      />

      {/* Drawer / Sidebar Off-Canvas o Fijo en Desktop */}
      <aside
        ref={menuContainerRef}
        aria-label="Panel lateral de navegación"
        className={`fixed inset-y-0 left-0 w-84 sm:w-96 bg-white/98 backdrop-blur-2xl border-r border-slate-200/90 z-50 flex flex-col justify-between transform transition-all duration-300 ease-out ${
          isSidebarPinned
            ? 'translate-x-0 xl:shadow-xs shadow-[0_20px_60px_-15px_rgba(0,0,0,0.25)]'
            : (isMenuOpen ? 'translate-x-0 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.25)]' : '-translate-x-full shadow-none')
        }`}
      >
        {/* PARTE SUPERIOR Y HERRAMIENTAS */}
        <div className="flex flex-col flex-1 overflow-y-auto">
          {/* Header del Drawer con botón de Anclaje Desktop */}
          <div className="p-5 pb-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-slate-900 via-indigo-950 to-indigo-700 flex items-center justify-center text-white shadow-sm font-black text-xs tracking-wider">
                FV
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-sm text-slate-900 tracking-tight">FirmaVault</span>
                  <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-100">SAT</span>
                </div>
                <p className="text-[11px] text-slate-400 font-medium">Portal de Operaciones</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {/* Botón para fijar / anclar en desktop */}
              <button
                type="button"
                onClick={toggleSidebarPin}
                className={`hidden xl:inline-flex w-8 h-8 rounded-xl items-center justify-center transition-all cursor-pointer ${
                  isSidebarPinned
                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/90 shadow-3xs'
                    : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                }`}
                title={isSidebarPinned ? "Desanclar menú lateral de la pantalla" : "Fijar menú lateral permanente en pantalla"}
              >
                <span className="material-symbols-outlined text-[19px]">
                  {isSidebarPinned ? 'push_pin' : 'dock_to_left'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (isSidebarPinned) {
                    setIsSidebarPinned(false);
                    try { localStorage.setItem('firmavault_sidebar_pinned', 'false'); } catch (_) {}
                  }
                  setIsMenuOpen(false);
                }}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer group"
                title="Cerrar panel (Esc)"
              >
                <span className="material-symbols-outlined text-[20px] group-hover:rotate-90 transition-transform duration-200">
                  close
                </span>
              </button>
            </div>
          </div>

          {/* 3 Módulos Contables en Acordeones Exclusivos */}
          <div className="p-4 flex-1 overflow-y-auto space-y-3">
            {MODULES_CONFIG.map((mod) => {
              const isOpen = openAccordion === mod.id;
              const hasActiveItem = mod.items.some((it) => it.id === activeSection);

              return (
                <div key={mod.id} className="flex flex-col">
                  {/* Cabecera del Acordeón Principal */}
                  <button
                    type="button"
                    onClick={() => toggleAccordion(mod.id)}
                    aria-expanded={isOpen}
                    className={`w-full flex items-center justify-between p-3 rounded-2xl border transition-all cursor-pointer select-none ${
                      isOpen
                        ? mod.accentColor === 'indigo'
                          ? 'bg-indigo-50/90 border-indigo-200/90 text-slate-900 shadow-xs ring-1 ring-indigo-500/10'
                          : mod.accentColor === 'teal'
                          ? 'bg-teal-50/90 border-teal-200/90 text-slate-900 shadow-xs ring-1 ring-teal-500/10'
                          : 'bg-amber-50/90 border-amber-200/90 text-slate-900 shadow-xs ring-1 ring-amber-500/10'
                        : hasActiveItem
                        ? 'bg-slate-100/90 hover:bg-slate-200/80 text-slate-900 border-slate-300 shadow-3xs'
                        : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-200/90 shadow-2xs'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all ${
                          isOpen
                            ? mod.accentColor === 'indigo'
                              ? 'bg-indigo-600 text-white shadow-xs'
                              : mod.accentColor === 'teal'
                              ? 'bg-teal-600 text-white shadow-xs'
                              : 'bg-amber-600 text-white shadow-xs'
                            : mod.accentColor === 'indigo'
                            ? 'bg-indigo-50 border border-indigo-100 text-indigo-600'
                            : mod.accentColor === 'teal'
                            ? 'bg-teal-50 border border-teal-100 text-teal-700'
                            : 'bg-amber-50 border border-amber-100 text-amber-700'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[19px]">{mod.icon}</span>
                      </div>
                      <div className="text-left min-w-0">
                        <span className={`text-xs font-extrabold tracking-tight block truncate ${
                          isOpen
                            ? mod.accentColor === 'indigo'
                              ? 'text-indigo-950 font-black'
                              : mod.accentColor === 'teal'
                              ? 'text-teal-950 font-black'
                              : 'text-amber-950 font-black'
                            : 'text-slate-900'
                        }`}>
                          {mod.title}
                        </span>
                        <span
                          className={`text-[10px] font-semibold block truncate ${
                            isOpen
                              ? mod.accentColor === 'indigo'
                                ? 'text-indigo-600'
                                : mod.accentColor === 'teal'
                                ? 'text-teal-700'
                                : 'text-amber-700'
                              : 'text-slate-400'
                          }`}
                        >
                          {mod.menuLabel}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition-colors ${
                          isOpen
                            ? mod.accentColor === 'indigo'
                              ? 'bg-indigo-100/90 border-indigo-200 text-indigo-700'
                              : mod.accentColor === 'teal'
                              ? 'bg-teal-100/90 border-teal-200 text-teal-800'
                              : 'bg-amber-100/90 border-amber-200 text-amber-800'
                            : 'bg-slate-100 border-slate-200/80 text-slate-500'
                        }`}
                      >
                        {mod.items.length}
                      </span>
                      <span
                        className={`material-symbols-outlined text-[20px] transition-transform duration-200 ${
                          isOpen
                            ? mod.accentColor === 'indigo'
                              ? 'rotate-180 text-indigo-600'
                              : mod.accentColor === 'teal'
                              ? 'rotate-180 text-teal-700'
                              : 'rotate-180 text-amber-700'
                            : 'text-slate-400'
                        }`}
                      >
                        expand_more
                      </span>
                    </div>
                  </button>

                  {/* Sub-opciones desplegables agrupadas */}
                  {isOpen && (
                    <div className={`mt-2 p-2 rounded-2xl border space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-150 ${
                      mod.accentColor === 'indigo'
                        ? 'bg-indigo-50/30 border-indigo-100/80'
                        : mod.accentColor === 'teal'
                        ? 'bg-teal-50/30 border-teal-100/80'
                        : 'bg-amber-50/30 border-amber-100/80'
                    }`}>
                      {mod.items.map((item) => {
                        const isSelected = activeSection === item.id;

                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              setActiveSection(item.id);
                              if (item.id === 'facturas') {
                                setFacturasKey((prev) => prev + 1);
                              }
                              // En desktop con barra anclada, mantener abierto para navegación continua
                              if (!isSidebarPinned || window.innerWidth < 1280) {
                                setIsMenuOpen(false);
                              }
                            }}
                            className={`w-full text-left p-2.5 rounded-xl border transition-all cursor-pointer group ${
                              isSelected
                                ? mod.accentColor === 'indigo'
                                  ? 'bg-white border-indigo-300 shadow-xs ring-2 ring-indigo-500/15'
                                  : mod.accentColor === 'teal'
                                  ? 'bg-white border-teal-300 shadow-xs ring-2 ring-teal-500/15'
                                  : 'bg-white border-amber-300 shadow-xs ring-2 ring-amber-500/15'
                                : 'bg-white hover:bg-slate-50/90 border-slate-200/80 hover:border-slate-300 shadow-3xs'
                            }`}
                          >
                            <div className="flex items-start gap-2.5">
                              <div
                                className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                                  isSelected
                                    ? mod.accentColor === 'indigo'
                                      ? 'bg-indigo-600 text-white shadow-xs'
                                      : mod.accentColor === 'teal'
                                      ? 'bg-teal-600 text-white shadow-xs'
                                      : 'bg-amber-600 text-white shadow-xs'
                                    : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200 group-hover:text-slate-800'
                                }`}
                              >
                                <span className="material-symbols-outlined text-[16px]">{item.icon}</span>
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-1">
                                  <span
                                    className={`text-xs font-bold leading-tight ${
                                      isSelected
                                        ? mod.accentColor === 'indigo'
                                          ? 'text-indigo-950 font-black'
                                          : mod.accentColor === 'teal'
                                          ? 'text-teal-950 font-black'
                                          : 'text-amber-950 font-black'
                                        : 'text-slate-800 group-hover:text-slate-950'
                                    }`}
                                  >
                                    {item.title}
                                  </span>
                                  {isSelected && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                                  )}
                                </div>

                                <p className="text-[11px] text-slate-500 mt-0.5 leading-snug line-clamp-2">
                                  {item.description}
                                </p>

                                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                  {item.badges.map((b, bi) => (
                                    <span
                                      key={bi}
                                      className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                                        b === 'Nuevo'
                                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold'
                                          : 'bg-slate-100 text-slate-600 border border-slate-200/60'
                                      }`}
                                    >
                                      {b}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* FOOTER DEL DRAWER */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/60">
          <button
            type="button"
            onClick={() => {
              setIsMenuOpen(false);
              onBack?.();
            }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            <span>Volver a Contribuyentes</span>
          </button>
        </div>
      </aside>

      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xl border-b border-slate-200/80 shadow-[0_1px_4px_-1px_rgba(0,0,0,0.03),0_4px_16px_-4px_rgba(0,0,0,0.02)]">
        <div className="h-[2px] w-full bg-gradient-to-r from-slate-900 via-indigo-600 to-slate-900" />

        <div className="max-w-[1560px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* LADO IZQUIERDO: Menú Hamburguesa + Marca + Breadcrumb */}
          <div className="flex items-center gap-3 sm:gap-4">
            <button
              ref={menuButtonRef}
              type="button"
              onClick={handleToggleMenu}
              title={isMenuOpen ? "Cerrar menú" : "Abrir menú de herramientas"}
              aria-label="Menú principal"
              aria-expanded={isMenuOpen}
              className={`inline-flex items-center justify-center w-9 h-9 rounded-xl border transition-all duration-150 cursor-pointer shadow-2xs focus:outline-none ${
                isMenuOpen
                  ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                  : 'bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 border-slate-200/90'
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">
                {isMenuOpen ? 'close' : 'menu'}
              </span>
            </button>

            {/* Separador vertical */}
            <div className="h-5 w-[1px] bg-slate-200" />

            {/* Marca y Breadcrumb Interactivo */}
            <nav aria-label="Ruta de navegación" className="flex items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={onBack}
                title="Ir al Directorio de Contribuyentes"
                className="flex items-center gap-1.5 hover:opacity-80 transition-opacity cursor-pointer group text-left"
              >
                <span className="text-[14px] sm:text-[15px] font-black tracking-[-0.03em] text-slate-900 group-hover:text-indigo-600 transition-colors">
                  Firma<span className="font-light text-slate-500">Vault</span>
                </span>
                <span className="text-[10px] font-bold tracking-widest text-indigo-600 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-100">
                  SAT
                </span>
              </button>

              <span className="text-slate-300 select-none text-xs">/</span>

              <button
                type="button"
                onClick={() => setActiveSection('overview')}
                title="Ir al Hub de Herramientas"
                className={`text-xs font-semibold transition-colors cursor-pointer px-1.5 py-0.5 rounded-md hover:bg-slate-100 ${
                  activeSection === 'overview'
                    ? 'text-slate-900 font-bold bg-slate-100/70'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Portal
              </button>

              {activeSection !== 'overview' && activeItem && (
                <>
                  <span className="text-slate-300 select-none text-xs">/</span>
                  <div
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold shadow-2xs ${
                      activeModule?.accentColor === 'indigo'
                        ? 'bg-indigo-50/90 text-indigo-800 border-indigo-200/80'
                        : activeModule?.accentColor === 'teal'
                        ? 'bg-teal-50/90 text-teal-800 border-teal-200/80'
                        : activeModule?.accentColor === 'amber'
                        ? 'bg-amber-50/90 text-amber-900 border-amber-200/80'
                        : 'bg-slate-100 text-slate-800 border-slate-200'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[15px]">
                      {activeItem.icon}
                    </span>
                    <span className="truncate max-w-[130px] sm:max-w-[200px]">
                      {activeItem.title}
                    </span>
                  </div>
                </>
              )}
            </nav>
          </div>

          {/* LADO DERECHO: Reloj en vivo + Tarjeta de Cliente Activo + Volver */}
          <div className="flex items-center gap-2 sm:gap-3">
            <LiveClock />

            <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-slate-100/70 border border-slate-200/80 shadow-2xs">
              {client?.photo ? (
                <img
                  src={client.photo}
                  alt={client.name}
                  className="w-8 h-8 rounded-lg object-cover ring-1 ring-slate-200 shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-800 to-slate-900 text-white font-bold text-xs flex items-center justify-center shadow-2xs shrink-0">
                  {initials}
                </div>
              )}

              <div className="flex flex-col text-left">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-800 max-w-[120px] sm:max-w-[190px] truncate leading-tight">
                    {client?.name || 'Cliente'}
                  </span>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10.5px] font-mono text-slate-500 leading-tight">
                    {client?.rfc || 'Sin RFC'}
                  </span>
                  <span
                    className={`inline-block px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider ${
                      isMoral
                        ? 'bg-slate-200/70 text-slate-600'
                        : 'bg-blue-100/80 text-blue-700'
                    }`}
                  >
                    {isMoral ? 'Moral' : 'Física'}
                  </span>
                </div>
              </div>
            </div>

            <div className="hidden sm:block h-6 w-[1px] bg-slate-200" />

            <button
              onClick={() => {
                if (activeSection === 'analisis_iva_isr' && client?.id) {
                  try {
                    const token = localStorage.getItem('firmavault_token');
                    if (token) {
                      fetch(`/api/clients/${client.id}/analisis-iva-isr/sync-cancel`, {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${token}` },
                        keepalive: true,
                      }).catch(() => {});
                    }
                  } catch (e) {}
                }
                if (activeSection !== 'overview') {
                  setActiveSection('overview');
                } else {
                  onBack();
                }
              }}
              title={activeSection !== 'overview' ? "Volver al Hub de Herramientas" : "Volver al Directorio de Contribuyentes"}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200/90 bg-white hover:bg-slate-50 hover:border-slate-300 text-slate-700 hover:text-slate-900 text-xs font-bold transition-all shadow-2xs hover:shadow-xs cursor-pointer active:scale-95 shrink-0"
            >
              <span className="material-symbols-outlined text-[17px] text-slate-400 group-hover:text-slate-600">
                {activeSection !== 'overview' ? 'grid_view' : 'arrow_back'}
              </span>
              <span className="hidden sm:inline">
                {activeSection !== 'overview' ? 'Hub' : 'Directorio'}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area: VISTA PRINCIPAL O HERRAMIENTA SELECCIONADA */}
      <main className="flex-1 max-w-[1560px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-6">
        {activeSection === 'overview' ? (
          <ContribuyenteHub
            client={client}
            onSelectSection={(section) => {
              setActiveSection(section);
              if (section === 'facturas') {
                setFacturasKey((prev) => prev + 1);
              }
            }}
          />
        ) : (
          <>
            {activeSection === 'nominas' ? (
              <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.03),0_1px_3px_rgba(0,0,0,0.02)] flex flex-col gap-6 relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-600" />

                {/* Header del Panel */}
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-2.5">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border bg-emerald-50 text-emerald-700 border-emerald-200/80">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      Herramientas Fiscales
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      Contribuyente: {client?.rfc || 'Sin RFC'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                    <span className="material-symbols-outlined text-[16px] text-emerald-500">verified</span>
                    <span>Motor de Extracción SAT Nóminas v2</span>
                  </div>
                </div>

                <div>
                  <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
                    Descarga Automatizada de Nóminas (CFDI)
                  </h1>
                  <p className="text-sm text-slate-600 leading-relaxed max-w-3xl mt-2 font-normal">
                    Extracción automática de comprobantes fiscales de nómina (CFDI) en PDF y XML directamente desde el portal del SAT para <strong className="text-slate-800 font-semibold">{client?.name}</strong>, utilizando su firma electrónica (.cer, .key y contraseña) registrada en el sistema.
                  </p>
                </div>

                {/* Formulario de Criterios */}
                <div className="bg-slate-50/80 rounded-2xl border border-slate-200/70 p-5 flex flex-col gap-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px] text-slate-500">tune</span>
                      Criterios de Extracción
                    </h3>
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 rounded-full shadow-2xs">
                      <span className="material-symbols-outlined text-[13px]">receipt_long</span>
                      Filtro Activo: Solo Nóminas (CFDI Sueldos y Asimilados)
                    </span>
                  </div>

                  {/* Selector de Rol Fiscal: Patrón (Emitidas) vs Empleado (Recibidas) */}
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px] text-teal-600">manage_accounts</span>
                      <span>Rol del Contribuyente en Nómina:</span>
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setSelectedRole('emisor')}
                        disabled={jobStatus === 'running'}
                        className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                          selectedRole === 'emisor'
                            ? 'bg-emerald-50/80 border-emerald-500 ring-2 ring-emerald-500/20 shadow-xs'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                          selectedRole === 'emisor' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'
                        }`}>
                          <span className="material-symbols-outlined text-[18px]">domain</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-black text-slate-900">Soy Patrón (Nómina Emitida)</span>
                            {selectedRole === 'emisor' && (
                              <span className="material-symbols-outlined text-[16px] text-emerald-600 font-bold">check_circle</span>
                            )}
                          </div>
                          <p className="text-[10.5px] text-slate-500 mt-0.5 leading-snug">
                            Descarga los comprobantes timbrados a los trabajadores de la empresa (Consulta Emisor).
                          </p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSelectedRole('receptor')}
                        disabled={jobStatus === 'running'}
                        className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                          selectedRole === 'receptor'
                            ? 'bg-indigo-50/80 border-indigo-500 ring-2 ring-indigo-500/20 shadow-xs'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                          selectedRole === 'receptor' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                        }`}>
                          <span className="material-symbols-outlined text-[18px]">badge</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-black text-slate-900">Soy Empleado (Nómina Recibida)</span>
                            {selectedRole === 'receptor' && (
                              <span className="material-symbols-outlined text-[16px] text-indigo-600 font-bold">check_circle</span>
                            )}
                          </div>
                          <p className="text-[10.5px] text-slate-500 mt-0.5 leading-snug">
                            Descarga los recibos de nómina que te timbró tu empleador (Consulta Receptor).
                          </p>
                        </div>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <CustomSelect
                      label="Ejercicio Fiscal"
                      value={selectedYear}
                      onChange={setSelectedYear}
                      options={yearOptions}
                      icon="calendar_month"
                    />

                    <CustomSelect
                      label="Formato de Entrega"
                      value={selectedFormat}
                      onChange={setSelectedFormat}
                      options={formatOptions}
                      icon="folder_zip"
                    />
                  </div>

                  {/* Barra de acción principal */}
                  <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-200/60">
                    <div className="flex items-center gap-2 text-[11.5px] text-slate-600">
                      <span className="material-symbols-outlined text-[16px] text-indigo-500">vpn_key</span>
                      <span>
                        Autenticación directa con e.firma de <strong>{client?.rfc}</strong>.
                      </span>
                    </div>

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
                        disabled={jobStatus === 'running'}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-60 active:scale-95"
                      >
                        {jobStatus === 'running' ? (
                          <>
                            <span className="material-symbols-outlined text-[18px] animate-spin text-emerald-400">
                              progress_activity
                            </span>
                            <span>Extrayendo Nóminas del SAT...</span>
                          </>
                        ) : (
                          <>
                            <span className="material-symbols-outlined text-[18px] text-emerald-400">play_arrow</span>
                            <span>Iniciar Extracción Automatizada</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* MENSAJES DE ERROR SI LOS HAY */}
                {errorMessage && (
                  <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold rounded-xl flex items-start gap-3">
                    <span className="material-symbols-outlined text-[20px] text-rose-600 shrink-0">error</span>
                    <div className="flex-1">
                      <p className="font-bold">Error en la extracción:</p>
                      <p className="mt-0.5 font-mono text-[11px] text-rose-700">{errorMessage}</p>
                    </div>
                  </div>
                )}

                {/* RASTREO ANIMADO ESTILO DIDI / UBER EATS */}
                {(jobStatus === 'running' || jobStatus === 'completed' || logs.length > 0) && (
                  <SatJourneyTracker
                    jobStatus={jobStatus}
                    progress={progress}
                    client={client}
                    selectedYear={selectedYear}
                    isAuthStarted={isAuthStarted}
                    isAuthSuccess={isAuthSuccess}
                    isSatReady={isSatReady}
                    isExtractionDone={isExtractionDone}
                    isCompleted={isCompleted}
                    jobResult={jobResult}
                    selectedFormat={jobResult?.format || selectedFormat}
                  />
                )}

                {/* MATRIZ DE 12 MESES (DISEÑO CLEAN EXECUTIVE TOP-TIER) */}
                <div className="bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-7 flex flex-col gap-5 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.04)]">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-slate-900 via-indigo-950 to-indigo-700 flex items-center justify-center text-white shadow-sm">
                        <span className="material-symbols-outlined text-[20px]">calendar_month</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">
                            Matriz de Nóminas por Mes
                          </h3>
                          <span className="text-[10px] font-mono font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md">
                            Ejercicio {selectedYear}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 font-normal mt-0.5">
                          Monitoreo en tiempo real de timbrado y desglose mensual de comprobantes ante el SAT
                        </p>
                      </div>
                    </div>

                    {/* Porcentaje y progreso */}
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-extrabold border bg-emerald-50 text-emerald-800 border-emerald-200 shadow-2xs">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        {progress}% COMPLETADO
                      </span>
                    </div>
                  </div>

                  {/* Barra de progreso visual corporativa */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 px-0.5">
                      <span>Progreso de escaneo y extracción anual</span>
                      <span className="font-mono text-slate-700 font-bold">{progress}% de 100%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden border border-slate-200/80 p-0.5">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-600 via-teal-500 to-emerald-500 rounded-full transition-all duration-300 ease-out shadow-xs"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  {/* Grid de 12 Meses */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5 pt-1">
                    {MONTH_NAMES.map((name, idx) => {
                      const item = monthStatus[idx] || { status: 'pending', desc: '--' };
                      return (
                        <MonthCard
                          key={name}
                          name={name}
                          index={idx}
                          status={item.status}
                          desc={item.desc}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* AL FINAL: PAQUETE DE NÓMINAS ENTREGADO Y DESCARGA (PASO 4) */}
                {isCompleted && (
                  <div ref={deliveryCardRef} className="scroll-mt-6">
                    <SatDeliveryCompletedCard
                      client={client}
                      selectedYear={selectedYear}
                      jobResult={jobResult}
                      selectedFormat={jobResult?.format || selectedFormat}
                      onDownloadZip={handleDownloadZip}
                      onReset={handleResetState}
                    />
                  </div>
                )}

                {/* Franja de pie */}
                <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500 font-medium">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span>
                      FirmaVault SAT • Módulo de Extracción de Nóminas Autónomo
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400">
                    CDP Headless Browser • Chromium/Brave Engine
                  </span>
                </div>
              </div>
            ) : activeSection === 'facturas' ? (
              <FacturasProcessor
                key={`facturas-${client?.id}-${facturasKey}`}
                client={client}
              />
            ) : (
              <ModuloWorkspace
                key={`modulo-${activeSection}-${client?.id}`}
                section={activeSection}
                client={client}
                onBackToHub={() => setActiveSection('overview')}
                onOpenFacturas={() => {
                  setActiveSection('facturas');
                  setFacturasKey((prev) => prev + 1);
                }}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
