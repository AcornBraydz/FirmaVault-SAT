import sys
import os
import json
import argparse
from datetime import datetime
from pdfminer.high_level import extract_text_to_fp
from pdfminer.layout import LAParams
import tempfile
import pandas as pd
from openpyxl import load_workbook
import sys
import os
from openpyxl.styles import Alignment
from openpyxl.styles import PatternFill, Font, Border, Side
from openpyxl.utils import get_column_letter

# Añadir tools/shared al path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "shared")))
try:
    from cfdi_xml_engine import CFDIXMLEngine
except ImportError:
    CFDIXMLEngine = None

def format_fecha_emision(fecha_emision):
    try:
        # Interpretar el formato original de la fecha (ej: 2023-08-04T12)
        fecha_original = datetime.strptime(fecha_emision, "%Y-%m-%dT%H")
    except ValueError:
        try:
            # En caso de timestamp ISO completo (ej: 2023-08-04T12:30:00)
            fecha_original = datetime.fromisoformat(fecha_emision)
        except Exception:
            return fecha_emision

    # Formatear la fecha al estilo deseado (DD-Mes-YYYY)
    fecha_formateada = fecha_original.strftime("%d-%B-%Y").lower()

    # Traducir el nombre del mes al español
    meses = {
        "january": "enero", "february": "febrero", "march": "marzo",
        "april": "abril", "may": "mayo", "june": "junio",
        "july": "julio", "august": "agosto", "september": "septiembre",
        "october": "octubre", "november": "noviembre", "december": "diciembre"
    }
    for en, es in meses.items():
        fecha_formateada = fecha_formateada.replace(en, es)

    return fecha_formateada.capitalize()

def apply_formulas_and_formatting(output_excel_path):
    workbook = load_workbook(output_excel_path)
    sheet = workbook.active

    # Aplicar fórmula para "Importe" (columna E) = ROUND("Total" (columna G) / 1.16, 2)
    for row in range(2, sheet.max_row + 1):
        sheet[f"E{row}"] = f"=ROUND(G{row}/1.16, 2)"

    # Aplicar fórmula para "IVA al 16%" (columna F) = ROUND("Importe" (columna E) * 0.16, 2)
    for row in range(2, sheet.max_row + 1):
        sheet[f"F{row}"] = f"=ROUND(E{row}*0.16, 2)"

    # Ajustar ancho de las columnas y centrar contenido
    for column in sheet.columns:
        max_length = 0
        column_letter = get_column_letter(column[0].column)
        for cell in column:
            if cell.value:
                max_length = max(max_length, len(str(cell.value)))
            cell.alignment = Alignment(horizontal='center', vertical='center')
        sheet.column_dimensions[column_letter].width = max(max_length * 1.30 + 2, 12)

    workbook.save(output_excel_path)

def process_facturas_pdf(pdf_path, tipo="emitidas", output_excel_path=None):
    """
    Procesa un archivo PDF o XML de Facturas (Emitidas o Recibidas) del SAT y genera un Excel con fórmulas.
    Retorna un diccionario con registros y resumen de estadísticas.
    """
    if pdf_path.lower().endswith('.xml') and CFDIXMLEngine:
        engine = CFDIXMLEngine(xml_path=pdf_path)
        data = engine.get_full_extraction()
        return {
            "success": True,
            "registros": [data],
            "stats": {
                "Total Documentos": 1,
                "Total Importe": data.get("SubTotal", 0.0),
                "Total IVA 16%": data.get("Traslados", {}).get("IVA_16", 0.0),
                "Total Retenciones": data.get("Retenciones", {}).get("ISR", 0.0) + data.get("Retenciones", {}).get("IVA", 0.0),
                "Total Final": data.get("Total", 0.0)
            }
        }
    tipo = tipo.lower().strip()
    if tipo not in ["emitidas", "recibidas"]:
        raise ValueError("El tipo de factura debe ser 'emitidas' o 'recibidas'")

    registros = []

    # Extraer texto del PDF usando stream para evitar Out-Of-Memory (OOM)
    with tempfile.TemporaryFile(mode='w+', encoding='utf-8') as temp_txt:
        with open(pdf_path, 'rb') as pdf_file:
            extract_text_to_fp(pdf_file, temp_txt, laparams=LAParams(), output_type='text', codec=None)
        
        temp_txt.seek(0)
        lines = [line.strip() for line in temp_txt.readlines()]
    registros = []

    i = 0
    while i < len(lines):
        if "Folio Fiscal:" in lines[i]:
            folio = lines[i].split(":")[1].strip()
            nombre = ""
            fecha_emision = ""
            rfc = ""
            estado_comprobante = ""
            efecto_comprobante = ""
            total = 0.00

            stop_headers = ["RFC Receptor:", "RFC Emisor:", "Folio Fiscal:", "Fecha Emisión:", "Fecha Emision:", "Total:", "Estado del Comprobante:"]

            if tipo == "emitidas":
                # Buscar "RFC Receptor"
                for j in range(i + 1, len(lines)):
                    if "RFC Receptor:" in lines[j]:
                        rfc = lines[j].split(":")[1].strip()
                        break

                # Buscar "Nombre o Razón Social" (en emitidas se toma el 2do)
                nombre_encontrado = 0
                for j in range(i + 1, len(lines)):
                    if "Nombre o Razón Social:" in lines[j]:
                        nombre_encontrado += 1
                        if nombre_encontrado == 2:
                            nombre = lines[j].split(":")[1].strip()
                            for k in range(j + 1, len(lines)):
                                line_clean = lines[k].strip()
                                if line_clean and not any(sh in lines[k] for sh in stop_headers):
                                    nombre += " " + line_clean
                                else:
                                    break
                            break

            else:  # tipo == "recibidas"
                # Buscar "RFC Emisor"
                for j in range(i + 1, len(lines)):
                    if "RFC Emisor:" in lines[j]:
                        rfc = lines[j].split(":")[1].strip()
                        break

                # Buscar "Nombre o Razón Social" (en recibidas se toma el 1ro)
                for j in range(i + 1, len(lines)):
                    if "Nombre o Razón Social:" in lines[j]:
                        nombre = lines[j].split(":")[1].strip()
                        for k in range(j + 1, len(lines)):
                            line_clean = lines[k].strip()
                            if line_clean and not any(sh in lines[k] for sh in stop_headers):
                                nombre += " " + line_clean
                            else:
                                break
                        break

            # Buscar "Fecha Emisión"
            for j in range(i + 1, len(lines)):
                if "Fecha Emisión:" in lines[j]:
                    fecha_emision_raw = lines[j].split(":")[1].strip()
                    fecha_emision = format_fecha_emision(fecha_emision_raw)
                    break

            # Buscar "Total:"
            for j in range(i + 1, len(lines)):
                if "Total:" in lines[j]:
                    total_text = lines[j].split(":")[1].strip()
                    try:
                        total = float(total_text.replace("$", "").replace(",", "").strip())
                    except ValueError:
                        total = 0.00
                    break

            # Buscar "Estado del Comprobante" y "Efecto del Comprobante"
            for j in range(i + 1, len(lines)):
                if "Estado del Comprobante:" in lines[j]:
                    partes = lines[j].split("Efecto del Comprobante:")
                    estado_comprobante = partes[0].split(":")[1].strip()
                    if len(partes) > 1:
                        efecto_comprobante = partes[1].strip()
                    break

            # Cálculos de importe e IVA para la vista previa en web
            importe_calc = round(total / 1.16, 2) if total else 0.00
            iva_calc = round(importe_calc * 0.16, 2) if total else 0.00

            registros.append({
                "Folio": folio,
                "Fecha de Emisión": fecha_emision,
                "Nombre o Razón Social": nombre,
                "RFC": rfc,
                "Importe": importe_calc,
                "IVA al 16%": iva_calc,
                "Total": total,
                "Estado del Comprobante": estado_comprobante,
                "Efecto del Comprobante": efecto_comprobante
            })
        i += 1

    # Si se solicitó guardar el Excel
    if output_excel_path:
        # Preparamos registros para Excel (dejando Importe e IVA vacíos para que las fórmulas openpyxl los calculen)
        excel_rows = []
        for r in registros:
            excel_rows.append({
                "Folio": r["Folio"],
                "Fecha de Emisión": r["Fecha de Emisión"],
                "Nombre o Razón Social": r["Nombre o Razón Social"],
                "RFC": r["RFC"],
                "Importe": "",  # Se llenará con la fórmula =ROUND(G{row}/1.16, 2)
                "IVA al 16%": "",  # Se llenará con la fórmula =ROUND(E{row}*0.16, 2)
                "Total": r["Total"],
                "Estado del Comprobante": r["Estado del Comprobante"],
                "Efecto del Comprobante": r["Efecto del Comprobante"]
            })

        df = pd.DataFrame(excel_rows)
        os.makedirs(os.path.dirname(os.path.abspath(output_excel_path)), exist_ok=True)
        df.to_excel(output_excel_path, index=False)
        apply_formulas_and_formatting(output_excel_path)

    # Calcular métricas para el frontend
    total_monto = sum(r["Total"] for r in registros)
    vigentes_count = sum(1 for r in registros if "vigente" in (r["Estado del Comprobante"] or "").lower())
    cancelados_count = sum(1 for r in registros if "cancelado" in (r["Estado del Comprobante"] or "").lower())

    return {
        "tipo": tipo,
        "total_registros": len(registros),
        "total_monto": round(total_monto, 2),
        "vigentes": vigentes_count,
        "cancelados": cancelados_count,
        "registros": registros,
        "excel_path": output_excel_path
    }

def main():
    parser = argparse.ArgumentParser(description="Procesador de Facturas SAT (Emitidas/Recibidas) a Excel")
    parser.add_argument("--input", required=True, help="Ruta al archivo PDF del SAT")
    parser.add_argument("--type", choices=["emitidas", "recibidas"], default="emitidas", help="Tipo de facturas")
    parser.add_argument("--output", help="Ruta del archivo Excel de salida (.xlsx)")
    parser.add_argument("--json", action="store_true", help="Imprimir resultado en JSON a stdout")

    args = parser.parse_args()

    try:
        output_path = args.output
        if not output_path:
            output_path = args.input.replace(".pdf", "_procesado.xlsx")

        res = process_facturas_pdf(args.input, tipo=args.type, output_excel_path=output_path)

        if args.json:
            print(json.dumps({
                "success": True,
                "data": res
            }, ensure_ascii=False))
        else:
            print(f"Procesamiento completado con éxito. {res['total_registros']} facturas procesadas.")
            print(f"Archivo generado: {output_path}")

    except Exception as e:
        if args.json:
            print(json.dumps({
                "success": False,
                "error": str(e)
            }, ensure_ascii=False))
        else:
            print(f"Error al procesar: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
