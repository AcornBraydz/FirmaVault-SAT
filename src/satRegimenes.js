// Catálogo Oficial de Regímenes Fiscales Delimitados para Conciliación de CFDIs
// Conforme a la Ley del Impuesto sobre la Renta (LISR) y Ley del IVA (LIVA).

export const REGIMENES_PERSONAS_FISICAS = [
  {
    code: '612',
    value: '612',
    nombre: 'Personas Físicas con Actividades Empresariales y Profesionales',
    shortLabel: '612 · Act. Empresarial y Profesional',
    tipoPersona: 'Física',
    subtitulo: 'Flujo de efectivo con deducciones reales: Cobrado menos pagado',
    fundamento: 'Arts. 100 a 110 LISR & Arts. 1, 5 LIVA',
    kpiTitle: 'Utilidad Fiscal Estimada ISR',
    kpiSubtitle: 'Flujo de efectivo: Ingresos cobrados menos gastos pagados',
    colHeader: 'Utilidad Fiscal ISR',
    gastosDeduciblesMensuales: true,
    causaIva: true,
    metodo: 'flujo_utilidad',
    descripcion: 'Régimen general por flujo de efectivo: Base gravable = Ingresos cobrados menos gastos deducibles pagados. Acreditamiento estricto de IVA.'
  },
  {
    code: '626',
    value: '626',
    nombre: 'Régimen Simplificado de Confianza (RESICO PF)',
    shortLabel: '626 · RESICO Personas Físicas',
    tipoPersona: 'Física',
    subtitulo: 'Tasas del 1.0% al 2.5% sobre ingresos cobrados (sin deducción de gastos para ISR)',
    fundamento: 'Arts. 113-E a 113-J LISR & Arts. 1, 5 LIVA',
    kpiTitle: 'ISR RESICO a Enterar',
    kpiSubtitle: 'Art. 113-E: Gastos no disminuyen ISR. Compras sí acreditan IVA.',
    colHeader: 'ISR RESICO a Pagar',
    gastosDeduciblesMensuales: false,
    causaIva: true,
    metodo: 'resico_tabla',
    descripcion: 'Cálculo directo por tabla del 1.0% al 2.5% sobre el total de ingresos cobrados sin deducción de gastos para el ISR (Art. 113-E). Resta retención de 1.25% de personas morales. Las compras sí acreditan IVA.'
  },
  {
    code: '606',
    value: '606',
    nombre: 'Arrendamiento de Bienes Inmuebles',
    shortLabel: '606 · Arrendamiento',
    tipoPersona: 'Física',
    subtitulo: 'Alterna entre Deducción Ciega del 35% (Art. 115 LISR) o Gastos Reales Comprobables',
    fundamento: 'Arts. 114 a 118 LISR & Art. 1-A LIVA',
    kpiTitle: 'Utilidad Fiscal Arrendamiento',
    kpiSubtitle: 'Permite Deducción Ciega 35% (Art. 115) o Gastos Reales',
    colHeader: 'Utilidad Fiscal Arrendamiento',
    gastosDeduciblesMensuales: true,
    causaIva: true,
    metodo: 'arrendamiento',
    hasDeduccionCiegaToggle: true,
    descripcion: 'Permite deducir gastos comprobables de mantenimiento y predial O aplicar la deducción opcional ciega del 35% sobre ingresos brutos sin comprobantes (Art. 115 LISR).'
  },
];

export const REGIMENES_PERSONAS_MORALES = [
  {
    code: '601',
    value: '601',
    nombre: 'General de Ley Personas Morales',
    shortLabel: '601 · General Personas Morales',
    tipoPersona: 'Moral',
    subtitulo: 'Título II LISR: Coeficiente de Utilidad (Art. 14) sobre Ingresos Nominales a tasa 30%',
    fundamento: 'Arts. 9 y 14 LISR & Arts. 1, 5 LIVA',
    kpiTitle: 'ISR Provisional PM (Art. 14)',
    kpiSubtitle: 'Ingresos Nominales × Coeficiente de Utilidad (CU) a tasa corporativa 30%',
    colHeader: 'ISR Provisional PM',
    gastosDeduciblesMensuales: false,
    causaIva: true,
    metodo: 'pm_coeficiente',
    descripcion: 'Determinación oficial de pagos provisionales mensuales: Ingresos nominales multiplicados por el Coeficiente de Utilidad (CU) a tasa corporativa del 30% (Art. 9 LISR). Gastos acreditan IVA pero no disminuyen la base mensual de ISR.'
  },
  {
    code: 'resico_pm',
    value: 'resico_pm',
    nombre: 'Régimen Simplificado de Confianza Personas Morales (RESICO PM)',
    shortLabel: 'RESICO Personas Morales',
    tipoPersona: 'Moral',
    subtitulo: 'Flujo de efectivo acumulado: Cobrado menos pagado (Título VII Cap. XII LISR)',
    fundamento: 'Arts. 206 a 215 LISR & Arts. 1, 5 LIVA',
    kpiTitle: 'Utilidad Fiscal RESICO PM',
    kpiSubtitle: 'Flujo de efectivo puro: Ingresos cobrados menos gastos efectivamente pagados',
    colHeader: 'Utilidad Fiscal RESICO PM',
    gastosDeduciblesMensuales: true,
    causaIva: true,
    metodo: 'resico_pm',
    descripcion: 'Tributa bajo esquema puro de flujo de efectivo acumulado: Ingresos efectivamente cobrados menos deducciones autorizadas e inversiones efectivamente pagadas.'
  },
];

// Catálogo delimitado de los 5 regímenes autorizados
export const ALL_REGIMENES = [
  ...REGIMENES_PERSONAS_FISICAS,
  ...REGIMENES_PERSONAS_MORALES,
];

// Mapa por código oficial
export const REGIMENES_BY_CODE = ALL_REGIMENES.reduce((acc, r) => {
  acc[r.code] = r;
  return acc;
}, {});

// Mapa de retrocompatibilidad
export const REGIMEN_ALIAS_MAP = {
  '601': '601',
  general_pm: '601',
  pm_general: '601',
  '612': '612',
  actividad_empresarial: '612',
  actividades_empresariales: '612',
  '626': '626',
  resico: '626',
  resico_pf: '626',
  '606': '606',
  arrendamiento: '606',
  resico_pm: 'resico_pm',
  '626_pm': 'resico_pm',
  persona_moral: '601',
  pm_resico: 'resico_pm',
};

/**
 * Normaliza cualquier clave o alias a uno de los regímenes autorizados
 */
export function normalizarRegimenCode(codeOrAlias) {
  const str = String(codeOrAlias || '').trim().toLowerCase();
  if (REGIMENES_BY_CODE[str]) return str;
  if (REGIMEN_ALIAS_MAP[str]) return REGIMEN_ALIAS_MAP[str];

  if (str.includes('601') || (str.includes('general') && str.includes('moral'))) return '601';
  if (str.includes('arrendamiento') || str.includes('606')) return '606';
  if (str.includes('resico_pm') || (str.includes('resico') && str.includes('moral'))) return 'resico_pm';
  if (str.includes('resico') || str.includes('626')) return '626';
  return '612';
}


/**
 * Devuelve la metadata completa del régimen fiscal
 */
export function getRegimenInfo(codeOrAlias) {
  const code = normalizarRegimenCode(codeOrAlias);
  return REGIMENES_BY_CODE[code] || REGIMENES_BY_CODE['612'];
}

/**
 * Sugerencia inteligente de régimen según longitud de RFC:
 * - 12 caracteres: Persona Moral -> resico_pm
 * - 13 caracteres: Persona Física -> 612 (Act. Empresarial y Profesional)
 */
export function getDefaultRegimeForRfc(rfc) {
  const cleanRfc = String(rfc || '').trim().toUpperCase();
  if (cleanRfc.length === 12) return 'resico_pm';
  return '612';
}

export const GROUPED_REGIMENES = {
  fisicas: REGIMENES_PERSONAS_FISICAS,
  morales: REGIMENES_PERSONAS_MORALES,
};
