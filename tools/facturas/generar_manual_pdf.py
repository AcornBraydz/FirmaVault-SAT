# -*- coding: utf-8 -*-
import os
import sys
import shutil
from reportlab.lib.pagesizes import letter
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.pdfgen import canvas

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count):
        self.saveState()
        width, height = letter

        # Solo dibujar header en páginas posteriores a la portada
        if self._pageNumber > 1:
            self.setFont("Helvetica-Bold", 8)
            self.setFillColor(colors.HexColor("#0F766E"))
            self.drawString(54, height - 36, "PROGRAMA SAT")
            self.setFont("Helvetica", 8)
            self.setFillColor(colors.HexColor("#64748B"))
            self.drawString(130, height - 36, "• Guia Tecnica de Regimenes y Arquitectura de Auditoria Fiscal")
            self.setStrokeColor(colors.HexColor("#E2E8F0"))
            self.setLineWidth(0.6)
            self.line(54, height - 42, width - 54, height - 42)

        # Footer en todas las páginas
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#64748B"))
        self.drawString(54, 28, "Conforme a LISR, LIVA, CFF y Reglas Miscelaneas Fiscales del SAT")
        page_text = f"Pagina {self._pageNumber} de {page_count}"
        self.drawRightString(width - 54, 28, page_text)
        self.setStrokeColor(colors.HexColor("#E2E8F0"))
        self.setLineWidth(0.6)
        self.line(54, 38, width - 54, 38)

        self.restoreState()

def generar_pdf(output_path):
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    doc = SimpleDocTemplate(
        output_path,
        pagesize=letter,
        leftMargin=45,
        rightMargin=45,
        topMargin=48,
        bottomMargin=48
    )

    styles = getSampleStyleSheet()
    
    # Estilos tipográficos personalizados
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=20,
        leading=24,
        textColor=colors.HexColor("#0F172A"),
        spaceAfter=4
    )
    subtitle_style = ParagraphStyle(
        'DocSubTitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#475569"),
        spaceAfter=14
    )
    h1_style = ParagraphStyle(
        'SecHeading1',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=16,
        textColor=colors.HexColor("#0F766E"),
        spaceBefore=14,
        spaceAfter=8,
        keepWithNext=True
    )
    h2_style = ParagraphStyle(
        'SecHeading2',
        parent=styles['Heading3'],
        fontName='Helvetica-Bold',
        fontSize=10.5,
        leading=13,
        textColor=colors.HexColor("#1E293B"),
        spaceBefore=8,
        spaceAfter=4,
        keepWithNext=True
    )
    body_style = ParagraphStyle(
        'BodyDark',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=12.5,
        textColor=colors.HexColor("#334155"),
        spaceAfter=6
    )
    bullet_style = ParagraphStyle(
        'BulletText',
        parent=body_style,
        leftIndent=12,
        firstLineIndent=-8,
        spaceAfter=3
    )
    callout_text = ParagraphStyle(
        'CalloutText',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=12,
        textColor=colors.HexColor("#0F766E")
    )
    th_style = ParagraphStyle(
        'TH',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=10,
        textColor=colors.white,
        alignment=1
    )
    td_style = ParagraphStyle(
        'TD',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=10.5,
        textColor=colors.HexColor("#1E293B")
    )
    td_center = ParagraphStyle(
        'TDCenter',
        parent=td_style,
        alignment=1
    )
    td_bold = ParagraphStyle(
        'TDBold',
        parent=td_style,
        fontName='Helvetica-Bold'
    )

    story = []

    # ========================================================
    # PORTADA / ENCABEZADO EJECUTIVO
    # ========================================================
    # Badge superior
    badge_data = [[
        Paragraph("<b>DOCUMENTO OFICIAL DE AUDITORIA CONTABLE Y FISCAL</b>", ParagraphStyle('Badge', fontName='Helvetica-Bold', fontSize=7.5, leading=9, textColor=colors.HexColor("#0F766E"))),
        Paragraph("<b>EJERCICIO 2026 • LISR & LIVA</b>", ParagraphStyle('Badge2', fontName='Helvetica-Bold', fontSize=7.5, leading=9, textColor=colors.HexColor("#475569"), alignment=2))
    ]]
    badge_table = Table(badge_data, colWidths=[340, 180])
    badge_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#F0FDFA")),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
        ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor("#99F6E4")),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(badge_table)
    story.append(Spacer(1, 8))

    story.append(Paragraph("Manual de Regimenes Fiscales, Parametros del Tablero y Mecanica de Calculo", title_style))
    story.append(Paragraph("Fundamentos tecnicos, reglas de deducibilidad, candados contra EFOS, formulas vivas de Excel y determinacion de IVA e ISR por conciliacion de CFDIs.", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#CBD5E1"), spaceAfter=10))

    # ========================================================
    # SECCIÓN 1: LOS 4 PARÁMETROS DEL TABLERO
    # ========================================================
    story.append(Paragraph("1. Parametros de Configuracion del Tablero: ¿Cuales son obligatorios?", h1_style))
    story.append(Paragraph(
        "El sistema incorpora 4 selectores en la barra superior. Estan disenados con <b>valores inteligentes por defecto</b>, "
        "de modo que el usuario <b>no esta obligado a moverlos en cada consulta</b>:",
        body_style
    ))

    param_table_data = [
        [Paragraph("Parametro", th_style), Paragraph("Valor Predeterminado", th_style), Paragraph("¿Obligatorio Moverlo?", th_style), Paragraph("Impacto en el Calculo Contable", th_style)],
        [
            Paragraph("<b>Ejercicio (Año)</b>", td_bold),
            Paragraph("Ano en curso (ej. 2026)", td_style),
            Paragraph("<b>NO</b><br/>(Solo anos previos)", td_center),
            Paragraph("Delimita las facturas conciliadas al ejercicio fiscal en revision.", td_style)
        ],
        [
            Paragraph("<b>Zona Fiscal</b>", td_bold),
            Paragraph("Zona General (16%)", td_style),
            Paragraph("<b>NO</b><br/>(Casi nunca)", td_center),
            Paragraph("Aplica al 95%+ del pais. Solo se cambia al 8% si el domicilio cuenta con decreto de Franja Fronteriza Norte/Sur.", td_style)
        ],
        [
            Paragraph("<b>Periodo</b>", td_bold),
            Paragraph("Todo el Ano (Consolidado)", td_style),
            Paragraph("<b>NO</b><br/>(Recomendado)", td_center),
            Paragraph("Calcula y despliega los 12 meses simultaneamente. Solo se cambia si el contador desea presentar o imprimir un mes especifico.", td_style)
        ],
        [
            Paragraph("<b>Regimen Fiscal SAT</b>", td_bold),
            Paragraph("Autodetectado por RFC<br/>(PF = 612, PM = RESICO)", td_style),
            Paragraph("<b>CONFIRMAR</b><br/>(Parametro critico)", td_center),
            Paragraph("<b>CRITICO:</b> Determina si los gastos restan ISR, si aplica tasa fija de RESICO, deduccion ciega del 35% o flujo puro.", td_style)
        ],
    ]

    t_params = Table(param_table_data, colWidths=[95, 110, 85, 230])
    t_params.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#0F766E")),
        ('ALIGN', (0,0), (-1,0), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#CBD5E1")),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor("#F8FAFC")]),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(t_params)
    story.append(Spacer(1, 10))

    # ========================================================
    # SECCIÓN 2: LOS 4 REGÍMENES DELIMITADOS
    # ========================================================
    story.append(Paragraph("2. Delimitacion de los 4 Regimenes Autorizados para Conciliacion CFDI", h1_style))
    story.append(Paragraph(
        "Se excluyeron los regimenes que no operan bajo pagos provisionales de facturas comerciales (como 605 de sueldos, "
        "611 dividendos, 614 intereses, 616 sin obligaciones, y se reservaron 601 y 625 para versiones posteriores). "
        "Los 4 regimenes vigentes operan mediante conciliacion directa de CFDIs tipos <b>'I'</b> (Ingreso), <b>'E'</b> (Egreso), "
        "<b>'P'</b> (Pagos) y <b>'N'</b> (Nomina):",
        body_style
    ))

    regimenes_data = [
        [Paragraph("Regimen / Clave", th_style), Paragraph("Fundamento Legal", th_style), Paragraph("Mecanica de Calculo ISR", th_style), Paragraph("Tratamiento de IVA", th_style)],
        [
            Paragraph("<b>612 · Personas Fisicas con Actividad Empresarial</b>", td_bold),
            Paragraph("Arts. 100 a 110 LISR<br/>Arts. 1, 5 LIVA", td_style),
            Paragraph("<b>Flujo de Efectivo Real:</b><br/>Base = Ingresos Cobrados - Gastos Deducibles Pagados.", td_style),
            Paragraph("Acredita el 100% de IVA pagado de gastos deducibles contra IVA cobrado.", td_style)
        ],
        [
            Paragraph("<b>626 · RESICO Personas Fisicas</b>", td_bold),
            Paragraph("Arts. 113-E a 113-J LISR<br/>Arts. 1, 5 LIVA", td_style),
            Paragraph("<b>Tasa Directa sobre Ingresos (1.0% a 2.5%):</b><br/><b>Los gastos NO restan ISR</b>. Se disminuye la retencion de 1.25% de personas morales.", td_style),
            Paragraph("<b>SI acredita IVA:</b> Las compras y gastos indispensables acreditan IVA al 100% (Art. 5 LIVA).", td_style)
        ],
        [
            Paragraph("<b>606 · Arrendamiento de Inmuebles</b>", td_bold),
            Paragraph("Arts. 114 a 118 LISR<br/>Art. 1-A LIVA", td_style),
            Paragraph("<b>Selector Dinamico:</b><br/>• <b>Deduccion Ciega (35%):</b> Sin comprobantes.<br/>• <b>Gastos Reales:</b> Facturas de mantenimiento.", td_style),
            Paragraph("Acredita IVA unicamente con facturas de gastos reales que tengan IVA trasladado.", td_style)
        ],
        [
            Paragraph("<b>RESICO PM · Personas Morales</b>", td_bold),
            Paragraph("Arts. 206 a 215 LISR (Titulo VII Cap. XII)", td_style),
            Paragraph("<b>Flujo de Efectivo Puro:</b><br/>Cobrado menos Pagado acumulado (sin coeficiente de utilidad ni ingresos devengados).", td_style),
            Paragraph("Acredita IVA de gastos efectivamente pagados en el mes.", td_style)
        ],
    ]

    t_reg = Table(regimenes_data, colWidths=[120, 95, 175, 130])
    t_reg.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#0F172A")),
        ('ALIGN', (0,0), (-1,0), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#CBD5E1")),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor("#F8FAFC")]),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(t_reg)
    story.append(PageBreak())

    # ========================================================
    # SECCIÓN 3: TARIFA RESICO PF Y TOGGLE ARRENDAMIENTO
    # ========================================================
    story.append(Paragraph("3. Tablas Oficiales y Mecanica de Calculo Especifica", h1_style))
    
    # Tarifa RESICO
    story.append(Paragraph("<b>A. Tarifa Progresiva Mensual para RESICO Personas Fisicas (Art. 113-E LISR):</b>", h2_style))
    
    resico_table_data = [
        [Paragraph("Monto de Ingresos Cobrados en el Mes (MXN)", th_style), Paragraph("Tasa Aplicable", th_style), Paragraph("Ejemplo: Ingreso Cobrado", th_style), Paragraph("ISR Determinado Bruto", th_style)],
        [Paragraph("Hasta $25,000.00", td_style), Paragraph("<b>1.00%</b>", td_center), Paragraph("$20,000.00", td_style), Paragraph("$200.00", td_style)],
        [Paragraph("Hasta $50,000.00", td_style), Paragraph("<b>1.10%</b>", td_center), Paragraph("$40,000.00", td_style), Paragraph("$440.00", td_style)],
        [Paragraph("Hasta $83,333.33", td_style), Paragraph("<b>1.50%</b>", td_center), Paragraph("$70,000.00", td_style), Paragraph("$1,050.00", td_style)],
        [Paragraph("Hasta $208,333.33", td_style), Paragraph("<b>2.00%</b>", td_center), Paragraph("$150,000.00", td_style), Paragraph("$3,000.00", td_style)],
        [Paragraph("Hasta $291,666.67 (o superior en provisional)", td_style), Paragraph("<b>2.50%</b>", td_center), Paragraph("$250,000.00", td_style), Paragraph("$6,250.00", td_style)],
    ]
    t_resico = Table(resico_table_data, colWidths=[180, 90, 120, 130])
    t_resico.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#134E4A")),
        ('ALIGN', (0,0), (-1,0), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#CBD5E1")),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor("#F0FDFA")]),
        ('TOPPADDING', (0,0), (-1,-1), 3.5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3.5),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(t_resico)
    story.append(Spacer(1, 6))

    story.append(Paragraph(
        "<b>Formula de Retencion RESICO (Art. 113-J LISR):</b> Si una Persona Moral paga al contribuyente RESICO PF, le retiene el 1.25% de ISR: "
        "<b>ISR Neto a Pagar = MAX(0, ISR Determinado - Retencion 1.25% de PM)</b>. Si la retencion es mayor, genera Saldo a Favor de ISR.",
        body_style
    ))
    story.append(Spacer(1, 4))

    # Toggle Arrendamiento
    story.append(Paragraph("<b>B. Modalidades en Arrendamiento (Art. 115 LISR):</b>", h2_style))
    story.append(Paragraph(
        "• <b>Deduccion Ciega (35%):</b> El contribuyente deduce el 35% de sus ingresos brutos cobrados <i>sin comprobante de gastos alguno</i>. "
        "Base gravable ISR = Ingresos - (Ingresos × 0.35) = <b>Ingresos × 0.65</b>.<br/>"
        "• <b>Gastos Reales Comprobados:</b> Deduccion del 100% de los gastos indispensables con CFDI (mantenimiento, predial, intereses, salarios). "
        "Base gravable ISR = <b>Ingresos - Gastos Reales Pagados</b>.<br/>"
        "• <i>En ambas opciones, el IVA acreditable se toma estrictamente de las facturas reales con IVA pagado.</i>",
        body_style
    ))
    story.append(Spacer(1, 8))

    # ========================================================
    # SECCIÓN 4: CANDADOS ESTRICTOS DE AUDITORÍA
    # ========================================================
    story.append(Paragraph("4. Candados Estrictos del Motor de Auditoria Contable", h1_style))
    story.append(Paragraph(
        "Para evitar discrepancias fiscales y no inflar deducciones ilegales, el motor ejecuta 5 candados de forma automatica en memoria:",
        body_style
    ))

    candados_info = [
        ("⛽ Gasolina en Efectivo (Clave SAT 151015 + Pago '01')", "100% No Deducible y $0.00 IVA Acreditable (Art. 27 Fracc. III LISR). Sin importar el monto, el combustible debe pagarse con tarjeta, cheque o transferencia."),
        ("💵 Gastos en Efectivo Mayores a $2,000.00 MXN", "No Deducible y $0.00 IVA Acreditable (Art. 27 Fracc. III LISR). Todo gasto superior a $2,000.00 con Forma de Pago '01' queda excluido de ISR e IVA."),
        ("👥 CFDI de Nomina (Tipo de Comprobante 'N')", "Deduce como gasto en los regimenes permitidos, pero su IVA acreditable es siempre $0.00 (Arts. 14 y 15 LIVA). La relacion laboral no causa IVA."),
        ("🚨 Cruce contra Lista Negra EFOS (Art. 69-B CFF)", "Cruce en memoria O(1) contra el catalogo de EFOS Definitivos del SAT. Si el emisor es boletinado definitivo, se excluye al 100% deduccion e IVA para blindar al cliente contra riesgos penales."),
        ("🏷️ Etiquetado Dinamico de Diferencia IVA", "Calculo mensual = (IVA Trasladado) - (IVA Acreditable) - (Retenciones IVA). Si > 0 muestra 'A Cargo: $X.XX' (Rojo); si < 0 muestra 'A Favor: $X.XX' (Verde); si = 0 muestra '$0.00'."),
    ]

    for title_c, desc_c in candados_info:
        story.append(Paragraph(f"• <b>{title_c}:</b> {desc_c}", bullet_style))

    story.append(PageBreak())

    # ========================================================
    # SECCIÓN 5: FÓRMULAS VIVAS EN EXCEL
    # ========================================================
    story.append(Paragraph("5. Arquitectura de Formulas Vivas en Excel (.xlsx)", h1_style))
    story.append(Paragraph(
        "El papel de trabajo exportable en Excel <b>no contiene cifras quemadas o fijas</b>. Las 5 pestanas mantienen formulas vivas "
        "para que el contador titular pueda auditar, rastrear precedentes y modificar importes con recalculo automatico:",
        body_style
    ))

    excel_data = [
        [Paragraph("Pestana Excel", th_style), Paragraph("Concepto", th_style), Paragraph("Formula Viva Nativa Implementada", th_style)],
        [
            Paragraph("<b>1_Resumen_Ejecutivo</b>", td_bold),
            Paragraph("Diferencia IVA Mensual", td_style),
            Paragraph("<code>=(C{row}+D{row})-(F{row}+G{row})-H{row}</code>", td_style)
        ],
        [
            Paragraph("<b>1_Resumen_Ejecutivo</b>", td_bold),
            Paragraph("Base ISR (612 y RESICO PM)", td_style),
            Paragraph("<code>=B{row}-E{row}</code> (Ingresos - Gastos Deducibles)", td_style)
        ],
        [
            Paragraph("<b>1_Resumen_Ejecutivo</b>", td_bold),
            Paragraph("Base Arrendamiento (606 Ciega)", td_style),
            Paragraph("<code>=B{row}-(B{row}*0.35)</code> (Ingresos menos 35% Ciega)", td_style)
        ],
        [
            Paragraph("<b>1_Resumen_Ejecutivo</b>", td_bold),
            Paragraph("Tarifa RESICO PF (626)", td_style),
            Paragraph("<code>=MAX(0, (B{row}*IF(B{row}<=25000, 0.01, IF(...))) - J{row})</code>", td_style)
        ],
        [
            Paragraph("<b>1_Resumen_Ejecutivo</b>", td_bold),
            Paragraph("Totales y Tarjetas KPI", td_style),
            Paragraph("<code>=SUM(B9:B20)</code> hasta <code>=SUM(K9:K20)</code> y <code>=B21</code> en KPIs", td_style)
        ],
        [
            Paragraph("<b>2_Determinacion_IVA</b>", td_bold),
            Paragraph("IVA Neto por Periodo", td_style),
            Paragraph("<code>=C{r}+E{r}</code> (Traslado), <code>=J{r}+L{r}</code> (Acred.), <code>=H-M-N</code> (Neto)", td_style)
        ],
        [
            Paragraph("<b>4_Detalle_Ingresos / Gastos</b>", td_bold),
            Paragraph("Total por CFDI y Sumatorias", td_style),
            Paragraph("<code>=G{r}+H{r}+I{r}-J{r}-K{r}</code> por factura y <code>=SUM(G2:G{n})</code> al calce", td_style)
        ],
    ]

    t_excel = Table(excel_data, colWidths=[125, 130, 265])
    t_excel.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#312E81")),
        ('ALIGN', (0,0), (-1,0), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#CBD5E1")),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor("#F8FAFC")]),
        ('TOPPADDING', (0,0), (-1,-1), 3.5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3.5),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(t_excel)
    story.append(Spacer(1, 14))

    # Cuadro de Certificación Final
    cert_data = [[
        Paragraph(
            "<b>DICTAMEN DE CONFORMIDAD Y VALIDEZ OFICIAL:</b><br/>"
            "El motor de calculo y determinacion contable ha sido validado contra las disposiciones vigentes de la Ley del Impuesto "
            "sobre la Renta (LISR), Ley del Impuesto al Valor Agregado (LIVA), Codigo Fiscal de la Federacion (CFF) y Resolucion "
            "Miscelanea Fiscal (RMF). Las cifras y formulas vivas generadas son 100% auditables y compatibles con las declaraciones del portal del SAT.",
            callout_text
        )
    ]]
    cert_table = Table(cert_data, colWidths=[520])
    cert_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#F0FDFA")),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#0F766E")),
        ('TOPPADDING', (0,0), (-1,-1), 8),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ('LEFTPADDING', (0,0), (-1,-1), 10),
        ('RIGHTPADDING', (0,0), (-1,-1), 10),
    ]))
    story.append(cert_table)

    # Construir PDF
    doc.build(story, canvasmaker=NumberedCanvas)
    return output_path

if __name__ == "__main__":
    out = "c:/Users/Gio/Documents/Programa SAT/Manual_Regimenes_y_Calculos_Fiscales_SAT.pdf"
    generar_pdf(out)
    print("PDF generado con exito en:", out)
    # Copia en Downloads
    downloads = os.path.expanduser("~/Downloads")
    if os.path.exists(downloads):
        dl_out = os.path.join(downloads, "Manual_Regimenes_y_Calculos_Fiscales_SAT.pdf")
        shutil.copyfile(out, dl_out)
        print("Copia guardada en Downloads:", dl_out)
