# -*- coding: utf-8 -*-
"""
Motor de Regímenes Fiscales del SAT Delimitado para Conciliación de CFDIs
Conforme a la Ley del Impuesto sobre la Renta (LISR) y Ley del IVA (LIVA).
Nivel Enterprise Top-Tier con precisión aritmética Decimal (ROUND_HALF_UP).

Regímenes soportados mediante conciliación de comprobantes tipo 'I', 'E', 'P' y 'N':
1. 601 - General de Ley Personas Morales (Art. 14 LISR: Coeficiente de Utilidad a tasa 30%)
2. 612 - Personas Físicas con Actividades Empresariales y Profesionales (Art. 96/106 LISR: Tarifa Progresiva)
3. 626 - Régimen Simplificado de Confianza RESICO PF (Art. 113-E: Tabla 1%-2.5%, ret. 1.25%)
4. 606 - Arrendamiento de Bienes Inmuebles (Art. 115 LISR: Deducción Ciega 35% vs Gastos Reales)
5. resico_pm - Régimen Simplificado de Confianza Personas Morales (Arts. 206 a 215 LISR: Flujo puro)
"""

from decimal import Decimal, ROUND_HALF_UP

def to_decimal(val) -> Decimal:
    """Convierte cualquier valor a Decimal de forma segura con 2 decimales."""
    if val is None or val == "":
        return Decimal("0.00")
    try:
        clean_str = str(val).replace("$", "").replace(",", "").strip()
        return Decimal(clean_str).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except Exception:
        return Decimal("0.00")

def round_money(val: Decimal) -> float:
    """Convierte Decimal a float redondeado a 2 decimales para serialización JSON."""
    return float(val.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))

CATALOGO_REGIMENES_SAT = {
    "601": {
        "code": "601",
        "nombre": "General de Ley Personas Morales",
        "short_label": "601 · General Personas Morales",
        "tipo_persona": "Moral",
        "subtitulo": "Título II LISR: Coeficiente de Utilidad (Art. 14) sobre Ingresos Nominales a tasa 30%",
        "fundamento": "Arts. 9 y 14 LISR & Arts. 1, 5 LIVA",
        "gastos_deducibles_isr": False, # En pagos provisionales no se deducen gastos mensuales
        "causa_iva": True,
        "metodo_calculo": "pm_coeficiente",
        "columna_header": "ISR Provisional PM (Art. 14)",
        "descripcion": "Determinación oficial de pagos provisionales mensuales: Ingresos nominales facturados/devengados multiplicados por el Coeficiente de Utilidad (CU), aplicando la tasa corporativa del 30% (Art. 9). Gastos acreditan IVA pero no disminuyen la base mensual de ISR."
    },
    "612": {
        "code": "612",
        "nombre": "Personas Físicas con Actividades Empresariales y Profesionales",
        "short_label": "612 · Act. Empresarial y Profesional",
        "tipo_persona": "Física",
        "subtitulo": "Flujo de efectivo con deducciones reales y Tarifa Progresiva de ISR (Art. 96/106 LISR)",
        "fundamento": "Arts. 96, 100 a 110 LISR & Arts. 1, 1-A, 5 LIVA",
        "gastos_deducibles_isr": True,
        "causa_iva": True,
        "metodo_calculo": "flujo_utilidad",
        "columna_header": "ISR a Pagar (Tarifa Art. 96/106)",
        "descripcion": "Régimen tradicional por flujo de efectivo: Base gravable = Ingresos cobrados menos gastos deducibles pagados. Aplica la tarifa mensual progresiva de ISR de ley (1.92% a 35%) y acredita retenciones de ISR."
    },
    "626": {
        "code": "626",
        "nombre": "Régimen Simplificado de Confianza (RESICO PF)",
        "short_label": "626 · RESICO Personas Físicas",
        "tipo_persona": "Física",
        "subtitulo": "Tasas mínimas del 1.0% al 2.5% sobre ingresos cobrados. Gastos acreditan IVA.",
        "fundamento": "Arts. 113-E a 113-J LISR & Arts. 1, 5 LIVA",
        "gastos_deducibles_isr": False,
        "causa_iva": True,
        "metodo_calculo": "resico_tabla",
        "columna_header": "ISR RESICO a Pagar",
        "descripcion": "Cálculo directo por tabla progresiva del 1.0% al 2.5% sobre el total de ingresos cobrados sin deducción de gastos para el ISR (Art. 113-E). Resta retención del 1.25% de personas morales. Las compras sí acreditan IVA conforme a los requisitos fiscales de ley."
    },
    "606": {
        "code": "606",
        "nombre": "Arrendamiento de Bienes Inmuebles",
        "short_label": "606 · Arrendamiento",
        "tipo_persona": "Física",
        "subtitulo": "Permite alternar entre Deducción Ciega del 35% (Art. 115) o Gastos Reales",
        "fundamento": "Arts. 114 a 118 LISR & Art. 1-A LIVA",
        "gastos_deducibles_isr": True,
        "causa_iva": True,
        "metodo_calculo": "arrendamiento",
        "columna_header": "Utilidad Fiscal Arrendamiento",
        "descripcion": "Permite deducir gastos comprobables de mantenimiento y predial O aplicar la deducción opcional ciega del 35% sobre ingresos brutos sin comprobantes (Art. 115 LISR). Retención del 10% ISR y 10.67% IVA si renta a persona moral."
    },
    "resico_pm": {
        "code": "resico_pm",
        "nombre": "Régimen Simplificado de Confianza Personas Morales (RESICO PM)",
        "short_label": "RESICO Personas Morales",
        "tipo_persona": "Moral",
        "subtitulo": "Título VII Capítulo XII LISR: Flujo de efectivo cobrado menos pagado",
        "fundamento": "Arts. 206 a 215 LISR & Arts. 1, 5 LIVA",
        "gastos_deducibles_isr": True,
        "causa_iva": True,
        "metodo_calculo": "resico_pm",
        "columna_header": "Utilidad Fiscal RESICO PM",
        "descripcion": "Tributa bajo esquema puro de flujo de efectivo acumulado: Ingresos efectivamente cobrados menos deducciones autorizadas e inversiones efectivamente pagadas (sin coeficiente de utilidad ni devengado)."
    }
}

# Tabla de Tarifa Mensual Oficial de ISR para Personas Físicas (Art. 96 y 106 LISR)
# Estructura: (Limite_Inferior, Limite_Superior, Cuota_Fija, Porcentaje_Excedente)
TARIFAS_MENSUALES_ISR_612 = [
    (Decimal("0.01"), Decimal("746.04"), Decimal("0.00"), Decimal("0.0192")),
    (Decimal("746.05"), Decimal("6332.05"), Decimal("14.32"), Decimal("0.0640")),
    (Decimal("6332.06"), Decimal("11128.01"), Decimal("371.83"), Decimal("0.1088")),
    (Decimal("11128.02"), Decimal("12935.82"), Decimal("893.14"), Decimal("0.1600")),
    (Decimal("12935.83"), Decimal("15487.71"), Decimal("1182.41"), Decimal("0.1792")),
    (Decimal("15487.72"), Decimal("31236.49"), Decimal("1640.18"), Decimal("0.2136")),
    (Decimal("31236.50"), Decimal("49233.00"), Decimal("5000.75"), Decimal("0.2352")),
    (Decimal("49233.01"), Decimal("93993.90"), Decimal("9233.67"), Decimal("0.3000")),
    (Decimal("93993.91"), Decimal("125325.20"), Decimal("22661.94"), Decimal("0.3200")),
    (Decimal("125325.21"), Decimal("375975.61"), Decimal("32687.96"), Decimal("0.3400")),
    (Decimal("375975.62"), Decimal("999999999999.99"), Decimal("117909.10"), Decimal("0.3500")),
]

# Alias y compatibilidad con frontend y backend
REGIMEN_ALIAS_MAP = {
    "601": "601",
    "general_pm": "601",
    "pm_general": "601",
    "general_ley_pm": "601",
    "persona_moral": "601",
    "pm": "601",
    "612": "612",
    "actividad_empresarial": "612",
    "actividades_empresariales": "612",
    "626": "626",
    "resico": "626",
    "resico_pf": "626",
    "606": "606",
    "arrendamiento": "606",
    "resico_pm": "resico_pm",
    "626_pm": "resico_pm",
    "pm_resico": "resico_pm",
}

def normalizar_regimen_code(key_or_code):
    """Convierte cualquier código o alias a uno de los 5 regímenes autorizados"""
    s = str(key_or_code or "").strip().lower()
    if s in CATALOGO_REGIMENES_SAT:
        return s
    if s in REGIMEN_ALIAS_MAP:
        return REGIMEN_ALIAS_MAP[s]
    if "601" in s or "persona_moral" in s or ("general" in s and "moral" in s):
        return "601"

    if "arrendamiento" in s or "606" in s:
        return "606"
    if "resico_pm" in s or ("resico" in s and "moral" in s):
        return "resico_pm"
    if "resico" in s or "626" in s:
        return "626"
    if "612" in s or "actividad" in s:
        return "612"
    return "612"

def get_regimen_info(key_or_code):
    """Devuelve la metadata completa del régimen"""
    code = normalizar_regimen_code(key_or_code)
    return CATALOGO_REGIMENES_SAT.get(code, CATALOGO_REGIMENES_SAT["612"])

def calcular_impuesto_tarifa_612(base_gravable: Decimal) -> tuple[Decimal, Decimal, str]:
    """
    Aplica la tarifa mensual progresiva del Art. 96 / 106 LISR sobre la base gravable.
    Retorna (isr_determinado, tasa_marginal, etiqueta_tramo)
    """
    if base_gravable <= Decimal("0.00"):
        return Decimal("0.00"), Decimal("0.00"), "0.0%"

    for lim_inf, lim_sup, cuota_fija, pct in TARIFAS_MENSUALES_ISR_612:
        if lim_inf <= base_gravable <= lim_sup:
            excedente = base_gravable - lim_inf
            impuesto_marginal = excedente * pct
            isr_total = (cuota_fija + impuesto_marginal).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            tasa_label = f"{round(float(pct * 100), 2)}%"
            return isr_total, pct, tasa_label

    # Si excede la última cota
    lim_inf, _, cuota_fija, pct = TARIFAS_MENSUALES_ISR_612[-1]
    excedente = base_gravable - lim_inf
    isr_total = (cuota_fija + (excedente * pct)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return isr_total, pct, "35.0%"

def calcular_impuestos_regimen(regimen_code, ingresos, gastos_deducibles, retencion_isr=0.0, retencion_iva=0.0, opcion_arrendamiento="ciega", coeficiente_utilidad=0.2000):
    """
    Calcula con estricto apego a la ley los impuestos (ISR e IVA) para los regímenes autorizados:
    - 601: General Personas Morales (Art. 14 LISR: Ingresos * Coeficiente de Utilidad * 30%)
    - 612: Actividad Empresarial (Art. 96/106 LISR: Tarifa Progresiva mensual cobrado - pagado)
    - 626: RESICO PF (Tabla 1%-2.5% s/ cobrado; gastos acreditan IVA pero no restan ISR)
    - 606: Arrendamiento (Toggle: Ciega 35% sin comprobantes vs Real con facturas)
    - resico_pm: RESICO PM (Flujo de efectivo acumulado cobrado - pagado)
    """
    code = normalizar_regimen_code(regimen_code)
    info = get_regimen_info(code)

    ing = to_decimal(ingresos)
    gas = to_decimal(gastos_deducibles)
    ret_isr = to_decimal(retencion_isr)
    ret_iva = to_decimal(retencion_iva)

    resultado = {
        "regimen_code": code,
        "regimen_nombre": info["nombre"],
        "short_label": info["short_label"],
        "tipo_persona": info["tipo_persona"],
        "fundamento": info["fundamento"],
        "metodo": info["metodo_calculo"],
        "gastos_deducibles_isr": info["gastos_deducibles_isr"],
        "ingresos": round_money(ing),
        "gastos": round_money(gas),
        "gastos_aplicados_isr": round_money(gas),
        "base_isr": 0.0,
        "isr_determinado": 0.0,
        "retencion_isr": round_money(ret_isr),
        "isr_neto": 0.0,
        "isr_a_favor": 0.0,
        "tasa_efectiva": 0.0,
        "tasa_label": "",
        "columna_header": info["columna_header"],
        "opcion_arrendamiento": opcion_arrendamiento,
        "coeficiente_utilidad": float(coeficiente_utilidad),
        "nota_adicional": ""
    }

    # =========================================================================
    # 1. Régimen General de Personas Morales (601 - Art. 14 LISR)
    # =========================================================================
    if code == "601":
        try:
            cu = Decimal(str(coeficiente_utilidad or 0.2000)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
            if cu <= Decimal("0.0000"):
                cu = Decimal("0.2000")
        except Exception:
            cu = Decimal("0.2000")

        # Base gravable mensual = Ingresos Nominales * CU
        base_utilidad = (ing * cu).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        # Tasa corporativa general del 30% (Art. 9 LISR)
        isr_determinado = (base_utilidad * Decimal("0.30")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        isr_neto = max(Decimal("0.00"), (isr_determinado - ret_isr).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
        isr_a_favor = max(Decimal("0.00"), (ret_isr - isr_determinado).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))

        resultado.update({
            "base_isr": round_money(base_utilidad),
            "gastos_aplicados_isr": 0.0, # Gastos no disminuyen el pago provisional de PM 601
            "isr_determinado": round_money(isr_determinado),
            "isr_neto": round_money(isr_neto),
            "isr_a_favor": round_money(isr_a_favor),
            "tasa_efectiva": 0.30,
            "tasa_label": "30% s/ Utilidad Estimada (CU)",
            "columna_header": "ISR Provisional PM (Art. 14)",
            "coeficiente_utilidad": float(cu),
            "nota_adicional": f"Art. 14 LISR: Ingresos nominales (${round_money(ing):,.2f}) × Coeficiente de Utilidad ({float(cu):.4f}) a tasa del 30% (Art. 9). Gastos acreditan IVA pero no disminuyen la base mensual de ISR."
        })

    # =========================================================================
    # 2. Actividades Empresariales y Profesionales (612 - Art. 96/106 LISR)
    # =========================================================================
    elif code == "612":
        base_utilidad = max(Decimal("0.00"), (ing - gas).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
        isr_determinado, tasa_marginal, tasa_label = calcular_impuesto_tarifa_612(base_utilidad)
        isr_neto = max(Decimal("0.00"), (isr_determinado - ret_isr).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
        isr_a_favor = max(Decimal("0.00"), (ret_isr - isr_determinado).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
        tasa_efectiva = float(isr_determinado / base_utilidad) if base_utilidad > 0 else 0.0

        resultado.update({
            "base_isr": round_money(base_utilidad),
            "gastos_aplicados_isr": round_money(gas),
            "isr_determinado": round_money(isr_determinado),
            "isr_neto": round_money(isr_neto),
            "isr_a_favor": round_money(isr_a_favor),
            "tasa_efectiva": round(tasa_efectiva, 4),
            "tasa_label": f"{round(tasa_efectiva * 100, 2)}% efectiva (tramo {tasa_label})",
            "columna_header": "ISR a Pagar (Tarifa Art. 96/106)",
            "nota_adicional": f"Arts. 96 y 106 LISR: Flujo de efectivo (Cobrado ${round_money(ing):,.2f} - Pagado ${round_money(gas):,.2f}) calculado con la Tarifa Mensual Progresiva oficial del SAT."
        })

    # =========================================================================
    # 3. RESICO Personas Físicas (626 - Art. 113-E LISR)
    # =========================================================================
    elif code == "626":
        if ing <= Decimal("0.00"):
            tasa = Decimal("0.0000")
        elif ing <= Decimal("25000.00"):
            tasa = Decimal("0.0100")
        elif ing <= Decimal("50000.00"):
            tasa = Decimal("0.0110")
        elif ing <= Decimal("83333.33"):
            tasa = Decimal("0.0150")
        elif ing <= Decimal("208333.33"):
            tasa = Decimal("0.0200")
        else:
            tasa = Decimal("0.0250")

        isr_causado = (ing * tasa).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        isr_neto = max(Decimal("0.00"), (isr_causado - ret_isr).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
        isr_a_favor = max(Decimal("0.00"), (ret_isr - isr_causado).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))

        resultado.update({
            "base_isr": round_money(ing),
            "gastos_aplicados_isr": 0.0, # Gastos no deducen ISR
            "isr_determinado": round_money(isr_causado),
            "isr_neto": round_money(isr_neto),
            "isr_a_favor": round_money(isr_a_favor),
            "tasa_efectiva": float(tasa),
            "tasa_label": f"{round(float(tasa * 100), 2)}%",
            "columna_header": "ISR RESICO a Pagar",
            "nota_adicional": "Art. 113-E: Gastos no disminuyen ISR. Tasa de tabla sobre ingresos cobrados. Gastos sí acreditan IVA."
        })

    # =========================================================================
    # 4. Arrendamiento (606 - Art. 115 LISR)
    # =========================================================================
    elif code == "606":
        opcion = str(opcion_arrendamiento or "ciega").strip().lower()
        if opcion == "real":
            deduccion = gas
            base = max(Decimal("0.00"), (ing - deduccion).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
            nota = f"Art. 115 LISR (Gastos Reales): Deducción comprobable de ${round_money(deduccion):,.2f} con comprobantes fiscales."
        else:
            # Deducción Ciega del 35% sin comprobantes
            deduccion = (ing * Decimal("0.35")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            base = max(Decimal("0.00"), (ing - deduccion).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
            nota = f"Art. 115 LISR (Deducción Ciega): 35% sobre ingresos (${round_money(deduccion):,.2f}) sin necesidad de comprobantes de gastos."

        isr_determinado, tasa_marginal, tasa_label = calcular_impuesto_tarifa_612(base)
        isr_neto = max(Decimal("0.00"), (isr_determinado - ret_isr).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
        isr_a_favor = max(Decimal("0.00"), (ret_isr - isr_determinado).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))

        resultado.update({
            "base_isr": round_money(base),
            "gastos_aplicados_isr": round_money(deduccion),
            "deduccion_ciega_35": round_money(ing * Decimal("0.35")),
            "isr_determinado": round_money(isr_determinado),
            "isr_neto": round_money(isr_neto),
            "isr_a_favor": round_money(isr_a_favor),
            "columna_header": "ISR Arrendamiento (Art. 115)",
            "opcion_arrendamiento": opcion,
            "nota_adicional": nota
        })

    # =========================================================================
    # 5. RESICO Personas Morales (resico_pm - Título VII Cap. XII LISR)
    # =========================================================================
    elif code == "resico_pm":
        base = max(Decimal("0.00"), (ing - gas).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
        isr_determinado = (base * Decimal("0.30")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        isr_neto = max(Decimal("0.00"), (isr_determinado - ret_isr).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
        isr_a_favor = max(Decimal("0.00"), (ret_isr - isr_determinado).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))

        resultado.update({
            "base_isr": round_money(base),
            "gastos_aplicados_isr": round_money(gas),
            "isr_determinado": round_money(isr_determinado),
            "isr_neto": round_money(isr_neto),
            "isr_a_favor": round_money(isr_a_favor),
            "tasa_efectiva": 0.30,
            "tasa_label": "30% sobre Utilidad Flujo Efectivo",
            "columna_header": "Utilidad Fiscal RESICO PM",
            "nota_adicional": "Capítulo XII Título VII LISR: Régimen Simplificado PM en flujo de efectivo acumulado (cobrado menos pagado a tasa 30%)."
        })

    return resultado
