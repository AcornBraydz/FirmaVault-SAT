import React, { useState } from 'react';
import { MODULES_CONFIG } from './modulesConfig';

function formatDate(dateString) {
  if (!dateString) return 'Sin fecha';
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return 'Fecha inválida';
  return d.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function getVigencia(validTo) {
  if (!validTo) return { days: 0, text: 'No disponible', status: 'error' };
  const expiry = new Date(validTo);
  const now = new Date();
  const diffDays = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return { days: diffDays, text: 'Certificado Vencido', status: 'error' };
  if (diffDays <= 30) return { days: diffDays, text: `${diffDays} días restantes (Urgente)`, status: 'warning' };
  return { days: diffDays, text: `${diffDays} días de vigencia restante`, status: 'ok' };
}

export default function ContribuyenteHub({ client, onSelectSection }) {
  const [copiedField, setCopiedField] = useState(null);

  const isMoral = client?.rfc?.length === 12;
  const vigencia = getVigencia(client?.validTo);
  const initials = client?.name
    ? client.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
    : 'CL';

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedField(id);
    setTimeout(() => setCopiedField(null), 1800);
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-200">
      {/* HERO BANNER: PERFIL EJECUTIVO DEL CONTRIBUYENTE */}
      <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.04),0_1px_3px_rgba(0,0,0,0.02)] relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-600 via-teal-500 to-emerald-500" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          {/* Datos principales */}
          <div className="flex items-start sm:items-center gap-4 sm:gap-5">
            {client?.photo ? (
              <img
                src={client.photo}
                alt={client.name}
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover ring-2 ring-slate-200 shadow-sm shrink-0"
              />
            ) : (
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white font-extrabold text-xl sm:text-2xl flex items-center justify-center shadow-sm shrink-0 tracking-tight">
                {initials}
              </div>
            )}

            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                    isMoral
                      ? 'bg-slate-200/80 text-slate-700'
                      : 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                  }`}
                >
                  {isMoral ? 'Persona Moral' : 'Persona Física'}
                </span>

                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  e.Firma Verificada en Bóveda
                </span>
              </div>

              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 leading-tight">
                {client?.name || 'Contribuyente SAT'}
              </h1>

              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 mt-1 font-medium">
                <div className="flex items-center gap-1 font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md">
                  <span>{client?.rfc || 'Sin RFC'}</span>
                  {client?.rfc && (
                    <button
                      type="button"
                      onClick={() => copyToClipboard(client.rfc, 'rfc')}
                      title="Copiar RFC"
                      className="text-slate-400 hover:text-slate-700 transition-colors ml-1 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[14px]">
                        {copiedField === 'rfc' ? 'check' : 'content_copy'}
                      </span>
                    </button>
                  )}
                </div>

                {client?.email && (
                  <div className="flex items-center gap-1 text-slate-500">
                    <span className="material-symbols-outlined text-[15px] text-slate-400">mail</span>
                    <span>{client.email}</span>
                  </div>
                )}

                {client?.curp && !isMoral && (
                  <div className="flex items-center gap-1 text-slate-500 font-mono text-[11px]">
                    <span className="material-symbols-outlined text-[15px] text-slate-400">badge</span>
                    <span>CURP: {client.curp}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Tarjeta de Vigencia e Indicador de Certificado */}
          <div className="bg-slate-50/90 rounded-2xl border border-slate-200/90 p-4 sm:p-5 flex flex-col justify-between gap-3 min-w-[260px]">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">
                Estado de la e.Firma
              </span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                vigencia.status === 'ok'
                  ? 'bg-emerald-100/80 text-emerald-800'
                  : vigencia.status === 'warning'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-rose-100 text-rose-800'
              }`}>
                <span className="material-symbols-outlined text-[13px]">
                  {vigencia.status === 'ok' ? 'verified' : 'warning'}
                </span>
                {vigencia.days > 0 ? `${vigencia.days} días` : 'Vencido'}
              </span>
            </div>

            <div>
              <div className="text-sm font-bold text-slate-800">
                Vence el {formatDate(client?.validTo)}
              </div>
              <div className="text-[11px] font-mono text-slate-500 truncate mt-0.5" title={client?.certSerialNumber}>
                Serie: {client?.certSerialNumber || 'Certificado Oficial SAT'}
              </div>
            </div>

            <div className="w-full bg-slate-200/80 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full"
                style={{ width: `${Math.min(100, Math.max(10, (vigencia.days / 1460) * 100))}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 3 MÓDULOS DE TRABAJO CONTABLE */}
      <div className="flex flex-col gap-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-200/80 pb-3">
          <div>
            <h2 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
              <span className="material-symbols-outlined text-indigo-600 text-[22px]">hub</span>
              Ecosistema de Módulos y Herramientas SAT
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Flujo de trabajo integral: desde la obtención en crudo hasta reportes de declaración y auditoría contra listas negras.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-500 font-mono bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-full">
              3 MÓDULOS
            </span>
            <span className="text-[11px] font-bold text-indigo-700 font-mono bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-full">
              {MODULES_CONFIG.reduce((acc, m) => acc + m.items.length, 0)} HERRAMIENTAS
            </span>
          </div>
        </div>

        {MODULES_CONFIG.map((mod) => (
          <div key={mod.id} className="flex flex-col gap-3.5">
            {/* Header del Módulo */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                  mod.id === 'extraccion' ? 'bg-indigo-600 text-white shadow-xs' :
                  mod.id === 'papeles' ? 'bg-teal-600 text-white shadow-xs' :
                  'bg-amber-600 text-white shadow-xs'
                }`}>
                  <span className="material-symbols-outlined text-[18px]">{mod.icon}</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide">
                      {mod.title}
                    </h3>
                    <span className="text-[10px] text-slate-400 font-semibold hidden sm:inline">•</span>
                    <span className="text-xs text-slate-500 font-medium hidden sm:inline">{mod.subtitle}</span>
                  </div>
                </div>
              </div>
              <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${mod.badgeColor}`}>
                {mod.items.length} {mod.items.length === 1 ? 'herramienta' : 'herramientas'}
              </span>
            </div>

            {/* Grid de herramientas del módulo */}
            <div className={`grid grid-cols-1 ${
              mod.items.length >= 3 ? 'md:grid-cols-2 lg:grid-cols-3' : 'md:grid-cols-2'
            } gap-4`}>
              {mod.items.map((item) => {
                const isReady = item.status === 'ready';
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectSection?.(item.id)}
                    className="group text-left bg-white hover:bg-slate-50/90 border border-slate-200/90 hover:border-indigo-300 rounded-2xl p-5 shadow-[0_2px_12px_-3px_rgba(0,0,0,0.03),0_1px_3px_rgba(0,0,0,0.02)] hover:shadow-md transition-all cursor-pointer flex flex-col justify-between gap-4 relative overflow-hidden"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all shadow-xs ${
                        mod.id === 'extraccion'
                          ? 'bg-indigo-50 border border-indigo-100 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white'
                          : mod.id === 'papeles'
                          ? 'bg-teal-50 border border-teal-100 text-teal-700 group-hover:bg-teal-600 group-hover:text-white'
                          : 'bg-amber-50 border border-amber-200 text-amber-700 group-hover:bg-amber-600 group-hover:text-white'
                      }`}>
                        <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                      </div>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        item.status === 'new'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}>
                        {item.statusLabel}
                      </span>
                    </div>

                    <div>
                      <h4 className="text-sm font-extrabold text-slate-900 group-hover:text-indigo-950 transition-colors line-clamp-1">
                        {item.title}
                      </h4>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed line-clamp-2">
                        {item.description}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-indigo-600">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {item.badges.slice(0, 2).map((b, bIdx) => (
                          <span
                            key={bIdx}
                            className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded"
                          >
                            {b}
                          </span>
                        ))}
                      </div>
                      <span className="inline-flex items-center gap-1 group-hover:translate-x-1 transition-transform text-xs shrink-0">
                        Abrir <span className="material-symbols-outlined text-[15px]">arrow_forward</span>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

