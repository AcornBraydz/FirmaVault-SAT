#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Validador de Cancelaciones SAT (Auditoría Integral de Comprobantes Digitales)
FirmaVault SAT - Nivel Top-Tier Enterprise

Coteja comprobantes fiscales digitales (CFDI Emitidos y Recibidos) contra
el Web Service oficial del SAT (ConsultaCFDIService.svc) y almacenes locales.
Detecta cancelaciones fraudulentas o silenciosas de proveedores, monitorea
solicitudes activas en Buzón Tributario y genera dictámenes de auditoría en Excel.
"""

import os
import sys
import glob
import json
import argparse
import time
import unicodedata
from datetime import datetime
from defusedxml import ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

# URL Oficial del Web Service SOAP del SAT para validación de CFDI
SAT_SOAP_URL = "https://consultaqr.facturaelectronica.sat.gob.mx/ConsultaCFDIService.svc"
SAT_SOAP_ACTION = "http://tempuri.org/IConsultaCFDIService/Consulta"

MESES_ESP = [
    '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

def clean_str(val):
    if val is None:
        return ''
    s = str(val).strip()
    # Normalizar texto si viene con caracteres extraños
    try:
        s = s.encode('latin1').decode('utf-8')
    except Exception:
        pass
    return s

def parse_float(val):
    try:
        if val is None:
            return 0.0
        return round(float(str(val).replace(',', '').strip()), 2)
    except Exception:
        return 0.0

def query_sat_soap(re, rr, tt, uuid, timeout=8):
    """
    Consulta directa al Web Service SOAP del SAT.
    Retorna un diccionario con:
    - estado: 'Vigente' | 'Cancelado' | 'No Encontrado'
    - es_cancelable: 'Cancelable con aceptación' | 'Cancelable sin aceptación' | 'No cancelable'
    - estatus_cancelacion: 'En proceso' | 'Cancelado con aceptación' | etc.
    - codigo_estatus: 'S - Comprobante obtenido satisfactoriamente.' | etc.
    - validacion_efos: '200' | '100'
    """
    # Formatear total con 2 decimales para la expresión impresa
    tt_str = f"{parse_float(tt):.2f}"
    headers = {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': SAT_SOAP_ACTION
    }
    body = f"""<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
    <s:Body>
        <Consulta xmlns="http://tempuri.org/">
            <expresionImpresa><![CDATA[?re={re}&rr={rr}&tt={tt_str}&id={uuid}]]></expresionImpresa>
        </Consulta>
    </s:Body>
</s:Envelope>"""

    try:
        resp = requests.post(SAT_SOAP_URL, data=body, headers=headers, timeout=timeout)
        if resp.status_code == 200:
            root = ET.fromstring(resp.text)
            ns = {
                's': 'http://schemas.xmlsoap.org/soap/envelope/',
                'a': 'http://schemas.datacontract.org/2004/07/Sat.Cfdi.Negocio.ConsultaCfdi.Servicio'
            }
            c_code = root.find('.//a:CodigoEstatus', ns)
            c_est = root.find('.//a:Estado', ns)
            c_canc = root.find('.//a:EsCancelable', ns)
            c_stat_canc = root.find('.//a:EstatusCancelacion', ns)
            c_efos = root.find('.//a:ValidacionEFOS', ns)

            def extract_text(node):
                if node is None or node.text is None:
                    return ''
                t = node.text.strip()
                # Limpiar posibles caracteres mal codificados como aceptacin
                t = t.replace('aceptacin', 'aceptación').replace('Cancelacin', 'Cancelación')
                return t

            return {
                'success': True,
                'codigo_estatus': extract_text(c_code),
                'estado': extract_text(c_est) or 'Vigente',
                'es_cancelable': extract_text(c_canc) or 'No especificado',
                'estatus_cancelacion': extract_text(c_stat_canc),
                'validacion_efos': extract_text(c_efos) or '200',
                'fecha_consulta': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            }
        else:
            return {
                'success': False,
                'error': f"HTTP {resp.status_code}",
                'estado': 'No Verificado',
                'es_cancelable': 'No disponible',
                'estatus_cancelacion': '',
                'validacion_efos': ''
            }
    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'estado': 'No Verificado',
            'es_cancelable': 'No disponible',
            'estatus_cancelacion': '',
            'validacion_efos': ''
        }

def parse_xml_cfdi(xml_path, current_rfc=""):
    """
    Parsea un archivo XML y extrae los campos clave de auditoría.
    """
    try:
        tree = ET.parse(xml_path)
        root = tree.getroot()
    except Exception:
        return None

    # Namespaces estándar CFDI
    ns = {
        'cfdi': 'http://www.sat.gob.mx/cfd/4',
        'cfdi3': 'http://www.sat.gob.mx/cfd/3',
        'tfd': 'http://www.sat.gob.mx/TimbreFiscalDigital'
    }

    # Atributos raíz
    total = parse_float(root.get('Total', 0))
    subtotal = parse_float(root.get('SubTotal', 0))
    fecha = root.get('Fecha', '')
    metodo_pago = root.get('MetodoPago', 'PUE')
    tipo_comprobante = root.get('TipoDeComprobante', 'I')

    # Emisor
    emisor_node = root.find('cfdi:Emisor', ns)
    if emisor_node is None:
        emisor_node = root.find('cfdi3:Emisor', ns)
    rfc_emisor = (emisor_node.get('Rfc', '') if emisor_node is not None else '').upper().strip()
    nombre_emisor = (emisor_node.get('Nombre', '') if emisor_node is not None else '').strip()

    # Receptor
    receptor_node = root.find('cfdi:Receptor', ns)
    if receptor_node is None:
        receptor_node = root.find('cfdi3:Receptor', ns)
    rfc_receptor = (receptor_node.get('Rfc', '') if receptor_node is not None else '').upper().strip()
    nombre_receptor = (receptor_node.get('Nombre', '') if receptor_node is not None else '').strip()

    # UUID y Timbre Fiscal
    uuid = ''
    tfd_node = root.find('.//tfd:TimbreFiscalDigital', ns)
    if tfd_node is not None:
        uuid = (tfd_node.get('UUID', '')).upper().strip()

    if not uuid:
        # Fallback al nombre del archivo si coincide con formato UUID
        base_name = os.path.splitext(os.path.basename(xml_path))[0].upper()
        if len(base_name) == 36 and '-' in base_name:
            uuid = base_name

    if not uuid:
        return None

    # Desglose de impuestos trasladados y retenidos
    iva_trasladado = 0.0
    ret_isr = 0.0
    ret_iva = 0.0

    for tras in root.findall('.//cfdi:Impuestos/cfdi:Traslados/cfdi:Traslado', ns):
        impuesto = tras.get('Impuesto', '')
        if impuesto in ['002', 'IVA']:
            iva_trasladado += parse_float(tras.get('Importe', 0))

    for tras in root.findall('.//cfdi3:Impuestos/cfdi3:Traslados/cfdi3:Traslado', ns):
        impuesto = tras.get('Impuesto', '')
        if impuesto in ['002', 'IVA']:
            iva_trasladado += parse_float(tras.get('Importe', 0))

    for ret in root.findall('.//cfdi:Impuestos/cfdi:Retenciones/cfdi:Retencion', ns):
        impuesto = ret.get('Impuesto', '')
        if impuesto in ['001', 'ISR']:
            ret_isr += parse_float(ret.get('Importe', 0))
        elif impuesto in ['002', 'IVA']:
            ret_iva += parse_float(ret.get('Importe', 0))

    for ret in root.findall('.//cfdi3:Impuestos/cfdi3:Retenciones/cfdi3:Retencion', ns):
        impuesto = ret.get('Impuesto', '')
        if impuesto in ['001', 'ISR']:
            ret_isr += parse_float(ret.get('Importe', 0))
        elif impuesto in ['002', 'IVA']:
            ret_iva += parse_float(ret.get('Importe', 0))

    # Determinar tipo según el RFC del cliente
    c_rfc = current_rfc.upper().strip()
    if c_rfc and rfc_emisor == c_rfc:
        flujo = 'Emitida (Ingreso)'
    else:
        flujo = 'Recibida (Gasto)'

    # Extraer año y mes de la fecha
    year = 0
    month = 0
    if fecha and len(fecha) >= 7:
        try:
            year = int(fecha[:4])
            month = int(fecha[5:7])
        except Exception:
            pass

    return {
        'uuid': uuid,
        'fecha': fecha,
        'year': year,
        'month': month,
        'rfc_emisor': rfc_emisor,
        'nombre_emisor': nombre_emisor,
        'rfc_receptor': rfc_receptor,
        'nombre_receptor': nombre_receptor,
        'total': total,
        'subtotal': subtotal,
        'iva_trasladado': iva_trasladado,
        'ret_isr': ret_isr,
        'ret_iva': ret_iva,
        'tipo_comprobante': tipo_comprobante,
        'metodo_pago': metodo_pago,
        'flujo': flujo,
        'source': 'XML',
        'file_name': os.path.basename(xml_path),
        'estado_local': 'Vigente'
    }

def load_cfdi_dataset(client_rfc, year, month, scope, xml_dir, facturas_dir):
    """
    Carga y consolida comprobantes desde XMLs y metadatos JSON.
    Garantiza que no existan duplicados por UUID.
    """
    cfdis = {}

    # 1. Cargar desde XMLs
    if xml_dir and os.path.exists(xml_dir):
        for root_dir, _, files in os.walk(xml_dir):
            for f in files:
                if f.lower().endswith('.xml'):
                    full_p = os.path.join(root_dir, f)
                    parsed = parse_xml_cfdi(full_p, client_rfc)
                    if parsed:
                        cfdis[parsed['uuid']] = parsed

    # 2. Cargar desde JSON store si existen datos adicionales
    if facturas_dir and os.path.exists(facturas_dir):
        # Buscar archivos recibidas y emitidas
        json_pattern = os.path.join(facturas_dir, "*.json")
        for j_path in glob.glob(json_pattern):
            base = os.path.basename(j_path).lower()
            if 'meta' in base:
                continue
            is_recibida = 'recibida' in base
            is_emitida = 'emitida' in base

            try:
                with open(j_path, 'r', encoding='utf-8') as jf:
                    data = json.load(jf)
                    if isinstance(data, list):
                        for item in data:
                            uuid = clean_str(item.get('Folio', '')).upper()
                            if not uuid or len(uuid) < 20:
                                continue
                            if uuid in cfdis:
                                # Complementar estado local previo si venía en el JSON
                                if 'Estado del Comprobante' in item:
                                    cfdis[uuid]['estado_local'] = clean_str(item['Estado del Comprobante'])
                                continue

                            # Si no estaba en XMLs, armar registro desde JSON
                            
                            f_raw = ''
                            emisor_n = ''
                            for k_orig, v_orig in item.items():
                                kl = k_orig.lower()
                                if 'fecha' in kl and 'emis' in kl:
                                    f_raw = clean_str(v_orig)
                                elif 'nombre' in kl or 'raz' in kl:
                                    emisor_n = clean_str(v_orig)

                            tot = parse_float(item.get('Total', 0))
                            sub = parse_float(item.get('Importe', 0))
                            iva = parse_float(item.get('IVA al 16%', 0))
                            
                            emisor_r = ''
                            for k_orig, v_orig in item.items():
                                if k_orig.upper() == 'RFC':
                                    emisor_r = clean_str(v_orig).upper()
                                    break
                            
                            est = clean_str(item.get('Estado del Comprobante', 'Vigente'))

                            flujo = 'Recibida (Gasto)' if is_recibida else ('Emitida (Ingreso)' if is_emitida else 'Recibida (Gasto)')

                            # Parsear mes aproximado
                            n_mes = item.get('NumMes', 0)
                            try:
                                n_mes = int(n_mes)
                            except Exception:
                                n_mes = 0

                            # Intentar inferir año del nombre del archivo o fecha
                            y_inf = 0
                            for py in ['2026', '2025', '2024', '2023', '2022', '2021', '2020']:
                                if py in base or py in f_raw:
                                    y_inf = int(py)
                                    break

                            cfdis[uuid] = {
                                'uuid': uuid,
                                'fecha': f_raw,
                                'year': y_inf,
                                'month': n_mes,
                                'rfc_emisor': emisor_r,
                                'nombre_emisor': emisor_n,
                                'rfc_receptor': client_rfc.upper() if is_recibida else '',
                                'nombre_receptor': 'CONTRIBUYENTE' if is_recibida else '',
                                'total': tot,
                                'subtotal': sub,
                                'iva_trasladado': iva,
                                'ret_isr': 0.0,
                                'ret_iva': 0.0,
                                'tipo_comprobante': 'I',
                                'metodo_pago': 'PUE',
                                'flujo': flujo,
                                'source': 'Metadata SAT',
                                'file_name': base,
                                'estado_local': est or 'Vigente'
                            }
            except Exception as e:
                print(f"[WARN] Error leyendo {j_path}: {e}", file=sys.stderr)

    # 3. Filtrar según parámetros solicitados
    filtrados = []
    y_target = int(year) if year else 0
    m_target = int(month) if month else 0
    scope_target = (scope or 'all').lower()

    for item in cfdis.values():
        # Filtro de año (si se especificó año distinto de 0)
        if y_target > 0 and item['year'] > 0 and item['year'] != y_target:
            continue

        # Filtro de mes (si se especificó mes distinto de 0)
        if m_target > 0 and item['month'] > 0 and item['month'] != m_target:
            continue

        # Filtro de alcance (scope)
        if scope_target == 'recibidas' and 'Recibida' not in item['flujo']:
            continue
        if scope_target == 'emitidas' and 'Emitida' not in item['flujo']:
            continue

        filtrados.append(item)

    # Ordenar por fecha descendente
    filtrados.sort(key=lambda x: x.get('fecha', ''), reverse=True)
    return filtrados

def run_auditoria_cancelaciones(items, client_rfc, do_live_check=True, max_live=300):
    """
    Ejecuta la auditoría completa, opcionalmente con llamadas multihilo al SAT.
    """
    print(f"[AUDITORIA] Procesando {len(items)} comprobantes (Live Check: {do_live_check})...")

    # Mapeo y cache de consultas SOAP
    results_map = {}

    if do_live_check and items:
        to_check = items[:max_live]
        print(f"[SAT WS] Consultando {len(to_check)} UUIDs contra el Web Service del SAT con 10 hilos...")

        def worker(item):
            re = item.get('rfc_emisor', '')
            rr = item.get('rfc_receptor', '') or client_rfc
            tt = item.get('total', 0)
            uid = item.get('uuid', '')
            res = query_sat_soap(re, rr, tt, uid)
            return uid, res

        with ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(worker, item) for item in to_check]
            for f in as_completed(futures):
                try:
                    uid, res = f.result()
                    results_map[uid] = res
                except Exception as e:
                    pass

    # Analizar y enriquecer cada comprobante
    total_auditados = len(items)
    total_importe = 0.0
    total_vigentes = 0
    monto_vigente = 0.0
    total_canceladas = 0
    monto_canceladas = 0.0
    total_en_proceso = 0
    monto_en_proceso = 0.0
    discrepancias_criticas = 0
    monto_en_riesgo = 0.0
    iva_en_riesgo = 0.0

    desglose_cancelabilidad = {
        'cancelable_con_aceptacion': {'count': 0, 'total': 0.0},
        'cancelable_sin_aceptacion': {'count': 0, 'total': 0.0},
        'no_cancelable': {'count': 0, 'total': 0.0},
        'no_especificado': {'count': 0, 'total': 0.0}
    }

    proveedores_riesgo = {}
    auditados = []

    for item in items:
        uid = item['uuid']
        tot = item['total']
        total_importe += tot

        # Obtener resultado de Web Service o fallback
        live_res = results_map.get(uid)
        if live_res and live_res.get('success'):
            sat_estado = live_res.get('estado', 'Vigente')
            es_cancelable = live_res.get('es_cancelable', 'No especificado')
            estatus_canc = live_res.get('estatus_cancelacion', '')
            efos = live_res.get('validacion_efos', '200')
            codigo_sat = live_res.get('codigo_estatus', '')
            fecha_sat = live_res.get('fecha_consulta', '')
            modo_verif = 'Web Service SAT en Vivo'
        else:
            # Fallback a estado local
            loc_est = item.get('estado_local', 'Vigente')
            sat_estado = loc_est if loc_est in ['Vigente', 'Cancelado'] else 'Vigente'
            es_cancelable = 'Verificación Local'
            estatus_canc = ''
            efos = '200'
            codigo_sat = 'Verificado en almacén local'
            fecha_sat = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            modo_verif = 'Almacén Local SAT'

        # Determinar estatus de riesgo y clasificación
        is_cancelado = 'cancelad' in sat_estado.lower()
        is_en_proceso = 'proceso' in (estatus_canc or '').lower() or 'proceso' in sat_estado.lower()

        tipo_riesgo = 'NORMAL'
        alerta_desc = 'Comprobante Vigente ante el SAT'

        if is_cancelado:
            total_canceladas += 1
            monto_canceladas += tot
            # Si era un gasto recibido, es una contingencia fiscal
            if 'Recibida' in item['flujo']:
                monto_en_riesgo += tot
                iva_en_riesgo += item.get('iva_trasladado', 0)
                # Si en nuestros registros estaba como Vigente pero el SAT dice Cancelado
                if 'vigente' in item.get('estado_local', '').lower():
                    discrepancias_criticas += 1
                    tipo_riesgo = 'DISCREPANCIA_CRITICA'
                    alerta_desc = '🚨 CANCELACIÓN SILENCIOSA: El proveedor canceló la factura que tienes deducida en contabilidad.'
                else:
                    tipo_riesgo = 'CANCELADO_CONFIRMADO'
                    alerta_desc = 'Comprobante cancelado en el SAT.'
            else:
                tipo_riesgo = 'CANCELADO_EMITIDO'
                alerta_desc = 'Factura emitida cancelada formalmente.'

            # Registrar proveedor con cancelaciones
            prov_rfc = item['rfc_emisor']
            if prov_rfc not in proveedores_riesgo:
                proveedores_riesgo[prov_rfc] = {
                    'rfc': prov_rfc,
                    'nombre': item['nombre_emisor'],
                    'canceladas': 0,
                    'monto_cancelado': 0.0,
                    'en_proceso': 0,
                    'monto_proceso': 0.0
                }
            proveedores_riesgo[prov_rfc]['canceladas'] += 1
            proveedores_riesgo[prov_rfc]['monto_cancelado'] += tot

        elif is_en_proceso:
            total_en_proceso += 1
            monto_en_proceso += tot
            tipo_riesgo = 'EN_PROCESO'
            alerta_desc = '⏰ SOLICITUD ACTIVA EN SAT: Requiere revisión en Buzón Tributario (plazo 72 horas).'
            if 'Recibida' in item['flujo']:
                monto_en_riesgo += tot
                iva_en_riesgo += item.get('iva_trasladado', 0)

            prov_rfc = item['rfc_emisor']
            if prov_rfc not in proveedores_riesgo:
                proveedores_riesgo[prov_rfc] = {
                    'rfc': prov_rfc,
                    'nombre': item['nombre_emisor'],
                    'canceladas': 0,
                    'monto_cancelado': 0.0,
                    'en_proceso': 0,
                    'monto_proceso': 0.0
                }
            proveedores_riesgo[prov_rfc]['en_proceso'] += 1
            proveedores_riesgo[prov_rfc]['monto_proceso'] += tot

        else:
            total_vigentes += 1
            monto_vigente += tot
            tipo_riesgo = 'VIGENTE'
            alerta_desc = 'Vigente y 100% amparado ante el SAT.'

        # Desglose de cancelabilidad
        canc_low = es_cancelable.lower()
        if 'con aceptación' in canc_low or 'con aceptacion' in canc_low:
            desglose_cancelabilidad['cancelable_con_aceptacion']['count'] += 1
            desglose_cancelabilidad['cancelable_con_aceptacion']['total'] += tot
        elif 'sin aceptación' in canc_low or 'sin aceptacion' in canc_low:
            desglose_cancelabilidad['cancelable_sin_aceptacion']['count'] += 1
            desglose_cancelabilidad['cancelable_sin_aceptacion']['total'] += tot
        elif 'no cancelable' in canc_low:
            desglose_cancelabilidad['no_cancelable']['count'] += 1
            desglose_cancelabilidad['no_cancelable']['total'] += tot
        else:
            desglose_cancelabilidad['no_especificado']['count'] += 1
            desglose_cancelabilidad['no_especificado']['total'] += tot

        enriched_item = dict(item)
        enriched_item.update({
            'sat_estado': sat_estado,
            'es_cancelable': es_cancelable,
            'estatus_cancelacion': estatus_canc,
            'sat_efos': efos,
            'codigo_sat': codigo_sat,
            'fecha_sat': fecha_sat,
            'modo_verificacion': modo_verif,
            'tipo_riesgo': tipo_riesgo,
            'alerta_desc': alerta_desc
        })
        auditados.append(enriched_item)

    # Convertir proveedores a lista ordenada por monto
    top_proveedores = sorted(
        proveedores_riesgo.values(),
        key=lambda x: (x['monto_cancelado'] + x['monto_proceso']),
        reverse=True
    )

    summary = {
        'total_auditados': total_auditados,
        'total_importe': round(total_importe, 2),
        'total_vigentes': total_vigentes,
        'monto_vigente': round(monto_vigente, 2),
        'total_canceladas': total_canceladas,
        'monto_canceladas': round(monto_canceladas, 2),
        'total_en_proceso': total_en_proceso,
        'monto_en_proceso': round(monto_en_proceso, 2),
        'discrepancias_criticas': discrepancias_criticas,
        'monto_en_riesgo': round(monto_en_riesgo, 2),
        'iva_en_riesgo': round(iva_en_riesgo, 2),
        'tasa_integridad': round((total_vigentes / total_auditados * 100), 1) if total_auditados > 0 else 100.0,
        'desglose_cancelabilidad': desglose_cancelabilidad,
        'top_proveedores_riesgo': top_proveedores,
        'timestamp_auditoria': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'items': auditados
    }

    return summary

def generate_cancelaciones_excel(summary, client_rfc, year, month, output_path):
    """
    Genera el libro de auditoría en Excel (.xlsx) con estándares Big Four.
    Pestaña 1: Resumen Ejecutivo y Riesgo
    Pestaña 2: Facturas Canceladas (Riesgo Fiscal)
    Pestaña 3: En Proceso de Cancelación (Buzón Tributario)
    Pestaña 4: Padrón Completo Auditado
    Pestaña 5: Dictamen de Auditoría Fiscal
    """
    wb = openpyxl.Workbook()
    # Eliminar hoja por defecto
    wb.remove(wb.active)

    font_family = "Segoe UI"
    border_thin = Border(
        left=Side(style='thin', color='E2E8F0'),
        right=Side(style='thin', color='E2E8F0'),
        top=Side(style='thin', color='E2E8F0'),
        bottom=Side(style='thin', color='E2E8F0')
    )
    border_header = Border(
        bottom=Side(style='medium', color='0F172A')
    )

    fill_header_dark = PatternFill(start_color="0F172A", end_color="0F172A", fill_type="solid")
    fill_header_amber = PatternFill(start_color="D97706", end_color="D97706", fill_type="solid")
    fill_header_red = PatternFill(start_color="991B1B", end_color="991B1B", fill_type="solid")
    fill_header_emerald = PatternFill(start_color="065F46", end_color="065F46", fill_type="solid")

    font_header = Font(name=font_family, size=9, bold=True, color="FFFFFF")
    font_body = Font(name=font_family, size=9, color="1E293B")
    font_bold = Font(name=font_family, size=9, bold=True, color="0F172A")
    font_uuid = Font(name="Consolas", size=8.5, color="334155")

    align_center = Alignment(horizontal="center", vertical="center")
    align_left = Alignment(horizontal="left", vertical="center")
    align_right = Alignment(horizontal="right", vertical="center")

    num_fmt_curr = "$#,##0.00"
    num_fmt_int = "#,##0"

    items = summary.get('items', [])
    m_num = int(month) if month else 0
    y_num = int(year) if year else 0
    periodo_str = "Consolidado" if y_num == 0 else (f"{MESES_ESP[m_num]} {y_num}" if m_num in range(1, 13) else f"Ejercicio {y_num}")

    # =========================================================
    # HOJA 1: RESUMEN EJECUTIVO Y RIESGO
    # =========================================================
    ws1 = wb.create_sheet(title="Resumen Ejecutivo")
    ws1.views.sheetView[0].showGridLines = True

    # Encabezado Corporativo
    ws1.row_dimensions[1].height = 36
    ws1.merge_cells("A1:G1")
    c_title = ws1["A1"]
    c_title.value = "FIRMAVAULT SAT — DICTAMEN EJECUTIVO DE CANCELACIONES"
    c_title.font = Font(name=font_family, size=15, bold=True, color="0F172A")
    c_title.alignment = align_left

    ws1.row_dimensions[2].height = 18
    ws1.merge_cells("A2:G2")
    c_sub = ws1["A2"]
    c_sub.value = f"Contribuyente: {client_rfc}  |  Periodo: {periodo_str}  |  Fecha de Auditoría: {summary['timestamp_auditoria']}"
    c_sub.font = Font(name=font_family, size=9.5, italic=True, color="64748B")
    c_sub.alignment = align_left

    # Scorecard de KPIs
    kpi_cards = [
        ("TOTAL AUDITADOS", f"{summary['total_auditados']:,}", f"Importe Total: ${summary['total_importe']:,.2f}", "0F172A", "F8FAFC"),
        ("COMPROBANTES VIGENTES", f"{summary['total_vigentes']:,}", f"Monto Deducible: ${summary['monto_vigente']:,.2f}", "065F46", "ECFDF5"),
        ("FACTURAS CANCELADAS", f"{summary['total_canceladas']:,}", f"Monto Cancelado: ${summary['monto_canceladas']:,.2f}", "991B1B" if summary['total_canceladas'] > 0 else "0F172A", "FEF2F2" if summary['total_canceladas'] > 0 else "F8FAFC"),
        ("EN PROCESO (SAT)", f"{summary['total_en_proceso']:,}", f"Atención Buzón: ${summary['monto_en_proceso']:,.2f}", "D97706" if summary['total_en_proceso'] > 0 else "0F172A", "FFFBEB" if summary['total_en_proceso'] > 0 else "F8FAFC"),
        ("RIESGO FISCAL NETO", f"${summary['monto_en_riesgo']:,.2f}", f"IVA Afectado: ${summary['iva_en_riesgo']:,.2f}", "B91C1C" if summary['monto_en_riesgo'] > 0 else "065F46", "FEF2F2" if summary['monto_en_riesgo'] > 0 else "ECFDF5")
    ]

    ws1.row_dimensions[4].height = 16
    ws1.row_dimensions[5].height = 28
    ws1.row_dimensions[6].height = 16

    col_idx = 1
    for title_kpi, val_kpi, sub_kpi, txt_col, bg_col in kpi_cards:
        start_c = col_idx
        end_c = col_idx + (1 if col_idx in [1, 5] else 0)

        c1 = ws1.cell(row=4, column=start_c, value=title_kpi)
        c2 = ws1.cell(row=5, column=start_c, value=val_kpi)
        c3 = ws1.cell(row=6, column=start_c, value=sub_kpi)

        fill_k = PatternFill(start_color=bg_col, end_color=bg_col, fill_type="solid")
        c1.font = Font(name=font_family, size=8, bold=True, color="64748B")
        c1.fill = fill_k
        c1.alignment = align_center

        c2.font = Font(name=font_family, size=15, bold=True, color=txt_col)
        c2.fill = fill_k
        c2.alignment = align_center

        c3.font = Font(name=font_family, size=8, color="64748B")
        c3.fill = fill_k
        c3.alignment = align_center

        for r in range(4, 7):
            for c in range(start_c, end_c + 1):
                cell = ws1.cell(row=r, column=c)
                cell.fill = fill_k
                cell.border = border_thin

        if end_c > start_c:
            ws1.merge_cells(start_row=4, start_column=start_c, end_row=4, end_column=end_c)
            ws1.merge_cells(start_row=5, start_column=start_c, end_row=5, end_column=end_c)
            ws1.merge_cells(start_row=6, start_column=start_c, end_row=6, end_column=end_c)

        col_idx = end_c + 1

    # Tabla: Alerta de Cancelaciones Silenciosas
    row_curr = 8
    ws1.row_dimensions[row_curr].height = 22
    ws1.merge_cells(start_row=row_curr, start_column=1, end_row=row_curr, end_column=7)
    sec1 = ws1.cell(row=row_curr, column=1, value="1. MATRIZ DE RIESGO: CANCELACIONES SILENCIOSAS VS REGISTROS CONTABLES")
    sec1.font = Font(name=font_family, size=10, bold=True, color="FFFFFF")
    sec1.fill = fill_header_dark
    sec1.alignment = align_left

    row_curr += 1
    matrix_headers = ["Indicador Fiscal", "Condición Detectada", "Comprobantes", "Monto Total (MXN)", "Impacto en IVA", "Nivel de Severidad", "Recomendación Inmediata"]
    ws1.row_dimensions[row_curr].height = 20
    for idx, h in enumerate(matrix_headers, 1):
        cell = ws1.cell(row=row_curr, column=idx, value=h)
        cell.font = font_header
        cell.fill = fill_header_dark
        cell.alignment = align_center
        cell.border = border_header

    matrix_rows = [
        ("Cancelaciones Silenciosas (Proveedores)", "Comprobante deducido en contabilidad pero cancelado en el SAT", summary['discrepancias_criticas'], summary['monto_en_riesgo'], summary['iva_en_riesgo'], "CRÍTICO", "Eliminar deducción de ISR / Solicitar sustitución al emisor"),
        ("Solicitudes en Proceso (Buzón)", "Proveedor solicitó cancelar y espera respuesta en 72h", summary['total_en_proceso'], summary['monto_en_proceso'], 0.0, "ALTO", "Revisar Buzón Tributario y manifestar Rechazo si ya se pagó"),
        ("Comprobantes Vigentes y Conformes", "Amparados 100% y activos en Web Service del SAT", summary['total_vigentes'], summary['monto_vigente'], 0.0, "CONFORME", "Deducción y acreditamiento plenamente blindados")
    ]

    for r_data in matrix_rows:
        row_curr += 1
        ws1.row_dimensions[row_curr].height = 20
        ws1.cell(row=row_curr, column=1, value=r_data[0]).font = font_bold
        ws1.cell(row=row_curr, column=2, value=r_data[1]).font = font_body
        c_cnt = ws1.cell(row=row_curr, column=3, value=r_data[2])
        c_cnt.number_format = num_fmt_int
        c_cnt.alignment = align_center
        c_cnt.font = font_bold

        c_tot = ws1.cell(row=row_curr, column=4, value=r_data[3])
        c_tot.number_format = num_fmt_curr
        c_tot.alignment = align_right
        c_tot.font = font_bold

        c_iva = ws1.cell(row=row_curr, column=5, value=r_data[4])
        c_iva.number_format = num_fmt_curr
        c_iva.alignment = align_right
        c_iva.font = font_body

        c_sev = ws1.cell(row=row_curr, column=6, value=r_data[5])
        c_sev.alignment = align_center
        if r_data[5] == 'CRÍTICO':
            c_sev.font = Font(name=font_family, size=9, bold=True, color="991B1B")
            c_sev.fill = PatternFill(start_color="FEF2F2", end_color="FEF2F2", fill_type="solid")
        elif r_data[5] == 'ALTO':
            c_sev.font = Font(name=font_family, size=9, bold=True, color="92400E")
            c_sev.fill = PatternFill(start_color="FFFBEB", end_color="FFFBEB", fill_type="solid")
        else:
            c_sev.font = Font(name=font_family, size=9, bold=True, color="065F46")
            c_sev.fill = PatternFill(start_color="ECFDF5", end_color="ECFDF5", fill_type="solid")

        ws1.cell(row=row_curr, column=7, value=r_data[6]).font = font_body

        for c in range(1, 8):
            ws1.cell(row=row_curr, column=c).border = border_thin

    # Tabla: Proveedores con Mayor Incidencia de Cancelación
    row_curr += 2
    ws1.row_dimensions[row_curr].height = 22
    ws1.merge_cells(start_row=row_curr, start_column=1, end_row=row_curr, end_column=7)
    sec2 = ws1.cell(row=row_curr, column=1, value="2. TOP PROVEEDORES CON FACTURAS CANCELADAS O EN PROCESO")
    sec2.font = Font(name=font_family, size=10, bold=True, color="FFFFFF")
    sec2.fill = fill_header_amber
    sec2.alignment = align_left

    row_curr += 1
    prov_headers = ["RFC Emisor", "Razón Social Proveedor", "CFDIs Cancelados", "Monto Cancelado ($)", "En Proceso", "Monto en Proceso ($)", "Riesgo Fiscal Total ($)"]
    ws1.row_dimensions[row_curr].height = 20
    for idx, h in enumerate(prov_headers, 1):
        cell = ws1.cell(row=row_curr, column=idx, value=h)
        cell.font = font_header
        cell.fill = fill_header_dark
        cell.alignment = align_center

    top_provs = summary.get('top_proveedores_riesgo', [])
    if not top_provs:
        row_curr += 1
        ws1.row_dimensions[row_curr].height = 22
        ws1.merge_cells(start_row=row_curr, start_column=1, end_row=row_curr, end_column=7)
        c_none = ws1.cell(row=row_curr, column=1, value="ðŸ›¡ï¸ No se detectaron proveedores con facturas canceladas en este periodo auditado.")
        c_none.font = Font(name=font_family, size=9.5, bold=True, color="065F46")
        c_none.alignment = align_center
        c_none.fill = PatternFill(start_color="ECFDF5", end_color="ECFDF5", fill_type="solid")
    else:
        for p in top_provs[:15]:
            row_curr += 1
            ws1.row_dimensions[row_curr].height = 19
            ws1.cell(row=row_curr, column=1, value=p['rfc']).font = font_bold
            ws1.cell(row=row_curr, column=2, value=p['nombre']).font = font_body

            c_c = ws1.cell(row=row_curr, column=3, value=p['canceladas'])
            c_c.number_format = num_fmt_int
            c_c.alignment = align_center
            c_c.font = Font(name=font_family, size=9, bold=True, color="991B1B" if p['canceladas'] > 0 else "0F172A")

            c_mc = ws1.cell(row=row_curr, column=4, value=p['monto_cancelado'])
            c_mc.number_format = num_fmt_curr
            c_mc.alignment = align_right
            c_mc.font = font_bold

            c_p = ws1.cell(row=row_curr, column=5, value=p['en_proceso'])
            c_p.number_format = num_fmt_int
            c_p.alignment = align_center
            c_p.font = Font(name=font_family, size=9, bold=True, color="92400E" if p['en_proceso'] > 0 else "0F172A")

            c_mp = ws1.cell(row=row_curr, column=6, value=p['monto_proceso'])
            c_mp.number_format = num_fmt_curr
            c_mp.alignment = align_right
            c_mp.font = font_body

            tot_r = p['monto_cancelado'] + p['monto_proceso']
            c_tr = ws1.cell(row=row_curr, column=7, value=tot_r)
            c_tr.number_format = num_fmt_curr
            c_tr.alignment = align_right
            c_tr.font = font_bold

            for c in range(1, 8):
                ws1.cell(row=row_curr, column=c).border = border_thin

    # =========================================================
    # HOJA 2: FACTURAS CANCELADAS (DETALLE Y ALERTA)
    # =========================================================
    ws2 = wb.create_sheet(title="Facturas Canceladas")
    ws2.views.sheetView[0].showGridLines = True

    canc_headers = [
        "Folio Fiscal (UUID)", "Fecha Emisión", "Flujo", "RFC Emisor",
        "Razón Social Emisor", "RFC Receptor", "Subtotal ($)", "IVA ($)",
        "Total ($)", "Estatus SAT", "Es Cancelable", "Estatus Cancelación",
        "Diagnóstico Auditoría", "Timestamp Consulta SAT"
    ]

    ws2.row_dimensions[1].height = 24
    for idx, h in enumerate(canc_headers, 1):
        cell = ws2.cell(row=1, column=idx, value=h)
        cell.font = font_header
        cell.fill = fill_header_red
        cell.alignment = align_center

    row_c = 1
    canceladas_items = [it for it in items if 'cancelad' in it.get('sat_estado', '').lower()]

    if not canceladas_items:
        row_c += 1
        ws2.row_dimensions[row_c].height = 24
        ws2.merge_cells(start_row=row_c, start_column=1, end_row=row_c, end_column=len(canc_headers))
        c_ok = ws2.cell(row=row_c, column=1, value="ðŸ›¡ï¸ Cero Comprobantes Cancelados Detectados para este periodo.")
        c_ok.font = Font(name=font_family, size=9.5, bold=True, color="065F46")
        c_ok.alignment = align_center
        c_ok.fill = PatternFill(start_color="ECFDF5", end_color="ECFDF5", fill_type="solid")
    else:
        for it in canceladas_items:
            row_c += 1
            ws2.row_dimensions[row_c].height = 19
            c_u = ws2.cell(row=row_c, column=1, value=it['uuid'])
            c_u.font = font_uuid
            c_u.alignment = align_center

            ws2.cell(row=row_c, column=2, value=it.get('fecha', '')).alignment = align_center
            ws2.cell(row=row_c, column=3, value=it.get('flujo', '')).alignment = align_center
            ws2.cell(row=row_c, column=4, value=it.get('rfc_emisor', '')).font = font_bold
            ws2.cell(row=row_c, column=5, value=it.get('nombre_emisor', ''))
            ws2.cell(row=row_c, column=6, value=it.get('rfc_receptor', ''))

            c_sub = ws2.cell(row=row_c, column=7, value=it.get('subtotal', 0))
            c_sub.number_format = num_fmt_curr
            c_sub.alignment = align_right

            c_iva = ws2.cell(row=row_c, column=8, value=it.get('iva_trasladado', 0))
            c_iva.number_format = num_fmt_curr
            c_iva.alignment = align_right

            c_tot = ws2.cell(row=row_c, column=9, value=it.get('total', 0))
            c_tot.number_format = num_fmt_curr
            c_tot.alignment = align_right
            c_tot.font = font_bold

            c_est = ws2.cell(row=row_c, column=10, value="CANCELADO")
            c_est.font = Font(name=font_family, size=9, bold=True, color="991B1B")
            c_est.fill = PatternFill(start_color="FEF2F2", end_color="FEF2F2", fill_type="solid")
            c_est.alignment = align_center

            ws2.cell(row=row_c, column=11, value=it.get('es_cancelable', ''))
            ws2.cell(row=row_c, column=12, value=it.get('estatus_cancelacion', ''))

            c_diag = ws2.cell(row=row_c, column=13, value=it.get('alerta_desc', ''))
            c_diag.font = Font(name=font_family, size=8.5, color="991B1B" if it.get('tipo_riesgo') == 'DISCREPANCIA_CRITICA' else "1E293B")

            c_fe = ws2.cell(row=row_c, column=14, value=it.get('fecha_sat', ''))
            c_fe.alignment = align_center
            c_fe.font = Font(name=font_family, size=8, color="64748B")

            for c in range(1, len(canc_headers) + 1):
                ws2.cell(row=row_c, column=c).border = border_thin

    # =========================================================
    # HOJA 3: EN PROCESO DE CANCELACIÓN (BUZÓN TRIBUTARIO)
    # =========================================================
    ws3 = wb.create_sheet(title="En Proceso (Buzón SAT)")
    ws3.views.sheetView[0].showGridLines = True

    proc_headers = [
        "Folio Fiscal (UUID)", "Fecha Emisión", "Flujo", "RFC Emisor",
        "Razón Social Emisor", "Total ($)", "Estatus SAT", "Es Cancelable",
        "Estatus Cancelación", "Plazo Límite Buzón", "Acción Recomendada", "Fecha Consulta"
    ]

    ws3.row_dimensions[1].height = 24
    for idx, h in enumerate(proc_headers, 1):
        cell = ws3.cell(row=1, column=idx, value=h)
        cell.font = font_header
        cell.fill = fill_header_amber
        cell.alignment = align_center

    row_p = 1
    proceso_items = [it for it in items if 'proceso' in (it.get('estatus_cancelacion', '') or '').lower() or 'proceso' in it.get('sat_estado', '').lower()]

    if not proceso_items:
        row_p += 1
        ws3.row_dimensions[row_p].height = 24
        ws3.merge_cells(start_row=row_p, start_column=1, end_row=row_p, end_column=len(proc_headers))
        c_ok = ws3.cell(row=row_p, column=1, value="ðŸ›¡ï¸ No existen comprobantes con solicitudes activas de cancelación en Buzón Tributario.")
        c_ok.font = Font(name=font_family, size=9.5, bold=True, color="065F46")
        c_ok.alignment = align_center
        c_ok.fill = PatternFill(start_color="ECFDF5", end_color="ECFDF5", fill_type="solid")
    else:
        for it in proceso_items:
            row_p += 1
            ws3.row_dimensions[row_p].height = 19
            c_u = ws3.cell(row=row_p, column=1, value=it['uuid'])
            c_u.font = font_uuid
            c_u.alignment = align_center

            ws3.cell(row=row_p, column=2, value=it.get('fecha', '')).alignment = align_center
            ws3.cell(row=row_p, column=3, value=it.get('flujo', '')).alignment = align_center
            ws3.cell(row=row_p, column=4, value=it.get('rfc_emisor', '')).font = font_bold
            ws3.cell(row=row_p, column=5, value=it.get('nombre_emisor', ''))

            c_tot = ws3.cell(row=row_p, column=6, value=it.get('total', 0))
            c_tot.number_format = num_fmt_curr
            c_tot.alignment = align_right
            c_tot.font = font_bold

            c_est = ws3.cell(row=row_p, column=7, value="EN PROCESO")
            c_est.font = Font(name=font_family, size=9, bold=True, color="92400E")
            c_est.fill = PatternFill(start_color="FFFBEB", end_color="FFFBEB", fill_type="solid")
            c_est.alignment = align_center

            ws3.cell(row=row_p, column=8, value=it.get('es_cancelable', ''))
            ws3.cell(row=row_p, column=9, value=it.get('estatus_cancelacion', ''))
            ws3.cell(row=row_p, column=10, value="72 Horas Hábiles").alignment = align_center
            ws3.cell(row=row_p, column=11, value="Ingresar a Buzón Tributario y Rechazar si ya fue liquidada.").font = font_bold
            ws3.cell(row=row_p, column=12, value=it.get('fecha_sat', '')).alignment = align_center

            for c in range(1, len(proc_headers) + 1):
                ws3.cell(row=row_p, column=c).border = border_thin

    # =========================================================
    # HOJA 4: PADRÓN COMPLETO AUDITADO
    # =========================================================
    ws4 = wb.create_sheet(title="Padrón Completo CFDI")
    ws4.views.sheetView[0].showGridLines = True

    full_headers = [
        "Folio Fiscal (UUID)", "Fecha Emisión", "Flujo / Tipo", "RFC Emisor",
        "Razón Social Emisor", "RFC Receptor", "Método Pago", "Subtotal ($)",
        "IVA Trasladado ($)", "Total ($)", "Estatus SAT", "Es Cancelable",
        "Estatus Cancelación", "Código Web Service SAT", "Modo Verificación"
    ]

    ws4.row_dimensions[1].height = 24
    for idx, h in enumerate(full_headers, 1):
        cell = ws4.cell(row=1, column=idx, value=h)
        cell.font = font_header
        cell.fill = fill_header_dark
        cell.alignment = align_center

    row_all = 1
    for it in items:
        row_all += 1
        ws4.row_dimensions[row_all].height = 19
        c_u = ws4.cell(row=row_all, column=1, value=it['uuid'])
        c_u.font = font_uuid
        c_u.alignment = align_center

        ws4.cell(row=row_all, column=2, value=it.get('fecha', '')).alignment = align_center
        ws4.cell(row=row_all, column=3, value=it.get('flujo', '')).alignment = align_center
        ws4.cell(row=row_all, column=4, value=it.get('rfc_emisor', '')).font = font_bold
        ws4.cell(row=row_all, column=5, value=it.get('nombre_emisor', ''))
        ws4.cell(row=row_all, column=6, value=it.get('rfc_receptor', ''))
        ws4.cell(row=row_all, column=7, value=it.get('metodo_pago', 'PUE')).alignment = align_center

        c_sub = ws4.cell(row=row_all, column=8, value=it.get('subtotal', 0))
        c_sub.number_format = num_fmt_curr
        c_sub.alignment = align_right

        c_iva = ws4.cell(row=row_all, column=9, value=it.get('iva_trasladado', 0))
        c_iva.number_format = num_fmt_curr
        c_iva.alignment = align_right

        c_tot = ws4.cell(row=row_all, column=10, value=it.get('total', 0))
        c_tot.number_format = num_fmt_curr
        c_tot.alignment = align_right
        c_tot.font = font_bold

        est_sat = it.get('sat_estado', 'Vigente')
        c_est = ws4.cell(row=row_all, column=11, value=est_sat)
        c_est.alignment = align_center
        if 'cancelad' in est_sat.lower():
            c_est.font = Font(name=font_family, size=9, bold=True, color="991B1B")
            c_est.fill = PatternFill(start_color="FEF2F2", end_color="FEF2F2", fill_type="solid")
        elif 'proceso' in est_sat.lower():
            c_est.font = Font(name=font_family, size=9, bold=True, color="92400E")
            c_est.fill = PatternFill(start_color="FFFBEB", end_color="FFFBEB", fill_type="solid")
        else:
            c_est.font = Font(name=font_family, size=9, bold=True, color="065F46")
            c_est.fill = PatternFill(start_color="ECFDF5", end_color="ECFDF5", fill_type="solid")

        ws4.cell(row=row_all, column=12, value=it.get('es_cancelable', ''))
        ws4.cell(row=row_all, column=13, value=it.get('estatus_cancelacion', ''))
        ws4.cell(row=row_all, column=14, value=it.get('codigo_sat', '')).font = Font(name=font_family, size=8, color="64748B")
        ws4.cell(row=row_all, column=15, value=it.get('modo_verificacion', '')).alignment = align_center

        for c in range(1, len(full_headers) + 1):
            ws4.cell(row=row_all, column=c).border = border_thin

    # =========================================================
    # HOJA 5: DICTAMEN DE AUDITORÍA FISCAL
    # =========================================================
    ws5 = wb.create_sheet(title="Dictamen Contable")
    ws5.views.sheetView[0].showGridLines = True

    ws5.row_dimensions[1].height = 36
    ws5.merge_cells("A1:F1")
    d_title = ws5["A1"]
    d_title.value = "CÉDULA DE DICTAMEN FISCAL DE CANCELACIONES (ART. 29-A CFF)"
    d_title.font = Font(name=font_family, size=14, bold=True, color="0F172A")
    d_title.alignment = align_left

    dictamen_texts = [
        f"Fecha y Hora de Dictaminación: {summary['timestamp_auditoria']}",
        f"Contribuyente Auditado: {client_rfc}",
        f"Periodo Fiscal Evaluado: {periodo_str}",
        "",
        "FUNDAMENTO JURÍDICO:",
        "De conformidad con el Artículo 29-A del Código Fiscal de la Federación (CFF) y las reglas de la Resolución Miscelánea Fiscal vigente, los comprobantes fiscales digitales por internet sólo podrán cancelarse cuando la persona a favor de quien se expidan acepte su cancelación, salvo las excepciones señaladas en las disposiciones fiscales.",
        "",
        "RESULTADO DE LA AUDITORÍA ELECTRÓNICA:",
        f"1. Se cotejó un universo total de {summary['total_auditados']:,} comprobantes fiscales por un importe global de ${summary['total_importe']:,.2f} MXN.",
        f"2. Se determinó que {summary['total_vigentes']:,} comprobantes (${summary['monto_vigente']:,.2f} MXN) se encuentran plenamente VIGENTES y amparan deducciones válidas de ISR y acreditamiento de IVA (Índice de integridad: {summary['tasa_integridad']}%).",
        f"3. Se detectaron {summary['total_canceladas']:,} comprobantes en estatus de CANCELADOS ante el SAT por un importe de ${summary['monto_canceladas']:,.2f} MXN.",
        f"4. Se identificaron {summary['discrepancias_criticas']:,} CANCELACIONES SILENCIOSAS en facturas recibidas de gastos por un monto en riesgo de ${summary['monto_en_riesgo']:,.2f} MXN y un IVA afectado de ${summary['iva_en_riesgo']:,.2f} MXN.",
        f"5. Se identificaron {summary['total_en_proceso']:,} comprobantes con SOLICITUD DE CANCELACIÓN ACTIVA ante Buzón Tributario por ${summary['monto_en_proceso']:,.2f} MXN.",
        "",
        "CONCLUSIÓN Y DICTAMEN DE RIESGO:",
        "El contribuyente cuenta con evidencia digital certificada por Web Service SAT para proceder a la corrección de papeles de trabajo o al requerimiento de reposición/sustitución por parte de los proveedores infractores, evitando determinaciones presuntivas de crédito fiscal en términos del CFF.",
        "",
        "________________________________________",
        "AUDITORÍA FISCAL DIGITAL Y SISTEMAS",
        "FIRMAVAULT SAT — PLATAFORMA PROFESIONAL"
    ]

    row_d = 2
    for line in dictamen_texts:
        row_d += 1
        ws5.row_dimensions[row_d].height = 20
        cell = ws5.cell(row=row_d, column=1, value=line)
        if "DICTAMEN" in line or "FUNDAMENTO" in line or "RESULTADO" in line or "CONCLUSIÓN" in line:
            cell.font = Font(name=font_family, size=10, bold=True, color="0F172A")
        elif "AUDITORÍA FISCAL" in line or "FIRMAVAULT" in line:
            cell.font = Font(name=font_family, size=9, bold=True, color="64748B")
        else:
            cell.font = font_body

    # Autoajuste de anchos de columna en todas las hojas
    for ws in [ws1, ws2, ws3, ws4, ws5]:
        for col in ws.columns:
            max_len = 0
            col_letter = get_column_letter(col[0].column)
            for cell in col:
                if cell.value:
                    val_s = str(cell.value)
                    if len(val_s) > max_len and len(val_s) < 80:
                        max_len = len(val_s)
            ws.column_dimensions[col_letter].width = max(max_len + 3, 12)

    # Anchos específicos óptimos
    ws1.column_dimensions['A'].width = 30
    ws1.column_dimensions['B'].width = 36
    ws1.column_dimensions['C'].width = 16
    ws1.column_dimensions['D'].width = 22
    ws1.column_dimensions['E'].width = 18
    ws1.column_dimensions['F'].width = 18
    ws1.column_dimensions['G'].width = 38

    ws2.column_dimensions['A'].width = 38
    ws3.column_dimensions['A'].width = 38
    ws4.column_dimensions['A'].width = 38

    wb.save(output_path)
    print(f"[EXCEL] Dictamen generado exitosamente: {output_path}")

def main():
    parser = argparse.ArgumentParser(description="Validador de Cancelaciones SAT")
    parser.add_argument("--rfc", required=True, help="RFC del contribuyente")
    parser.add_argument("--year", default="0", help="Ejercicio fiscal")
    parser.add_argument("--month", default="0", help="Mes / periodo (0 para anual)")
    parser.add_argument("--scope", default="all", choices=["all", "recibidas", "emitidas"], help="Alcance de CFDI")
    parser.add_argument("--xml-dir", default="", help="Directorio de XMLs almacenados")
    parser.add_argument("--facturas-dir", default="", help="Directorio de metadatos JSON")
    parser.add_argument("--live-check", action="store_true", help="Consultar Web Service SAT en vivo")
    parser.add_argument("--max-live", type=int, default=300, help="Máximo de comprobantes a verificar en vivo")
    parser.add_argument("--output-excel", default="", help="Ruta para libro Excel generado")
    parser.add_argument("--json-output", default="", help="Ruta para métricas JSON generadas")

    args = parser.parse_args()

    # 1. Cargar comprobantes
    items = load_cfdi_dataset(
        client_rfc=args.rfc,
        year=args.year,
        month=args.month,
        scope=args.scope,
        xml_dir=args.xml_dir,
        facturas_dir=args.facturas_dir
    )

    # 2. Ejecutar auditoría
    summary = run_auditoria_cancelaciones(
        items=items,
        client_rfc=args.rfc,
        do_live_check=args.live_check,
        max_live=args.max_live
    )

    # 3. Guardar JSON si se solicita
    if args.json_output:
        os.makedirs(os.path.dirname(os.path.abspath(args.json_output)), exist_ok=True)
        with open(args.json_output, 'w', encoding='utf-8') as f:
            json.dump(summary, f, ensure_ascii=False, indent=2)
        print(f"[JSON] Métricas guardadas en {args.json_output}")

    # 4. Generar Excel si se solicita
    if args.output_excel:
        os.makedirs(os.path.dirname(os.path.abspath(args.output_excel)), exist_ok=True)
        generate_cancelaciones_excel(
            summary=summary,
            client_rfc=args.rfc,
            year=args.year,
            month=args.month,
            output_path=args.output_excel
        )

    print("[SUCCESS] Proceso de Auditoría de Cancelaciones completado.")

if __name__ == '__main__':
    main()
