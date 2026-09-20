# -*- coding: utf-8 -*-
"""
Pruebas Unitarias Automatizadas para el Generador de Pólizas Contables (Anexo 24 RMF).
Verifica la partida doble estricta (Debe == Haber) y el tratamiento de descuentos y retenciones.
"""

import unittest
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from generador_polizas import balance_asientos, CUENTAS_SAT

class TestGeneradorPolizas(unittest.TestCase):

    def test_cuentas_sat_anexo_24(self):
        """Verifica que el catálogo de cuentas cumpla con las claves del Anexo 24 del SAT"""
        self.assertEqual(CUENTAS_SAT['bancos'], '102.01.001')
        self.assertEqual(CUENTAS_SAT['clientes'], '105.01.001')
        self.assertEqual(CUENTAS_SAT['retencion_isr_acreditable'], '113.01.001')
        self.assertEqual(CUENTAS_SAT['retencion_iva_acreditable'], '113.02.001')
        self.assertEqual(CUENTAS_SAT['iva_acreditable_pagado'], '118.01.001')
        self.assertEqual(CUENTAS_SAT['iva_por_acreditar'], '118.02.001')
        self.assertEqual(CUENTAS_SAT['proveedores'], '201.01.001')
        self.assertEqual(CUENTAS_SAT['iva_trasladado_cobrado'], '208.01.001')
        self.assertEqual(CUENTAS_SAT['iva_por_trasladar'], '208.02.001')
        self.assertEqual(CUENTAS_SAT['retencion_isr'], '216.01.001')
        self.assertEqual(CUENTAS_SAT['retencion_iva'], '216.02.001')
        self.assertEqual(CUENTAS_SAT['ingresos_16'], '401.01.001')
        self.assertEqual(CUENTAS_SAT['descuento_ventas'], '401.04.001')
        self.assertEqual(CUENTAS_SAT['descuento_compras'], '501.02.001')
        self.assertEqual(CUENTAS_SAT['gastos_generales'], '601.01.001')

    def test_partida_doble_egreso_con_descuento_y_retenciones(self):
        """
        Gasto con descuento comercial y retención de ISR e IVA:
        Subtotal: $1,000.00
        Descuento: $100.00
        IVA 16% s/ $900.00: $144.00
        Retención ISR (10%): $90.00
        Retención IVA (10.67%): $96.00
        Total pagado en Banco = Subtotal - Descuento + IVA - RetISR - RetIVA
                             = 1000 - 100 + 144 - 90 - 96 = $858.00
        """
        asientos = [
            {'cuenta': CUENTAS_SAT['gastos_generales'], 'debe': 1000.00, 'haber': 0.0},
            {'cuenta': CUENTAS_SAT['iva_acreditable_pagado'], 'debe': 144.00, 'haber': 0.0},
            {'cuenta': CUENTAS_SAT['bancos'], 'debe': 0.0, 'haber': 858.00},
            {'cuenta': CUENTAS_SAT['retencion_isr'], 'debe': 0.0, 'haber': 90.00},
            {'cuenta': CUENTAS_SAT['retencion_iva'], 'debe': 0.0, 'haber': 96.00},
            {'cuenta': CUENTAS_SAT['descuento_compras'], 'debe': 0.0, 'haber': 100.00},
        ]
        asientos = balance_asientos(asientos, adjust_index=0)
        total_debe = round(sum(a['debe'] for a in asientos), 2)
        total_haber = round(sum(a['haber'] for a in asientos), 2)
        self.assertEqual(total_debe, 1144.00)
        self.assertEqual(total_haber, 1144.00)
        self.assertEqual(round(total_debe - total_haber, 2), 0.00)

    def test_balance_asientos_ajuste_centavos(self):
        """Verifica que el auto-balanceador compense centavos de redondeo XML."""
        asientos = [
            {'cuenta': CUENTAS_SAT['gastos_generales'], 'debe': 100.00, 'haber': 0.0},
            {'cuenta': CUENTAS_SAT['iva_acreditable_pagado'], 'debe': 16.00, 'haber': 0.0},
            {'cuenta': CUENTAS_SAT['bancos'], 'debe': 0.0, 'haber': 116.01} # 1 centavo de diferencia
        ]
        balanced = balance_asientos(asientos, adjust_index=0)
        total_debe = round(sum(a['debe'] for a in balanced), 2)
        total_haber = round(sum(a['haber'] for a in balanced), 2)
        self.assertEqual(total_debe, total_haber)
        self.assertEqual(round(total_debe - total_haber, 2), 0.00)

if __name__ == '__main__':
    unittest.main()
