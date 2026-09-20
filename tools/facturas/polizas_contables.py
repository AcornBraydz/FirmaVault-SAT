import os
import sys
import glob

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "shared")))
try:
    from cfdi_xml_engine import CFDIXMLEngine
except ImportError:
    CFDIXMLEngine = None

def generar_anexo_24(xml_dir, tipo_poliza="Diario"):
    """
    Genera el layout tabular de Pólizas Contables con UUID asociado
    para importación nativa a CONTPAQi / ASPEL COI.
    """
    if not CFDIXMLEngine:
        return {"success": False, "error": "Motor XML no encontrado."}

    xml_files = glob.glob(os.path.join(xml_dir, "**", "*.xml"), recursive=True)
    polizas = []
    
    for i, xml_path in enumerate(xml_files):
        try:
            engine = CFDIXMLEngine(xml_path=xml_path)
            data = engine.get_full_extraction()
            
            uuid = data.get("UUID", "")
            if not uuid:
                continue
                
            fecha = data.get("Fecha", "")[:10]
            total = data.get("Total", 0.0)
            subtotal = data.get("SubTotal", 0.0)
            rfc = data.get("Emisor_RFC", "") if data.get("TipoDeComprobante") == 'I' else data.get("Receptor_RFC", "")
            
            # Asientos simulados de provisión
            if data.get("TipoDeComprobante") == 'I': # Venta
                polizas.append({
                    "Fecha": fecha,
                    "Tipo": tipo_poliza,
                    "Numero": i + 1,
                    "Cuenta": "105-01-000", # Clientes
                    "Concepto": f"Provisión Factura {uuid[-5:]} {rfc}",
                    "Cargo": total,
                    "Abono": 0.0,
                    "UUID": uuid
                })
                polizas.append({
                    "Fecha": fecha,
                    "Tipo": tipo_poliza,
                    "Numero": i + 1,
                    "Cuenta": "401-01-000", # Ventas
                    "Concepto": f"Provisión Factura {uuid[-5:]} {rfc}",
                    "Cargo": 0.0,
                    "Abono": subtotal,
                    "UUID": uuid
                })
                # IVA Pendiente de Cobro
                iva_16 = data.get("Traslados", {}).get("IVA_16", 0.0)
                if iva_16 > 0:
                    polizas.append({
                        "Fecha": fecha,
                        "Tipo": tipo_poliza,
                        "Numero": i + 1,
                        "Cuenta": "209-01-000", # IVA Pendiente
                        "Concepto": f"Provisión Factura {uuid[-5:]} {rfc}",
                        "Cargo": 0.0,
                        "Abono": iva_16,
                        "UUID": uuid
                    })
        except Exception:
            continue
            
    return {
        "success": True,
        "total_polizas": len(polizas) // 3 if polizas else 0,
        "asientos": polizas
    }
