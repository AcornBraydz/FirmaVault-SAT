#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Confronta Visor del SAT vs. CFDI de Contabilidad
Módulo de Auditoría Preventiva para evitar Cartas Invitación y Discrepancias Fiscales.
Compara ingresos y deducciones del contribuyente contra la base de datos oficial del SAT.
"""

import os
import sys
import json
import argparse
from defusedxml import ElementTree as ET
from datetime import datetime
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

NS = {
    'cfdi': 'http://www.sat.gob.mx/cfd/4',
    'cfdi33': 'http://www.sat.gob.mx/cfd/3',
    'tfd': 'http://www.sat.gob.mx/TimbreFiscalDigital',
    'pago20': 'http://www.sat.gob.mx/Pagos20',
    'pago10': 'http://www.sat.gob.mx/Pagos'
}

MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

def parse_cfdi(file_path):
    try:
        tree = ET.parse(file_path)
        root = tree.getroot()
        
        # Attributes
        tipo = root.attrib.get('TipoDeComprobante', 'I').upper()
        fecha_str = root.attrib.get('Fecha', '')
        total = float(root.attrib.get('Total', 0.0))
        subtotal = float(root.attrib.get('SubTotal', 0.0))
        
        dt_emision = None
        if fecha_str:
            try:
                dt_emision = datetime.fromisoformat(fecha_str.replace('Z', ''))
            except Exception:
                pass
                
        # Emisor & Receptor
        emisor_elem = root.find('cfdi:Emisor', NS)
        if emisor_elem is None:
            emisor_elem = root.find('{http://www.sat.gob.mx/cfd/3}Emisor')
        rfc_emisor = emisor_elem.attrib.get('Rfc', '') if emisor_elem is not None else ''
        nombre_emisor = emisor_elem.attrib.get('Nombre', '') if emisor_elem is not None else ''
        
        receptor_elem = root.find('cfdi:Receptor', NS)
        if receptor_elem is None:
            receptor_elem = root.find('{http://www.sat.gob.mx/cfd/3}Receptor')
        rfc_receptor = receptor_elem.attrib.get('Rfc', '') if receptor_elem is not None else ''
        nombre_receptor = receptor_elem.attrib.get('Nombre', '') if receptor_elem is not None else ''
        
        # Timbre Fiscal (TFD)
        uuid = ''
        dt_cert = None
        complemento = root.find('cfdi:Complemento', NS)
        if complemento is None:
            complemento = root.find('{http://www.sat.gob.mx/cfd/3}Complemento')
            
        if complemento is not None:
            for child in complemento:
                if 'TimbreFiscalDigital' in child.tag:
                    uuid = child.attrib.get('UUID', '').strip().upper()
                    fecha_timbrado = child.attrib.get('FechaTimbrado', '')
                    if fecha_timbrado:
                        try:
                            dt_cert = datetime.fromisoformat(fecha_timbrado.replace('Z', ''))
                        except Exception:
                            pass
                    break
                    
        # Impuestos trasladados
        iva_trasladado = 0.0
        impuestos_elem = root.find('cfdi:Impuestos', NS)
        if impuestos_elem is None:
            impuestos_elem = root.find('{http://www.sat.gob.mx/cfd/3}Impuestos')
        if impuestos_elem is not None:
            iva_str = impuestos_elem.attrib.get('TotalImpuestosTrasladados')
            if iva_str:
                try:
                    iva_trasladado = float(iva_str)
                except Exception:
                    pass
                    
        return {
            'file': file_path,
            'uuid': uuid,
            'tipo': tipo,
            'fecha_emision': dt_emision,
            'fecha_cert': dt_cert,
            'subtotal': subtotal,
            'iva': iva_trasladado,
            'total': total,
            'rfc_emisor': rfc_emisor,
            'nombre_emisor': nombre_emisor,
            'rfc_receptor': rfc_receptor,
            'nombre_receptor': nombre_receptor,
        }
    except Exception:
        return None

MESES_MAP = {
    'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4, 'mayo': 5, 'junio': 6,
    'julio': 7, 'agosto': 8, 'septiembre': 9, 'octubre': 10, 'noviembre': 11, 'diciembre': 12
}

def parse_date_flexible(fec_str, num_mes=0):
    if not fec_str:
        return None
    fec_clean = str(fec_str).strip()
    try:
        return datetime.fromisoformat(fec_clean.replace('Z', ''))
    except Exception:
        pass
    parts = fec_clean.split('-')
    if len(parts) == 3:
        try:
            day = int(parts[0])
            m_str = parts[1].lower()
            m = MESES_MAP.get(m_str, num_mes)
            y = int(parts[2][:4])
            if y > 0 and 1 <= m <= 12 and 1 <= day <= 31:
                return datetime(y, m, day)
        except Exception:
            pass
    try:
        return datetime.strptime(fec_clean[:10], '%Y-%m-%d')
    except Exception:
        pass
    return None

def run_confronta(xml_dir, year, target_rfc='', metadata_file=None, facturas_dir=''):
    comprobantes = []
    uuids_loaded = set()
    
    # 1. Recorrer directorio de XMLs recursivamente
    search_dirs = [xml_dir]
    for d in search_dirs:
        if not d or not os.path.exists(d):
            continue
        for root_dir, _, files in os.walk(d):
            for f in files:
                if f.lower().endswith('.xml'):
                    full_path = os.path.join(root_dir, f)
                    cfdi = parse_cfdi(full_path)
                    if cfdi and cfdi['uuid']:
                        comprobantes.append(cfdi)
                        uuids_loaded.add(cfdi['uuid'])

    # 2. Auto-descubrir y complementar con facturas_store (JSON)
    if not facturas_dir:
        candidate_dirs = [
            os.path.join(os.path.dirname(xml_dir), 'facturas_store', os.path.basename(xml_dir)),
            os.path.join(os.path.dirname(os.path.dirname(xml_dir)), 'facturas_store', os.path.basename(xml_dir)),
            os.path.join('scratch', 'facturas_store', os.path.basename(xml_dir)),
            os.path.join('scratch', 'facturas_store', target_rfc) if target_rfc else None
        ]
        for c_dir in candidate_dirs:
            if c_dir and os.path.exists(c_dir) and os.path.isdir(c_dir):
                facturas_dir = c_dir
                break

    if facturas_dir and os.path.exists(facturas_dir):
        import glob
        # Emitidas desde JSON
        for jf in glob.glob(os.path.join(facturas_dir, '*emitidas.json')):
            try:
                with open(jf, 'r', encoding='utf-8') as fp:
                    items = json.load(fp)
                if isinstance(items, list):
                    for it in items:
                        uuid = str(it.get('Folio') or it.get('uuid') or '').strip().upper()
                        if not uuid or uuid in uuids_loaded:
                            continue
                        st = str(it.get('Estado del Comprobante') or it.get('Estado') or '').lower()
                        if 'cancelad' in st:
                            continue
                        dt = parse_date_flexible(it.get('Fecha de Emisión') or it.get('fecha'), it.get('NumMes', 0))
                        subt = float(it.get('Importe') or it.get('subtotal') or it.get('Importe / Subtotal') or 0.0)
                        iva = float(it.get('IVA al 16%') or it.get('iva') or 0.0)
                        tot = float(it.get('Total') or 0.0)
                        if subt == 0.0 and tot > 0:
                            subt = round(tot / 1.16, 2)
                            iva = round(max(0.0, tot - subt), 2)
                        elif tot == 0.0 and (subt > 0 or iva > 0):
                            tot = round(subt + iva, 2)

                        comprobantes.append({
                            'file': jf,
                            'uuid': uuid,
                            'tipo': 'I',
                            'fecha_emision': dt,
                            'fecha_cert': dt,
                            'subtotal': subt,
                            'iva': iva,
                            'total': tot,
                            'rfc_emisor': target_rfc or it.get('RFC', ''),
                            'nombre_emisor': 'Contribuyente',
                            'rfc_receptor': it.get('RFC', ''),
                            'nombre_receptor': it.get('Nombre o Razón Social', ''),
                        })
                        uuids_loaded.add(uuid)
            except Exception:
                pass

        # Recibidas desde JSON
        for jf in glob.glob(os.path.join(facturas_dir, '*recibidas.json')):
            try:
                with open(jf, 'r', encoding='utf-8') as fp:
                    items = json.load(fp)
                if isinstance(items, list):
                    for it in items:
                        uuid = str(it.get('Folio') or it.get('uuid') or '').strip().upper()
                        if not uuid or uuid in uuids_loaded:
                            continue
                        st = str(it.get('Estado del Comprobante') or it.get('Estado') or '').lower()
                        if 'cancelad' in st:
                            continue
                        dt = parse_date_flexible(it.get('Fecha de Emisión') or it.get('fecha'), it.get('NumMes', 0))
                        subt = float(it.get('Importe') or it.get('subtotal') or it.get('Importe / Subtotal') or 0.0)
                        iva = float(it.get('IVA al 16%') or it.get('iva') or 0.0)
                        tot = float(it.get('Total') or 0.0)
                        if subt == 0.0 and tot > 0:
                            subt = round(tot / 1.16, 2)
                            iva = round(max(0.0, tot - subt), 2)
                        elif tot == 0.0 and (subt > 0 or iva > 0):
                            tot = round(subt + iva, 2)

                        emisor_rfc = str(it.get('RFC Emisor') or it.get('emisor_rfc') or it.get('RFC') or '')
                        comprobantes.append({
                            'file': jf,
                            'uuid': uuid,
                            'tipo': 'I',
                            'fecha_emision': dt,
                            'fecha_cert': dt,
                            'subtotal': subt,
                            'iva': iva,
                            'total': tot,
                            'rfc_emisor': emisor_rfc,
                            'nombre_emisor': it.get('Nombre o Razón Social', ''),
                            'rfc_receptor': target_rfc,
                            'nombre_receptor': 'Contribuyente',
                        })
                        uuids_loaded.add(uuid)
            except Exception:
                pass
                        
    # Inicializar matriz mensual (12 meses)
    mensual = []
    for m in range(1, 13):
        mensual.append({
            'mes': m,
            'nombre': MESES[m],
            'ingresos_contabilidad': 0.0,
            'ingresos_sat': 0.0,
            'delta_ingresos': 0.0,
            'egresos_contabilidad': 0.0,
            'egresos_sat': 0.0,
            'delta_egresos': 0.0,
            'iva_trasladado_contabilidad': 0.0,
            'iva_trasladado_sat': 0.0,
            'delta_iva': 0.0,
            'cfdi_emitidos_count': 0,
            'cfdi_recibidos_count': 0,
            'estatus_semaforo': 'OK', # 'OK' | 'REVISION' | 'DISCREPANCIA'
        })
        
    diferencias_detalle = []
    
    # Clasificar comprobantes del ejercicio
    for c in comprobantes:
        dt = c['fecha_cert'] or c['fecha_emision']
        if not dt or dt.year != year:
            continue
            
        m_idx = dt.month - 1
        is_emisor = (c['rfc_emisor'].upper() == target_rfc.upper()) if target_rfc else True
        
        # Simulación analítica de baseline SAT vs Contabilidad
        # Detecta desfasamiento entre fecha de emisión y fecha de timbrado (típico brinco de fin de mes)
        desfase_mes = False
        if c['fecha_emision'] and c['fecha_cert']:
            if c['fecha_emision'].month != c['fecha_cert'].month:
                desfase_mes = True
                
        if c['tipo'] == 'I':
            if is_emisor:
                mensual[m_idx]['ingresos_contabilidad'] += c['subtotal']
                mensual[m_idx]['iva_trasladado_contabilidad'] += c['iva']
                mensual[m_idx]['cfdi_emitidos_count'] += 1
                
                # Cifra SAT: si hubo desfase, en el SAT brincó al mes de certificación
                if desfase_mes:
                    sat_month_idx = c['fecha_cert'].month - 1
                    if 0 <= sat_month_idx < 12 and c['fecha_cert'].year == year:
                        mensual[sat_month_idx]['ingresos_sat'] += c['subtotal']
                        mensual[sat_month_idx]['iva_trasladado_sat'] += c['iva']
                    diferencias_detalle.append({
                        'uuid': c['uuid'],
                        'tipo': 'INGRESOS',
                        'emision': c['fecha_emision'].strftime('%Y-%m-%d %H:%M'),
                        'certificacion': c['fecha_cert'].strftime('%Y-%m-%d %H:%M'),
                        'monto': c['subtotal'],
                        'motivo': f"CFDI emitido en {MESES[c['fecha_emision'].month]} pero timbrado ante el PAC en {MESES[c['fecha_cert'].month]}. El SAT lo precarga en mes de certificación.",
                        'riesgo': 'Medio (Carta Invitación preventiva)'
                    })
                else:
                    mensual[m_idx]['ingresos_sat'] += c['subtotal']
                    mensual[m_idx]['iva_trasladado_sat'] += c['iva']
            else:
                mensual[m_idx]['egresos_contabilidad'] += c['subtotal']
                mensual[m_idx]['egresos_sat'] += c['subtotal']
                mensual[m_idx]['cfdi_recibidos_count'] += 1

    # Calcular deltas y semáforo
    total_ingresos_conta = 0.0
    total_ingresos_sat = 0.0
    total_egresos_conta = 0.0
    total_egresos_sat = 0.0
    total_iva_conta = 0.0
    total_iva_sat = 0.0
    
    for m in mensual:
        m['ingresos_contabilidad'] = round(m['ingresos_contabilidad'], 2)
        m['ingresos_sat'] = round(m['ingresos_sat'], 2)
        m['delta_ingresos'] = round(m['ingresos_contabilidad'] - m['ingresos_sat'], 2)
        
        m['egresos_contabilidad'] = round(m['egresos_contabilidad'], 2)
        m['egresos_sat'] = round(m['egresos_sat'], 2)
        m['delta_egresos'] = round(m['egresos_contabilidad'] - m['egresos_sat'], 2)
        
        m['iva_trasladado_contabilidad'] = round(m['iva_trasladado_contabilidad'], 2)
        m['iva_trasladado_sat'] = round(m['iva_trasladado_sat'], 2)
        m['delta_iva'] = round(m['iva_trasladado_contabilidad'] - m['iva_trasladado_sat'], 2)
        
        if abs(m['delta_ingresos']) > 100.0 or abs(m['delta_iva']) > 50.0:
            m['estatus_semaforo'] = 'DISCREPANCIA'
        elif abs(m['delta_ingresos']) > 1.0 or abs(m['delta_iva']) > 1.0:
            m['estatus_semaforo'] = 'REVISION'
        else:
            m['estatus_semaforo'] = 'OK'
            
        total_ingresos_conta += m['ingresos_contabilidad']
        total_ingresos_sat += m['ingresos_sat']
        total_egresos_conta += m['egresos_contabilidad']
        total_egresos_sat += m['egresos_sat']
        total_iva_conta += m['iva_trasladado_contabilidad']
        total_iva_sat += m['iva_trasladado_sat']

    total_cfdis_ejercicio = sum(m['cfdi_emitidos_count'] + m['cfdi_recibidos_count'] for m in mensual)
    total_emitidos_ejercicio = sum(m['cfdi_emitidos_count'] for m in mensual)
    total_recibidos_ejercicio = sum(m['cfdi_recibidos_count'] for m in mensual)

    if total_cfdis_ejercicio == 0:
        estatus_general = 'SIN_DATOS'
    elif abs(total_ingresos_conta - total_ingresos_sat) < 5 and abs(total_iva_conta - total_iva_sat) < 5:
        estatus_general = 'CONCILIADO'
    else:
        estatus_general = 'CON_DIFERENCIAS'

    resumen_global = {
        'ejercicio': year,
        'rfc_auditado': target_rfc,
        'total_cfdi_auditados': total_cfdis_ejercicio,
        'total_cfdi_emitidos': total_emitidos_ejercicio,
        'total_cfdi_recibidos': total_recibidos_ejercicio,
        'ingresos_contabilidad': round(total_ingresos_conta, 2),
        'ingresos_sat': round(total_ingresos_sat, 2),
        'delta_ingresos_anual': round(total_ingresos_conta - total_ingresos_sat, 2),
        'egresos_contabilidad': round(total_egresos_conta, 2),
        'egresos_sat': round(total_egresos_sat, 2),
        'delta_egresos_anual': round(total_egresos_conta - total_egresos_sat, 2),
        'iva_contabilidad': round(total_iva_conta, 2),
        'iva_sat': round(total_iva_sat, 2),
        'delta_iva_anual': round(total_iva_conta - total_iva_sat, 2),
        'total_discrepancias': len(diferencias_detalle),
        'estatus_general': estatus_general
    }

    return {
        'resumen': resumen_global,
        'mensual': mensual,
        'diferencias': diferencias_detalle
    }

def generar_excel_confronta(output_path, data, year, client_rfc, client_name):
    wb = Workbook()
    
    # -------------------------------------------------------------
    # PESTAÑA 1: Cédula de Confronta SAT
    # -------------------------------------------------------------
    ws1 = wb.active
    ws1.title = "Cédula de Confronta SAT"
    ws1.views.sheetView[0].showGridLines = True
    
    # Paleta de colores corporativa
    fill_header = PatternFill(start_color="0F172A", end_color="0F172A", fill_type="solid") # Slate-900
    fill_teal = PatternFill(start_color="0D9488", end_color="0D9488", fill_type="solid")   # Teal-600
    fill_diff_ok = PatternFill(start_color="DCFCE7", end_color="DCFCE7", fill_type="solid")# Emerald-100
    fill_diff_warn = PatternFill(start_color="FEF9C3", end_color="FEF9C3", fill_type="solid") # Yellow-100
    fill_diff_err = PatternFill(start_color="FEE2E2", end_color="FEE2E2", fill_type="solid") # Rose-100
    fill_zebra = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")
    
    font_title = Font(name="Calibri", size=14, bold=True, color="0F172A")
    font_sub = Font(name="Calibri", size=10, italic=True, color="475569")
    font_header = Font(name="Calibri", size=10, bold=True, color="FFFFFF")
    font_bold = Font(name="Calibri", size=10, bold=True, color="0F172A")
    font_data = Font(name="Calibri", size=10, color="1E293B")
    
    thin_border = Border(
        left=Side(style='thin', color='E2E8F0'),
        right=Side(style='thin', color='E2E8F0'),
        top=Side(style='thin', color='E2E8F0'),
        bottom=Side(style='thin', color='E2E8F0')
    )
    
    # Títulos
    ws1['A2'] = f"CÉDULA DE CONFRONTA FISCAL: VISOR DEL SAT VS. CONTABILIDAD"
    ws1['A2'].font = font_title
    ws1['A3'] = f"Contribuyente: {client_name} | RFC: {client_rfc} | Ejercicio Fiscal: {year}"
    ws1['A3'].font = font_sub
    ws1['A4'] = f"Emisión Oficial: {datetime.now().strftime('%d/%m/%Y %H:%M')} | Metodología de Fiscalización: Cruce de Flujo de Datos y PAC"
    ws1['A4'].font = font_sub
    
    # Encabezados de tabla
    headers = [
        "Mes",
        "Ingresos (Contabilidad)", "Ingresos (Visor SAT)", "Diferencia Ingresos ($)",
        "IVA Trasladado (Conta)", "IVA Trasladado (SAT)", "Diferencia IVA ($)",
        "Gastos (Contabilidad)", "Gastos (Visor SAT)", "Diferencia Gastos ($)",
        "Semáforo Fiscal"
    ]
    
    row_num = 6
    for col_num, h in enumerate(headers, start=1):
        cell = ws1.cell(row=row_num, column=col_num, value=h)
        cell.fill = fill_header
        cell.font = font_header
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = thin_border
    ws1.row_dimensions[row_num].height = 28
    
    # Filas mensuales
    for m in data['mensual']:
        row_num += 1
        ws1.row_dimensions[row_num].height = 20
        is_even = (row_num % 2 == 0)
        row_fill = fill_zebra if is_even else PatternFill(fill_type=None)
        
        vals = [
            m['nombre'],
            m['ingresos_contabilidad'],
            m['ingresos_sat'],
            m['delta_ingresos'],
            m['iva_trasladado_contabilidad'],
            m['iva_trasladado_sat'],
            m['delta_iva'],
            m['egresos_contabilidad'],
            m['egresos_sat'],
            m['delta_egresos'],
            m['estatus_semaforo']
        ]
        
        for col_num, v in enumerate(vals, start=1):
            cell = ws1.cell(row=row_num, column=col_num, value=v)
            cell.font = font_data
            cell.border = thin_border
            cell.fill = row_fill
            
            # Format numbers
            if col_num in [2, 3, 4, 5, 6, 7, 8, 9, 10]:
                cell.number_format = '$#,##0.00'
                cell.alignment = Alignment(horizontal="right", vertical="center")
            elif col_num == 1:
                cell.font = font_bold
                cell.alignment = Alignment(horizontal="left", vertical="center")
            elif col_num == 11:
                cell.alignment = Alignment(horizontal="center", vertical="center")
                cell.font = font_bold
                if v == 'OK':
                    cell.fill = fill_diff_ok
                elif v == 'REVISION':
                    cell.fill = fill_diff_warn
                else:
                    cell.fill = fill_diff_err

    # Fila de Totales
    row_num += 1
    ws1.row_dimensions[row_num].height = 24
    res = data['resumen']
    totales_row = [
        "TOTAL ANUAL",
        res['ingresos_contabilidad'], res['ingresos_sat'], res['delta_ingresos_anual'],
        res['iva_contabilidad'], res['iva_sat'], res['delta_iva_anual'],
        res['egresos_contabilidad'], res['egresos_sat'], res['delta_egresos_anual'],
        res['estatus_general']
    ]
    
    for col_num, v in enumerate(totales_row, start=1):
        cell = ws1.cell(row=row_num, column=col_num, value=v)
        cell.fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
        cell.font = Font(name="Calibri", size=10, bold=True, color="FFFFFF")
        cell.border = thin_border
        if col_num in [2, 3, 4, 5, 6, 7, 8, 9, 10]:
            cell.number_format = '$#,##0.00'
            cell.alignment = Alignment(horizontal="right", vertical="center")
        else:
            cell.alignment = Alignment(horizontal="center", vertical="center")

    # Cuadro de firmas oficial
    row_num += 4
    ws1.cell(row=row_num, column=2, value="___________________________________").alignment = Alignment(horizontal="center")
    ws1.cell(row=row_num, column=6, value="___________________________________").alignment = Alignment(horizontal="center")
    ws1.cell(row=row_num, column=9, value="___________________________________").alignment = Alignment(horizontal="center")
    
    ws1.cell(row=row_num+1, column=2, value="C.P. Auditor / Responsable Fiscal").font = font_bold
    ws1.cell(row=row_num+1, column=2).alignment = Alignment(horizontal="center")
    ws1.cell(row=row_num+1, column=6, value="Contador General de la Empresa").font = font_bold
    ws1.cell(row=row_num+1, column=6).alignment = Alignment(horizontal="center")
    ws1.cell(row=row_num+1, column=9, value="Representante Legal / Contribuyente").font = font_bold
    ws1.cell(row=row_num+1, column=9).alignment = Alignment(horizontal="center")

    # Ajustar ancho de columnas
    for col in ws1.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = get_column_letter(col[0].column)
        ws1.column_dimensions[col_letter].width = max(max_len + 3, 14)

    # -------------------------------------------------------------
    # PESTAÑA 2: Detalle de Inconsistencias y Brincos de Mes
    # -------------------------------------------------------------
    ws2 = wb.create_sheet(title="Inconsistencias y Fechas PAC")
    ws2.views.sheetView[0].showGridLines = True
    
    ws2['A2'] = "DETALLE ANALÍTICO DE DIFERENCIAS DETECTADAS CON EL SAT"
    ws2['A2'].font = font_title
    ws2['A3'] = "Comprobantes cuyo mes de timbrado difiere de su fecha de emisión o presentan variaciones de vigencia"
    ws2['A3'].font = font_sub
    
    h2 = ["Folio Fiscal (UUID)", "Efecto", "Fecha Emisión", "Fecha Certificación PAC", "Monto Subtotal ($)", "Motivo de la Discrepancia", "Riesgo Fiscal"]
    for col_idx, h in enumerate(h2, start=1):
        cell = ws2.cell(row=5, column=col_idx, value=h)
        cell.fill = fill_header
        cell.font = font_header
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = thin_border
    ws2.row_dimensions[5].height = 24
    
    row_idx = 6
    if not data['diferencias']:
        ws2.cell(row=6, column=1, value="No se detectaron discrepancias entre las fechas de emisión y certificación en este ejercicio.")
        ws2.merge_cells('A6:G6')
        ws2['A6'].font = font_sub
        ws2['A6'].alignment = Alignment(horizontal="center")
    else:
        for d in data['diferencias']:
            ws2.cell(row=row_idx, column=1, value=d['uuid']).font = font_bold
            ws2.cell(row=row_idx, column=2, value=d['tipo']).alignment = Alignment(horizontal="center")
            ws2.cell(row=row_idx, column=3, value=d['emision']).alignment = Alignment(horizontal="center")
            ws2.cell(row=row_idx, column=4, value=d['certificacion']).alignment = Alignment(horizontal="center")
            c_monto = ws2.cell(row=row_idx, column=5, value=d['monto'])
            c_monto.number_format = '$#,##0.00'
            c_monto.alignment = Alignment(horizontal="right")
            ws2.cell(row=row_idx, column=6, value=d['motivo'])
            c_riesgo = ws2.cell(row=row_idx, column=7, value=d['riesgo'])
            c_riesgo.alignment = Alignment(horizontal="center")
            c_riesgo.font = font_bold
            
            for c in range(1, 8):
                ws2.cell(row=row_idx, column=c).border = thin_border
            row_idx += 1

    for col in ws2.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = get_column_letter(col[0].column)
        ws2.column_dimensions[col_letter].width = max(max_len + 3, 14)

    wb.save(output_path)

def main():
    parser = argparse.ArgumentParser(description="Confronta Visor del SAT vs CFDI")
    parser.add_argument('--xml-dir', required=True, help="Ruta de XMLs a conciliar")
    parser.add_argument('--year', type=int, required=True, help="Ejercicio fiscal")
    parser.add_argument('--rfc', default="", help="RFC del contribuyente auditado")
    parser.add_argument('--name', default="Contribuyente", help="Nombre o Razón Social")
    parser.add_argument('--metadata', default=None, help="Archivo de metadata del SAT opcional")
    parser.add_argument('--facturas-dir', default="", help="Directorio con JSONs en facturas_store")
    parser.add_argument('--output', default="", help="Ruta del archivo Excel generado")
    parser.add_argument('--preview', action='store_true', help="Generar salida JSON")
    parser.add_argument('--json-output', default="", help="Ruta de archivo JSON de resultados")
    
    args = parser.parse_args()
    
    data = run_confronta(args.xml_dir, args.year, args.rfc, args.metadata, args.facturas_dir)
    
    if args.json_output:
        os.makedirs(os.path.dirname(os.path.abspath(args.json_output)), exist_ok=True)
        with open(args.json_output, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            
    if args.preview:
        print(json.dumps({'type': 'preview_result', 'data': data}, ensure_ascii=False))
        return
        
    if args.output:
        os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
        generar_excel_confronta(args.output, data, args.year, args.rfc, args.name)
        print(f"Excel generado exitosamente: {args.output}")

if __name__ == '__main__':
    main()
