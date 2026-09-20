#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Motor de Auditoría y Rastreador de Listas Negras (EFOS - Art. 69-B CFF)
Cruza el 100% de los comprobantes recibidos de cualquier contribuyente contra
la base de datos oficial del SAT y DOF, detecta proveedores boletinados (definitivos y presuntos),
cuantifica el monto en riesgo fiscal y penal, y genera un libro de trabajo en Excel con dictamen.
"""

import os
import sys
import glob
import json
import zipfile
import argparse
from defusedxml import ElementTree as ET
from datetime import datetime
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

# Asegurar importación del validador de EFOS
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from sat_efos_validator import check_rfc_efos, get_efos_catalog_stats, load_efos_database

MESES_ESP = [
    '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

def clean_str(val):
    return str(val or '').strip()

def parse_float(val):
    try:
        if val is None:
            return 0.0
        return round(float(str(val).replace(',', '').strip()), 2)
    except Exception:
        return 0.0

def extract_cfdi_data_from_xml_string(xml_content, source_file=""):
    """
    Parsea el contenido XML de un CFDI y retorna un diccionario estructurado.
    """
    try:
        root = ET.fromstring(xml_content)
    except Exception:
        return None

    ns = {'cfdi': 'http://www.sat.gob.mx/cfd/4', 'cfdi3': 'http://www.sat.gob.mx/cfd/3'}
    version = root.get('Version', '4.0')
    tipo_de_comprobante = root.get('TipoDeComprobante', 'I')
    fecha = root.get('Fecha', '')
    folio = root.get('Folio', '')
    serie = root.get('Serie', '')
    metodo_pago = root.get('MetodoPago', 'PUE')
    forma_pago = root.get('FormaPago', '99')
    subtotal = parse_float(root.get('SubTotal', 0.0))
    total = parse_float(root.get('Total', 0.0))

    emisor_rfc = ''
    emisor_nombre = ''
    receptor_rfc = ''
    receptor_nombre = ''
    uuid = ''
    concepto_desc = ''
    iva_trasladado = 0.0

    for elem in root.iter():
        tag = elem.tag.split('}')[-1]
        if tag == 'Emisor':
            emisor_rfc = clean_str(elem.get('Rfc', '')).upper()
            emisor_nombre = clean_str(elem.get('Nombre', ''))
        elif tag == 'Receptor':
            receptor_rfc = clean_str(elem.get('Rfc', '')).upper()
            receptor_nombre = clean_str(elem.get('Nombre', ''))
        elif tag == 'TimbreFiscalDigital':
            uuid = clean_str(elem.get('UUID', '')).upper()
        elif tag == 'Concepto' and not concepto_desc:
            concepto_desc = clean_str(elem.get('Descripcion', ''))
        elif tag == 'Traslado':
            impuesto = elem.get('Impuesto', '')
            tasa = parse_float(elem.get('TasaOCuota', 0))
            # 002 = IVA
            if impuesto in ['002', 'IVA', '2'] or abs(tasa - 0.16) < 0.01 or abs(tasa - 0.08) < 0.01:
                imp = parse_float(elem.get('Importe', 0))
                iva_trasladado += imp

    if not uuid:
        return None

    # Fecha parseada
    anio = 0
    mes = 0
    if fecha:
        try:
            dt = datetime.fromisoformat(fecha.replace('Z', ''))
            anio = dt.year
            mes = dt.month
        except Exception:
            if len(fecha) >= 7:
                try:
                    anio = int(fecha[:4])
                    mes = int(fecha[5:7])
                except Exception:
                    pass

    return {
        'uuid': uuid,
        'fecha': fecha[:10] if len(fecha) >= 10 else fecha,
        'anio': anio,
        'mes': mes,
        'serie': serie,
        'folio': folio,
        'tipo': tipo_de_comprobante,
        'metodo_pago': metodo_pago,
        'forma_pago': forma_pago,
        'subtotal': subtotal,
        'iva': round(iva_trasladado, 2),
        'total': total,
        'emisor_rfc': emisor_rfc,
        'emisor_nombre': emisor_nombre,
        'receptor_rfc': receptor_rfc,
        'receptor_nombre': receptor_nombre,
        'concepto': concepto_desc or 'Gastos en general',
        'source_file': os.path.basename(source_file) if source_file else '',
    }

def collect_cfdis_from_directory(xml_dir, target_rfc, year=0, month=0):
    """
    Recolecta todos los CFDIs recibidos por el contribuyente desde la carpeta de XMLs o ZIPs.
    Deduplica por UUID.
    """
    cfdis = {}
    target_rfc_clean = clean_str(target_rfc).upper()

    if not xml_dir or not os.path.exists(xml_dir):
        return cfdis

    # 1. XMLs sueltos
    xml_files = glob.glob(os.path.join(xml_dir, "**", "*.xml"), recursive=True)
    for file_path in xml_files:
        try:
            with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
                content = f.read()
            data = extract_cfdi_data_from_xml_string(content, source_file=file_path)
            if data and data['uuid']:
                # Solo comprobantes RECIBIDOS por el contribuyente (él es el receptor)
                if data['receptor_rfc'] == target_rfc_clean or (data['emisor_rfc'] != target_rfc_clean and not data['receptor_rfc']):
                    # Filtro por año y mes
                    if year > 0 and data['anio'] > 0 and data['anio'] != year:
                        continue
                    if month > 0 and data['mes'] > 0 and data['mes'] != month:
                        continue
                    cfdis[data['uuid']] = data
        except Exception:
            continue

    # 2. Paquetes ZIP
    zip_files = glob.glob(os.path.join(xml_dir, "**", "*.zip"), recursive=True)
    for zip_path in zip_files:
        try:
            with zipfile.ZipFile(zip_path, 'r') as z:
                for zinfo in z.infolist():
                    if zinfo.filename.lower().endswith('.xml'):
                        try:
                            with z.open(zinfo) as zf:
                                content = zf.read().decode('utf-8', errors='replace')
                            data = extract_cfdi_data_from_xml_string(content, source_file=zinfo.filename)
                            if data and data['uuid']:
                                if data['receptor_rfc'] == target_rfc_clean or (data['emisor_rfc'] != target_rfc_clean and not data['receptor_rfc']):
                                    if year > 0 and data['anio'] > 0 and data['anio'] != year:
                                        continue
                                    if month > 0 and data['mes'] > 0 and data['mes'] != month:
                                        continue
                                    if data['uuid'] not in cfdis:
                                        cfdis[data['uuid']] = data
                        except Exception:
                            continue
        except Exception:
            continue

    return cfdis

def load_json_cache_cfdis(facturas_store_dir, target_rfc, year=0, month=0, existing_cfdis=None):
    """
    Carga comprobantes de facturas_store/{clientId} si existen archivos JSON sincronizados previamente.
    """
    if existing_cfdis is None:
        existing_cfdis = {}
    target_rfc_clean = clean_str(target_rfc).upper()

    if not facturas_store_dir or not os.path.exists(facturas_store_dir):
        return existing_cfdis

    json_files = glob.glob(os.path.join(facturas_store_dir, "*recibidas.json"))
    for jf in json_files:
        try:
            with open(jf, 'r', encoding='utf-8') as f:
                items = json.load(f)
            if not isinstance(items, list):
                continue
            for item in items:
                uuid = clean_str(item.get('Folio', '') or item.get('uuid', '')).upper()
                if not uuid or uuid in existing_cfdis:
                    continue

                emisor_rfc = clean_str(item.get('RFC Emisor', '') or item.get('emisor_rfc', '') or item.get('RfcEmisor', '')).upper()
                emisor_nom = clean_str(item.get('Nombre o Razón Social del Emisor', '') or item.get('emisor_nombre', '') or item.get('NombreEmisor', ''))
                fecha = clean_str(item.get('Fecha de Emisión', '') or item.get('fecha', ''))
                total = parse_float(item.get('Total', 0.0))
                subtotal = parse_float(item.get('Importe / Subtotal', 0.0) or item.get('subtotal', 0.0))
                if subtotal == 0.0 and total > 0:
                    subtotal = round(total / 1.16, 2)
                iva = round(max(0.0, total - subtotal), 2)

                anio = 0
                mes = 0
                if len(fecha) >= 4:
                    try:
                        anio = int(fecha[:4])
                        if len(fecha) >= 7:
                            mes = int(fecha[5:7])
                    except Exception:
                        pass

                if year > 0 and anio > 0 and anio != year:
                    continue
                if month > 0 and mes > 0 and mes != month:
                    continue

                if emisor_rfc and emisor_rfc != target_rfc_clean:
                    existing_cfdis[uuid] = {
                        'uuid': uuid,
                        'fecha': fecha[:10],
                        'anio': anio,
                        'mes': mes,
                        'serie': '',
                        'folio': '',
                        'tipo': 'I',
                        'metodo_pago': clean_str(item.get('MetodoPago', 'PUE')),
                        'forma_pago': clean_str(item.get('FormaPago', '99')),
                        'subtotal': subtotal,
                        'iva': iva,
                        'total': total,
                        'emisor_rfc': emisor_rfc,
                        'emisor_nombre': emisor_nom,
                        'receptor_rfc': target_rfc_clean,
                        'receptor_nombre': '',
                        'concepto': clean_str(item.get('Concepto', 'Gastos generales')),
                        'source_file': os.path.basename(jf),
                    }
        except Exception:
            continue

    return existing_cfdis

def run_efos_audit(target_rfc, year=0, month=0, xml_dir="", facturas_store_dir=""):
    """
    Ejecuta el cruce masivo contra la base de datos de EFOS (Art. 69-B CFF).
    Retorna un diccionario completo con métricas, proveedores clasificados y comprobantes en riesgo.
    """
    load_efos_database()
    stats_catalogo = get_efos_catalog_stats()

    # 1. Recolectar CFDIs
    cfdis = collect_cfdis_from_directory(xml_dir, target_rfc, year=year, month=month)
    cfdis = load_json_cache_cfdis(facturas_store_dir, target_rfc, year=year, month=month, existing_cfdis=cfdis)

    # 2. Agrupar por Proveedor (RFC Emisor)
    proveedores_map = {}

    for uuid, cfdi in cfdis.items():
        emisor_rfc = cfdi['emisor_rfc']
        if not emisor_rfc or emisor_rfc == target_rfc.upper():
            continue

        if emisor_rfc not in proveedores_map:
            # Consultar en base oficial 69-B
            efo_info = check_rfc_efos(emisor_rfc)
            
            es_def = False
            es_pres = False
            es_desv = False
            es_sent = False
            situacion = "Conforme (No listado)"

            if efo_info:
                situacion = efo_info.get('situacion', 'Definitivo')
                es_def = efo_info.get('es_definitivo', False)
                es_pres = efo_info.get('es_presunto', False)
                es_desv = efo_info.get('es_desvirtuado', False)
                es_sent = efo_info.get('es_sentencia_favorable', False)

            proveedores_map[emisor_rfc] = {
                'rfc': emisor_rfc,
                'nombre_cfdi': cfdi['emisor_nombre'],
                'nombre_oficial_sat': efo_info.get('nombre', '') if efo_info else cfdi['emisor_nombre'],
                'situacion': situacion,
                'es_efos': bool(efo_info),
                'es_definitivo': es_def,
                'es_presunto': es_pres,
                'es_desvirtuado': es_desv,
                'es_sentencia_favorable': es_sent,
                'oficio_dof': efo_info.get('oficio_dof', '') if efo_info else '',
                'fecha_publicacion_dof': efo_info.get('fecha_publicacion_dof', '') if efo_info else '',
                'total_cfdis': 0,
                'subtotal': 0.0,
                'iva': 0.0,
                'total': 0.0,
                'fecha_primera': cfdi['fecha'],
                'fecha_ultima': cfdi['fecha'],
                'cfdis': [],
            }

        prov = proveedores_map[emisor_rfc]
        prov['total_cfdis'] += 1
        prov['subtotal'] += cfdi['subtotal']
        prov['iva'] += cfdi['iva']
        prov['total'] += cfdi['total']
        if cfdi['fecha'] and (not prov['fecha_primera'] or cfdi['fecha'] < prov['fecha_primera']):
            prov['fecha_primera'] = cfdi['fecha']
        if cfdi['fecha'] and (not prov['fecha_ultima'] or cfdi['fecha'] > prov['fecha_ultima']):
            prov['fecha_ultima'] = cfdi['fecha']

        prov['cfdis'].append(cfdi)

    # Redondear montos por proveedor
    for prov in proveedores_map.values():
        prov['subtotal'] = round(prov['subtotal'], 2)
        prov['iva'] = round(prov['iva'], 2)
        prov['total'] = round(prov['total'], 2)

    # 3. Separar en Listas de Proveedores
    proveedores_definitivos = [p for p in proveedores_map.values() if p['es_definitivo']]
    proveedores_presuntos = [p for p in proveedores_map.values() if p['es_presunto']]
    proveedores_desvirtuados = [p for p in proveedores_map.values() if p['es_desvirtuado']]
    proveedores_sentencias = [p for p in proveedores_map.values() if p['es_sentencia_favorable']]
    proveedores_conformes = [p for p in proveedores_map.values() if not p['es_definitivo'] and not p['es_presunto']]

    # Ordenar por monto total descendente
    proveedores_definitivos.sort(key=lambda x: x['total'], reverse=True)
    proveedores_presuntos.sort(key=lambda x: x['total'], reverse=True)
    proveedores_conformes.sort(key=lambda x: x['total'], reverse=True)

    # 4. Métricas Globales
    total_prov = len(proveedores_map)
    total_def = len(proveedores_definitivos)
    total_pres = len(proveedores_presuntos)
    total_desv = len(proveedores_desvirtuados)
    total_sent = len(proveedores_sentencias)
    total_conf = len(proveedores_conformes)

    total_cfdis_auditados = sum(p['total_cfdis'] for p in proveedores_map.values())
    subtotal_auditado = round(sum(p['subtotal'] for p in proveedores_map.values()), 2)
    iva_auditado = round(sum(p['iva'] for p in proveedores_map.values()), 2)
    total_auditado = round(sum(p['total'] for p in proveedores_map.values()), 2)

    # Monto en riesgo (Definitivos + Presuntos)
    prov_riesgo = proveedores_definitivos + proveedores_presuntos
    subtotal_riesgo = round(sum(p['subtotal'] for p in prov_riesgo), 2)
    iva_riesgo = round(sum(p['iva'] for p in prov_riesgo), 2)
    total_riesgo = round(sum(p['total'] for p in prov_riesgo), 2)
    cfdis_riesgo = sum(p['total_cfdis'] for p in prov_riesgo)

    # Dictamen Contable Oficial
    if total_def > 0:
        dictamen_estatus = "RIESGO CRITICO"
        dictamen_color = "#DC2626"
        dictamen_titulo = "DICTAMEN FISCAL: RIESGO PENAL Y FISCAL CRÍTICO — EFOS DEFINITIVOS DETECTADOS"
        dictamen_texto = (
            f"Se detectaron {total_def} proveedor(es) boletinado(s) como DEFINITIVO(S) en el Art. 69-B del CFF. "
            f"El importe total en riesgo asciende a ${total_riesgo:,.2f} MXN (Subtotal: ${subtotal_riesgo:,.2f} + IVA: ${iva_riesgo:,.2f}). "
            "Fundamento legal: Art. 69-B quinto y noveno párrafos del CFF y Art. 113-Bis CFF. "
            "Acción requerida: Reversar la deducción del gasto y el acreditamiento de IVA mediante declaración complementaria, "
            "o acreditar la efectiva materialidad de las operaciones ante el SAT dentro del plazo legal."
        )
    elif total_pres > 0:
        dictamen_estatus = "ALERTA FISCAL"
        dictamen_color = "#D97706"
        dictamen_titulo = "DICTAMEN FISCAL: ALERTA PREVENTIVA — PROVEEDORES PRESUNTOS DETECTADOS"
        dictamen_texto = (
            f"Se detectaron {total_pres} proveedor(es) en situación de PRESUNTO en el Art. 69-B del CFF con operaciones por ${total_riesgo:,.2f} MXN. "
            "Los proveedores se encuentran dentro del plazo para desvirtuar las imputaciones del SAT. "
            "Acción recomendada: Recabar contratos, órdenes de compra, entregables y evidencia de materialidad de forma inmediata."
        )
    else:
        dictamen_estatus = "CONFORME"
        dictamen_color = "#059669"
        dictamen_titulo = "DICTAMEN FISCAL: CUMPLIMIENTO FAVORABLE — COMPROBANTES 100% LIMPIOS"
        dictamen_texto = (
            f"Se auditaron satisfactoriamente {total_prov} proveedores únicos y {total_cfdis_auditados} comprobantes fiscales recibidos. "
            "NINGUNO de los emisores se encuentra boletinado como presunto ni definitivo en el listado oficial del Artículo 69-B del CFF publicado en el DOF. "
            "El contribuyente cuenta con blindaje y trazabilidad completa de sus deducciones e IVA acreditable."
        )

    # Periodo formateado
    if year == 0:
        periodo_str = "Histórico Completo (Consolidado)"
    elif month == 0:
        periodo_str = f"Ejercicio Anual {year}"
    else:
        periodo_str = f"{MESES_ESP[month]} de {year}"

    return {
        'target_rfc': target_rfc.upper(),
        'periodo': periodo_str,
        'year': year,
        'month': month,
        'fecha_auditoria': datetime.now().strftime("%d/%m/%Y %H:%M"),
        'catalogo_stats': stats_catalogo,
        'dictamen': {
            'estatus': dictamen_estatus,
            'color': dictamen_color,
            'titulo': dictamen_titulo,
            'texto': dictamen_texto,
        },
        'metricas': {
            'total_proveedores': total_prov,
            'total_conformes': total_conf,
            'total_definitivos': total_def,
            'total_presuntos': total_pres,
            'total_desvirtuados': total_desv,
            'total_sentencias': total_sent,
            'total_cfdis_auditados': total_cfdis_auditados,
            'total_cfdis_riesgo': cfdis_riesgo,
            'subtotal_auditado': subtotal_auditado,
            'iva_auditado': iva_auditado,
            'total_auditado': total_auditado,
            'monto_en_riesgo_subtotal': subtotal_riesgo,
            'monto_en_riesgo_iva': iva_riesgo,
            'monto_total_en_riesgo': total_riesgo,
            'tasa_cumplimiento': round((total_conf / total_prov * 100) if total_prov > 0 else 100.0, 1),
        },
        'proveedores_definitivos': proveedores_definitivos,
        'proveedores_presuntos': proveedores_presuntos,
        'proveedores_conformes': proveedores_conformes,
    }

def generate_efos_excel(audit_results, output_file):
    """
    Genera un libro de trabajo en Excel con formato corporativo top-tier (4 pestañas).
    """
    wb = openpyxl.Workbook()
    wb.remove(wb.active)

    res = audit_results
    m = res['metricas']
    dictamen = res['dictamen']

    font_family = "Segoe UI"
    c_navy = "0F172A"
    c_teal = "0F766E"
    c_rose = "991B1B"

    fill_header_navy = PatternFill(start_color=c_navy, end_color=c_navy, fill_type="solid")
    fill_header_rose = PatternFill(start_color=c_rose, end_color=c_rose, fill_type="solid")
    fill_header_teal = PatternFill(start_color=c_teal, end_color=c_teal, fill_type="solid")

    font_header = Font(name=font_family, size=10, bold=True, color="FFFFFF")
    font_bold = Font(name=font_family, size=10, bold=True)
    font_regular = Font(name=font_family, size=10)
    font_small = Font(name=font_family, size=9, color="475569")
    font_code = Font(name="Consolas", size=9)

    border_thin = Border(
        left=Side(style='thin', color='E2E8F0'),
        right=Side(style='thin', color='E2E8F0'),
        top=Side(style='thin', color='E2E8F0'),
        bottom=Side(style='thin', color='E2E8F0')
    )
    align_center = Alignment(horizontal='center', vertical='center')
    align_left = Alignment(horizontal='left', vertical='center')
    align_right = Alignment(horizontal='right', vertical='center')

    # ==========================================
    # PESTAÑA 1: RESUMEN EJECUTIVO Y DICTAMEN
    # ==========================================
    ws1 = wb.create_sheet(title="Dictamen y Resumen")
    ws1.views.sheetView[0].showGridLines = True

    # Banner Institucional
    ws1.merge_cells("A1:G1")
    ws1["A1"] = "PROGRAMA SAT — AUDITORÍA FISCAL DE PROVEEDORES (ART. 69-B CFF)"
    ws1["A1"].font = Font(name=font_family, size=13, bold=True, color="FFFFFF")
    ws1["A1"].fill = fill_header_navy
    ws1["A1"].alignment = Alignment(horizontal='center', vertical='center')
    ws1.row_dimensions[1].height = 30

    ws1.merge_cells("A2:G2")
    ws1["A2"] = f"Contribuyente: {res['target_rfc']}  |  Periodo Auditado: {res['periodo']}  |  Fecha de Emisión: {res['fecha_auditoria']}"
    ws1["A2"].font = Font(name=font_family, size=9.5, italic=True, color="FFFFFF")
    ws1["A2"].fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
    ws1["A2"].alignment = Alignment(horizontal='center', vertical='center')
    ws1.row_dimensions[2].height = 22

    # Espacio
    ws1.row_dimensions[3].height = 12

    # KPIs Principales
    kpis = [
        ("PROVEEDORES AUDITADOS", f"{m['total_proveedores']:,}", "100% de proveedores emisores", "0F172A", "F8FAFC"),
        ("PROVEEDORES CONFORMES", f"{m['total_conformes']:,}", f"{m['tasa_cumplimiento']}% Cumplimiento Limpio", "065F46", "ECFDF5"),
        ("EFOS DEFINITIVOS", f"{m['total_definitivos']:,}", "Art. 69-B CFF (No Deducible)", "991B1B" if m['total_definitivos'] > 0 else "0F172A", "FEF2F2" if m['total_definitivos'] > 0 else "F8FAFC"),
        ("EFOS PRESUNTOS", f"{m['total_presuntos']:,}", "Art. 69-B CFF (Alerta Preventiva)", "92400E" if m['total_presuntos'] > 0 else "0F172A", "FFFBEB" if m['total_presuntos'] > 0 else "F8FAFC"),
    ]

    ws1.row_dimensions[4].height = 18
    ws1.row_dimensions[5].height = 28
    ws1.row_dimensions[6].height = 16

    col_idx = 1
    for title, val, sub, txt_color, bg_color in kpis:
        start_col = col_idx
        end_col = col_idx + (1 if col_idx in [1, 3, 6] else 0)
        c1 = ws1.cell(row=4, column=start_col, value=title)
        c2 = ws1.cell(row=5, column=start_col, value=val)
        c3 = ws1.cell(row=6, column=start_col, value=sub)

        fill_kpi = PatternFill(start_color=bg_color, end_color=bg_color, fill_type="solid")
        c1.font = Font(name=font_family, size=8, bold=True, color="64748B")
        c1.fill = fill_kpi
        c1.alignment = align_center

        c2.font = Font(name=font_family, size=16, bold=True, color=txt_color)
        c2.fill = fill_kpi
        c2.alignment = align_center

        c3.font = Font(name=font_family, size=8, color="64748B")
        c3.fill = fill_kpi
        c3.alignment = align_center

        for r in range(4, 7):
            for c in range(start_col, end_col + 1):
                cell = ws1.cell(row=r, column=c)
                cell.fill = fill_kpi
                cell.border = border_thin

        if end_col > start_col:
            ws1.merge_cells(start_row=4, start_column=start_col, end_row=4, end_column=end_col)
            ws1.merge_cells(start_row=5, start_column=start_col, end_row=5, end_column=end_col)
            ws1.merge_cells(start_row=6, start_column=start_col, end_row=6, end_column=end_col)

        col_idx = end_col + 1

    # Espacio
    ws1.row_dimensions[7].height = 12

    # CUADRO DE DICTAMEN OFICIAL
    ws1.merge_cells("A8:G8")
    ws1["A8"] = dictamen['titulo']
    bg_dictamen = "FEF2F2" if dictamen['estatus'] == "RIESGO CRITICO" else ("FFFBEB" if dictamen['estatus'] == "ALERTA FISCAL" else "ECFDF5")
    fg_dictamen = "991B1B" if dictamen['estatus'] == "RIESGO CRITICO" else ("92400E" if dictamen['estatus'] == "ALERTA FISCAL" else "065F46")
    ws1["A8"].font = Font(name=font_family, size=10, bold=True, color=fg_dictamen)
    ws1["A8"].fill = PatternFill(start_color=bg_dictamen, end_color=bg_dictamen, fill_type="solid")
    ws1["A8"].alignment = Alignment(horizontal='center', vertical='center')
    ws1.row_dimensions[8].height = 24

    ws1.merge_cells("A9:G10")
    ws1["A9"] = dictamen['texto']
    ws1["A9"].font = Font(name=font_family, size=9, color="1E293B")
    ws1["A9"].fill = PatternFill(start_color="FFFFFF", end_color="FFFFFF", fill_type="solid")
    ws1["A9"].alignment = Alignment(horizontal='left', vertical='center', wrap_text=True)

    for r in range(8, 11):
        for c in range(1, 8):
            ws1.cell(row=r, column=c).border = border_thin

    # Espacio
    ws1.row_dimensions[11].height = 12

    # TABLA RESUMEN FINANCIERO DE AUDITORÍA
    headers_fin = ["CONCEPTO AUDITADO", "CANTIDAD", "SUBTOTAL FACTURADO", "IVA TRASLADADO", "TOTAL EN RIESGO / AUDITADO", "% EXPOSICIÓN", "ESTATUS FISCAL"]
    ws1.row_dimensions[12].height = 22
    for idx, h in enumerate(headers_fin, 1):
        cell = ws1.cell(row=12, column=idx, value=h)
        cell.font = font_header
        cell.fill = fill_header_navy
        cell.alignment = align_center
        cell.border = border_thin

    rows_fin = [
        ("Proveedores EFOS Definitivos (Art. 69-B)", len(res['proveedores_definitivos']), sum(p['subtotal'] for p in res['proveedores_definitivos']), sum(p['iva'] for p in res['proveedores_definitivos']), sum(p['total'] for p in res['proveedores_definitivos']), "🚨 NO DEDUCIBLE"),
        ("Proveedores EFOS Presuntos (Art. 69-B)", len(res['proveedores_presuntos']), sum(p['subtotal'] for p in res['proveedores_presuntos']), sum(p['iva'] for p in res['proveedores_presuntos']), sum(p['total'] for p in res['proveedores_presuntos']), "⚠️ï¸ EN OBSERVACIÓN"),
        ("Proveedores Conformes (100% Limpios)", len(res['proveedores_conformes']), sum(p['subtotal'] for p in res['proveedores_conformes']), sum(p['iva'] for p in res['proveedores_conformes']), sum(p['total'] for p in res['proveedores_conformes']), "✅ CONFORME"),
    ]

    cur_row = 13
    for desc, cant, sub, iva_val, tot_val, stat in rows_fin:
        ws1.row_dimensions[cur_row].height = 20
        c1 = ws1.cell(row=cur_row, column=1, value=desc)
        c2 = ws1.cell(row=cur_row, column=2, value=cant)
        c3 = ws1.cell(row=cur_row, column=3, value=sub)
        c4 = ws1.cell(row=cur_row, column=4, value=iva_val)
        c5 = ws1.cell(row=cur_row, column=5, value=tot_val)
        c6 = ws1.cell(row=cur_row, column=6, value=f"=(E{cur_row}/E16)")
        c7 = ws1.cell(row=cur_row, column=7, value=stat)

        c1.font = font_bold if "Definitivos" in desc else font_regular
        c2.font = font_regular
        c2.alignment = align_center
        c3.font = font_regular
        c3.number_format = '"$"#,##0.00_-'
        c3.alignment = align_right
        c4.font = font_regular
        c4.number_format = '"$"#,##0.00_-'
        c4.alignment = align_right
        c5.font = font_bold if "Definitivos" in desc else font_regular
        c5.number_format = '"$"#,##0.00_-'
        c5.alignment = align_right
        c6.font = font_regular
        c6.number_format = '0.0%'
        c6.alignment = align_center
        c7.font = font_bold
        c7.alignment = align_center

        for c in range(1, 8):
            ws1.cell(row=cur_row, column=c).border = border_thin

        cur_row += 1

    # Fila de Totales
    ws1.row_dimensions[16].height = 22
    t1 = ws1.cell(row=16, column=1, value="TOTAL GENERAL AUDITADO")
    t2 = ws1.cell(row=16, column=2, value="=SUM(B13:B15)")
    t3 = ws1.cell(row=16, column=3, value="=SUM(C13:C15)")
    t4 = ws1.cell(row=16, column=4, value="=SUM(D13:D15)")
    t5 = ws1.cell(row=16, column=5, value="=SUM(E13:E15)")
    t6 = ws1.cell(row=16, column=6, value="100.0%")
    t7 = ws1.cell(row=16, column=7, value="AUDITORÍA INTEGRAL")

    t1.font = font_bold
    t2.font = font_bold
    t2.alignment = align_center
    t3.font = font_bold
    t3.number_format = '"$"#,##0.00_-'
    t3.alignment = align_right
    t4.font = font_bold
    t4.number_format = '"$"#,##0.00_-'
    t4.alignment = align_right
    t5.font = font_bold
    t5.number_format = '"$"#,##0.00_-'
    t5.alignment = align_right
    t6.font = font_bold
    t6.alignment = align_center
    t7.font = font_bold
    t7.alignment = align_center

    fill_tot = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")
    for c in range(1, 8):
        cell = ws1.cell(row=16, column=c)
        cell.fill = fill_tot
        cell.border = border_thin

    # Espacio
    ws1.row_dimensions[17].height = 16

    # Cédula de Firmas
    ws1.row_dimensions[18].height = 18
    ws1.row_dimensions[19].height = 36
    ws1.row_dimensions[20].height = 18
    ws1.row_dimensions[21].height = 16

    ws1.merge_cells("A18:C18")
    ws1["A18"] = "AUDITÓ Y VALIDÓ"
    ws1["A18"].font = Font(name=font_family, size=9, bold=True, color="64748B")
    ws1["A18"].alignment = align_center

    ws1.merge_cells("E18:G18")
    ws1["E18"] = "ENTERADO Y CONFORME"
    ws1["E18"].font = Font(name=font_family, size=9, bold=True, color="64748B")
    ws1["E18"].alignment = align_center

    ws1.merge_cells("A20:C20")
    ws1["A20"] = "________________________________________________"
    ws1["A20"].alignment = align_center

    ws1.merge_cells("E20:G20")
    ws1["E20"] = "________________________________________________"
    ws1["E20"].alignment = align_center

    ws1.merge_cells("A21:C21")
    ws1["A21"] = "Contador Público Titulado / Firma Auditora"
    ws1["A21"].font = font_small
    ws1["A21"].alignment = align_center

    ws1.merge_cells("E21:G21")
    ws1["E21"] = f"{res['target_rfc']} - Representante Legal"
    ws1["E21"].font = font_small
    ws1["E21"].alignment = align_center

    # ==========================================
    # PESTAÑA 2: PROVEEDORES EN LISTA NEGRA
    # ==========================================
    ws2 = wb.create_sheet(title="Proveedores en Lista Negra")
    ws2.views.sheetView[0].showGridLines = True

    headers_p2 = [
        "RFC EMISOR", "RAZÓN SOCIAL (CFDI)", "RAZÓN SOCIAL (LISTADO SAT)",
        "SITUACIÓN 69-B", "OFICIO DOF", "PUBLICACIÓN DOF",
        "COMPROBANTES", "SUBTOTAL ($)", "IVA ($)", "TOTAL EN RIESGO ($)", "ACCIÓN LEGAL REQUERIDA"
    ]
    ws2.row_dimensions[1].height = 26
    for idx, h in enumerate(headers_p2, 1):
        cell = ws2.cell(row=1, column=idx, value=h)
        cell.font = font_header
        cell.fill = fill_header_rose if m['total_definitivos'] > 0 else fill_header_navy
        cell.alignment = align_center
        cell.border = border_thin

    row_p2 = 2
    provs_alerta = res['proveedores_definitivos'] + res['proveedores_presuntos']

    if not provs_alerta:
        ws2.merge_cells("A2:K3")
        ws2["A2"] = "✅ FELICIDADES: No se detectó ningún proveedor en el listado del Artículo 69-B del CFF (Definitivos o Presuntos)."
        ws2["A2"].font = Font(name=font_family, size=11, bold=True, color="065F46")
        ws2["A2"].fill = PatternFill(start_color="ECFDF5", end_color="ECFDF5", fill_type="solid")
        ws2["A2"].alignment = align_center
        ws2.row_dimensions[2].height = 24
        ws2.row_dimensions[3].height = 24
    else:
        for p in provs_alerta:
            ws2.row_dimensions[row_p2].height = 22
            accion = "Presentar complementaria y reversar deducción/IVA" if p['es_definitivo'] else "Integrar expediente de materialidad probatoria"
            
            c1 = ws2.cell(row=row_p2, column=1, value=p['rfc'])
            c2 = ws2.cell(row=row_p2, column=2, value=p['nombre_cfdi'])
            c3 = ws2.cell(row=row_p2, column=3, value=p['nombre_oficial_sat'])
            c4 = ws2.cell(row=row_p2, column=4, value=p['situacion'])
            c5 = ws2.cell(row=row_p2, column=5, value=p['oficio_dof'])
            c6 = ws2.cell(row=row_p2, column=6, value=p['fecha_publicacion_dof'])
            c7 = ws2.cell(row=row_p2, column=7, value=p['total_cfdis'])
            c8 = ws2.cell(row=row_p2, column=8, value=p['subtotal'])
            c9 = ws2.cell(row=row_p2, column=9, value=p['iva'])
            c10 = ws2.cell(row=row_p2, column=10, value=p['total'])
            c11 = ws2.cell(row=row_p2, column=11, value=accion)

            c1.font = font_code
            c1.alignment = align_center
            c2.font = font_regular
            c3.font = font_regular
            c4.font = font_bold
            c4.alignment = align_center
            c5.font = font_small
            c6.font = font_code
            c6.alignment = align_center
            c7.font = font_regular
            c7.alignment = align_center
            c8.font = font_regular
            c8.number_format = '"$"#,##0.00_-'
            c8.alignment = align_right
            c9.font = font_regular
            c9.number_format = '"$"#,##0.00_-'
            c9.alignment = align_right
            c10.font = font_bold
            c10.number_format = '"$"#,##0.00_-'
            c10.alignment = align_right
            c11.font = font_bold
            c11.alignment = align_left

            fill_row = PatternFill(start_color="FEF2F2" if p['es_definitivo'] else "FFFBEB", end_color="FEF2F2" if p['es_definitivo'] else "FFFBEB", fill_type="solid")
            for col in range(1, 12):
                cell = ws2.cell(row=row_p2, column=col)
                cell.fill = fill_row
                cell.border = border_thin

            row_p2 += 1

        # Totales lista negra
        ws2.row_dimensions[row_p2].height = 24
        t1 = ws2.cell(row=row_p2, column=1, value="TOTAL EN RIESGO")
        t7 = ws2.cell(row=row_p2, column=7, value=f"=SUM(G2:G{row_p2-1})")
        t8 = ws2.cell(row=row_p2, column=8, value=f"=SUM(H2:H{row_p2-1})")
        t9 = ws2.cell(row=row_p2, column=9, value=f"=SUM(I2:I{row_p2-1})")
        t10 = ws2.cell(row=row_p2, column=10, value=f"=SUM(J2:J{row_p2-1})")

        t1.font = font_bold
        t7.font = font_bold
        t7.alignment = align_center
        t8.font = font_bold
        t8.number_format = '"$"#,##0.00_-'
        t8.alignment = align_right
        t9.font = font_bold
        t9.number_format = '"$"#,##0.00_-'
        t9.alignment = align_right
        t10.font = font_bold
        t10.number_format = '"$"#,##0.00_-'
        t10.alignment = align_right

        fill_tot_efo = PatternFill(start_color="FEE2E2", end_color="FEE2E2", fill_type="solid")
        for col in range(1, 12):
            cell = ws2.cell(row=row_p2, column=col)
            cell.fill = fill_tot_efo
            cell.border = border_thin

    # ==========================================
    # PESTAÑA 3: DETALLE DE FACTURAS EN RIESGO
    # ==========================================
    ws3 = wb.create_sheet(title="Detalle Facturas EFOS")
    ws3.views.sheetView[0].showGridLines = True

    headers_p3 = [
        "FOLIO FISCAL (UUID)", "FECHA EMISIÓN", "RFC EMISOR", "RAZÓN SOCIAL EMISOR",
        "SITUACIÓN DOF", "CONCEPTO / DESCRIPCIÓN", "SUBTOTAL ($)", "IVA TRASLADADO ($)",
        "TOTAL ($)", "MÉTODO PAGO", "ESTATUS DEDUCCIÓN"
    ]
    ws3.row_dimensions[1].height = 26
    for idx, h in enumerate(headers_p3, 1):
        cell = ws3.cell(row=1, column=idx, value=h)
        cell.font = font_header
        cell.fill = fill_header_navy
        cell.alignment = align_center
        cell.border = border_thin

    row_p3 = 2
    cfdis_en_riesgo = []
    for p in provs_alerta:
        for c in p['cfdis']:
            cfdis_en_riesgo.append((p, c))

    if not cfdis_en_riesgo:
        ws3.merge_cells("A2:K3")
        ws3["A2"] = "✅ Ningún comprobante fiscal recibido corresponde a proveedores de operaciones simuladas."
        ws3["A2"].font = Font(name=font_family, size=11, bold=True, color="065F46")
        ws3["A2"].fill = PatternFill(start_color="ECFDF5", end_color="ECFDF5", fill_type="solid")
        ws3["A2"].alignment = align_center
        ws3.row_dimensions[2].height = 24
        ws3.row_dimensions[3].height = 24
    else:
        for p, c in cfdis_en_riesgo:
            ws3.row_dimensions[row_p3].height = 20
            c1 = ws3.cell(row=row_p3, column=1, value=c['uuid'])
            c2 = ws3.cell(row=row_p3, column=2, value=c['fecha'])
            c3 = ws3.cell(row=row_p3, column=3, value=c['emisor_rfc'])
            c4 = ws3.cell(row=row_p3, column=4, value=c['emisor_nombre'])
            c5 = ws3.cell(row=row_p3, column=5, value=p['situacion'])
            c6 = ws3.cell(row=row_p3, column=6, value=c['concepto'])
            c7 = ws3.cell(row=row_p3, column=7, value=c['subtotal'])
            c8 = ws3.cell(row=row_p3, column=8, value=c['iva'])
            c9 = ws3.cell(row=row_p3, column=9, value=c['total'])
            c10 = ws3.cell(row=row_p3, column=10, value=c['metodo_pago'])
            c11 = ws3.cell(row=row_p3, column=11, value="🚨 NO DEDUCIBLE" if p['es_definitivo'] else "⚠️ï¸ BAJO REVISIÓN")

            c1.font = font_code
            c2.font = font_code
            c2.alignment = align_center
            c3.font = font_code
            c3.alignment = align_center
            c4.font = font_regular
            c5.font = font_bold
            c5.alignment = align_center
            c6.font = font_regular
            c7.font = font_regular
            c7.number_format = '"$"#,##0.00_-'
            c7.alignment = align_right
            c8.font = font_regular
            c8.number_format = '"$"#,##0.00_-'
            c8.alignment = align_right
            c9.font = font_bold
            c9.number_format = '"$"#,##0.00_-'
            c9.alignment = align_right
            c10.font = font_code
            c10.alignment = align_center
            c11.font = font_bold
            c11.alignment = align_center

            fill_c = PatternFill(start_color="FEF2F2" if p['es_definitivo'] else "FFFBEB", end_color="FEF2F2" if p['es_definitivo'] else "FFFBEB", fill_type="solid")
            for col in range(1, 12):
                cell = ws3.cell(row=row_p3, column=col)
                cell.fill = fill_c
                cell.border = border_thin

            row_p3 += 1

        # Totales
        ws3.row_dimensions[row_p3].height = 24
        ws3.cell(row=row_p3, column=1, value="TOTAL COMPROBANTES EN RIESGO").font = font_bold
        ws3.cell(row=row_p3, column=7, value=f"=SUM(G2:G{row_p3-1})").number_format = '"$"#,##0.00_-'
        ws3.cell(row=row_p3, column=8, value=f"=SUM(H2:H{row_p3-1})").number_format = '"$"#,##0.00_-'
        ws3.cell(row=row_p3, column=9, value=f"=SUM(I2:I{row_p3-1})").number_format = '"$"#,##0.00_-'

        for col in range(1, 12):
            cell = ws3.cell(row=row_p3, column=col)
            cell.font = font_bold
            cell.fill = PatternFill(start_color="FEE2E2", end_color="FEE2E2", fill_type="solid")
            cell.border = border_thin

    # ==========================================
    # PESTAÑA 4: PADRÓN DE PROVEEDORES CONFORMES
    # ==========================================
    ws4 = wb.create_sheet(title="Proveedores Conformes")
    ws4.views.sheetView[0].showGridLines = True

    headers_p4 = [
        "RFC PROVEEDOR", "NOMBRE O RAZÓN SOCIAL", "COMPROBANTES",
        "SUBTOTAL FACTURADO ($)", "IVA TRASLADADO ($)", "TOTAL FACTURADO ($)",
        "PRIMERA OPERACIÓN", "ÚLTIMA OPERACIÓN", "ESTATUS ART. 69-B SAT"
    ]
    ws4.row_dimensions[1].height = 26
    for idx, h in enumerate(headers_p4, 1):
        cell = ws4.cell(row=1, column=idx, value=h)
        cell.font = font_header
        cell.fill = fill_header_teal
        cell.alignment = align_center
        cell.border = border_thin

    row_p4 = 2
    for p in res['proveedores_conformes']:
        ws4.row_dimensions[row_p4].height = 19
        c1 = ws4.cell(row=row_p4, column=1, value=p['rfc'])
        c2 = ws4.cell(row=row_p4, column=2, value=p['nombre_cfdi'])
        c3 = ws4.cell(row=row_p4, column=3, value=p['total_cfdis'])
        c4 = ws4.cell(row=row_p4, column=4, value=p['subtotal'])
        c5 = ws4.cell(row=row_p4, column=5, value=p['iva'])
        c6 = ws4.cell(row=row_p4, column=6, value=p['total'])
        c7 = ws4.cell(row=row_p4, column=7, value=p['fecha_primera'])
        c8 = ws4.cell(row=row_p4, column=8, value=p['fecha_ultima'])
        c9 = ws4.cell(row=row_p4, column=9, value="✅ CONFORME (NO LISTADO)")

        c1.font = font_code
        c1.alignment = align_center
        c2.font = font_regular
        c3.font = font_regular
        c3.alignment = align_center
        c4.font = font_regular
        c4.number_format = '"$"#,##0.00_-'
        c4.alignment = align_right
        c5.font = font_regular
        c5.number_format = '"$"#,##0.00_-'
        c5.alignment = align_right
        c6.font = font_bold
        c6.number_format = '"$"#,##0.00_-'
        c6.alignment = align_right
        c7.font = font_code
        c7.alignment = align_center
        c8.font = font_code
        c8.alignment = align_center
        c9.font = font_bold
        c9.alignment = align_center

        if row_p4 % 2 == 0:
            fill_zebra = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")
            for col in range(1, 10):
                ws4.cell(row=row_p4, column=col).fill = fill_zebra

        for col in range(1, 10):
            ws4.cell(row=row_p4, column=col).border = border_thin

        row_p4 += 1

    # Fila de Totales pestaña 4
    ws4.row_dimensions[row_p4].height = 24
    ws4.cell(row=row_p4, column=1, value="TOTAL PROVEEDORES CONFORMES").font = font_bold
    ws4.cell(row=row_p4, column=3, value=f"=SUM(C2:C{row_p4-1})").alignment = align_center
    ws4.cell(row=row_p4, column=4, value=f"=SUM(D2:D{row_p4-1})").number_format = '"$"#,##0.00_-'
    ws4.cell(row=row_p4, column=5, value=f"=SUM(E2:E{row_p4-1})").number_format = '"$"#,##0.00_-'
    ws4.cell(row=row_p4, column=6, value=f"=SUM(F2:F{row_p4-1})").number_format = '"$"#,##0.00_-'
    ws4.cell(row=row_p4, column=9, value="100% BLINDAJE FISCAL").alignment = align_center

    for col in range(1, 10):
        cell = ws4.cell(row=row_p4, column=col)
        cell.font = font_bold
        cell.fill = PatternFill(start_color="CCFBF1", end_color="CCFBF1", fill_type="solid")
        cell.border = border_thin

    # Autoajuste de columnas en todas las pestañas
    for ws in [ws1, ws2, ws3, ws4]:
        for col in ws.columns:
            max_len = 0
            col_letter = get_column_letter(col[0].column)
            for cell in col:
                if cell.row in [1, 2, 8, 9, 10] and ws.title == "Dictamen y Resumen":
                    continue
                val = str(cell.value or '')
                if val.startswith('='):
                    val = " $999,999,999.00 "
                if len(val) > max_len:
                    max_len = len(val)
            ws.column_dimensions[col_letter].width = min(45, max(max_len + 3, 12))

    wb.save(output_file)
    print(f"[EFOS OK] Libro Excel generado exitosamente: {output_file}")

def main():
    parser = argparse.ArgumentParser(description="Rastreador de Listas Negras (EFOS - Art. 69-B CFF)")
    parser.add_argument("--rfc", required=True, help="RFC del contribuyente receptor a auditar")
    parser.add_argument("--year", type=int, default=0, help="Año de ejercicio fiscal (0 = consolidado)")
    parser.add_argument("--month", type=int, default=0, help="Mes de ejercicio fiscal (0 = todo el año)")
    parser.add_argument("--xml-dir", default="", help="Directorio con archivos XML o paquetes ZIP")
    parser.add_argument("--facturas-dir", default="", help="Directorio con JSONs en facturas_store")
    parser.add_argument("--output", default="", help="Ruta de destino del libro de Excel generado (.xlsx)")
    parser.add_argument("--json-output", default="", help="Ruta de destino de métricas en JSON")

    args = parser.parse_args()

    facturas_dir = args.facturas_dir
    if not facturas_dir and args.xml_dir:
        parent = os.path.dirname(args.xml_dir)
        client_folder = os.path.basename(args.xml_dir)
        possible_json_dir = os.path.join(os.path.dirname(parent), "facturas_store", client_folder)
        if os.path.exists(possible_json_dir):
            facturas_dir = possible_json_dir

    print(f"[EFOS] Iniciando auditoría 69-B para {args.rfc} (Año: {args.year}, Mes: {args.month})...")
    results = run_efos_audit(
        target_rfc=args.rfc,
        year=args.year,
        month=args.month,
        xml_dir=args.xml_dir,
        facturas_store_dir=facturas_dir,
    )

    m = results['metricas']
    print(f"[EFOS] Resultados: {m['total_proveedores']} proveedores auditados, "
          f"{m['total_definitivos']} definitivos, {m['total_presuntos']} presuntos, "
          f"Monto en riesgo: ${m['monto_total_en_riesgo']:,.2f}")

    if args.json_output:
        clean_res = {
            'target_rfc': results['target_rfc'],
            'periodo': results['periodo'],
            'year': results['year'],
            'month': results['month'],
            'fecha_auditoria': results['fecha_auditoria'],
            'catalogo_stats': results['catalogo_stats'],
            'dictamen': results['dictamen'],
            'metricas': results['metricas'],
            'proveedores_definitivos': [
                {k: v for k, v in p.items() if k != 'cfdis'} for p in results['proveedores_definitivos']
            ],
            'proveedores_presuntos': [
                {k: v for k, v in p.items() if k != 'cfdis'} for p in results['proveedores_presuntos']
            ],
            'proveedores_conformes': [
                {k: v for k, v in p.items() if k != 'cfdis'} for p in results['proveedores_conformes']
            ],
            'cfdis_en_riesgo': [
                {
                    'uuid': c['uuid'],
                    'fecha': c['fecha'],
                    'emisor_rfc': c['emisor_rfc'],
                    'emisor_nombre': c['emisor_nombre'],
                    'situacion': p['situacion'],
                    'concepto': c['concepto'],
                    'subtotal': c['subtotal'],
                    'iva': c['iva'],
                    'total': c['total'],
                    'metodo_pago': c['metodo_pago'],
                }
                for p in (results['proveedores_definitivos'] + results['proveedores_presuntos'])
                for c in p['cfdis']
            ]
        }

        with open(args.json_output, 'w', encoding='utf-8') as f:
            json.dump(clean_res, f, ensure_ascii=False, indent=2)
        print(f"[EFOS OK] JSON de auditoría guardado: {args.json_output}")

    if args.output:
        os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
        generate_efos_excel(results, args.output)

    print("[EFOS OK] Proceso completado exitosamente.")

if __name__ == "__main__":
    main()
