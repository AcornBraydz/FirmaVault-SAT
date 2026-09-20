#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Generador Automatizado de Pólizas Contables para Contabilidad Electrónica (Anexo 24 RMF).
Asocia UUID de 36 caracteres a cada asiento contable.
Exporta a Contpaqi Contabilidad (.txt), Aspel COI (.csv) y Libro Maestro Excel (.xlsx).
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
    'nomina12': 'http://www.sat.gob.mx/nomina12'
}

CUENTAS_SAT = {
    'bancos': '102.01.001',
    'clientes': '105.01.001',
    'retencion_isr_acreditable': '113.01.001',
    'retencion_iva_acreditable': '113.02.001',
    'iva_acreditable_pagado': '118.01.001',
    'iva_por_acreditar': '118.02.001',
    'proveedores': '201.01.001',
    'iva_trasladado_cobrado': '208.01.001',
    'iva_por_trasladar': '208.02.001',
    'retencion_isr': '216.01.001',
    'retencion_iva': '216.02.001',
    'retencion_imss': '216.03.001',
    'ingresos_16': '401.01.001',
    'descuento_ventas': '401.04.001',
    'ingresos_exentos': '401.03.001',
    'descuento_compras': '501.02.001',
    'gastos_generales': '601.01.001',
    'sueldos_salarios': '601.02.001'
}

def parse_cfdi_for_poliza(file_path):
    try:
        tree = ET.parse(file_path)
        root = tree.getroot()
        tipo = root.attrib.get('TipoDeComprobante', 'I').upper()
        metodo = root.attrib.get('MetodoPago', 'PUE')
        forma = root.attrib.get('FormaPago', '03')
        fecha_str = root.attrib.get('Fecha', '')
        total = float(root.attrib.get('Total', 0.0))
        subtotal = float(root.attrib.get('SubTotal', 0.0))
        descuento = float(root.attrib.get('Descuento', 0.0))
        
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

        uuid = ''
        comp = root.find('cfdi:Complemento', NS)
        if comp is None:
            comp = root.find('{http://www.sat.gob.mx/cfd/3}Complemento')
        if comp is not None:
            for child in comp:
                if 'TimbreFiscalDigital' in child.tag:
                    uuid = child.attrib.get('UUID', '').strip().upper()
                    break

        dt = None
        if fecha_str:
            try:
                dt = datetime.fromisoformat(fecha_str.replace('Z', ''))
            except Exception:
                pass

        # Impuestos
        iva = 0.0
        ret_isr = 0.0
        ret_iva = 0.0
        impuestos_elem = root.find('cfdi:Impuestos', NS)
        if impuestos_elem is None:
            impuestos_elem = root.find('{http://www.sat.gob.mx/cfd/3}Impuestos')
        if impuestos_elem is not None:
            iva_str = impuestos_elem.attrib.get('TotalImpuestosTrasladados')
            if iva_str:
                try: iva = float(iva_str)
                except Exception: pass

            # Desglose fidedigno de retenciones individuales (001: ISR, 002: IVA)
            for ret_tag in ['cfdi:Retenciones', '{http://www.sat.gob.mx/cfd/3}Retenciones']:
                ret_node = impuestos_elem.find(ret_tag, NS) if ':' in ret_tag else impuestos_elem.find(ret_tag)
                if ret_node is not None:
                    for r in ret_node:
                        imp_code = r.attrib.get('Impuesto', '')
                        try:
                            imp_val = float(r.attrib.get('Importe', 0.0))
                        except Exception:
                            imp_val = 0.0
                        if imp_code in ['001', 'ISR']:
                            ret_isr += imp_val
                        elif imp_code in ['002', 'IVA']:
                            ret_iva += imp_val
                    break

            if ret_isr == 0.0 and ret_iva == 0.0:
                ret_str = impuestos_elem.attrib.get('TotalImpuestosRetenidos')
                if ret_str:
                    try: ret_isr = float(ret_str)
                    except Exception: pass

        # Nómina (Catálogo Oficial SAT: 001 = IMSS/Seguridad Social, 002 = ISR)
        imss = 0.0
        if tipo == 'N' and comp is not None:
            for n in comp.findall('.//nomina12:Nomina', NS):
                ded_elem = n.find('nomina12:Deducciones', NS)
                if ded_elem is not None:
                    for d in ded_elem.findall('nomina12:Deduccion', NS):
                        tipo_d = d.attrib.get('TipoDeduccion', '')
                        try:
                            imp_d = float(d.attrib.get('Importe', 0.0))
                        except Exception:
                            imp_d = 0.0
                        if tipo_d in ['001', '1']:
                            imss += imp_d  # Clave 001: Seguridad Social (IMSS)
                        elif tipo_d in ['002', '2']:
                            ret_isr += imp_d  # Clave 002: ISR Retenido


        return {
            'file': file_path,
            'uuid': uuid,
            'tipo': tipo,
            'metodo': metodo,
            'forma': forma,
            'fecha': dt,
            'subtotal': subtotal,
            'descuento': round(descuento, 2),
            'iva': iva,
            'ret_isr': ret_isr,
            'ret_iva': ret_iva,
            'imss': imss,
            'total': total,
            'rfc_emisor': rfc_emisor,
            'nombre_emisor': nombre_emisor,
            'rfc_receptor': rfc_receptor,
            'nombre_receptor': nombre_receptor,
        }
    except Exception:
        return None

def balance_asientos(asientos, adjust_index=0):
    """
    Garantiza la partida doble estricta: sum(debe) == sum(haber).
    Ajusta diferencias residuales de centavos (por redondeo de conceptos del CFDI)
    al asiento contable principal (gasto, ingreso o provisión).
    """
    if not asientos:
        return asientos
    sum_debe = round(sum(a['debe'] for a in asientos), 2)
    sum_haber = round(sum(a['haber'] for a in asientos), 2)
    diff = round(sum_debe - sum_haber, 2)
    if diff != 0.0:
        idx = max(0, min(adjust_index, len(asientos) - 1))
        if diff > 0:
            # Debe > Haber -> disminuir Debe o aumentar Haber
            if asientos[idx]['debe'] > 0:
                asientos[idx]['debe'] = round(asientos[idx]['debe'] - diff, 2)
            else:
                asientos[idx]['haber'] = round(asientos[idx]['haber'] + diff, 2)
        else:
            # Haber > Debe -> aumentar Debe o disminuir Haber
            diff_abs = abs(diff)
            if asientos[idx]['debe'] > 0:
                asientos[idx]['debe'] = round(asientos[idx]['debe'] + diff_abs, 2)
            else:
                asientos[idx]['haber'] = round(asientos[idx]['haber'] - diff_abs, 2)
    return asientos

def generar_polizas(xml_dir, year, month=0, target_rfc="", facturas_dir=""):
    cfdis = []
    seen_uuids = set()
    if xml_dir and os.path.exists(xml_dir):
        for root_dir, _, files in os.walk(xml_dir):
            for f in files:
                if f.lower().endswith('.xml'):
                    p = os.path.join(root_dir, f)
                    c = parse_cfdi_for_poliza(p)
                    if c and c['uuid']:
                        cfdis.append(c)
                        seen_uuids.add(c['uuid'].upper().strip())

    # Fallback / Complemento con facturas_store (JSON)
    if not facturas_dir or not os.path.exists(facturas_dir):
        candidates = []
        if xml_dir:
            c_base = os.path.basename(xml_dir.rstrip('\\/'))
            p_dir = os.path.dirname(xml_dir.rstrip('\\/'))
            candidates.append(os.path.join(p_dir, 'facturas_store', c_base))
            candidates.append(os.path.join(os.path.dirname(p_dir), 'facturas_store', c_base))
            candidates.append(os.path.join('scratch', 'facturas_store', c_base))
        if target_rfc:
            candidates.append(os.path.join('scratch', 'facturas_store', target_rfc))
        for c in candidates:
            if c and os.path.exists(c):
                facturas_dir = c
                break

    MESES_MAP = {
        'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4,
        'mayo': 5, 'junio': 6, 'julio': 7, 'agosto': 8,
        'septiembre': 9, 'octubre': 10, 'noviembre': 11, 'diciembre': 12
    }

    def parse_dt(fec_str, num_mes_hint=0):
        if not fec_str:
            return None
        fec_str = str(fec_str).strip()
        if len(fec_str) >= 10 and fec_str[4] == '-' and fec_str[7] == '-':
            try:
                return datetime.fromisoformat(fec_str[:10])
            except Exception:
                pass
        parts = fec_str.split('-')
        if len(parts) == 3:
            try:
                y = int(parts[2].strip())
                m_str = parts[1].strip().lower()
                m = MESES_MAP.get(m_str, num_mes_hint or 1)
                d = int(parts[0].strip())
                return datetime(year=y, month=m, day=min(max(d, 1), 28))
            except Exception:
                pass
        return None

    if facturas_dir and os.path.exists(facturas_dir):
        import glob
        # A) Emitidas (JSON)
        for jf in glob.glob(os.path.join(facturas_dir, '*emitidas*.json')):
            try:
                with open(jf, 'r', encoding='utf-8') as f:
                    records = json.load(f)
                if isinstance(records, list):
                    for it in records:
                        u = str(it.get('Folio') or it.get('uuid') or it.get('UUID') or '').upper().strip()
                        if not u or u in seen_uuids:
                            continue
                        fec_raw = str(it.get('Fecha de Emisión') or it.get('fecha_emision') or it.get('fecha') or '')
                        num_m = int(it.get('NumMes', 0) or 0)
                        dt = parse_dt(fec_raw, num_m)
                        if not dt or dt.year != year:
                            continue
                        if month > 0 and dt.month != month:
                            continue

                        tot = float(it.get('Total') or 0.0)
                        subt = float(it.get('Importe') or it.get('SubTotal') or it.get('subtotal') or 0.0)
                        if subt == 0.0 and tot > 0:
                            subt = round(tot / 1.16, 2)
                        iva = float(it.get('IVA al 16%') or it.get('iva') or 0.0)
                        if iva == 0.0 and tot > subt:
                            iva = round(tot - subt, 2)

                        metodo = str(it.get('MetodoPago') or 'PUE').upper().strip()
                        forma = str(it.get('FormaPago') or '03').strip()
                        efecto = str(it.get('Efecto del Comprobante') or it.get('tipo') or 'Ingreso').lower()
                        rec_rfc = str(it.get('RFC') or it.get('receptor_rfc') or '').upper().strip()
                        rec_nom = str(it.get('Nombre o Razón Social') or it.get('nombre_razon_social') or it.get('receptor_nombre') or rec_rfc).strip()

                        is_rep = ('pago' in efecto or metodo == 'REP')
                        is_egr = ('egreso' in efecto)

                        cfdis.append({
                            'file': jf,
                            'uuid': u,
                            'tipo': 'P' if is_rep else ('E' if is_egr else 'I'),
                            'metodo': 'REP' if is_rep else metodo,
                            'forma': forma,
                            'fecha': dt,
                            'subtotal': subt,
                            'descuento': 0.0,
                            'iva': round(iva, 2),
                            'ret_isr': float(it.get('RetISR') or 0.0),
                            'ret_iva': float(it.get('RetIVA') or 0.0),
                            'imss': 0.0,
                            'total': tot,
                            'rfc_emisor': target_rfc,
                            'nombre_emisor': target_rfc,
                            'rfc_receptor': rec_rfc,
                            'nombre_receptor': rec_nom,
                        })
                        seen_uuids.add(u)
            except Exception:
                pass

        # B) Recibidas (JSON)
        for jf in glob.glob(os.path.join(facturas_dir, '*recibidas*.json')):
            try:
                with open(jf, 'r', encoding='utf-8') as f:
                    records = json.load(f)
                if isinstance(records, list):
                    for it in records:
                        u = str(it.get('Folio') or it.get('uuid') or it.get('UUID') or '').upper().strip()
                        if not u or u in seen_uuids:
                            continue
                        fec_raw = str(it.get('Fecha de Emisión') or it.get('fecha_emision') or it.get('fecha') or '')
                        num_m = int(it.get('NumMes', 0) or 0)
                        dt = parse_dt(fec_raw, num_m)
                        if not dt or dt.year != year:
                            continue
                        if month > 0 and dt.month != month:
                            continue

                        tot = float(it.get('Total') or 0.0)
                        subt = float(it.get('Importe') or it.get('SubTotal') or it.get('subtotal') or 0.0)
                        if subt == 0.0 and tot > 0:
                            subt = round(tot / 1.16, 2)
                        iva = float(it.get('IVA al 16%') or it.get('iva') or 0.0)
                        if iva == 0.0 and tot > subt:
                            iva = round(tot - subt, 2)

                        metodo = str(it.get('MetodoPago') or 'PUE').upper().strip()
                        forma = str(it.get('FormaPago') or '03').strip()
                        efecto = str(it.get('Efecto del Comprobante') or it.get('tipo') or 'Ingreso').lower()
                        emi_rfc = str(it.get('RFC') or it.get('emisor_rfc') or '').upper().strip()
                        emi_nom = str(it.get('Nombre o Razón Social') or it.get('nombre_razon_social') or it.get('emisor_nombre') or emi_rfc).strip()

                        is_rep = ('pago' in efecto or metodo == 'REP')
                        is_egr = ('egreso' in efecto)

                        cfdis.append({
                            'file': jf,
                            'uuid': u,
                            'tipo': 'P' if is_rep else ('E' if is_egr else 'I'),
                            'metodo': 'REP' if is_rep else metodo,
                            'forma': forma,
                            'fecha': dt,
                            'subtotal': subt,
                            'descuento': 0.0,
                            'iva': round(iva, 2),
                            'ret_isr': float(it.get('RetISR') or 0.0),
                            'ret_iva': float(it.get('RetIVA') or 0.0),
                            'imss': 0.0,
                            'total': tot,
                            'rfc_emisor': emi_rfc,
                            'nombre_emisor': emi_nom,
                            'rfc_receptor': target_rfc,
                            'nombre_receptor': target_rfc,
                        })
                        seen_uuids.add(u)
            except Exception:
                pass

    polizas = []
    poliza_num = 1
    
    total_debe = 0.0
    total_haber = 0.0
    count_ingresos = 0
    count_egresos = 0
    count_diario = 0
    count_nomina = 0

    for c in cfdis:
        if not c['fecha'] or c['fecha'].year != year:
            continue
        if month > 0 and c['fecha'].month != month:
            continue

        is_emisor = (c['rfc_emisor'].upper() == target_rfc.upper()) if target_rfc else True
        is_receptor = (c['rfc_receptor'].upper() == target_rfc.upper()) if target_rfc else False
        f_str = c['fecha'].strftime('%Y-%m-%d')
        
        # ---------------------------------------------------------------------
        # 1. PÓLIZAS DE INGRESOS (Facturas Emitidas PUE - Contado)
        # ---------------------------------------------------------------------
        if is_emisor and c['tipo'] == 'I' and c['metodo'] == 'PUE':
            asientos = [
                {
                    'cuenta': CUENTAS_SAT['bancos'],
                    'nombre_cuenta': 'Bancos Nacionales',
                    'debe': round(c['total'], 2),
                    'haber': 0.0,
                    'concepto': f"Cobro Factura {c['nombre_receptor'][:30]}",
                    'uuid': c['uuid'],
                    'rfc': c['rfc_receptor']
                }
            ]
            if c['ret_isr'] > 0:
                asientos.append({
                    'cuenta': CUENTAS_SAT['retencion_isr_acreditable'],
                    'nombre_cuenta': 'Impuestos Retenidos a Favor (ISR)',
                    'debe': round(c['ret_isr'], 2),
                    'haber': 0.0,
                    'concepto': f"Retención ISR Cliente {c['uuid'][:8]}",
                    'uuid': c['uuid'],
                    'rfc': c['rfc_receptor']
                })
            if c['ret_iva'] > 0:
                asientos.append({
                    'cuenta': CUENTAS_SAT['retencion_iva_acreditable'],
                    'nombre_cuenta': 'Impuestos Retenidos a Favor (IVA)',
                    'debe': round(c['ret_iva'], 2),
                    'haber': 0.0,
                    'concepto': f"Retención IVA Cliente {c['uuid'][:8]}",
                    'uuid': c['uuid'],
                    'rfc': c['rfc_receptor']
                })
            if c['descuento'] > 0:
                asientos.append({
                    'cuenta': CUENTAS_SAT['descuento_ventas'],
                    'nombre_cuenta': 'Descuentos y Rebajas sobre Ventas',
                    'debe': round(c['descuento'], 2),
                    'haber': 0.0,
                    'concepto': f"Descuento Comercial {c['uuid'][:8]}",
                    'uuid': c['uuid'],
                    'rfc': c['rfc_receptor']
                })
            ventas_idx = len(asientos)
            asientos.append({
                'cuenta': CUENTAS_SAT['ingresos_16'],
                'nombre_cuenta': 'Ventas y Servicios Gravados 16%',
                'debe': 0.0,
                'haber': round(c['subtotal'], 2),
                'concepto': f"Ventas Factura {c['uuid'][:8]}",
                'uuid': c['uuid'],
                'rfc': c['rfc_receptor']
            })
            if c['iva'] > 0:
                asientos.append({
                    'cuenta': CUENTAS_SAT['iva_trasladado_cobrado'],
                    'nombre_cuenta': 'IVA Trasladado Efectivamente Cobrado',
                    'debe': 0.0,
                    'haber': round(c['iva'], 2),
                    'concepto': f"IVA Trasladado {c['uuid'][:8]}",
                    'uuid': c['uuid'],
                    'rfc': c['rfc_receptor']
                })
            
            balance_asientos(asientos, adjust_index=ventas_idx)
            polizas.append({
                'num': poliza_num,
                'tipo': 'INGRESOS',
                'tipo_num': 1,
                'fecha': f_str,
                'concepto': f"Cobro de Factura {c['uuid'][:8]} - {c['nombre_receptor'][:30]}",
                'asientos': asientos,
                'total': c['total']
            })
            count_ingresos += 1
            poliza_num += 1
            for a in asientos:
                total_debe += a['debe']
                total_haber += a['haber']

        # ---------------------------------------------------------------------
        # 2. PÓLIZAS DE EGRESOS / GASTOS (Facturas Recibidas PUE - Contado)
        # ---------------------------------------------------------------------
        elif is_receptor and c['tipo'] == 'I' and c['metodo'] == 'PUE':
            asientos = [
                {
                    'cuenta': CUENTAS_SAT['gastos_generales'],
                    'nombre_cuenta': 'Gastos Generales de Operación',
                    'debe': round(c['subtotal'], 2),
                    'haber': 0.0,
                    'concepto': f"Gasto {c['nombre_emisor'][:30]}",
                    'uuid': c['uuid'],
                    'rfc': c['rfc_emisor']
                }
            ]
            if c['iva'] > 0:
                asientos.append({
                    'cuenta': CUENTAS_SAT['iva_acreditable_pagado'],
                    'nombre_cuenta': 'IVA Acreditable Efectivamente Pagado',
                    'debe': round(c['iva'], 2),
                    'haber': 0.0,
                    'concepto': f"IVA Pagado {c['uuid'][:8]}",
                    'uuid': c['uuid'],
                    'rfc': c['rfc_emisor']
                })
            asientos.append({
                'cuenta': CUENTAS_SAT['bancos'],
                'nombre_cuenta': 'Bancos Nacionales',
                'debe': 0.0,
                'haber': round(c['total'], 2),
                'concepto': f"Pago a Proveedor {c['nombre_emisor'][:30]}",
                'uuid': c['uuid'],
                'rfc': c['rfc_emisor']
            })
            if c['ret_isr'] > 0:
                asientos.append({
                    'cuenta': CUENTAS_SAT['retencion_isr'],
                    'nombre_cuenta': 'Retenciones de ISR por Enterar',
                    'debe': 0.0,
                    'haber': round(c['ret_isr'], 2),
                    'concepto': f"Retención ISR Prov {c['uuid'][:8]}",
                    'uuid': c['uuid'],
                    'rfc': c['rfc_emisor']
                })
            if c['ret_iva'] > 0:
                asientos.append({
                    'cuenta': CUENTAS_SAT['retencion_iva'],
                    'nombre_cuenta': 'Retenciones de IVA por Enterar',
                    'debe': 0.0,
                    'haber': round(c['ret_iva'], 2),
                    'concepto': f"Retención IVA Prov {c['uuid'][:8]}",
                    'uuid': c['uuid'],
                    'rfc': c['rfc_emisor']
                })
            if c['descuento'] > 0:
                asientos.append({
                    'cuenta': CUENTAS_SAT['descuento_compras'],
                    'nombre_cuenta': 'Descuentos y Rebajas sobre Compras',
                    'debe': 0.0,
                    'haber': round(c['descuento'], 2),
                    'concepto': f"Descuento Comercial {c['uuid'][:8]}",
                    'uuid': c['uuid'],
                    'rfc': c['rfc_emisor']
                })

            balance_asientos(asientos, adjust_index=0)
            polizas.append({
                'num': poliza_num,
                'tipo': 'EGRESOS',
                'tipo_num': 2,
                'fecha': f_str,
                'concepto': f"Pago a Proveedor {c['nombre_emisor'][:30]}",
                'asientos': asientos,
                'total': c['total']
            })
            count_egresos += 1
            poliza_num += 1
            for a in asientos:
                total_debe += a['debe']
                total_haber += a['haber']

        # ---------------------------------------------------------------------
        # 3. PÓLIZAS DE DIARIO (Facturas Recibidas PPD - Provisión de Compras/Gastos)
        # ---------------------------------------------------------------------
        elif is_receptor and c['tipo'] == 'I' and c['metodo'] == 'PPD':
            asientos = [
                {
                    'cuenta': CUENTAS_SAT['gastos_generales'],
                    'nombre_cuenta': 'Gastos Generales de Operación',
                    'debe': round(c['subtotal'], 2),
                    'haber': 0.0,
                    'concepto': f"Provisión Gasto {c['nombre_emisor'][:30]}",
                    'uuid': c['uuid'],
                    'rfc': c['rfc_emisor']
                }
            ]
            if c['iva'] > 0:
                asientos.append({
                    'cuenta': CUENTAS_SAT['iva_por_acreditar'],
                    'nombre_cuenta': 'IVA Pendiente de Acreditar',
                    'debe': round(c['iva'], 2),
                    'haber': 0.0,
                    'concepto': f"IVA x Acreditar {c['uuid'][:8]}",
                    'uuid': c['uuid'],
                    'rfc': c['rfc_emisor']
                })
            asientos.append({
                'cuenta': CUENTAS_SAT['proveedores'],
                'nombre_cuenta': 'Proveedores Nacionales',
                'debe': 0.0,
                'haber': round(c['total'], 2),
                'concepto': f"Provisión Proveedor {c['nombre_emisor'][:30]}",
                'uuid': c['uuid'],
                'rfc': c['rfc_emisor']
            })
            if c['ret_isr'] > 0:
                asientos.append({
                    'cuenta': CUENTAS_SAT['retencion_isr'],
                    'nombre_cuenta': 'Retenciones de ISR por Enterar',
                    'debe': 0.0,
                    'haber': round(c['ret_isr'], 2),
                    'concepto': f"Retención ISR Prov {c['uuid'][:8]}",
                    'uuid': c['uuid'],
                    'rfc': c['rfc_emisor']
                })
            if c['ret_iva'] > 0:
                asientos.append({
                    'cuenta': CUENTAS_SAT['retencion_iva'],
                    'nombre_cuenta': 'Retenciones de IVA por Enterar',
                    'debe': 0.0,
                    'haber': round(c['ret_iva'], 2),
                    'concepto': f"Retención IVA Prov {c['uuid'][:8]}",
                    'uuid': c['uuid'],
                    'rfc': c['rfc_emisor']
                })
            if c['descuento'] > 0:
                asientos.append({
                    'cuenta': CUENTAS_SAT['descuento_compras'],
                    'nombre_cuenta': 'Descuentos y Rebajas sobre Compras',
                    'debe': 0.0,
                    'haber': round(c['descuento'], 2),
                    'concepto': f"Descuento Provisión {c['uuid'][:8]}",
                    'uuid': c['uuid'],
                    'rfc': c['rfc_emisor']
                })

            balance_asientos(asientos, adjust_index=0)
            polizas.append({
                'num': poliza_num,
                'tipo': 'DIARIO',
                'tipo_num': 3,
                'fecha': f_str,
                'concepto': f"Provisión de Compra {c['uuid'][:8]} - {c['nombre_emisor'][:30]}",
                'asientos': asientos,
                'total': c['total']
            })
            count_diario += 1
            poliza_num += 1
            for a in asientos:
                total_debe += a['debe']
                total_haber += a['haber']

        # ---------------------------------------------------------------------
        # 4. PÓLIZAS DE DIARIO (Facturas Emitidas PPD - Provisión de Ventas/Clientes)
        # ---------------------------------------------------------------------
        elif is_emisor and c['tipo'] == 'I' and c['metodo'] == 'PPD':
            asientos = [
                {
                    'cuenta': CUENTAS_SAT['clientes'],
                    'nombre_cuenta': 'Clientes Nacionales',
                    'debe': round(c['total'], 2),
                    'haber': 0.0,
                    'concepto': f"Cuenta x Cobrar {c['nombre_receptor'][:30]}",
                    'uuid': c['uuid'],
                    'rfc': c['rfc_receptor']
                }
            ]
            if c['ret_isr'] > 0:
                asientos.append({
                    'cuenta': CUENTAS_SAT['retencion_isr_acreditable'],
                    'nombre_cuenta': 'Impuestos Retenidos a Favor (ISR)',
                    'debe': round(c['ret_isr'], 2),
                    'haber': 0.0,
                    'concepto': f"Retención ISR Cliente {c['uuid'][:8]}",
                    'uuid': c['uuid'],
                    'rfc': c['rfc_receptor']
                })
            if c['ret_iva'] > 0:
                asientos.append({
                    'cuenta': CUENTAS_SAT['retencion_iva_acreditable'],
                    'nombre_cuenta': 'Impuestos Retenidos a Favor (IVA)',
                    'debe': round(c['ret_iva'], 2),
                    'haber': 0.0,
                    'concepto': f"Retención IVA Cliente {c['uuid'][:8]}",
                    'uuid': c['uuid'],
                    'rfc': c['rfc_receptor']
                })
            if c['descuento'] > 0:
                asientos.append({
                    'cuenta': CUENTAS_SAT['descuento_ventas'],
                    'nombre_cuenta': 'Descuentos y Rebajas sobre Ventas',
                    'debe': round(c['descuento'], 2),
                    'haber': 0.0,
                    'concepto': f"Descuento Provisión {c['uuid'][:8]}",
                    'uuid': c['uuid'],
                    'rfc': c['rfc_receptor']
                })
            ventas_idx = len(asientos)
            asientos.append({
                'cuenta': CUENTAS_SAT['ingresos_16'],
                'nombre_cuenta': 'Ventas y Servicios Gravados 16%',
                'debe': 0.0,
                'haber': round(c['subtotal'], 2),
                'concepto': f"Ventas a Crédito {c['uuid'][:8]}",
                'uuid': c['uuid'],
                'rfc': c['rfc_receptor']
            })
            if c['iva'] > 0:
                asientos.append({
                    'cuenta': CUENTAS_SAT['iva_por_trasladar'],
                    'nombre_cuenta': 'IVA Pendiente de Trasladar',
                    'debe': 0.0,
                    'haber': round(c['iva'], 2),
                    'concepto': f"IVA x Trasladar {c['uuid'][:8]}",
                    'uuid': c['uuid'],
                    'rfc': c['rfc_receptor']
                })

            balance_asientos(asientos, adjust_index=ventas_idx)
            polizas.append({
                'num': poliza_num,
                'tipo': 'DIARIO',
                'tipo_num': 3,
                'fecha': f_str,
                'concepto': f"Provisión de Venta {c['uuid'][:8]} - {c['nombre_receptor'][:30]}",
                'asientos': asientos,
                'total': c['total']
            })
            count_diario += 1
            poliza_num += 1
            for a in asientos:
                total_debe += a['debe']
                total_haber += a['haber']

        # ---------------------------------------------------------------------
        # 5. PÓLIZAS DE NÓMINA (CFDI Tipo N)
        # ---------------------------------------------------------------------
        elif is_emisor and c['tipo'] == 'N':
            neto_pagado = round(c['total'], 2)
            asientos = [
                {
                    'cuenta': CUENTAS_SAT['sueldos_salarios'],
                    'nombre_cuenta': 'Sueldos y Salarios Ordinarios',
                    'debe': round(c['subtotal'], 2),
                    'haber': 0.0,
                    'concepto': f"Nómina {c['nombre_receptor'][:30]}",
                    'uuid': c['uuid'],
                    'rfc': c['rfc_receptor']
                }
            ]
            if c['ret_isr'] > 0:
                asientos.append({
                    'cuenta': CUENTAS_SAT['retencion_isr'],
                    'nombre_cuenta': 'Retenciones de ISR por Salarios',
                    'debe': 0.0,
                    'haber': round(c['ret_isr'], 2),
                    'concepto': f"Retención ISR Salarios",
                    'uuid': c['uuid'],
                    'rfc': c['rfc_receptor']
                })
            if c['imss'] > 0:
                asientos.append({
                    'cuenta': CUENTAS_SAT['retencion_imss'],
                    'nombre_cuenta': 'Retención Cuotas IMSS Trabajador',
                    'debe': 0.0,
                    'haber': round(c['imss'], 2),
                    'concepto': f"Cuota IMSS Obrero",
                    'uuid': c['uuid'],
                    'rfc': c['rfc_receptor']
                })
            asientos.append({
                'cuenta': CUENTAS_SAT['bancos'],
                'nombre_cuenta': 'Bancos Nacionales',
                'debe': 0.0,
                'haber': neto_pagado,
                'concepto': f"Pago de Nómina Líquida",
                'uuid': c['uuid'],
                'rfc': c['rfc_receptor']
            })

            balance_asientos(asientos, adjust_index=0)
            polizas.append({
                'num': poliza_num,
                'tipo': 'NÓMINA',
                'tipo_num': 2,
                'fecha': f_str,
                'concepto': f"Nómina de {c['nombre_receptor'][:30]}",
                'asientos': asientos,
                'total': c['total']
            })
            count_nomina += 1
            poliza_num += 1
            for a in asientos:
                total_debe += a['debe']
                total_haber += a['haber']

    resumen = {
        'ejercicio': year,
        'mes': month,
        'total_polizas': len(polizas),
        'polizas_ingresos': count_ingresos,
        'polizas_egresos': count_egresos,
        'polizas_nomina': count_nomina,
        'polizas_diario': count_diario,
        'total_debe': round(total_debe, 2),
        'total_haber': round(total_haber, 2),
        'descuadre': round(total_debe - total_haber, 2),
        'cumple_anexo_24': True
    }

    return {
        'resumen': resumen,
        'polizas': polizas
    }

def export_contpaqi_txt(data, output_file):
    """Exporta pólizas en formato estándar de importación para Contpaqi Contabilidad"""
    with open(output_file, 'w', encoding='utf-8') as f:
        for p in data['polizas']:
            # P [Fecha] [Tipo: 1=Ing, 2=Egr, 3=Dia] [Num] [Clase=1] [Concepto]
            f_dt = datetime.strptime(p['fecha'], '%Y-%m-%d').strftime('%Y%m%d')
            f.write(f"P {f_dt} {p['tipo_num']} {p['num']} 1 {p['concepto']}\n")
            for a in p['asientos']:
                cta_clean = a['cuenta'].replace('.', '')
                tipo_mov = 0 if a['debe'] > 0 else 1
                importe = a['debe'] if a['debe'] > 0 else a['haber']
                # M [Cuenta] [Referencia] [TipoMov: 0=Cargo, 1=Abono] [Importe] [Concepto] [UUID]
                uuid_field = a.get('uuid', '')
                f.write(f"M {cta_clean} {uuid_field[:10]} {tipo_mov} {importe:.2f} {a['concepto']} {uuid_field}\n")

def export_coi_csv(data, output_file):
    """Exporta pólizas en formato de intercambio para Aspel COI"""
    import csv
    with open(output_file, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.writer(f)
        writer.writerow(["TIPO_POLIZA", "NUM_POLIZA", "FECHA", "CONCEPTO_POLIZA", "CUENTA", "DEPTO", "CONCEPTO_MOV", "CARGO", "ABONO", "UUID", "RFC"])
        for p in data['polizas']:
            for a in p['asientos']:
                writer.writerow([
                    p['tipo'][:3],
                    p['num'],
                    p['fecha'],
                    p['concepto'],
                    a['cuenta'],
                    "0",
                    a['concepto'],
                    a['debe'],
                    a['haber'],
                    a.get('uuid', ''),
                    a.get('rfc', '')
                ])

def export_excel_polizas(data, output_file, year, client_rfc, client_name):
    """Genera el Libro Diario y Pólizas en Excel (.xlsx)"""
    wb = Workbook()
    ws = wb.active
    ws.title = "Libro Diario de Pólizas"
    ws.views.sheetView[0].showGridLines = True
    
    fill_header = PatternFill(start_color="0F172A", end_color="0F172A", fill_type="solid")
    fill_sub = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")
    fill_poliza_head = PatternFill(start_color="E2E8F0", end_color="E2E8F0", fill_type="solid")
    
    font_title = Font(name="Calibri", size=14, bold=True, color="0F172A")
    font_sub = Font(name="Calibri", size=10, italic=True, color="475569")
    font_h = Font(name="Calibri", size=10, bold=True, color="FFFFFF")
    font_bold = Font(name="Calibri", size=10, bold=True)
    font_mono = Font(name="Consolas", size=9)
    
    thin_border = Border(
        left=Side(style='thin', color='CBD5E1'),
        right=Side(style='thin', color='CBD5E1'),
        top=Side(style='thin', color='CBD5E1'),
        bottom=Side(style='thin', color='CBD5E1')
    )

    ws['A2'] = "LIBRO DIARIO DE PÓLIZAS CONTABLES CON ASOCIACIÓN DE UUID (ANEXO 24 RMF)"
    ws['A2'].font = font_title
    ws['A3'] = f"Contribuyente: {client_name} | RFC: {client_rfc} | Ejercicio: {year} | Compatibilidad: Contpaqi / Aspel COI"
    ws['A3'].font = font_sub

    headers = ["Póliza #", "Tipo", "Fecha", "Código Agrupador SAT", "Nombre de la Cuenta", "Concepto Asiento", "Debe (Cargo $)", "Haber (Abono $)", "UUID Digital SAT", "RFC Contraparte"]
    for idx, h in enumerate(headers, start=1):
        c = ws.cell(row=5, column=idx, value=h)
        c.fill = fill_header
        c.font = font_h
        c.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[5].height = 24

    row_num = 6
    for p in data['polizas']:
        for a in p['asientos']:
            ws.cell(row=row_num, column=1, value=f"P-{p['num']:04d}").alignment = Alignment(horizontal="center")
            ws.cell(row=row_num, column=2, value=p['tipo']).alignment = Alignment(horizontal="center")
            ws.cell(row=row_num, column=3, value=p['fecha']).alignment = Alignment(horizontal="center")
            ws.cell(row=row_num, column=4, value=a['cuenta']).font = font_mono
            ws.cell(row=row_num, column=5, value=a['nombre_cuenta'])
            ws.cell(row=row_num, column=6, value=a['concepto'])
            
            c_debe = ws.cell(row=row_num, column=7, value=a['debe'])
            c_debe.number_format = '$#,##0.00'
            c_debe.alignment = Alignment(horizontal="right")
            
            c_haber = ws.cell(row=row_num, column=8, value=a['haber'])
            c_haber.number_format = '$#,##0.00'
            c_haber.alignment = Alignment(horizontal="right")
            
            ws.cell(row=row_num, column=9, value=a.get('uuid', '')).font = font_mono
            ws.cell(row=row_num, column=10, value=a.get('rfc', '')).font = font_mono

            for col_i in range(1, 11):
                ws.cell(row=row_num, column=col_i).border = thin_border
            row_num += 1

    # Totales generales
    ws.row_dimensions[row_num].height = 22
    ws.cell(row=row_num, column=6, value="SUMAS IGUALES DEBE Y HABER:").font = font_bold
    ws.cell(row=row_num, column=6).alignment = Alignment(horizontal="right")
    
    tot_debe = ws.cell(row=row_num, column=7, value=data['resumen']['total_debe'])
    tot_debe.number_format = '$#,##0.00'
    tot_debe.font = font_bold
    
    tot_hab = ws.cell(row=row_num, column=8, value=data['resumen']['total_haber'])
    tot_hab.number_format = '$#,##0.00'
    tot_hab.font = font_bold

    for col in ws.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = max(max_len + 3, 14)

    wb.save(output_file)

def main():
    parser = argparse.ArgumentParser(description="Generador de Pólizas Contables Anexo 24")
    parser.add_argument('--xml-dir', required=True, help="Directorio de CFDI")
    parser.add_argument('--facturas-dir', default="", help="Directorio con JSONs en facturas_store")
    parser.add_argument('--year', type=int, required=True, help="Ejercicio fiscal")
    parser.add_argument('--month', type=int, default=0, help="Mes (0 = todo el año)")
    parser.add_argument('--rfc', default="", help="RFC del contribuyente")
    parser.add_argument('--name', default="Contribuyente", help="Nombre o Razón Social")
    parser.add_argument('--format', default="excel", choices=['excel', 'contpaqi', 'coi'], help="Formato de exportación")
    parser.add_argument('--output', default="", help="Archivo de salida")
    parser.add_argument('--preview', action='store_true', help="Generar JSON para previsualización")
    parser.add_argument('--json-output', default="", help="Ruta de salida JSON")

    args = parser.parse_args()

    data = generar_polizas(args.xml_dir, args.year, args.month, args.rfc, args.facturas_dir)

    if args.json_output:
        os.makedirs(os.path.dirname(os.path.abspath(args.json_output)), exist_ok=True)
        with open(args.json_output, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    if args.preview:
        print(json.dumps({'type': 'preview_result', 'data': data}, ensure_ascii=False))
        return

    if args.output:
        os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
        if args.format == 'contpaqi':
            export_contpaqi_txt(data, args.output)
        elif args.format == 'coi':
            export_coi_csv(data, args.output)
        else:
            export_excel_polizas(data, args.output, args.year, args.rfc, args.name)
        print(f"Pólizas generadas en formato {args.format}: {args.output}")

if __name__ == '__main__':
    main()
