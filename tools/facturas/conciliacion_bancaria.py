import os
import sys
import glob
import pandas as pd

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "shared")))
try:
    from cfdi_xml_engine import CFDIXMLEngine
except ImportError:
    CFDIXMLEngine = None

def conciliar_banco_cfdi(excel_banco_path, xml_dir, fecha_col="Fecha", deposito_col="Abono", retiro_col="Cargo"):
    """
    Cruza el estado de cuenta bancario con los XML de facturas para detectar 
    presuncion de ingresos (Art 59 CFF).
    """
    if not CFDIXMLEngine:
        return {"success": False, "error": "Motor XML no encontrado."}
        
    try:
        # Leer estado de cuenta bancario
        df_banco = pd.read_excel(excel_banco_path)
    except Exception as e:
        return {"success": False, "error": f"No se pudo leer el Excel del banco: {e}"}

    # Leer XMLs de ingresos
    xml_files = glob.glob(os.path.join(xml_dir, "**", "*.xml"), recursive=True)
    facturas_ingreso = []
    
    for xml_path in xml_files:
        try:
            engine = CFDIXMLEngine(xml_path=xml_path)
            data = engine.get_full_extraction()
            
            # Solo considerar facturas de ingreso o pagos recibidos
            if data.get("TipoDeComprobante") in ['I', 'P']:
                facturas_ingreso.append({
                    "UUID": data.get("UUID", ""),
                    "Fecha": data.get("Fecha", "")[:10],
                    "Total": data.get("Total", 0.0),
                    "RFC_Cliente": data.get("Receptor_RFC", "")
                })
        except Exception:
            continue
            
    # Lógica de cruce simplificada
    resultados = []
    
    for index, row in df_banco.iterrows():
        abono = row.get(deposito_col, 0)
        cargo = row.get(retiro_col, 0)
        
        if pd.isna(abono) or abono <= 0:
            continue
            
        # Buscar factura coincidente (misma cantidad exacta en este demo)
        match = next((f for f in facturas_ingreso if abs(f["Total"] - abono) < 0.10), None)
        
        if match:
            resultados.append({
                "Fecha_Banco": row.get(fecha_col, ""),
                "Concepto_Banco": row.get("Concepto", "Depósito"),
                "Monto_Banco": abono,
                "Estatus": "Amparado con XML",
                "UUID_CFDI": match["UUID"],
                "Cliente": match["RFC_Cliente"]
            })
        else:
            resultados.append({
                "Fecha_Banco": row.get(fecha_col, ""),
                "Concepto_Banco": row.get("Concepto", "Depósito"),
                "Monto_Banco": abono,
                "Estatus": "ALERTA: Sin Facturar (Art 59 CFF)",
                "UUID_CFDI": "N/A",
                "Cliente": "Desconocido"
            })
            
    return {
        "success": True,
        "total_depositos": sum([r["Monto_Banco"] for r in resultados]),
        "total_amparado": sum([r["Monto_Banco"] for r in resultados if r["Estatus"] == "Amparado con XML"]),
        "total_riesgo": sum([r["Monto_Banco"] for r in resultados if "ALERTA" in r["Estatus"]]),
        "registros": resultados
    }
