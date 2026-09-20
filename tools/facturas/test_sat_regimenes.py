# -*- coding: utf-8 -*-
"""
Suite de Pruebas Unitarias Automatizadas para el Motor Tributario del SAT (sat_regimenes.py).
FirmaVault SAT - Verificación Nivel Enterprise Top-Tier.
Ejecutar con: python tools/facturas/test_sat_regimenes.py
"""

import unittest
import sys
import os

# Asegurar path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sat_regimenes import (
    calcular_impuestos_regimen,
    normalizar_regimen_code,
    get_regimen_info,
    CATALOGO_REGIMENES_SAT
)

class TestSatRegimenes(unittest.TestCase):

    def test_catalogo_completo(self):
        """Verifica que todos los regímenes requeridos estén presentes en el catálogo."""
        self.assertIn("601", CATALOGO_REGIMENES_SAT)
        self.assertIn("612", CATALOGO_REGIMENES_SAT)
        self.assertIn("626", CATALOGO_REGIMENES_SAT)
        self.assertIn("606", CATALOGO_REGIMENES_SAT)
        self.assertIn("resico_pm", CATALOGO_REGIMENES_SAT)

    def test_normalizacion_codigos(self):
        """Verifica la normalización correcta de aliases y claves SAT."""
        self.assertEqual(normalizar_regimen_code("601"), "601")
        self.assertEqual(normalizar_regimen_code("general_pm"), "601")
        self.assertEqual(normalizar_regimen_code("pm_general"), "601")
        self.assertEqual(normalizar_regimen_code("persona_moral"), "601")
        self.assertEqual(normalizar_regimen_code("612"), "612")
        self.assertEqual(normalizar_regimen_code("actividad_empresarial"), "612")
        self.assertEqual(normalizar_regimen_code("626"), "626")
        self.assertEqual(normalizar_regimen_code("resico"), "626")
        self.assertEqual(normalizar_regimen_code("arrendamiento"), "606")

    def test_regimen_601_pm_general(self):
        """
        Verifica el cálculo oficial de Personas Morales Régimen General (Art. 14 LISR):
        Ingresos Nominales: $100,000.00
        Gastos: $60,000.00 (No disminuyen pago provisional)
        Coeficiente de Utilidad (CU): 0.2000 (20%)
        Utilidad Fiscal Estimada = $100,000.00 * 0.20 = $20,000.00
        ISR Causado (30%) = $20,000.00 * 0.30 = $6,000.00
        Retención ISR = $1,000.00
        ISR Neto a pagar = $5,000.00
        """
        res = calcular_impuestos_regimen(
            regimen_code="601",
            ingresos=100000.00,
            gastos_deducibles=60000.00,
            retencion_isr=1000.00,
            coeficiente_utilidad=0.2000
        )
        self.assertEqual(res["regimen_code"], "601")
        self.assertEqual(res["base_isr"], 20000.00)
        self.assertEqual(res["gastos_aplicados_isr"], 0.0) # Gastos no deducen provisional
        self.assertEqual(res["isr_determinado"], 6000.00)
        self.assertEqual(res["isr_neto"], 5000.00)
        self.assertEqual(res["isr_a_favor"], 0.0)

    def test_regimen_612_tarifa_progresiva(self):
        """
        Verifica el cálculo de Actividades Empresariales (Arts. 96 y 106 LISR):
        Ingresos: $50,000.00
        Gastos: $20,000.00
        Utilidad Fiscal = $30,000.00
        Tramo de tabla mensual ($15,487.72 a $31,236.49):
        Cuota fija: $1,640.18
        Excedente s/ $15,487.72 = $14,512.28 * 21.36% = $3,099.82
        ISR Determinado = $1,640.18 + $3,099.82 = $4,740.00
        Retención ISR = $500.00
        ISR Neto = $4,240.00
        """
        res = calcular_impuestos_regimen(
            regimen_code="612",
            ingresos=50000.00,
            gastos_deducibles=20000.00,
            retencion_isr=500.00
        )
        self.assertEqual(res["regimen_code"], "612")
        self.assertEqual(res["base_isr"], 30000.00)
        self.assertGreater(res["isr_determinado"], 0.0)
        self.assertAlmostEqual(res["isr_determinado"], 4740.00, delta=1.0)
        self.assertAlmostEqual(res["isr_neto"], 4240.00, delta=1.0)

    def test_regimen_626_resico_pf(self):
        """
        Verifica el cálculo de RESICO PF (Art. 113-E LISR):
        Ingresos cobrados: $40,000.00 (Tramo $25,000 a $50,000 -> Tasa 1.10%)
        Gastos: $15,000.00 (No restan ISR)
        ISR Causado = $40,000.00 * 1.10% = $440.00
        Retención 1.25% de PM (Art. 113-J) = $500.00
        ISR Neto a Pagar = $0.00
        ISR a Favor = $60.00
        """
        res = calcular_impuestos_regimen(
            regimen_code="626",
            ingresos=40000.00,
            gastos_deducibles=15000.00,
            retencion_isr=500.00
        )
        self.assertEqual(res["regimen_code"], "626")
        self.assertEqual(res["base_isr"], 40000.00)
        self.assertEqual(res["gastos_aplicados_isr"], 0.0)
        self.assertEqual(res["isr_determinado"], 440.00)
        self.assertEqual(res["isr_neto"], 0.0)
        self.assertEqual(res["isr_a_favor"], 60.00)

    def test_regimen_606_arrendamiento_ciega(self):
        """
        Verifica deducción ciega del 35% en Arrendamiento (Art. 115 LISR):
        Ingresos: $30,000.00
        Deducción Ciega (35%): $10,500.00
        Base ISR = $19,500.00
        """
        res = calcular_impuestos_regimen(
            regimen_code="606",
            ingresos=30000.00,
            gastos_deducibles=5000.00,
            opcion_arrendamiento="ciega"
        )
        self.assertEqual(res["regimen_code"], "606")
        self.assertEqual(res["deduccion_ciega_35"], 10500.00)
        self.assertEqual(res["base_isr"], 19500.00)
        self.assertGreater(res["isr_determinado"], 0.0)

if __name__ == "__main__":
    unittest.main()
