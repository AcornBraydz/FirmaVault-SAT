# -*- coding: utf-8 -*-
"""
Suite de Pruebas Unitarias Automatizadas para el Motor Universal CFDI (cfdi_xml_engine.py).
FirmaVault SAT - Verificación Nivel Enterprise Top-Tier.
Ejecutar con: python tools/shared/test_cfdi_engine.py
"""

import unittest
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from cfdi_xml_engine import CFDIXMLEngine

# XML Mocks
SAMPLE_CFDI_40 = """<?xml version="1.0" encoding="utf-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
    Version="4.0" Serie="F" Folio="1001" Fecha="2024-05-15T12:00:00"
    TipoDeComprobante="I" MetodoPago="PUE" FormaPago="03"
    SubTotal="10000.00" Descuento="0.00" Total="11600.00" Moneda="MXN" LugarExpedicion="06000">
    <cfdi:Emisor Rfc="XAXX010101000" Nombre="EMPRESA PRUEBA SA DE CV" RegimenFiscal="601"/>
    <cfdi:Receptor Rfc="URE180429CE4" Nombre="UNIVERSIDAD RECEPTORA SC" UsoCFDI="G03" RegimenFiscalReceptor="603"/>
    <cfdi:Impuestos TotalImpuestosTrasladados="1600.00" TotalImpuestosRetenidos="0.00">
        <cfdi:Traslados>
            <cfdi:Traslado Base="10000.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="1600.00"/>
        </cfdi:Traslados>
    </cfdi:Impuestos>
    <cfdi:Complemento>
        <tfd:TimbreFiscalDigital UUID="9E9F8E5A-7F42-4A3C-9A52-87F93E4E8D1B" FechaTimbrado="2024-05-15T12:05:00"/>
    </cfdi:Complemento>
</cfdi:Comprobante>
"""

SAMPLE_CFDI_33 = """<?xml version="1.0" encoding="utf-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/3" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
    Version="3.3" Serie="A" Folio="542" Fecha="2022-03-10T10:00:00"
    TipoDeComprobante="I" MetodoPago="PUE" FormaPago="01"
    SubTotal="5000.00" Descuento="0.00" Total="5800.00" Moneda="MXN" LugarExpedicion="64000">
    <cfdi:Emisor Rfc="AAA010101AAA" Nombre="PROVEEDOR HISTORICO SA" RegimenFiscal="601"/>
    <cfdi:Receptor Rfc="BBB020202BBB" Nombre="CLIENTE HISTORICO SA" UsoCFDI="G01"/>
    <cfdi:Impuestos TotalImpuestosTrasladados="800.00" TotalImpuestosRetenidos="0.00">
        <cfdi:Traslados>
            <cfdi:Traslado Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="800.00"/>
        </cfdi:Traslados>
    </cfdi:Impuestos>
    <cfdi:Complemento>
        <tfd:TimbreFiscalDigital UUID="12345678-ABCD-EF01-2345-6789ABCDEF01" FechaTimbrado="2022-03-10T10:02:00"/>
    </cfdi:Complemento>
</cfdi:Comprobante>
"""

SAMPLE_CFDI_RETENCIONES = """<?xml version="1.0" encoding="utf-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
    Version="4.0" Fecha="2024-06-01T09:00:00" TipoDeComprobante="I" SubTotal="20000.00" Total="21066.67">
    <cfdi:Emisor Rfc="MED900101XYZ" Nombre="DOCTOR O ARRENDADOR PF" RegimenFiscal="612"/>
    <cfdi:Receptor Rfc="MOR950505ABC" Nombre="EMPRESA MORAL RECEPTORA SA" UsoCFDI="G03"/>
    <cfdi:Impuestos TotalImpuestosTrasladados="3200.00" TotalImpuestosRetenidos="4133.33">
        <cfdi:Retenciones>
            <cfdi:Retencion Impuesto="001" Importe="2000.00"/>
            <cfdi:Retencion Impuesto="002" Importe="2133.33"/>
        </cfdi:Retenciones>
        <cfdi:Traslados>
            <cfdi:Traslado Base="20000.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="3200.00"/>
        </cfdi:Traslados>
    </cfdi:Impuestos>
    <cfdi:Complemento>
        <tfd:TimbreFiscalDigital UUID="AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE"/>
    </cfdi:Complemento>
</cfdi:Comprobante>
"""

SAMPLE_CFDI_NOMINA = """<?xml version="1.0" encoding="utf-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:nomina12="http://www.sat.gob.mx/nomina12" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
    Version="4.0" Fecha="2024-05-31T18:00:00" TipoDeComprobante="N" SubTotal="15000.00" Total="13500.00">
    <cfdi:Emisor Rfc="PATR900101AA1" Nombre="PATRON DE PRUEBA SA"/>
    <cfdi:Receptor Rfc="TRAB920202BB2" Nombre="TRABAJADOR JUAN PEREZ"/>
    <cfdi:Complemento>
        <nomina12:Nomina FechaPago="2024-05-31" TipoNomina="O">
            <nomina12:Percepciones TotalSueldos="15000.00" TotalGravado="12000.00" TotalExento="3000.00"/>
            <nomina12:Deducciones>
                <nomina12:Deduccion TipoDeduccion="001" Clave="001" Concepto="Seguridad Social IMSS" Importe="450.00"/>
                <nomina12:Deduccion TipoDeduccion="002" Clave="002" Concepto="Retención ISR" Importe="1050.00"/>
            </nomina12:Deducciones>
            <nomina12:OtrosPagos>
                <nomina12:OtroPago TipoOtroPago="002" Clave="002" Concepto="Subsidio">
                    <nomina12:SubsidioAlEmpleo SubsidioCausado="250.00"/>
                </nomina12:OtroPago>
            </nomina12:OtrosPagos>
        </nomina12:Nomina>
        <tfd:TimbreFiscalDigital UUID="NOMINA-UUID-1234-5678-ABCDEF987654"/>
    </cfdi:Complemento>
</cfdi:Comprobante>
"""

SAMPLE_CFDI_PAGOS = """<?xml version="1.0" encoding="utf-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:pago20="http://www.sat.gob.mx/Pagos20" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
    Version="4.0" Fecha="2024-06-15T15:00:00" TipoDeComprobante="P" SubTotal="0" Total="0">
    <cfdi:Emisor Rfc="EMIS900101XX1" Nombre="EMISOR REP"/>
    <cfdi:Receptor Rfc="RECP900101YY2" Nombre="RECEPTOR REP"/>
    <cfdi:Complemento>
        <pago20:Pagos Version="2.0">
            <pago20:Pago FechaPago="2024-06-14T11:30:00" FormaDePagoP="03" MonedaP="MXN" Monto="5000.00">
                <pago20:DoctoRelacionado IdDocumento="F1E2D3C4-B5A6-7890-1234-567890ABCDEF" MonedaDR="MXN" EquivalenciaDR="1"
                    NumParcialidad="1" ImpSaldoAnt="10000.00" ImpPagado="5000.00" ImpSaldoInsoluto="5000.00"/>
            </pago20:Pago>
        </pago20:Pagos>
        <tfd:TimbreFiscalDigital UUID="PAGO-UUID-9999-8888-777766665555"/>
    </cfdi:Complemento>
</cfdi:Comprobante>
"""

class TestCFDIXMLEngine(unittest.TestCase):

    def test_cfdi_40_parsing(self):
        """Valida extracción completa de CFDI 4.0."""
        engine = CFDIXMLEngine(xml_string=SAMPLE_CFDI_40)
        data = engine.get_full_extraction()

        self.assertEqual(data["Version"], "4.0")
        self.assertEqual(data["UUID"], "9E9F8E5A-7F42-4A3C-9A52-87F93E4E8D1B")
        self.assertEqual(data["Emisor_RFC"], "XAXX010101000")
        self.assertEqual(data["Receptor_RFC"], "URE180429CE4")
        self.assertEqual(data["SubTotal"], 10000.00)
        self.assertEqual(data["Total"], 11600.00)
        self.assertEqual(data["Traslados"]["IVA_16"], 1600.00)
        self.assertEqual(data["Bases"]["IVA_16"], 10000.00)

    def test_cfdi_33_retrocompatibility(self):
        """Valida que CFDI 3.3 histórico sea extraído con exactitud sin fallar por namespace."""
        engine = CFDIXMLEngine(xml_string=SAMPLE_CFDI_33)
        data = engine.get_full_extraction()

        self.assertEqual(data["Version"], "3.3")
        self.assertEqual(data["UUID"], "12345678-ABCD-EF01-2345-6789ABCDEF01")
        self.assertEqual(data["Emisor_RFC"], "AAA010101AAA")
        self.assertEqual(data["Receptor_RFC"], "BBB020202BBB")
        self.assertEqual(data["SubTotal"], 5000.00)
        self.assertEqual(data["Total"], 5800.00)
        self.assertEqual(data["Traslados"]["IVA_16"], 800.00)

    def test_retenciones_individuales(self):
        """Valida separación estricta de Retenciones de ISR e IVA."""
        engine = CFDIXMLEngine(xml_string=SAMPLE_CFDI_RETENCIONES)
        data = engine.get_full_extraction()

        self.assertEqual(data["Retenciones"]["ISR"], 2000.00)
        self.assertEqual(data["Retenciones"]["IVA"], 2133.33)
        self.assertEqual(data["TotalImpuestosRetenidos"], 4133.33)

    def test_nomina_complement(self):
        """Valida extracción de Nómina 1.2, separando Gravado, Exento, ISR y Subsidio."""
        engine = CFDIXMLEngine(xml_string=SAMPLE_CFDI_NOMINA)
        data = engine.get_full_extraction()

        self.assertTrue(data.get("IsNomina"))
        self.assertEqual(data.get("TotalSueldos"), 15000.00)
        self.assertEqual(data.get("TotalGravado"), 12000.00)
        self.assertEqual(data.get("TotalExento"), 3000.00)
        self.assertEqual(data.get("ISRRetenido"), 1050.00)
        self.assertEqual(data.get("SubsidioAlEmpleo"), 250.00)

    def test_pagos_rep_complement(self):
        """Valida extracción de Complemento de Recepción de Pagos (REP)."""
        engine = CFDIXMLEngine(xml_string=SAMPLE_CFDI_PAGOS)
        data = engine.get_full_extraction()

        self.assertIn("Pagos_REP", data)
        pagos = data["Pagos_REP"]
        self.assertEqual(len(pagos), 1)
        self.assertEqual(pagos[0]["Monto"], 5000.00)
        self.assertEqual(len(pagos[0]["DocumentosRelacionados"]), 1)
        docto = pagos[0]["DocumentosRelacionados"][0]
        self.assertEqual(docto["IdDocumento"], "F1E2D3C4-B5A6-7890-1234-567890ABCDEF")
        self.assertEqual(docto["ImpPagado"], 5000.00)
        self.assertEqual(docto["ImpSaldoInsoluto"], 5000.00)

if __name__ == "__main__":
    unittest.main()
