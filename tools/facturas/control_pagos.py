import os
import sys
import argparse
import json
from defusedxml import ElementTree as ET
from datetime import datetime
from collections import defaultdict
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

def emit_event(data):
    try:
        print(json.dumps(data), flush=True)
    except Exception:
        pass

def parse_cfdi_xml(xml_content):
    try:
        root = ET.fromstring(xml_content)
    except Exception:
        return None

    tipo_comp = root.attrib.get('TipoDeComprobante', 'I')
    fecha_raw = root.attrib.get('Fecha', '')
    total = float(root.attrib.get('Total', 0.0))
    subtotal = float(root.attrib.get('SubTotal', 0.0))
    metodo_pago = root.attrib.get('MetodoPago', 'PUE' if tipo_comp != 'P' else 'REP')
    forma_pago = root.attrib.get('FormaPago', '')
    folio_fiscal = ""
    doctos_relacionados = []

    for elem in root.iter():
        tag = elem.tag.split('}')[-1] if '}' in elem.tag else elem.tag
        if tag == 'TimbreFiscalDigital':
            folio_fiscal = elem.attrib.get('UUID', '')
        elif tag == 'Pago':
            if not forma_pago and 'FormaDePagoP' in elem.attrib:
                forma_pago = elem.attrib.get('FormaDePagoP', '')
            if tipo_comp == 'P' and 'Monto' in elem.attrib and total == 0.0:
                try: total += float(elem.attrib.get('Monto', 0.0))
                except: pass
        elif tag == 'DoctoRelacionado' and tipo_comp == 'P':
            dr_uuid = elem.attrib.get('IdDocumento', '')
            imp_pagado = float(elem.attrib.get('ImpPagado', 0.0)) if 'ImpPagado' in elem.attrib else 0.0
            if dr_uuid:
                doctos_relacionados.append({'uuid': dr_uuid, 'imp_pagado': imp_pagado})

    if not forma_pago:
        forma_pago = '99' if tipo_comp != 'P' else '03'

    emisor_rfc, emisor_nombre = "", ""
    receptor_rfc, receptor_nombre = "", ""

    for elem in root:
        tag = elem.tag.split('}')[-1] if '}' in elem.tag else elem.tag
        if tag == 'Emisor':
            emisor_rfc = elem.attrib.get('Rfc', '')
            emisor_nombre = elem.attrib.get('Nombre', emisor_rfc)
        elif tag == 'Receptor':
            receptor_rfc = elem.attrib.get('Rfc', '')
            receptor_nombre = elem.attrib.get('Nombre', receptor_rfc)

    dt = None
    if fecha_raw:
        try:
            dt = datetime.fromisoformat(fecha_raw.split("T")[0])
        except Exception:
            pass

    iva = 0.0
    for elem in root.iter():
        tag = elem.tag.split('}')[-1] if '}' in elem.tag else elem.tag
        if tag == 'Traslado':
            imp = elem.attrib.get('Impuesto', '')
            tasa = float(elem.attrib.get('TasaOCuota', 0.0)) if 'TasaOCuota' in elem.attrib else 0.0
            if imp in ['002', 'IVA'] or abs(tasa - 0.16) < 0.01:
                try:
                    iva += float(elem.attrib.get('Importe', 0.0))
                except Exception:
                    pass

    pue_viciado = False
    if metodo_pago == 'PUE' and forma_pago == '99':
        pue_viciado = True

    return {
        'uuid': folio_fiscal,
        'fecha': fecha_raw,
        'mes': dt.month if dt else 1,
        'anio': dt.year if dt else 2026,
        'tipo': tipo_comp,
        'metodo_pago': metodo_pago,
        'forma_pago': forma_pago,
        'emisor_rfc': emisor_rfc,
        'emisor_nombre': emisor_nombre,
        'receptor_rfc': receptor_rfc,
        'receptor_nombre': receptor_nombre,
        'subtotal': subtotal,
        'iva': round(iva, 2),
        'total': total,
        'pue_viciado': pue_viciado,
        'doctos_relacionados': doctos_relacionados
    }

def calc_reps(ppd_list, reps_list):
    rep_sums = defaultdict(float)
    rep_dates = defaultdict(list)
    for r in reps_list:
        for dr in r.get('doctos_relacionados', []):
            rep_sums[dr['uuid']] += dr['imp_pagado']
            if r.get('fecha'):
                rep_dates[dr['uuid']].append(r['fecha'])

    color_ppd_pagado = "DCFCE7"
    color_ppd_parcial = "FEF9C3"
    color_ppd_sin_rep = "FEE2E2"

    results = []
    now = datetime.now()
    for p in ppd_list:
        pagado = rep_sums.get(p['uuid'], 0.0)
        saldo = round(p['total'] - pagado, 2)

        # Cálculo de días de antigüedad y vencimiento del plazo legal de REP (Día 5 del mes sig. RMF 2.7.1.32)
        dias_antiguedad = 0
        es_vencido_rep = False
        fecha_str = p.get('fecha', '')
        if fecha_str:
            try:
                dt = datetime.fromisoformat(fecha_str.split('T')[0])
                dias_antiguedad = max(0, (now - dt).days)
                # Si la factura tiene más de 35 días y sigue con saldo sin REP, está legalmente vencida
                if dias_antiguedad > 35 and saldo > 0.1:
                    es_vencido_rep = True
            except Exception:
                pass

        if saldo < 0.1:
            estatus = "PAGADO (Con REP)"
            color = color_ppd_pagado
        elif pagado > 0:
            estatus = "PARCIAL"
            color = color_ppd_parcial
        else:
            estatus = "SIN REP / NO PAGADO"
            color = color_ppd_sin_rep

        p_copy = p.copy()
        p_copy['pagado'] = round(pagado, 2)
        p_copy['saldo'] = max(0.0, saldo)
        p_copy['estatus'] = estatus
        p_copy['color'] = color
        p_copy['dias_antiguedad'] = dias_antiguedad
        p_copy['es_vencido_rep'] = es_vencido_rep
        p_copy['iva_estimado'] = round(p['total'] - (p['total'] / 1.16), 2) if p.get('iva', 0.0) == 0 else p.get('iva', 0.0)
        results.append(p_copy)
    return results

def build_excel(pue_emitidas, ppd_emitidas, reps_emitidas, pue_recibidas, ppd_recibidas, reps_recibidas, output_path):
    wb = Workbook()
    
    # Colores corporativos (Teal palette)
    color_header = "0F766E" # Teal 700
    color_pue = "F0FDF4" # Green 50
    color_ppd_pagado = "DCFCE7" # Green 100
    color_ppd_parcial = "FEF9C3" # Yellow 100
    color_ppd_sin_rep = "FEE2E2" # Red 100
    
    font_header = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    font_bold = Font(name="Calibri", size=10, bold=True)
    font_regular = Font(name="Calibri", size=10)
    font_red = Font(name="Calibri", size=10, bold=True, color="991B1B")
    
    fill_header = PatternFill(start_color=color_header, end_color=color_header, fill_type="solid")
    thin_border = Border(left=Side(style='thin', color='E2E8F0'), 
                         right=Side(style='thin', color='E2E8F0'), 
                         top=Side(style='thin', color='E2E8F0'), 
                         bottom=Side(style='thin', color='E2E8F0'))
    
    num_format = '"$"#,##0.00_-'

    emitidas_proc = calc_reps(ppd_emitidas, reps_emitidas)
    recibidas_proc = calc_reps(ppd_recibidas, reps_recibidas)

    # ---------------------------------------------------------
    # Tab 1: Emitidas (CxC)
    # ---------------------------------------------------------
    ws_em = wb.active
    ws_em.title = "1_Cobranza_Emitidas"
    ws_em.views.sheetView[0].showGridLines = True
    
    headers_em = ["Folio Fiscal (UUID)", "Fecha", "Mes", "RFC Cliente", "Nombre Cliente", "Método", "Subtotal", "Total", "Total Cobrado (REPs)", "Saldo Insoluto", "Estatus REP"]
    ws_em.append(headers_em)
    for col_idx in range(1, len(headers_em) + 1):
        cell = ws_em.cell(row=1, column=col_idx)
        cell.font = font_header
        cell.fill = fill_header
        cell.alignment = Alignment(horizontal="center", vertical="center")

    row_idx = 2
    # PUE
    for d in pue_emitidas:
        ws_em.append([
            d['uuid'], d['fecha'], d['mes'], d['receptor_rfc'], d['receptor_nombre'], 
            'PUE', d['subtotal'], d['total'], d['total'], 0.0, 'CONTADO (PUE)'
        ])
        for c in range(1, 12):
            cell = ws_em.cell(row=row_idx, column=c)
            cell.border = thin_border
            cell.fill = PatternFill(start_color=color_pue, end_color=color_pue, fill_type="solid")
            if c >= 7 and c <= 10:
                cell.number_format = num_format
        row_idx += 1

    # PPD
    for d in emitidas_proc:
        ws_em.append([
            d['uuid'], d['fecha'], d['mes'], d['receptor_rfc'], d['receptor_nombre'], 
            'PPD', d['subtotal'], d['total'], d['pagado'], f"=MAX(0, H{row_idx}-I{row_idx})", d['estatus']
        ])
        for c in range(1, 12):
            cell = ws_em.cell(row=row_idx, column=c)
            cell.border = thin_border
            cell.fill = PatternFill(start_color=d['color'], end_color=d['color'], fill_type="solid")
            if c >= 7 and c <= 10:
                cell.number_format = num_format
            if c == 11 and d['estatus'] == "SIN REP / NO PAGADO":
                cell.font = font_red
        row_idx += 1

    if row_idx > 2:
        ws_em.append([
            "TOTALES", "", "", "", "", "",
            f"=SUM(G2:G{row_idx-1})", f"=SUM(H2:H{row_idx-1})", f"=SUM(I2:I{row_idx-1})", f"=SUM(J2:J{row_idx-1})",
            f"{len(pue_emitidas) + len(emitidas_proc)} Facturas"
        ])
        for c in range(1, 12):
            cell = ws_em.cell(row=row_idx, column=c)
            cell.font = font_bold
            cell.fill = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")
            cell.border = Border(top=Side(style='thin', color='0F766E'), bottom=Side(style='double', color='0F766E'))
            if c >= 7 and c <= 10:
                cell.number_format = num_format
                cell.alignment = Alignment(horizontal="right", vertical="center")
            else:
                cell.alignment = Alignment(horizontal="center", vertical="center")

    # ---------------------------------------------------------
    # Tab 2: Recibidas (CxP)
    # ---------------------------------------------------------
    ws_re = wb.create_sheet(title="2_Pagos_Recibidas")
    ws_re.views.sheetView[0].showGridLines = True
    
    headers_re = ["Folio Fiscal (UUID)", "Fecha", "Mes", "RFC Proveedor", "Nombre Proveedor", "Método", "Subtotal", "Total", "Total Pagado (REPs)", "Saldo Insoluto", "Estatus REP"]
    ws_re.append(headers_re)
    for col_idx in range(1, len(headers_re) + 1):
        cell = ws_re.cell(row=1, column=col_idx)
        cell.font = font_header
        cell.fill = fill_header
        cell.alignment = Alignment(horizontal="center", vertical="center")

    row_idx = 2
    # PUE
    for d in pue_recibidas:
        ws_re.append([
            d['uuid'], d['fecha'], d['mes'], d['emisor_rfc'], d['emisor_nombre'], 
            'PUE', d['subtotal'], d['total'], d['total'], 0.0, 'CONTADO (PUE)'
        ])
        for c in range(1, 12):
            cell = ws_re.cell(row=row_idx, column=c)
            cell.border = thin_border
            cell.fill = PatternFill(start_color=color_pue, end_color=color_pue, fill_type="solid")
            if c >= 7 and c <= 10:
                cell.number_format = num_format
        row_idx += 1

    # PPD
    for d in recibidas_proc:
        ws_re.append([
            d['uuid'], d['fecha'], d['mes'], d['emisor_rfc'], d['emisor_nombre'], 
            'PPD', d['subtotal'], d['total'], d['pagado'], f"=MAX(0, H{row_idx}-I{row_idx})", d['estatus']
        ])
        for c in range(1, 12):
            cell = ws_re.cell(row=row_idx, column=c)
            cell.border = thin_border
            cell.fill = PatternFill(start_color=d['color'], end_color=d['color'], fill_type="solid")
            if c >= 7 and c <= 10:
                cell.number_format = num_format
            if c == 11 and d['estatus'] == "SIN REP / NO PAGADO":
                cell.font = font_red
        row_idx += 1

    if row_idx > 2:
        ws_re.append([
            "TOTALES", "", "", "", "", "",
            f"=SUM(G2:G{row_idx-1})", f"=SUM(H2:H{row_idx-1})", f"=SUM(I2:I{row_idx-1})", f"=SUM(J2:J{row_idx-1})",
            f"{len(pue_recibidas) + len(recibidas_proc)} Facturas"
        ])
        for c in range(1, 12):
            cell = ws_re.cell(row=row_idx, column=c)
            cell.font = font_bold
            cell.fill = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")
            cell.border = Border(top=Side(style='thin', color='0F766E'), bottom=Side(style='double', color='0F766E'))
            if c >= 7 and c <= 10:
                cell.number_format = num_format
                cell.alignment = Alignment(horizontal="right", vertical="center")
            else:
                cell.alignment = Alignment(horizontal="center", vertical="center")

    # ---------------------------------------------------------
    # Tab 3: Complementos de Pago (REPs)
    # ---------------------------------------------------------
    all_reps = [(r, 'Emitido (Cobranza)', r.get('receptor_rfc', ''), r.get('receptor_nombre', '')) for r in reps_emitidas] + \
               [(r, 'Recibido (Pago)', r.get('emisor_rfc', ''), r.get('emisor_nombre', '')) for r in reps_recibidas]

    if all_reps:
        ws_rep = wb.create_sheet(title="3_Complementos_Pago")
        ws_rep.views.sheetView[0].showGridLines = True
        headers_rep = ["Folio Fiscal (UUID)", "Fecha", "Mes", "Tipo Flujo", "RFC Contraparte", "Nombre Contraparte", "Monto Pago", "Estatus REP"]
        ws_rep.append(headers_rep)
        for col_idx in range(1, len(headers_rep) + 1):
            cell = ws_rep.cell(row=1, column=col_idx)
            cell.font = font_header
            cell.fill = fill_header
            cell.alignment = Alignment(horizontal="center", vertical="center")

        row_rep = 2
        for r, flujo, contra_rfc, contra_nom in all_reps:
            ws_rep.append([
                r['uuid'], r['fecha'], r['mes'], flujo, contra_rfc, contra_nom,
                r.get('total', 0.0), 'COMPLEMENTO DE PAGO (REP)'
            ])
            for c in range(1, 9):
                cell = ws_rep.cell(row=row_rep, column=c)
                cell.border = thin_border
                cell.fill = PatternFill(start_color="F0FDFA", end_color="F0FDFA", fill_type="solid")
                if c == 7:
                    cell.number_format = num_format
            row_rep += 1

        if row_rep > 2:
            ws_rep.append([
                "TOTALES", "", "", "", "", "",
                f"=SUM(G2:G{row_rep-1})", f"{len(all_reps)} Complementos"
            ])
            for c in range(1, 9):
                cell = ws_rep.cell(row=row_rep, column=c)
                cell.font = font_bold
                cell.fill = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")
                cell.border = Border(top=Side(style='thin', color='0F766E'), bottom=Side(style='double', color='0F766E'))
                if c == 7:
                    cell.number_format = num_format
                    cell.alignment = Alignment(horizontal="right", vertical="center")
                else:
                    cell.alignment = Alignment(horizontal="center", vertical="center")

    for sheet in wb.worksheets:
        for col in sheet.columns:
            max_len = 0
            col_letter = get_column_letter(col[0].column)
            for cell in col:
                val = str(cell.value or '')
                if not val.startswith("="):
                    max_len = max(max_len, len(val))
            sheet.column_dimensions[col_letter].width = max(max_len + 3, 12)

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    wb.save(output_path)
    return output_path

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--year', type=int, required=True)
    parser.add_argument('--month', type=int, required=False, default=0)
    parser.add_argument('--xml-dir', type=str, required=True)
    parser.add_argument('--facturas-dir', type=str, required=False, default='')
    parser.add_argument('--rfc', type=str, required=False, default=None)
    parser.add_argument('--output', type=str, required=False, default='')
    parser.add_argument('--preview', action='store_true', default=False)
    parser.add_argument('--json-output', type=str, required=False, default='')
    args = parser.parse_args()

    emit_event({"type": "progress", "percent": 10, "msg": "Iniciando análisis de PUE vs PPD..."})

    pue_em, ppd_em, reps_em = [], [], []
    pue_re, ppd_re, reps_re = [], [], []

    search_dirs = []
    if args.xml_dir and os.path.exists(args.xml_dir):
        search_dirs.append(args.xml_dir)

    import zipfile
    import glob
    processed = 0
    seen_uuids = set()
    rfc_target = (args.rfc or '').upper().strip()

    def process_content(content, source_path):
        nonlocal processed
        parsed = parse_cfdi_xml(content)
        if parsed and parsed.get('uuid'):
            u = parsed['uuid'].upper().strip()
            if u in seen_uuids:
                return
            seen_uuids.add(u)

            if args.month != 0 and parsed['mes'] != args.month:
                return
            if parsed['anio'] != args.year:
                return

            if rfc_target:
                is_em = (parsed.get('emisor_rfc', '').upper() == rfc_target)
            else:
                is_em = ("emitidas" in source_path.lower() or "ingreso" in source_path.lower())

            if parsed['tipo'] == 'P':
                parsed['estatus'] = 'COMPLEMENTO DE PAGO (REP)'
                parsed['pagado'] = parsed['total']
                parsed['saldo'] = 0.0
                if is_em: reps_em.append(parsed)
                else: reps_re.append(parsed)
            elif parsed['metodo_pago'] == 'PPD':
                if is_em: ppd_em.append(parsed)
                else: ppd_re.append(parsed)
            else:
                parsed['estatus'] = 'CONTADO (PUE)'
                parsed['pagado'] = parsed['total']
                parsed['saldo'] = 0.0
                if is_em: pue_em.append(parsed)
                else: pue_re.append(parsed)

            processed += 1
            if processed % 50 == 0:
                emit_event({"type": "progress", "percent": 15 + int((processed / 1000) * 50), "msg": f"Procesando XMLs ({processed})..."})

    for target_dir in search_dirs:
        for root_dir, dirs, files in os.walk(target_dir):
            for file in files:
                file_path = os.path.join(root_dir, file)
                if file.lower().endswith(".xml"):
                    try:
                        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                            content = f.read()
                        process_content(content, file_path)
                    except Exception:
                        pass
                elif file.lower().endswith(".zip"):
                    try:
                        with zipfile.ZipFile(file_path, 'r') as z:
                            for zname in z.namelist():
                                if zname.lower().endswith(".xml"):
                                    try:
                                        with z.open(zname) as zf:
                                            content = zf.read().decode('utf-8', errors='ignore')
                                        process_content(content, zname)
                                    except Exception:
                                        pass
                    except Exception:
                        pass

    # -------------------------------------------------------------
    # 2. Complemento / Fallback con facturas_store (JSON metadata)
    # Permite funcionar para cualquier contribuyente y cualquier año
    # -------------------------------------------------------------
    facturas_dir = args.facturas_dir
    if not facturas_dir or not os.path.exists(facturas_dir):
        candidates = []
        if args.xml_dir:
            c_base = os.path.basename(args.xml_dir.rstrip('\\/'))
            p_dir = os.path.dirname(args.xml_dir.rstrip('\\/'))
            candidates.append(os.path.join(p_dir, 'facturas_store', c_base))
            candidates.append(os.path.join(os.path.dirname(p_dir), 'facturas_store', c_base))
            candidates.append(os.path.join('scratch', 'facturas_store', c_base))
        if rfc_target:
            candidates.append(os.path.join('scratch', 'facturas_store', rfc_target))
        for c in candidates:
            if c and os.path.exists(c):
                facturas_dir = c
                break

    MESES_MAP = {
        'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4,
        'mayo': 5, 'junio': 6, 'julio': 7, 'agosto': 8,
        'septiembre': 9, 'octubre': 10, 'noviembre': 11, 'diciembre': 12
    }

    def parse_fecha_mes_anio(fec_str, num_mes_hint=0):
        if not fec_str:
            return (0, num_mes_hint or 1)
        fec_str = str(fec_str).strip()
        if len(fec_str) >= 10 and fec_str[4] == '-' and fec_str[7] == '-':
            try:
                return (int(fec_str[:4]), int(fec_str[5:7]))
            except Exception:
                pass
        parts = fec_str.split('-')
        if len(parts) == 3:
            try:
                y = int(parts[2].strip())
                m_str = parts[1].strip().lower()
                m = MESES_MAP.get(m_str, num_mes_hint or 1)
                return (y, m)
            except Exception:
                pass
        for p in parts:
            if len(p.strip()) == 4 and p.strip().isdigit():
                return (int(p.strip()), num_mes_hint or 1)
        return (0, num_mes_hint or 1)

    if facturas_dir and os.path.exists(facturas_dir):
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
                        anio_f, mes_f = parse_fecha_mes_anio(fec_raw, num_m)
                        if anio_f and anio_f != args.year:
                            continue
                        if args.month != 0 and mes_f != args.month:
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
                        is_ppd = (metodo == 'PPD')

                        doc_obj = {
                            'uuid': u,
                            'fecha': fec_raw,
                            'mes': mes_f,
                            'anio': anio_f or args.year,
                            'tipo': 'P' if is_rep else ('E' if is_egr else 'I'),
                            'metodo_pago': 'REP' if is_rep else ('PPD' if is_ppd else 'PUE'),
                            'forma_pago': forma,
                            'emisor_rfc': rfc_target,
                            'emisor_nombre': rfc_target,
                            'receptor_rfc': rec_rfc,
                            'receptor_nombre': rec_nom,
                            'subtotal': subt,
                            'iva': round(iva, 2),
                            'total': tot,
                            'pue_viciado': (metodo == 'PUE' and forma == '99'),
                            'doctos_relacionados': []
                        }

                        seen_uuids.add(u)
                        if doc_obj['tipo'] == 'P':
                            doc_obj['estatus'] = 'COMPLEMENTO DE PAGO (REP)'
                            doc_obj['pagado'] = tot
                            doc_obj['saldo'] = 0.0
                            reps_em.append(doc_obj)
                        elif doc_obj['metodo_pago'] == 'PPD':
                            ppd_em.append(doc_obj)
                        else:
                            doc_obj['estatus'] = 'CONTADO (PUE)'
                            doc_obj['pagado'] = tot
                            doc_obj['saldo'] = 0.0
                            pue_em.append(doc_obj)
                        processed += 1
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
                        anio_f, mes_f = parse_fecha_mes_anio(fec_raw, num_m)
                        if anio_f and anio_f != args.year:
                            continue
                        if args.month != 0 and mes_f != args.month:
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
                        is_ppd = (metodo == 'PPD')

                        doc_obj = {
                            'uuid': u,
                            'fecha': fec_raw,
                            'mes': mes_f,
                            'anio': anio_f or args.year,
                            'tipo': 'P' if is_rep else ('E' if is_egr else 'I'),
                            'metodo_pago': 'REP' if is_rep else ('PPD' if is_ppd else 'PUE'),
                            'forma_pago': forma,
                            'emisor_rfc': emi_rfc,
                            'emisor_nombre': emi_nom,
                            'receptor_rfc': rfc_target,
                            'receptor_nombre': rfc_target,
                            'subtotal': subt,
                            'iva': round(iva, 2),
                            'total': tot,
                            'pue_viciado': (metodo == 'PUE' and forma == '99'),
                            'doctos_relacionados': []
                        }

                        seen_uuids.add(u)
                        if doc_obj['tipo'] == 'P':
                            doc_obj['estatus'] = 'COMPLEMENTO DE PAGO (REP)'
                            doc_obj['pagado'] = tot
                            doc_obj['saldo'] = 0.0
                            reps_re.append(doc_obj)
                        elif doc_obj['metodo_pago'] == 'PPD':
                            ppd_re.append(doc_obj)
                        else:
                            doc_obj['estatus'] = 'CONTADO (PUE)'
                            doc_obj['pagado'] = tot
                            doc_obj['saldo'] = 0.0
                            pue_re.append(doc_obj)
                        processed += 1
            except Exception:
                pass

    if processed == 0:
        emit_event({"type": "progress", "percent": 50, "msg": "No se encontraron comprobantes para los filtros seleccionados."})

    emit_event({"type": "progress", "percent": 75, "msg": "Cruzando REPs y calculando métricas..."})
    
    emitidas_proc = calc_reps(ppd_em, reps_em)
    recibidas_proc = calc_reps(ppd_re, reps_re)

    preview_payload = {
        "metricas": {
            "total_pue_emitidas": len(pue_em),
            "monto_pue_emitidas": round(sum(x['total'] for x in pue_em), 2),
            "total_ppd_emitidas": len(emitidas_proc),
            "monto_ppd_emitidas": round(sum(x['total'] for x in emitidas_proc), 2),
            "ppd_emitidas_cobradas": round(sum(x['pagado'] for x in emitidas_proc), 2),
            "ppd_emitidas_saldo": round(sum(x['saldo'] for x in emitidas_proc), 2),

            "total_pue_recibidas": len(pue_re),
            "monto_pue_recibidas": round(sum(x['total'] for x in pue_re), 2),
            "total_ppd_recibidas": len(recibidas_proc),
            "monto_ppd_recibidas": round(sum(x['total'] for x in recibidas_proc), 2),
            "ppd_recibidas_pagadas_rep": sum(1 for x in recibidas_proc if x['estatus'] == "PAGADO (Con REP)"),
            "monto_ppd_recibidas_pagadas": round(sum(x['pagado'] for x in recibidas_proc), 2),
            "ppd_recibidas_parciales": sum(1 for x in recibidas_proc if x['estatus'] == "PARCIAL"),
            "ppd_recibidas_sin_rep": sum(1 for x in recibidas_proc if x['estatus'] == "SIN REP / NO PAGADO"),
            "monto_sin_rep": round(sum(x['saldo'] for x in recibidas_proc if x['estatus'] == "SIN REP / NO PAGADO"), 2),
            "iva_en_riesgo": round(sum(x['iva_estimado'] for x in recibidas_proc if x['estatus'] == "SIN REP / NO PAGADO"), 2),
            "ppd_vencidas_legales": sum(1 for x in recibidas_proc if x.get('es_vencido_rep')),
            "pue_viciados": sum(1 for x in pue_re if x.get('pue_viciado')),
            "total_reps_emitidas": len(reps_em),
            "total_reps_recibidas": len(reps_re)
        },
        "pue_emitidas": pue_em[:500],
        "ppd_emitidas": emitidas_proc[:500],
        "reps_emitidas": reps_em[:500],
        "pue_recibidas": pue_re[:500],
        "ppd_recibidas": recibidas_proc[:500],
        "reps_recibidas": reps_re[:500]
    }

    if args.json_output:
        try:
            os.makedirs(os.path.dirname(os.path.abspath(args.json_output)), exist_ok=True)
            with open(args.json_output, 'w', encoding='utf-8') as f:
                json.dump(preview_payload, f, ensure_ascii=False, indent=2)
        except Exception as e:
            pass

    if args.output:
        build_excel(pue_em, ppd_em, reps_em, pue_re, ppd_re, reps_re, args.output)

    emit_event({"type": "progress", "percent": 100, "msg": "Generación completa"})
    if args.output:
        emit_event({"type": "finished", "excel_path": args.output, "preview": preview_payload})
    else:
        emit_event({"type": "preview_result", "data": preview_payload})

if __name__ == "__main__":
    main()
