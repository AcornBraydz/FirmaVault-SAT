#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Motor de Pre-cálculo de la DIOT (Declaración Informativa de Operaciones con Terceros)
Artículo 32, Fracción VIII de la LIVA y RMF vigente.

Analiza todos los gastos y compras efectivamente pagados en el periodo (PUE y PPD liquidados con REP),
clasifica inteligentemente a los proveedores por Tipo de Tercero y Tipo de Operación,
acumula las bases gravables oficiales (16%, 8%, 0%, Exento y Retenciones) y genera:
1. Libro Excel de Trabajo con cédula de confronta y firmas.
2. Archivo Batch TXT Nuevo SAT 2025+ (54 campos delimitados por tubería '|').
3. Archivo Batch TXT Tradicional DEM-SAT (24 campos delimitados por tubería '|').
4. Paquete integral ZIP con todos los archivos listos para el contador.
5. JSON estructurado para el tablero interactivo en pantalla.
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

current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

sys.path.append(os.path.abspath(os.path.join(current_dir, "..", "shared")))
try:
    from cfdi_xml_engine import CFDIXMLEngine
    from efos_validator import EfosValidator
except ImportError:
    CFDIXMLEngine = None

from sat_efos_validator import check_rfc_efos

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

def parse_int_round(val):
    try:
        if val is None:
            return 0
        return int(round(float(str(val).replace(',', '').strip())))
    except Exception:
        return 0

import re

def infer_tipo_tercero(rfc):
    """
    Infiere el tipo de tercero para la DIOT:
    04: Proveedor Nacional
    05: Proveedor Extranjero
    15: Proveedor Global
    """
    clean_rfc = re.sub(r'[^A-Z0-9&Ñ]', '', clean_str(rfc).upper())
    if clean_rfc == 'XEXX010101000' or len(clean_rfc) < 12:
        return '05'  # Extranjero
    elif clean_rfc == 'XAXX010101000':
        return '15'  # Global
    else:
        return '04'  # Nacional

def infer_tipo_operacion(cfdi_item):
    """
    Infiere el tipo de operación para la DIOT:
    03: Prestación de Servicios Profesionales
    06: Arrendamiento de Inmuebles
    85: Otros (Adquisición de bienes, servicios generales, etc.)
    """
    concepto = clean_str(cfdi_item.get('concepto', '')).lower()
    clave_prod = clean_str(cfdi_item.get('clave_prod_serv', ''))
    ret_iva = parse_float(cfdi_item.get('ret_iva', 0))
    ret_isr = parse_float(cfdi_item.get('ret_isr', 0))
    emisor_rfc = clean_str(cfdi_item.get('emisor_rfc', ''))

    # Arrendamiento de inmuebles:
    # Si clave empieza con 8013 (bienes raíces) o menciona renta/arrendamiento o retención de ISR e IVA
    if 'arrenda' in concepto or 'renta de' in concepto or clave_prod.startswith('8013'):
        return '06'
    
    # Servicios Profesionales:
    # Claves típicas de servicios: 80, 81, 84, 85, 86, 93 o si tiene retención de ISR (10% o 1.25% RESICO)
    # y el emisor es persona física (RFC de 13 caracteres)
    if len(emisor_rfc) == 13 and (ret_isr > 0 or ret_iva > 0):
        if 'renta' in concepto or 'arrenda' in concepto:
            return '06'
        return '03'

    keywords_servicios = ['honorario', 'asesor', 'legal', 'contab', 'medico', 'consultor', 'servicio profesional']
    if any(k in concepto for k in keywords_servicios):
        return '03'

    # Predeterminado para comercio, compras y otros gastos
    return '85'

def parse_cfdi_for_diot(xml_content, source_file=""):
    """
    Parsea un CFDI XML extrayendo bases desglosadas por tasa de IVA para DIOT usando el nuevo CFDIXMLEngine.
    """
    if not CFDIXMLEngine:
        return None
        
    try:
        engine = CFDIXMLEngine(xml_string=xml_content)
        data = engine.get_full_extraction()
    except Exception:
        return None

    tipo_de_comprobante = data.get('TipoDeComprobante', 'I')
    if tipo_de_comprobante == 'N':
        return None

    uuid = data.get('UUID', '')
    if not uuid:
        return None
        
    fecha = data.get('Fecha', '')
    anio = 0
    mes = 0
    fecha_efectiva = fecha[:10] if len(fecha) >= 10 else fecha
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

    tras = data.get("Traslados", {})
    bases = data.get("Bases", {})
    ret = data.get("Retenciones", {})
    
    doctos_relacionados = []
    fecha_pago_rep = ''
    if data.get("Pagos_REP"):
        for pago in data["Pagos_REP"]:
            fecha_pago_rep = pago.get("FechaPago", "")
            for doc in pago.get("DocumentosRelacionados", []):
                doctos_relacionados.append({'id_documento': doc.get("IdDocumento"), 'imp_pagado': doc.get("ImpPagado", 0.0)})

    # Ya no se usan inferencias matemáticas falibles, usamos la Base 100% pura extraída del XML.
    base_16 = bases.get("IVA_16", 0.0)
    iva_16 = tras.get("IVA_16", 0.0)
    base_8 = bases.get("IVA_8", 0.0)
    iva_8 = tras.get("IVA_8", 0.0)
    base_0 = bases.get("IVA_0", 0.0)
    base_exento = bases.get("IVA_Exento", 0.0)
    
    ret_iva = ret.get("IVA", 0.0)
    ret_isr = ret.get("ISR", 0.0)

    # Identificar concepto para inferir tipo de operación
    concepto_desc = 'Gastos en general'
    clave_prod_serv = ''
    # El engine actual no extrae el primer concepto ni la clave_prod_serv, para esto podemos hacer un escaneo rápido
    try:
        root = engine.root
        conceptos = root.find('.//cfdi:Concepto', {'cfdi': 'http://www.sat.gob.mx/cfd/4'})
        if conceptos is not None:
            concepto_desc = conceptos.attrib.get('Descripcion', 'Gastos en general')
            clave_prod_serv = conceptos.attrib.get('ClaveProdServ', '')
    except:
        pass

    return {
        'uuid': uuid,
        'fecha': fecha_efectiva,
        'anio': anio,
        'mes': mes,
        'tipo': tipo_de_comprobante,
        'metodo_pago': data.get('MetodoPago', 'PUE'),
        'forma_pago': data.get('FormaPago', '99'),
        'subtotal': data.get('SubTotal', 0.0),
        'total': data.get('Total', 0.0),
        'emisor_rfc': data.get('Emisor_RFC', ''),
        'emisor_nombre': data.get('Emisor_Nombre', ''),
        'receptor_rfc': data.get('Receptor_RFC', ''),
        'receptor_nombre': data.get('Receptor_Nombre', ''),
        'concepto': concepto_desc,
        'clave_prod_serv': clave_prod_serv,
        'base_16': round(base_16, 2),
        'iva_16': round(iva_16, 2),
        'base_8': round(base_8, 2),
        'iva_8': round(iva_8, 2),
        'base_0': round(base_0, 2),
        'base_exento': round(base_exento, 2),
        'ret_iva': round(ret_iva, 2),
        'ret_isr': round(ret_isr, 2),
        'fecha_pago_rep': fecha_pago_rep[:10] if len(fecha_pago_rep) >= 10 else fecha_pago_rep,
        'doctos_relacionados': doctos_relacionados,
        'source_file': os.path.basename(source_file) if source_file else '',
    }

def run_diot_precalculation(target_rfc, year=0, month=0, xml_dir="", facturas_store_dir=""):
    """
    Ejecuta el cálculo y agrupación de la DIOT para el contribuyente y periodo solicitados.
    """
    target_rfc_clean = clean_str(target_rfc).upper()
    cfdis_gastos = {}
    reps_list = []

    # 1. Leer XMLs sueltos
    if xml_dir and os.path.exists(xml_dir):
        xml_files = glob.glob(os.path.join(xml_dir, "**", "*.xml"), recursive=True)
        for fpath in xml_files:
            try:
                with open(fpath, 'r', encoding='utf-8', errors='replace') as f:
                    content = f.read()
                data = parse_cfdi_for_diot(content, source_file=fpath)
                if not data:
                    continue
                # Separar complementos de pago (REP) vs facturas recibidas
                if data['tipo'] == 'P' and data['doctos_relacionados']:
                    reps_list.append(data)
                elif data['receptor_rfc'] == target_rfc_clean or (data['emisor_rfc'] != target_rfc_clean and not data['receptor_rfc']):
                    cfdis_gastos[data['uuid']] = data
            except Exception:
                continue

    # 2. Paquetes ZIP
    if xml_dir and os.path.exists(xml_dir):
        zip_files = glob.glob(os.path.join(xml_dir, "**", "*.zip"), recursive=True)
        for zpath in zip_files:
            try:
                with zipfile.ZipFile(zpath, 'r') as z:
                    for zinfo in z.infolist():
                        if zinfo.filename.lower().endswith('.xml'):
                            try:
                                with z.open(zinfo) as zf:
                                    content = zf.read().decode('utf-8', errors='replace')
                                data = parse_cfdi_for_diot(content, source_file=zinfo.filename)
                                if not data:
                                    continue
                                if data['tipo'] == 'P' and data['doctos_relacionados']:
                                    reps_list.append(data)
                                elif data['receptor_rfc'] == target_rfc_clean or (data['emisor_rfc'] != target_rfc_clean and not data['receptor_rfc']):
                                    if data['uuid'] not in cfdis_gastos:
                                        cfdis_gastos[data['uuid']] = data
                            except Exception:
                                continue
            except Exception:
                continue

    # 3. Fallback / Complemento con facturas_store (JSON)
    if facturas_store_dir and os.path.exists(facturas_store_dir):
        json_files = glob.glob(os.path.join(facturas_store_dir, "*recibidas.json"))
        for jf in json_files:
            try:
                with open(jf, 'r', encoding='utf-8') as f:
                    items = json.load(f)
                if isinstance(items, list):
                    for it in items:
                        uuid = clean_str(it.get('Folio', '') or it.get('uuid', '')).upper()
                        if not uuid or uuid in cfdis_gastos:
                            continue
                        emisor = clean_str(it.get('RFC Emisor', '') or it.get('emisor_rfc', '')).upper()
                        if emisor and emisor != target_rfc_clean:
                            subt = parse_float(it.get('Importe / Subtotal', 0) or it.get('subtotal', 0))
                            tot = parse_float(it.get('Total', 0))
                            if subt == 0.0 and tot > 0:
                                subt = round(tot / 1.16, 2)
                            iva = round(max(0.0, tot - subt), 2)
                            fec = clean_str(it.get('Fecha de Emisión', '') or it.get('fecha', ''))
                            anio_f = int(fec[:4]) if len(fec) >= 4 else 0
                            mes_f = int(fec[5:7]) if len(fec) >= 7 else 0

                            cfdis_gastos[uuid] = {
                                'uuid': uuid,
                                'fecha': fec[:10],
                                'anio': anio_f,
                                'mes': mes_f,
                                'tipo': 'I',
                                'metodo_pago': clean_str(it.get('MetodoPago', 'PUE')),
                                'forma_pago': clean_str(it.get('FormaPago', '99')),
                                'subtotal': subt,
                                'total': tot,
                                'emisor_rfc': emisor,
                                'emisor_nombre': clean_str(it.get('Nombre o Razón Social del Emisor', '') or it.get('emisor_nombre', '')),
                                'receptor_rfc': target_rfc_clean,
                                'receptor_nombre': '',
                                'concepto': clean_str(it.get('Concepto', 'Gastos generales')),
                                'clave_prod_serv': '',
                                'base_16': subt,
                                'iva_16': iva,
                                'base_8': 0.0,
                                'iva_8': 0.0,
                                'base_0': 0.0,
                                'base_exento': 0.0,
                                'ret_iva': 0.0,
                                'ret_isr': 0.0,
                                'fecha_pago_rep': '',
                                'doctos_relacionados': [],
                                'source_file': os.path.basename(jf),
                            }
            except Exception:
                continue

    # Mapeo de pagos REP a facturas PPD
    rep_payments_by_uuid = {}
    for rep in reps_list:
        p_fecha = rep['fecha_pago_rep'] or rep['fecha']
        for doc in rep['doctos_relacionados']:
            uid = doc['id_documento']
            if uid not in rep_payments_by_uuid:
                rep_payments_by_uuid[uid] = []
            rep_payments_by_uuid[uid].append({
                'fecha_pago': p_fecha,
                'imp_pagado': doc['imp_pagado'],
            })

    # 4. Filtrar comprobantes efectivamente pagados en el periodo
    cfdis_pagados = []

    for uuid, cfdi in cfdis_gastos.items():
        # Excluir EFOS definitivos del cálculo DIOT (Art. 69-B)
        efo = check_rfc_efos(cfdi['emisor_rfc'])
        if efo and efo.get('es_definitivo'):
            continue

        es_pue = cfdi['metodo_pago'] == 'PUE'

        if es_pue:
            # Factura de contado (PUE): Se considera pagada en su fecha de emisión
            if year > 0 and cfdi['anio'] > 0 and cfdi['anio'] != year:
                continue
            if month > 0 and cfdi['mes'] > 0 and cfdi['mes'] != month:
                continue
            cfdis_pagados.append({
                **cfdi,
                'fecha_efectiva_pago': cfdi['fecha'],
                'origen_pago': 'PUE (Contado)',
            })
        else:
            # Factura a crédito (PPD): Verificar si tiene REP en el periodo
            if uuid in rep_payments_by_uuid:
                for pago in rep_payments_by_uuid[uuid]:
                    f_pago = pago['fecha_pago']
                    p_anio = int(f_pago[:4]) if len(f_pago) >= 4 else cfdi['anio']
                    p_mes = int(f_pago[5:7]) if len(f_pago) >= 7 else cfdi['mes']

                    if year > 0 and p_anio > 0 and p_anio != year:
                        continue
                    if month > 0 and p_mes > 0 and p_mes != month:
                        continue

                    # Proporción de pago sobre el total
                    ratio = (pago['imp_pagado'] / cfdi['total']) if cfdi['total'] > 0 else 1.0
                    ratio = min(1.0, max(0.0, ratio))

                    cfdis_pagados.append({
                        **cfdi,
                        'subtotal': round(cfdi['subtotal'] * ratio, 2),
                        'total': round(cfdi['total'] * ratio, 2),
                        'base_16': round(cfdi['base_16'] * ratio, 2),
                        'iva_16': round(cfdi['iva_16'] * ratio, 2),
                        'base_8': round(cfdi['base_8'] * ratio, 2),
                        'iva_8': round(cfdi['iva_8'] * ratio, 2),
                        'base_0': round(cfdi['base_0'] * ratio, 2),
                        'base_exento': round(cfdi['base_exento'] * ratio, 2),
                        'ret_iva': round(cfdi['ret_iva'] * ratio, 2),
                        'ret_isr': round(cfdi['ret_isr'] * ratio, 2),
                        'fecha_efectiva_pago': f_pago,
                        'origen_pago': 'PPD con REP',
                    })
            else:
                # Si es PPD y no hay REP registrado, pero el usuario solicitó el año y coincide la fecha,
                # se incluye como PPD para no dejar vacíos de deducción si el cliente pagó
                if year > 0 and cfdi['anio'] > 0 and cfdi['anio'] != year:
                    continue
                if month > 0 and cfdi['mes'] > 0 and cfdi['mes'] != month:
                    continue
                cfdis_pagados.append({
                    **cfdi,
                    'fecha_efectiva_pago': cfdi['fecha'],
                    'origen_pago': 'PPD (Sin REP conciliado)',
                })

    # 5. Agrupar por RFC de Proveedor para la DIOT
    proveedores_diot = {}

    for item in cfdis_pagados:
        rfc_prov = item['emisor_rfc']
        if not rfc_prov or rfc_prov == target_rfc_clean:
            continue

        if rfc_prov not in proveedores_diot:
            tipo_tercero = infer_tipo_tercero(rfc_prov)
            tipo_operacion = infer_tipo_operacion(item)

            proveedores_diot[rfc_prov] = {
                'rfc': rfc_prov,
                'nombre': item['emisor_nombre'],
                'tipo_tercero': tipo_tercero,
                'tipo_operacion': tipo_operacion,
                'id_fiscal': '' if tipo_tercero == '04' else 'EXTRANJERO',
                'nombre_extranjero': '' if tipo_tercero == '04' else item['emisor_nombre'],
                'pais': '' if tipo_tercero == '04' else 'USA',
                'nacionalidad': '' if tipo_tercero == '04' else 'EXTRANJERA',
                'base_16': 0.0,
                'iva_16': 0.0,
                'base_8': 0.0,
                'iva_8': 0.0,
                'base_0': 0.0,
                'base_exento': 0.0,
                'ret_iva': 0.0,
                'total_operacion': 0.0,
                'total_cfdis': 0,
                'cfdis': [],
            }

        p = proveedores_diot[rfc_prov]
        p['base_16'] += item['base_16']
        p['iva_16'] += item['iva_16']
        p['base_8'] += item['base_8']
        p['iva_8'] += item['iva_8']
        p['base_0'] += item['base_0']
        p['base_exento'] += item['base_exento']
        p['ret_iva'] += item['ret_iva']
        p['total_operacion'] += item['total']
        p['total_cfdis'] += 1
        p['cfdis'].append(item)

    # Redondear valores acumulados por proveedor
    lista_proveedores = list(proveedores_diot.values())
    for p in lista_proveedores:
        p['base_16'] = round(p['base_16'], 2)
        p['iva_16'] = round(p['iva_16'], 2)
        p['base_8'] = round(p['base_8'], 2)
        p['iva_8'] = round(p['iva_8'], 2)
        p['base_0'] = round(p['base_0'], 2)
        p['base_exento'] = round(p['base_exento'], 2)
        p['ret_iva'] = round(p['ret_iva'], 2)
        p['total_operacion'] = round(p['total_operacion'], 2)

    # Ordenar por Total de Operación descendente
    lista_proveedores.sort(key=lambda x: x['total_operacion'], reverse=True)

    # 6. Métricas Globales
    total_provs = len(lista_proveedores)
    sum_base_16 = round(sum(p['base_16'] for p in lista_proveedores), 2)
    sum_iva_16 = round(sum(p['iva_16'] for p in lista_proveedores), 2)
    sum_base_8 = round(sum(p['base_8'] for p in lista_proveedores), 2)
    sum_iva_8 = round(sum(p['iva_8'] for p in lista_proveedores), 2)
    sum_base_0 = round(sum(p['base_0'] for p in lista_proveedores), 2)
    sum_base_exento = round(sum(p['base_exento'] for p in lista_proveedores), 2)
    sum_ret_iva = round(sum(p['ret_iva'] for p in lista_proveedores), 2)
    sum_total_operacion = round(sum(p['total_operacion'] for p in lista_proveedores), 2)
    total_iva_acreditable_diot = round(sum_iva_16 + sum_iva_8, 2)
    total_cfdis_contabilizados = sum(p['total_cfdis'] for p in lista_proveedores)

    # Periodo formateado
    if year == 0:
        periodo_str = "Histórico Completo (Consolidado)"
    elif month == 0:
        periodo_str = f"Ejercicio Anual {year}"
    else:
        periodo_str = f"{MESES_ESP[month]} de {year}"

    return {
        'target_rfc': target_rfc_clean,
        'periodo': periodo_str,
        'year': year,
        'month': month,
        'fecha_generacion': datetime.now().strftime("%d/%m/%Y %H:%M"),
        'metricas': {
            'total_proveedores': total_provs,
            'total_cfdis_pagados': total_cfdis_contabilizados,
            'base_gravable_16': sum_base_16,
            'iva_trasladado_16': sum_iva_16,
            'base_gravable_8': sum_base_8,
            'iva_trasladado_8': sum_iva_8,
            'base_gravable_0': sum_base_0,
            'actos_exentos': sum_base_exento,
            'iva_retenido': sum_ret_iva,
            'total_operacion': sum_total_operacion,
            'iva_acreditable_total': total_iva_acreditable_diot,
        },
        'proveedores': lista_proveedores,
        'cfdis_pagados': cfdis_pagados,
    }

def generate_diot_txt_traditional(diot_data, output_file):
    """
    Genera el archivo TXT para el programa DEM tradicional del SAT (24 campos pipe '|').
    Valores monetarios en enteros redondeados conforme a la regla del SAT DEM.
    """
    lines = []
    for p in diot_data['proveedores']:
        # 24 campos oficiales DEM:
        # 1: Tipo tercero
        # 2: Tipo operación
        # 3: RFC
        # 4: ID Fiscal
        # 5: Nombre extranjero
        # 6: País residencia
        # 7: Nacionalidad
        # 8: Base 15% o 16%
        # 9: Base 8% frontera norte
        # 10: Base 15% o 16% no acreditable (0)
        # 11: Base 8% frontera sur (0)
        # 12: Base 10% u 11% (0)
        # 13: Base 10% u 11% no acreditable (0)
        # 14: Importación 15% o 16% (0)
        # 15: Importación 15% o 16% no acreditable (0)
        # 16: Importación 10% u 11% (0)
        # 17: Importación 10% u 11% no acreditable (0)
        # 18: Importación exenta (0)
        # 19: Base 0%
        # 20: Actos exentos
        # 21: IVA Retenido
        # 22: Devoluciones / descuentos sobre compras (0)
        # 23: Vacio
        # 24: Vacio

        tipo_3 = p['tipo_tercero']
        tipo_op = p['tipo_operacion']
        rfc = p['rfc'] if tipo_3 == '04' else ''
        id_fiscal = p['id_fiscal'] if tipo_3 != '04' else ''
        nom_ext = p['nombre_extranjero'] if tipo_3 != '04' else ''
        pais = p['pais'] if tipo_3 != '04' else ''
        nac = p['nacionalidad'] if tipo_3 != '04' else ''

        b16 = parse_int_round(p['base_16'])
        b8 = parse_int_round(p['base_8'])
        b0 = parse_int_round(p['base_0'])
        b_ex = parse_int_round(p['base_exento'])
        ret = parse_int_round(p['ret_iva'])

        fields = [
            tipo_3,
            tipo_op,
            rfc,
            id_fiscal,
            nom_ext,
            pais,
            nac,
            str(b16 if b16 > 0 else ''),
            str(b8 if b8 > 0 else ''),
            '', # 10
            '', # 11
            '', # 12
            '', # 13
            '', # 14
            '', # 15
            '', # 16
            '', # 17
            '', # 18
            str(b0 if b0 > 0 else ''),
            str(b_ex if b_ex > 0 else ''),
            str(ret if ret > 0 else ''),
            '', # 22
            '', # 23
            ''  # 24
        ]
        line = '|'.join(fields) + '|'
        lines.append(line)

    content = '\n'.join(lines)
    os.makedirs(os.path.dirname(os.path.abspath(output_file)), exist_ok=True)
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"[DIOT OK] Archivo TXT Tradicional DEM generado ({len(lines)} registros): {output_file}")

def generate_diot_txt_2025(diot_data, output_file):
    """
    Genera el archivo TXT para el nuevo portal del SAT 2025+ con exactamente 54 campos pipe '|'.
    """
    lines = []
    for p in diot_data['proveedores']:
        tipo_3 = p['tipo_tercero']
        tipo_op = p['tipo_operacion']
        rfc = p['rfc'] if tipo_3 == '04' else ''
        id_fiscal = p['id_fiscal'] if tipo_3 != '04' else ''
        nom_ext = p['nombre_extranjero'] if tipo_3 != '04' else ''
        pais = p['pais'] if tipo_3 != '04' else ''
        jurisd = '0' if tipo_3 != '04' else ''

        b16 = parse_int_round(p['base_16'])
        b8 = parse_int_round(p['base_8'])
        b0 = parse_int_round(p['base_0'])
        b_ex = parse_int_round(p['base_exento'])
        ret = parse_int_round(p['ret_iva'])

        # Crear arreglo de 54 campos
        fields = ['0'] * 54
        # Sección 1: Datos Tercero (campos 0 a 6 index 0)
        fields[0] = tipo_3
        fields[1] = tipo_op
        fields[2] = rfc
        fields[3] = id_fiscal
        fields[4] = nom_ext
        fields[5] = pais
        fields[6] = jurisd

        # Sección 2: Actos y bases
        # Campo 8: Actos pagados RFN (8%)
        fields[7] = str(b8)
        # Campo 14: Actos pagados tasa 16% nacional
        fields[13] = str(b16)
        # Campo 22: Actos tasa 0%
        fields[21] = str(b0)
        # Campo 23: Actos exentos
        fields[22] = str(b_ex)
        # Campo 26: IVA Retenido
        fields[25] = str(ret)

        line = '|'.join(fields) + '|'
        lines.append(line)

    content = '\n'.join(lines)
    os.makedirs(os.path.dirname(os.path.abspath(output_file)), exist_ok=True)
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"[DIOT OK] Archivo TXT SAT 2025 (54 campos) generado ({len(lines)} registros): {output_file}")

def generate_diot_excel(diot_data, output_file):
    """
    Genera el libro de Excel con 3 pestañas profesionales y fórmulas contables vivas.
    """
    wb = openpyxl.Workbook()
    wb.remove(wb.active)

    res = diot_data
    m = res['metricas']

    font_family = "Segoe UI"
    c_navy = "0F172A"
    c_teal = "0F766E"
    c_emerald = "065F46"

    fill_header_navy = PatternFill(start_color=c_navy, end_color=c_navy, fill_type="solid")
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
    # PESTAÑA 1: CONFRONTA Y RESUMEN DIOT
    # ==========================================
    ws1 = wb.create_sheet(title="Confronta y Resumen DIOT")
    ws1.views.sheetView[0].showGridLines = True

    # Banner
    ws1.merge_cells("A1:G1")
    ws1["A1"] = "PROGRAMA SAT — PAPEL DE TRABAJO PRE-CÁLCULO DIOT (ART. 32 LIVA)"
    ws1["A1"].font = Font(name=font_family, size=13, bold=True, color="FFFFFF")
    ws1["A1"].fill = fill_header_navy
    ws1["A1"].alignment = align_center
    ws1.row_dimensions[1].height = 30

    ws1.merge_cells("A2:G2")
    ws1["A2"] = f"Contribuyente: {res['target_rfc']}  |  Periodo: {res['periodo']}  |  Fecha de Emisión: {res['fecha_generacion']}"
    ws1["A2"].font = Font(name=font_family, size=9.5, italic=True, color="FFFFFF")
    ws1["A2"].fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
    ws1["A2"].alignment = align_center
    ws1.row_dimensions[2].height = 22

    ws1.row_dimensions[3].height = 12

    # KPIs
    kpis = [
        ("PROVEEDORES DIOT", f"{m['total_proveedores']:,}", "Terceros con operaciones en el mes", "0F172A", "F8FAFC"),
        ("ACTOS PAGADOS TASA 16%", f"${m['base_gravable_16']:,.2f}", "Base gravable general", "0F766E", "F0FDFA"),
        ("IVA ACREDITABLE DIOT", f"${m['iva_acreditable_total']:,.2f}", "IVA efectivamente pagado", "065F46", "ECFDF5"),
        ("IVA RETENIDO TERCEROS", f"${m['iva_retenido']:,.2f}", "Retenciones efectuadas (002)", "92400E", "FFFBEB"),
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

        c2.font = Font(name=font_family, size=15, bold=True, color=txt_color)
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

    ws1.row_dimensions[7].height = 14

    # TABLA DE CONFRONTA FISCAL (DIOT vs DECLARACIÓN MENSUAL IVA)
    ws1.merge_cells("A8:G8")
    ws1["A8"] = "CÉDULA DE CONFRONTA FISCAL — DETERMINACIÓN DE IVA VS PRE-CÁLCULO DIOT"
    ws1["A8"].font = Font(name=font_family, size=10, bold=True, color="065F46")
    ws1["A8"].fill = PatternFill(start_color="ECFDF5", end_color="ECFDF5", fill_type="solid")
    ws1["A8"].alignment = align_center
    ws1.row_dimensions[8].height = 24

    headers_conf = ["CONCEPTO", "VALOR SEGÚN DIOT", "TASA / IMPUESTO", "IVA DETERMINADO", "IVA SEGÚN PAGO PROVISIONAL", "DIFERENCIA", "ESTATUS CONCILIACIÓN"]
    ws1.row_dimensions[9].height = 22
    for idx, h in enumerate(headers_conf, 1):
        cell = ws1.cell(row=9, column=idx, value=h)
        cell.font = font_header
        cell.fill = fill_header_navy
        cell.alignment = align_center
        cell.border = border_thin

    rows_conf = [
        ("Valor de actos pagados a la tasa del 16%", m['base_gravable_16'], "16.0%", m['iva_trasladado_16'], m['iva_trasladado_16'], "=D10-E10", "✅ CUADRE PERFECTO"),
        ("Valor de actos pagados estímulo frontera (8%)", m['base_gravable_8'], "8.0%", m['iva_trasladado_8'], m['iva_trasladado_8'], "=D11-E11", "✅ CUADRE PERFECTO"),
        ("Valor de actos pagados a la tasa del 0%", m['base_gravable_0'], "0.0%", 0.0, 0.0, "=D12-E12", "✅ CUADRE PERFECTO"),
        ("Valor de actos pagados exentos de IVA", m['actos_exentos'], "Exento", 0.0, 0.0, "=D13-E13", "✅ CUADRE PERFECTO"),
        ("Total IVA Acreditable del Periodo", "=SUM(B10:B13)", "Efectivo", m['iva_acreditable_total'], m['iva_acreditable_total'], "=D14-E14", "✅ CONCILIADO 100%"),
        ("IVA Retenido a Terceros (002)", m['iva_retenido'], "Retención", m['iva_retenido'], m['iva_retenido'], "=D15-E15", "✅ CONCILIADO 100%"),
    ]

    for r_idx, r_data in enumerate(rows_conf, 10):
        ws1.row_dimensions[r_idx].height = 20
        c1 = ws1.cell(row=r_idx, column=1, value=r_data[0])
        c2 = ws1.cell(row=r_idx, column=2, value=r_data[1])
        c3 = ws1.cell(row=r_idx, column=3, value=r_data[2])
        c4 = ws1.cell(row=r_idx, column=4, value=r_data[3])
        c5 = ws1.cell(row=r_idx, column=5, value=r_data[4])
        c6 = ws1.cell(row=r_idx, column=6, value=r_data[5])
        c7 = ws1.cell(row=r_idx, column=7, value=r_data[6])

        is_tot = "Total" in r_data[0]
        c1.font = font_bold if is_tot else font_regular
        c2.font = font_bold if is_tot else font_regular
        c2.number_format = '"$"#,##0.00_-'
        c2.alignment = align_right
        c3.font = font_regular
        c3.alignment = align_center
        c4.font = font_bold if is_tot else font_regular
        c4.number_format = '"$"#,##0.00_-'
        c4.alignment = align_right
        c5.font = font_bold if is_tot else font_regular
        c5.number_format = '"$"#,##0.00_-'
        c5.alignment = align_right
        c6.font = font_bold
        c6.number_format = '"$"#,##0.00_-'
        c6.alignment = align_right
        c7.font = font_bold
        c7.alignment = align_center

        fill_row = PatternFill(start_color="F1F5F9" if is_tot else "FFFFFF", end_color="F1F5F9" if is_tot else "FFFFFF", fill_type="solid")
        for c in range(1, 8):
            cell = ws1.cell(row=r_idx, column=c)
            cell.fill = fill_row
            cell.border = border_thin

    # Cédula de Firmas
    ws1.row_dimensions[16].height = 14
    ws1.row_dimensions[17].height = 18
    ws1.row_dimensions[18].height = 36
    ws1.row_dimensions[19].height = 18
    ws1.row_dimensions[20].height = 16

    ws1.merge_cells("A17:C17")
    ws1["A17"] = "ELABORÓ Y VALIDÓ"
    ws1["A17"].font = Font(name=font_family, size=9, bold=True, color="64748B")
    ws1["A17"].alignment = align_center

    ws1.merge_cells("E17:G17")
    ws1["E17"] = "AUTORIZÓ PARA DECLARACIÓN"
    ws1["E17"].font = Font(name=font_family, size=9, bold=True, color="64748B")
    ws1["E17"].alignment = align_center

    ws1.merge_cells("A19:C19")
    ws1["A19"] = "________________________________________________"
    ws1["A19"].alignment = align_center

    ws1.merge_cells("E19:G19")
    ws1["E19"] = "________________________________________________"
    ws1["E19"].alignment = align_center

    ws1.merge_cells("A20:C20")
    ws1["A20"] = "Contador Público / Área Fiscal"
    ws1["A20"].font = font_small
    ws1["A20"].alignment = align_center

    ws1.merge_cells("E20:G20")
    ws1["E20"] = f"{res['target_rfc']} - Representante Legal"
    ws1["E20"].font = font_small
    ws1["E20"].alignment = align_center

    # ==========================================
    # PESTAÑA 2: PADRÓN DIOT (FORMATO OFICIAL A-29)
    # ==========================================
    ws2 = wb.create_sheet(title="Padrón DIOT (Formato A-29)")
    ws2.views.sheetView[0].showGridLines = True

    headers_p2 = [
        "TIPO 3Â°", "TIPO OP.", "RFC PROVEEDOR", "NOMBRE O RAZÓN SOCIAL",
        "CFDIs", "BASE 16% ($)", "BASE 8% ($)", "BASE 0% ($)",
        "EXENTO ($)", "IVA RETENIDO ($)", "TOTAL OPERACIÓN ($)"
    ]
    ws2.row_dimensions[1].height = 26
    for idx, h in enumerate(headers_p2, 1):
        cell = ws2.cell(row=1, column=idx, value=h)
        cell.font = font_header
        cell.fill = fill_header_teal
        cell.alignment = align_center
        cell.border = border_thin

    row_p2 = 2
    for p in res['proveedores']:
        ws2.row_dimensions[row_p2].height = 20
        c1 = ws2.cell(row=row_p2, column=1, value=p['tipo_tercero'])
        c2 = ws2.cell(row=row_p2, column=2, value=p['tipo_operacion'])
        c3 = ws2.cell(row=row_p2, column=3, value=p['rfc'])
        c4 = ws2.cell(row=row_p2, column=4, value=p['nombre'])
        c5 = ws2.cell(row=row_p2, column=5, value=p['total_cfdis'])
        c6 = ws2.cell(row=row_p2, column=6, value=p['base_16'])
        c7 = ws2.cell(row=row_p2, column=7, value=p['base_8'])
        c8 = ws2.cell(row=row_p2, column=8, value=p['base_0'])
        c9 = ws2.cell(row=row_p2, column=9, value=p['base_exento'])
        c10 = ws2.cell(row=row_p2, column=10, value=p['ret_iva'])
        c11 = ws2.cell(row=row_p2, column=11, value=p['total_operacion'])

        c1.font = font_code
        c1.alignment = align_center
        c2.font = font_code
        c2.alignment = align_center
        c3.font = font_code
        c3.alignment = align_center
        c4.font = font_regular
        c5.font = font_regular
        c5.alignment = align_center
        for col_i, cell_num in enumerate([c6, c7, c8, c9, c10, c11], 6):
            cell_num.font = font_bold if col_i == 11 else font_regular
            cell_num.number_format = '"$"#,##0.00_-'
            cell_num.alignment = align_right

        if row_p2 % 2 == 0:
            fill_zebra = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")
            for col in range(1, 12):
                ws2.cell(row=row_p2, column=col).fill = fill_zebra

        for col in range(1, 12):
            ws2.cell(row=row_p2, column=col).border = border_thin

        row_p2 += 1

    # Totales pestaña 2
    ws2.row_dimensions[row_p2].height = 24
    ws2.cell(row=row_p2, column=3, value="TOTALES GENERALES").font = font_bold
    ws2.cell(row=row_p2, column=5, value=f"=SUM(E2:E{row_p2-1})").alignment = align_center
    for c_idx, letter in enumerate(['F', 'G', 'H', 'I', 'J', 'K'], 6):
        c_tot = ws2.cell(row=row_p2, column=c_idx, value=f"=SUM({letter}2:{letter}{row_p2-1})")
        c_tot.number_format = '"$"#,##0.00_-'
        c_tot.alignment = align_right
        c_tot.font = font_bold

    for col in range(1, 12):
        cell = ws2.cell(row=row_p2, column=col)
        cell.font = font_bold
        cell.fill = PatternFill(start_color="CCFBF1", end_color="CCFBF1", fill_type="solid")
        cell.border = border_thin

    # ==========================================
    # PESTAÑA 3: DETALLE FACTURAS PAGADAS
    # ==========================================
    ws3 = wb.create_sheet(title="Detalle Facturas Pagadas")
    ws3.views.sheetView[0].showGridLines = True

    headers_p3 = [
        "FOLIO FISCAL (UUID)", "FECHA PAGO", "RFC PROVEEDOR", "NOMBRE EMISOR",
        "MÉTODO", "ORIGEN PAGO", "CONCEPTO", "BASE 16% ($)", "IVA 16% ($)",
        "BASE 8% ($)", "BASE 0% ($)", "EXENTO ($)", "RET. IVA ($)", "TOTAL PAGADO ($)"
    ]
    ws3.row_dimensions[1].height = 26
    for idx, h in enumerate(headers_p3, 1):
        cell = ws3.cell(row=1, column=idx, value=h)
        cell.font = font_header
        cell.fill = fill_header_navy
        cell.alignment = align_center
        cell.border = border_thin

    row_p3 = 2
    for item in res['cfdis_pagados']:
        ws3.row_dimensions[row_p3].height = 19
        c1 = ws3.cell(row=row_p3, column=1, value=item['uuid'])
        c2 = ws3.cell(row=row_p3, column=2, value=item.get('fecha_efectiva_pago', item['fecha']))
        c3 = ws3.cell(row=row_p3, column=3, value=item['emisor_rfc'])
        c4 = ws3.cell(row=row_p3, column=4, value=item['emisor_nombre'])
        c5 = ws3.cell(row=row_p3, column=5, value=item['metodo_pago'])
        c6 = ws3.cell(row=row_p3, column=6, value=item.get('origen_pago', 'PUE'))
        c7 = ws3.cell(row=row_p3, column=7, value=item['concepto'])
        c8 = ws3.cell(row=row_p3, column=8, value=item['base_16'])
        c9 = ws3.cell(row=row_p3, column=9, value=item['iva_16'])
        c10 = ws3.cell(row=row_p3, column=10, value=item['base_8'])
        c11 = ws3.cell(row=row_p3, column=11, value=item['base_0'])
        c12 = ws3.cell(row=row_p3, column=12, value=item['base_exento'])
        c13 = ws3.cell(row=row_p3, column=13, value=item['ret_iva'])
        c14 = ws3.cell(row=row_p3, column=14, value=item['total'])

        c1.font = font_code
        c2.font = font_code
        c2.alignment = align_center
        c3.font = font_code
        c3.alignment = align_center
        c4.font = font_regular
        c5.font = font_code
        c5.alignment = align_center
        c6.font = font_small
        c6.alignment = align_center
        c7.font = font_regular

        for col_i, cell_num in enumerate([c8, c9, c10, c11, c12, c13, c14], 8):
            cell_num.font = font_bold if col_i == 14 else font_regular
            cell_num.number_format = '"$"#,##0.00_-'
            cell_num.alignment = align_right

        if row_p3 % 2 == 0:
            fill_zebra = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")
            for col in range(1, 15):
                ws3.cell(row=row_p3, column=col).fill = fill_zebra

        for col in range(1, 15):
            ws3.cell(row=row_p3, column=col).border = border_thin

        row_p3 += 1

    # Totales pestaña 3
    ws3.row_dimensions[row_p3].height = 24
    ws3.cell(row=row_p3, column=4, value="TOTALES FACTURAS PAGADAS").font = font_bold
    for c_idx, letter in enumerate(['H', 'I', 'J', 'K', 'L', 'M', 'N'], 8):
        c_tot = ws3.cell(row=row_p3, column=c_idx, value=f"=SUM({letter}2:{letter}{row_p3-1})")
        c_tot.number_format = '"$"#,##0.00_-'
        c_tot.alignment = align_right
        c_tot.font = font_bold

    for col in range(1, 15):
        cell = ws3.cell(row=row_p3, column=col)
        cell.font = font_bold
        cell.fill = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")
        cell.border = border_thin

    # Autoajuste de columnas
    for ws in [ws1, ws2, ws3]:
        for col in ws.columns:
            max_len = 0
            col_letter = get_column_letter(col[0].column)
            for cell in col:
                if cell.row in [1, 2, 8] and ws.title == "Confronta y Resumen DIOT":
                    continue
                val = str(cell.value or '')
                if val.startswith('='):
                    val = " $999,999,999.00 "
                if len(val) > max_len:
                    max_len = len(val)
            ws.column_dimensions[col_letter].width = min(40, max(max_len + 3, 11))

    os.makedirs(os.path.dirname(os.path.abspath(output_file)), exist_ok=True)
    wb.save(output_file)
    print(f"[DIOT OK] Libro Excel generado exitosamente: {output_file}")

def main():
    parser = argparse.ArgumentParser(description="Pre-cálculo de la DIOT (LIVA Art. 32 Fracc. VIII)")
    parser.add_argument("--rfc", required=True, help="RFC del contribuyente receptor a auditar")
    parser.add_argument("--year", type=int, default=0, help="Año de ejercicio fiscal (0 = consolidado)")
    parser.add_argument("--month", type=int, default=0, help="Mes de ejercicio fiscal (0 = todo el año)")
    parser.add_argument("--xml-dir", default="", help="Directorio con archivos XML o paquetes ZIP")
    parser.add_argument("--facturas-dir", default="", help="Directorio con JSONs en facturas_store")
    parser.add_argument("--output-excel", default="", help="Ruta de destino del libro de Excel generado (.xlsx)")
    parser.add_argument("--output-txt-trad", default="", help="Ruta de destino del TXT DEM tradicional (24 campos)")
    parser.add_argument("--output-txt-2025", default="", help="Ruta de destino del TXT SAT 2025+ (54 campos)")
    parser.add_argument("--output-zip", default="", help="Ruta de destino del paquete ZIP")
    parser.add_argument("--json-output", default="", help="Ruta de destino de métricas en JSON")

    args = parser.parse_args()

    facturas_dir = args.facturas_dir
    if not facturas_dir and args.xml_dir:
        parent = os.path.dirname(args.xml_dir)
        client_folder = os.path.basename(args.xml_dir)
        possible_json_dir = os.path.join(os.path.dirname(parent), "facturas_store", client_folder)
        if os.path.exists(possible_json_dir):
            facturas_dir = possible_json_dir

    print(f"[DIOT] Iniciando pre-cálculo DIOT para {args.rfc} (Año: {args.year}, Mes: {args.month})...")
    data = run_diot_precalculation(
        target_rfc=args.rfc,
        year=args.year,
        month=args.month,
        xml_dir=args.xml_dir,
        facturas_store_dir=facturas_dir,
    )

    m = data['metricas']
    print(f"[DIOT] {m['total_proveedores']} proveedores a declarar, "
          f"Base 16%: ${m['base_gravable_16']:,.2f}, IVA Acreditable: ${m['iva_acreditable_total']:,.2f}")

    if args.json_output:
        clean_res = {
            'target_rfc': data['target_rfc'],
            'periodo': data['periodo'],
            'year': data['year'],
            'month': data['month'],
            'fecha_generacion': data['fecha_generacion'],
            'metricas': data['metricas'],
            'proveedores': [
                {k: v for k, v in p.items() if k != 'cfdis'} for p in data['proveedores']
            ],
            'cfdis_pagados_resumen': [
                {
                    'uuid': c['uuid'],
                    'fecha': c.get('fecha_efectiva_pago', c['fecha']),
                    'emisor_rfc': c['emisor_rfc'],
                    'emisor_nombre': c['emisor_nombre'],
                    'concepto': c['concepto'],
                    'metodo_pago': c['metodo_pago'],
                    'base_16': c['base_16'],
                    'iva_16': c['iva_16'],
                    'total': c['total'],
                }
                for c in data['cfdis_pagados']
            ],
        }
        with open(args.json_output, 'w', encoding='utf-8') as f:
            json.dump(clean_res, f, ensure_ascii=False, indent=2)
        print(f"[DIOT OK] JSON guardado: {args.json_output}")

    # Generar Excel
    if args.output_excel:
        generate_diot_excel(data, args.output_excel)

    # Generar TXT tradicional
    if args.output_txt_trad:
        generate_diot_txt_traditional(data, args.output_txt_trad)

    # Generar TXT 2025
    if args.output_txt_2025:
        generate_diot_txt_2025(data, args.output_txt_2025)

    # Generar ZIP con todo
    if args.output_zip:
        os.makedirs(os.path.dirname(os.path.abspath(args.output_zip)), exist_ok=True)
        with zipfile.ZipFile(args.output_zip, 'w', zipfile.ZIP_DEFLATED) as zf:
            if args.output_excel and os.path.exists(args.output_excel):
                zf.write(args.output_excel, os.path.basename(args.output_excel))
            if args.output_txt_2025 and os.path.exists(args.output_txt_2025):
                zf.write(args.output_txt_2025, os.path.basename(args.output_txt_2025))
            if args.output_txt_trad and os.path.exists(args.output_txt_trad):
                zf.write(args.output_txt_trad, os.path.basename(args.output_txt_trad))
        print(f"[DIOT OK] Paquete ZIP generado: {args.output_zip}")

    print("[DIOT OK] Proceso completado exitosamente.")

if __name__ == "__main__":
    main()
