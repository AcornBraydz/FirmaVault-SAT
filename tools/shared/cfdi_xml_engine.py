# -*- coding: utf-8 -*-
"""
Motor Universal de Extracción y Parsing de CFDI y Complementos del SAT.
FirmaVault SAT - Nivel Enterprise Top-Tier
Compatible con CFDI 4.0, CFDI 3.3, Complementos de Pago 1.0 / 2.0 y Nómina 1.2.
Aritmética de precisión con Decimal y control exhaustivo de excepciones.
"""

from defusedxml import ElementTree as ET
from decimal import Decimal, ROUND_HALF_UP
import os

NAMESPACES_MAP = {
    'cfdi4': 'http://www.sat.gob.mx/cfd/4',
    'cfdi33': 'http://www.sat.gob.mx/cfd/3',
    'nomina12': 'http://www.sat.gob.mx/nomina12',
    'nomina11': 'http://www.sat.gob.mx/nomina',
    'pago20': 'http://www.sat.gob.mx/Pagos20',
    'pago10': 'http://www.sat.gob.mx/Pagos',
    'tfd': 'http://www.sat.gob.mx/TimbreFiscalDigital'
}

def to_decimal(val) -> Decimal:
    """Convierte con seguridad cualquier valor numérico a Decimal con 2 decimales."""
    if val is None or val == "":
        return Decimal("0.00")
    try:
        clean = str(val).replace("$", "").replace(",", "").strip()
        return Decimal(clean).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except Exception:
        return Decimal("0.00")

def round_money(val: Decimal) -> float:
    """Retorna float redondeado a 2 decimales para serialización JSON."""
    return float(val.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))

def local_tag(elem) -> str:
    """Extrae el nombre local del tag XML sin namespace."""
    if elem is None or not hasattr(elem, 'tag'):
        return ""
    return elem.tag.split('}')[-1] if '}' in elem.tag else elem.tag

class CFDIXMLEngine:
    def __init__(self, xml_path=None, xml_string=None):
        self.xml_path = xml_path
        if xml_string:
            if isinstance(xml_string, str):
                xml_bytes = xml_string.encode('utf-8')
            else:
                xml_bytes = xml_string
            self.root = ET.fromstring(xml_bytes)
        elif xml_path:
            self.tree = ET.parse(xml_path)
            self.root = self.tree.getroot()
        else:
            raise ValueError("Debe proveer xml_path o xml_string")

        # Detectar versión base de CFDI
        self.version = self.root.attrib.get("Version") or self.root.attrib.get("version", "4.0")

    def _find_direct_child(self, tag_name: str):
        """Busca un hijo directo del nodo raíz ignorando namespace."""
        for child in self.root:
            if local_tag(child) == tag_name:
                return child
        return None

    def _find_descendant(self, tag_name: str):
        """Busca el primer elemento descendiente que coincida con tag_name."""
        for elem in self.root.iter():
            if local_tag(elem) == tag_name:
                return elem
        return None

    def _find_all_descendants(self, tag_name: str):
        """Retorna todos los elementos descendientes que coincidan con tag_name."""
        return [elem for elem in self.root.iter() if local_tag(elem) == tag_name]

    def parse_comprobante_base(self) -> dict:
        """Extrae la metadata base del comprobante CFDI (3.3 o 4.0)."""
        subtotal = to_decimal(self.root.attrib.get("SubTotal", 0.0))
        descuento = to_decimal(self.root.attrib.get("Descuento", 0.0))
        total = to_decimal(self.root.attrib.get("Total", 0.0))

        data = {
            "Version": self.version,
            "Serie": self.root.attrib.get("Serie", ""),
            "Folio": self.root.attrib.get("Folio", ""),
            "Fecha": self.root.attrib.get("Fecha", ""),
            "TipoDeComprobante": self.root.attrib.get("TipoDeComprobante", "I").upper(),
            "MetodoPago": self.root.attrib.get("MetodoPago", "PUE"),
            "FormaPago": self.root.attrib.get("FormaPago", ""),
            "SubTotal": round_money(subtotal),
            "Descuento": round_money(descuento),
            "Total": round_money(total),
            "Moneda": self.root.attrib.get("Moneda", "MXN"),
            "TipoCambio": float(self.root.attrib.get("TipoCambio", 1.0)),
            "LugarExpedicion": self.root.attrib.get("LugarExpedicion", ""),
            "Emisor_RFC": "",
            "Emisor_Nombre": "",
            "Emisor_RegimenFiscal": "",
            "Receptor_RFC": "",
            "Receptor_Nombre": "",
            "Receptor_UsoCFDI": "",
            "Receptor_RegimenFiscalReceptor": "",
            "UUID": ""
        }

        # Emisor
        emisor = self._find_direct_child("Emisor")
        if emisor is not None:
            data["Emisor_RFC"] = (emisor.attrib.get("Rfc") or emisor.attrib.get("rfc", "")).strip().upper()
            data["Emisor_Nombre"] = emisor.attrib.get("Nombre") or emisor.attrib.get("nombre", "")
            data["Emisor_RegimenFiscal"] = emisor.attrib.get("RegimenFiscal") or emisor.attrib.get("regimenFiscal", "")

        # Receptor
        receptor = self._find_direct_child("Receptor")
        if receptor is not None:
            data["Receptor_RFC"] = (receptor.attrib.get("Rfc") or receptor.attrib.get("rfc", "")).strip().upper()
            data["Receptor_Nombre"] = receptor.attrib.get("Nombre") or receptor.attrib.get("nombre", "")
            data["Receptor_UsoCFDI"] = receptor.attrib.get("UsoCFDI") or receptor.attrib.get("usoCFDI", "")
            data["Receptor_RegimenFiscalReceptor"] = receptor.attrib.get("RegimenFiscalReceptor", "")

        # Timbre Fiscal Digital (UUID)
        tfd = self._find_descendant("TimbreFiscalDigital")
        if tfd is not None:
            data["UUID"] = (tfd.attrib.get("UUID") or tfd.attrib.get("uuid", "")).strip().upper()
            data["FechaTimbrado"] = tfd.attrib.get("FechaTimbrado", "")

        return data

    def parse_impuestos(self) -> dict:
        """
        Extrae impuestos trasladados y retenidos a nivel comprobante y/o concepto,
        con acumuladores en Decimal para evitar discrepancias de centavos.
        """
        iva_16_base = Decimal("0.00")
        iva_16_imp = Decimal("0.00")
        iva_8_base = Decimal("0.00")
        iva_8_imp = Decimal("0.00")
        iva_0_base = Decimal("0.00")
        iva_0_imp = Decimal("0.00")
        iva_exento_base = Decimal("0.00")
        iva_exento_imp = Decimal("0.00")
        ieps_base = Decimal("0.00")
        ieps_imp = Decimal("0.00")

        ret_iva = Decimal("0.00")
        ret_isr = Decimal("0.00")
        ret_ieps = Decimal("0.00")

        total_trasladados = Decimal("0.00")
        total_retenidos = Decimal("0.00")

        nodo_impuestos = self._find_direct_child("Impuestos")

        if nodo_impuestos is not None:
            total_trasladados = to_decimal(nodo_impuestos.attrib.get("TotalImpuestosTrasladados", 0.0))
            total_retenidos = to_decimal(nodo_impuestos.attrib.get("TotalImpuestosRetenidos", 0.0))

            # Traslados en nodo comprobante
            for tras in nodo_impuestos.iter():
                if local_tag(tras) == "Traslado":
                    impuesto = tras.attrib.get("Impuesto", "")
                    tasa = str(tras.attrib.get("TasaOCuota", "0")).strip()
                    importe = to_decimal(tras.attrib.get("Importe", 0.0))
                    base = to_decimal(tras.attrib.get("Base", 0.0))
                    factor = tras.attrib.get("TipoFactor", "")

                    if factor == "Exento":
                        iva_exento_base += base
                        iva_exento_imp += importe
                    elif impuesto in ["002", "IVA"]:
                        try:
                            tasa_num = float(tasa)
                        except Exception:
                            tasa_num = 0.16 if "16" in tasa else (0.08 if "8" in tasa else 0.0)

                        if abs(tasa_num - 0.16) < 0.005:
                            iva_16_imp += importe
                            iva_16_base += base
                        elif abs(tasa_num - 0.08) < 0.005:
                            iva_8_imp += importe
                            iva_8_base += base
                        elif abs(tasa_num) < 0.001:
                            iva_0_imp += importe
                            iva_0_base += base
                    elif impuesto in ["003", "IEPS"]:
                        ieps_imp += importe
                        ieps_base += base

            # Retenciones en nodo comprobante
            for ret in nodo_impuestos.iter():
                if local_tag(ret) == "Retencion":
                    impuesto = ret.attrib.get("Impuesto", "")
                    importe = to_decimal(ret.attrib.get("Importe", 0.0))
                    if impuesto in ["001", "ISR"]:
                        ret_isr += importe
                    elif impuesto in ["002", "IVA"]:
                        ret_iva += importe
                    elif impuesto in ["003", "IEPS"]:
                        ret_ieps += importe

        # Si el comprobante no tiene nodo global de impuestos (ej. desglosado por concepto en CFDI 4.0)
        if total_trasladados == Decimal("0.00") and total_retenidos == Decimal("0.00") and (iva_16_imp + iva_8_imp + ret_iva + ret_isr == Decimal("0.00")):
            conceptos = self._find_all_descendants("Concepto")
            for c in conceptos:
                for t in c.iter():
                    if local_tag(t) == "Traslado":
                        imp = t.attrib.get("Impuesto", "")
                        importe = to_decimal(t.attrib.get("Importe", 0.0))
                        base = to_decimal(t.attrib.get("Base", 0.0))
                        tasa = str(t.attrib.get("TasaOCuota", "0")).strip()
                        factor = t.attrib.get("TipoFactor", "")

                        if factor == "Exento":
                            iva_exento_base += base
                        elif imp in ["002", "IVA"]:
                            try:
                                tn = float(tasa)
                            except Exception:
                                tn = 0.16 if "16" in tasa else 0.0
                            if abs(tn - 0.16) < 0.005:
                                iva_16_imp += importe
                                iva_16_base += base
                            elif abs(tn - 0.08) < 0.005:
                                iva_8_imp += importe
                                iva_8_base += base
                            elif abs(tn) < 0.001:
                                iva_0_base += base
                        elif imp in ["003", "IEPS"]:
                            ieps_imp += importe
                            ieps_base += base

                    elif local_tag(t) == "Retencion":
                        imp = t.attrib.get("Impuesto", "")
                        importe = to_decimal(t.attrib.get("Importe", 0.0))
                        if imp in ["001", "ISR"]:
                            ret_isr += importe
                        elif imp in ["002", "IVA"]:
                            ret_iva += importe

            total_trasladados = iva_16_imp + iva_8_imp + iva_0_imp + ieps_imp
            total_retenidos = ret_isr + ret_iva + ret_ieps

        return {
            "TotalImpuestosTrasladados": round_money(total_trasladados),
            "TotalImpuestosRetenidos": round_money(total_retenidos),
            "Traslados": {
                "IVA_16": round_money(iva_16_imp),
                "IVA_8": round_money(iva_8_imp),
                "IVA_0": round_money(iva_0_imp),
                "IVA_Exento": round_money(iva_exento_imp),
                "IEPS": round_money(ieps_imp)
            },
            "Bases": {
                "IVA_16": round_money(iva_16_base),
                "IVA_8": round_money(iva_8_base),
                "IVA_0": round_money(iva_0_base),
                "IVA_Exento": round_money(iva_exento_base),
                "IEPS": round_money(ieps_base)
            },
            "Retenciones": {
                "IVA": round_money(ret_iva),
                "ISR": round_money(ret_isr),
                "IEPS": round_money(ret_ieps)
            }
        }

    def parse_nomina(self) -> dict:
        """Extrae datos específicos de nómina 1.2 separando Gravado y Exento."""
        nomina_data = {
            "IsNomina": False,
            "TotalSueldos": 0.0,
            "TotalGravado": 0.0,
            "TotalExento": 0.0,
            "SubsidioAlEmpleo": 0.0,
            "ISRRetenido": 0.0
        }

        nomina = self._find_descendant("Nomina")
        if nomina is not None:
            nomina_data["IsNomina"] = True
            nomina_data["FechaPago"] = nomina.attrib.get("FechaPago", "")
            nomina_data["TipoNomina"] = nomina.attrib.get("TipoNomina", "O")

            for elem in nomina.iter():
                lt = local_tag(elem)
                if lt == "Percepciones":
                    nomina_data["TotalSueldos"] = round_money(to_decimal(elem.attrib.get("TotalSueldos", 0.0)))
                    nomina_data["TotalGravado"] = round_money(to_decimal(elem.attrib.get("TotalGravado", 0.0)))
                    nomina_data["TotalExento"] = round_money(to_decimal(elem.attrib.get("TotalExento", 0.0)))
                elif lt == "Deduccion":
                    if elem.attrib.get("TipoDeduccion", "") in ["002", "2"]:
                        nomina_data["ISRRetenido"] += round_money(to_decimal(elem.attrib.get("Importe", 0.0)))
                elif lt == "SubsidioAlEmpleo":
                    sc = to_decimal(elem.attrib.get("SubsidioCausado", 0.0))
                    nomina_data["SubsidioAlEmpleo"] = max(nomina_data["SubsidioAlEmpleo"], round_money(sc))

        return nomina_data

    def parse_pagos(self) -> list:
        """Extrae el complemento de recepción de pagos (compatible con Pagos 1.0 y Pagos 2.0)."""
        pagos_data = []
        pagos_nodes = self._find_all_descendants("Pagos")
        for pnode in pagos_nodes:
            for p in pnode.iter():
                if local_tag(p) == "Pago":
                    pago_info = {
                        "FechaPago": p.attrib.get("FechaPago", ""),
                        "FormaDePagoP": p.attrib.get("FormaDePagoP", ""),
                        "Monto": round_money(to_decimal(p.attrib.get("Monto", 0.0))),
                        "MonedaP": p.attrib.get("MonedaP", "MXN"),
                        "DocumentosRelacionados": []
                    }

                    for docto in p.iter():
                        if local_tag(docto) == "DoctoRelacionado":
                            pago_info["DocumentosRelacionados"].append({
                                "IdDocumento": (docto.attrib.get("IdDocumento") or "").strip().upper(),
                                "MonedaDR": docto.attrib.get("MonedaDR", "MXN"),
                                "EquivalenciaDR": float(docto.attrib.get("EquivalenciaDR", 1.0)),
                                "NumParcialidad": docto.attrib.get("NumParcialidad", "1"),
                                "ImpSaldoAnt": round_money(to_decimal(docto.attrib.get("ImpSaldoAnt", 0.0))),
                                "ImpPagado": round_money(to_decimal(docto.attrib.get("ImpPagado", 0.0))),
                                "ImpSaldoInsoluto": round_money(to_decimal(docto.attrib.get("ImpSaldoInsoluto", 0.0)))
                            })
                    pagos_data.append(pago_info)
        return pagos_data

    def get_full_extraction(self) -> dict:
        """Retorna un diccionario completo estructurado con toda la información procesada."""
        data = self.parse_comprobante_base()
        impuestos = self.parse_impuestos()
        data.update(impuestos)

        if data.get("TipoDeComprobante") == "N":
            nomina = self.parse_nomina()
            data.update(nomina)

        if data.get("TipoDeComprobante") == "P":
            pagos = self.parse_pagos()
            data["Pagos_REP"] = pagos

        return data
