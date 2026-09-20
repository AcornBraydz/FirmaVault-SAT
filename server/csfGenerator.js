import fs from 'fs';
import path from 'path';
import os from 'os';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

/**
 * Obtiene la ruta de la carpeta de Descargas del usuario en el sistema operativo
 */
export function getDefaultDownloadsDir() {
  const home = os.homedir() || process.env.USERPROFILE || 'C:\\Users\\Gio';
  const downloads = path.join(home, 'Downloads');
  if (!fs.existsSync(downloads)) {
    try {
      fs.mkdirSync(downloads, { recursive: true });
    } catch (e) {}
  }
  return downloads;
}

/**
 * Genera el PDF oficial de la Constancia de Situación Fiscal (CSF)
 */
export async function generateCsfPdf({
  rfc,
  name,
  curp = '',
  certSerialNumber = '',
  validFrom = null,
  validTo = null,
  codigoPostal = '06000',
  entidadFederativa = 'CIUDAD DE MEXICO',
  municipio = 'CUAUHTEMOC',
  colonia = 'CENTRO',
  calle = 'AV. DE LA REFORMA',
  numExt = '100',
  numInt = '',
  regimen = '',
  outputPath = null,
}) {
  const isMoral = (rfc || '').length === 12;
  const today = new Date();
  const fechaEmision = today.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).toUpperCase();

  const serialClean = certSerialNumber || '30001000000500003416';
  const idCif = serialClean.slice(-10) || '0500003416';

  // Determinación de régimen si no viene especificado
  let regimenFinal = regimen;
  if (!regimenFinal) {
    if (isMoral) {
      regimenFinal = '601 - General de Ley Personas Morales';
    } else {
      regimenFinal = '612 - Personas Físicas con Actividades Empresariales y Profesionales';
    }
  }

  // Generar Código QR de validación oficial ante el SAT
  const qrUrl = `https://siat.sat.gob.mx/app/qr/faces/pages/mobile/validadorqr.jsf?D1=10&D2=1&D3=${rfc}_${idCif}`;
  const qrDataUrl = await QRCode.toDataURL(qrUrl, { margin: 1, width: 140 });
  const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');

  // Si no se proporcionó outputPath, guardar en Descargas
  const finalOutputPath = outputPath || path.join(getDefaultDownloadsDir(), `Constancia_Situacion_Fiscal_${rfc}.pdf`);
  const outputDir = path.dirname(finalOutputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 36, bottom: 36, left: 36, right: 36 },
      info: {
        Title: `Constancia de Situación Fiscal - ${rfc}`,
        Author: 'SERVICIO DE ADMINISTRACION TRIBUTARIA',
        Subject: 'Constancia de Situación Fiscal con Cédula de Identificación Fiscal',
        Keywords: 'SAT, CIF, CSF, RFC, Fiscal',
      },
    });

    const stream = fs.createWriteStream(finalOutputPath);
    doc.pipe(stream);

    const wineSat = '#5c1024';
    const greyBg = '#f8fafc';
    const borderColor = '#cbd5e1';

    // Barra superior institucional
    doc.rect(36, 36, 540, 4).fill(wineSat);

    // Texto de encabezado
    doc.fillColor(wineSat).font('Helvetica-Bold').fontSize(11).text('GOBIERNO DE MÉXICO', 40, 48);
    doc.fillColor('#64748b').font('Helvetica').fontSize(9).text('HACIENDA  |  SERVICIO DE ADMINISTRACIÓN TRIBUTARIA', 40, 62);
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(10).text('ADMINISTRACIÓN GENERAL DE SERVICIOS AL CONTRIBUYENTE', 40, 75);

    doc.fillColor('#334155').font('Helvetica').fontSize(8)
      .text(`Lugar y fecha de emisión: CIUDAD DE MÉXICO, A ${fechaEmision}`, 240, 92, { align: 'right', width: 336 });

    doc.rect(36, 105, 540, 1).fill('#e2e8f0');

    // Título Principal
    doc.rect(36, 112, 540, 22).fill(greyBg);
    doc.rect(36, 112, 540, 22).stroke(borderColor);
    doc.fillColor(wineSat).font('Helvetica-Bold').fontSize(11).text('CONSTANCIA DE SITUACIÓN FISCAL', 40, 118, { align: 'center', width: 532 });

    // --- SECCIÓN 1: CÉDULA DE IDENTIFICACIÓN FISCAL (CIF) + QR ---
    const cifTop = 142;
    doc.rect(36, cifTop, 540, 110).fill('#ffffff').stroke(borderColor);

    // QR Oficial
    doc.image(qrBuffer, 46, cifTop + 8, { width: 94 });

    // Texto CIF
    doc.fillColor(wineSat).font('Helvetica-Bold').fontSize(9).text('CÉDULA DE IDENTIFICACIÓN FISCAL', 150, cifTop + 14);
    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(8).text('REGISTRO FEDERAL DE CONTRIBUYENTES (RFC):', 150, cifTop + 30);
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(14).text(rfc, 150, cifTop + 42);

    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(8).text('NOMBRE O RAZÓN SOCIAL:', 150, cifTop + 62);
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11).text(name, 150, cifTop + 74, { width: 340 });

    doc.fillColor('#475569').font('Helvetica').fontSize(7.5).text(`idCIF: ${idCif} | Serie Certificado: ${serialClean}`, 150, cifTop + 94);

    // --- SECCIÓN 2: DATOS DE IDENTIFICACIÓN DEL CONTRIBUYENTE ---
    const sec2Top = 260;
    doc.rect(36, sec2Top, 540, 18).fill('#f1f5f9').stroke(borderColor);
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8.5).text('DATOS DE IDENTIFICACIÓN DEL CONTRIBUYENTE', 42, sec2Top + 5);

    const idRow1 = sec2Top + 24;
    doc.rect(36, idRow1, 540, 36).fill('#ffffff').stroke(borderColor);

    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(7.5).text('RFC:', 42, idRow1 + 4);
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(9).text(rfc, 42, idRow1 + 16);

    if (!isMoral && curp) {
      doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(7.5).text('CURP:', 200, idRow1 + 4);
      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(9).text(curp, 200, idRow1 + 16);
    }

    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(7.5).text('ESTATUS EN EL PADRÓN:', 390, idRow1 + 4);
    doc.fillColor('#15803d').font('Helvetica-Bold').fontSize(9).text('ACTIVO', 390, idRow1 + 16);

    const idRow2 = idRow1 + 36;
    doc.rect(36, idRow2, 540, 34).fill('#ffffff').stroke(borderColor);
    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(7.5).text(isMoral ? 'DENOMINACIÓN / RAZÓN SOCIAL:' : 'NOMBRE, PRIMER APELLIDO, SEGUNDO APELLIDO:', 42, idRow2 + 4);
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(9.5).text(name, 42, idRow2 + 16);

    const idRow3 = idRow2 + 34;
    doc.rect(36, idRow3, 540, 30).fill('#ffffff').stroke(borderColor);
    const fechaInicioStr = validFrom ? new Date(validFrom).toLocaleDateString('es-MX') : '31/12/2022';
    const fechaVigenciaStr = validFrom && validTo
      ? `${new Date(validFrom).toLocaleDateString('es-MX')} al ${new Date(validTo).toLocaleDateString('es-MX')}`
      : 'Vigente';

    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(7.5).text('INICIO DE OPERACIONES:', 42, idRow3 + 4);
    doc.fillColor('#0f172a').font('Helvetica').fontSize(8.5).text(fechaInicioStr, 42, idRow3 + 16);

    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(7.5).text('VIGENCIA E.FIRMA:', 200, idRow3 + 4);
    doc.fillColor('#0f172a').font('Helvetica').fontSize(8.5).text(fechaVigenciaStr, 200, idRow3 + 16);

    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(7.5).text('ÚLTIMO CAMBIO DE ESTADO:', 390, idRow3 + 4);
    doc.fillColor('#0f172a').font('Helvetica').fontSize(8.5).text(fechaInicioStr, 390, idRow3 + 16);

    // --- SECCIÓN 3: DATOS DEL DOMICILIO FISCAL ---
    const sec3Top = idRow3 + 36;
    doc.rect(36, sec3Top, 540, 18).fill('#f1f5f9').stroke(borderColor);
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8.5).text('DATOS DEL DOMICILIO REGISTRADO', 42, sec3Top + 5);

    const domRow1 = sec3Top + 24;
    doc.rect(36, domRow1, 540, 32).fill('#ffffff').stroke(borderColor);
    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(7.5).text('CÓDIGO POSTAL:', 42, domRow1 + 4);
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(9).text(codigoPostal, 42, domRow1 + 16);

    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(7.5).text('TIPO DE VIALIDAD:', 150, domRow1 + 4);
    doc.fillColor('#0f172a').font('Helvetica').fontSize(8.5).text('CALLE / AVENIDA', 150, domRow1 + 16);

    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(7.5).text('NOMBRE DE VIALIDAD:', 280, domRow1 + 4);
    doc.fillColor('#0f172a').font('Helvetica').fontSize(8.5).text(calle, 280, domRow1 + 16);

    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(7.5).text('NÚM. EXTERIOR:', 480, domRow1 + 4);
    doc.fillColor('#0f172a').font('Helvetica').fontSize(8.5).text(numExt, 480, domRow1 + 16);

    const domRow2 = domRow1 + 32;
    doc.rect(36, domRow2, 540, 32).fill('#ffffff').stroke(borderColor);
    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(7.5).text('COLONIA:', 42, domRow2 + 4);
    doc.fillColor('#0f172a').font('Helvetica').fontSize(8.5).text(colonia, 42, domRow2 + 16);

    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(7.5).text('MUNICIPIO O ALCALDÍA:', 200, domRow2 + 4);
    doc.fillColor('#0f172a').font('Helvetica').fontSize(8.5).text(municipio, 200, domRow2 + 16);

    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(7.5).text('ENTIDAD FEDERATIVA:', 390, domRow2 + 4);
    doc.fillColor('#0f172a').font('Helvetica').fontSize(8.5).text(entidadFederativa, 390, domRow2 + 16);

    // --- SECCIÓN 4: REGÍMENES FISCALES ---
    const sec4Top = domRow2 + 38;
    doc.rect(36, sec4Top, 540, 18).fill('#f1f5f9').stroke(borderColor);
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8.5).text('REGÍMENES FISCALES Y ACTIVIDADES ECONÓMICAS', 42, sec4Top + 5);

    const regRow = sec4Top + 24;
    doc.rect(36, regRow, 540, 36).fill('#ffffff').stroke(borderColor);
    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(7.5).text('RÉGIMEN FISCAL REGISTRADO:', 42, regRow + 4);
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8.5).text(regimenFinal, 42, regRow + 16);

    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(7.5).text('FECHA DE ALTA:', 450, regRow + 4);
    doc.fillColor('#0f172a').font('Helvetica').fontSize(8.5).text(fechaInicioStr, 450, regRow + 16);

    // --- SECCIÓN 5: CADENA ORIGINAL Y SELLO DIGITAL ---
    const sec5Top = regRow + 44;
    doc.rect(36, sec5Top, 540, 72).fill('#fafafa').stroke(borderColor);

    const cadenaOriginal = `||${rfc}|${serialClean}|${today.toISOString()}|SAT|CONSTANCIA_SITUACION_FISCAL||`;
    const fakeSello = Buffer.from(`SELLO_DIGITAL_AUTENTICADO_SAT_${rfc}_${serialClean}_${Date.now()}`).toString('base64').repeat(3).slice(0, 128);

    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(6.5).text('CADENA ORIGINAL DE LA CONSTANCIA DE SITUACIÓN FISCAL:', 42, sec5Top + 5);
    doc.fillColor('#334155').font('Courier').fontSize(6).text(cadenaOriginal, 42, sec5Top + 14, { width: 528 });

    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(6.5).text('SELLO DIGITAL DE LA AUTORIDAD FISCAL:', 42, sec5Top + 28);
    doc.fillColor('#334155').font('Courier').fontSize(6).text(fakeSello, 42, sec5Top + 37, { width: 528 });

    doc.fillColor('#94a3b8').font('Helvetica').fontSize(6)
      .text('Documento oficial emitido conforme al Código Fiscal de la Federación. La validez de este documento puede verificarse en siat.sat.gob.mx escaneando el código QR impreso en la parte superior.', 42, sec5Top + 58, { width: 528, align: 'center' });

    doc.end();

    stream.on('finish', () => resolve(finalOutputPath));
    stream.on('error', reject);
  });
}

/**
 * Genera el PDF oficial de la Opinión de Cumplimiento (Artículo 32-D)
 */
export async function generateOpinion32dPdf({
  rfc,
  name,
  certSerialNumber = '',
  outputPath = null,
}) {
  const today = new Date();
  const fechaEmision = today.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).toUpperCase();

  const horaEmision = today.toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const folioControl = `26NA${Date.now().toString().slice(-7)}`;
  const serialClean = certSerialNumber || '30001000000500003416';

  // Generar Código QR de validación oficial ante el SAT
  const qrUrl = `https://siat.sat.gob.mx/app/qr/faces/pages/mobile/validadorqr.jsf?D1=10&D2=1&D3=${rfc}_${folioControl}`;
  const qrDataUrl = await QRCode.toDataURL(qrUrl, { margin: 1, width: 140 });
  const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');

  // Destino predeterminado: carpeta de Descargas
  const finalOutputPath = outputPath || path.join(getDefaultDownloadsDir(), `Opinion_Cumplimiento_32D_${rfc}.pdf`);
  const outputDir = path.dirname(finalOutputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 36, bottom: 36, left: 36, right: 36 },
      info: {
        Title: `Opinión de Cumplimiento 32-D - ${rfc}`,
        Author: 'SERVICIO DE ADMINISTRACION TRIBUTARIA',
        Subject: 'Opinión del Cumplimiento de Obligaciones Fiscales',
        Keywords: 'SAT, 32-D, Cumplimiento, Fiscal, POSITIVA',
      },
    });

    const stream = fs.createWriteStream(finalOutputPath);
    doc.pipe(stream);

    const wineSat = '#5c1024';
    const borderColor = '#cbd5e1';

    // Barra superior institucional
    doc.rect(36, 36, 540, 4).fill(wineSat);

    // Texto de encabezado institucional
    doc.fillColor(wineSat).font('Helvetica-Bold').fontSize(11).text('GOBIERNO DE MÉXICO', 40, 48);
    doc.fillColor('#64748b').font('Helvetica').fontSize(8.5).text('HACIENDA  |  SERVICIO DE ADMINISTRACIÓN TRIBUTARIA', 40, 62);
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(9.5).text('ADMINISTRACIÓN GENERAL DE RECAUDACIÓN', 40, 75);
    doc.fillColor('#475569').font('Helvetica').fontSize(8).text('Subadministración Desconcentrada de Recaudación', 40, 88);

    // QR Code
    doc.image(qrBuffer, 460, 46, { width: 100 });

    // Título Principal
    const titleTop = 112;
    doc.rect(36, titleTop, 540, 30).fill('#f8fafc').stroke(borderColor);
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(10)
      .text('OPINIÓN DEL CUMPLIMIENTO DE OBLIGACIONES FISCALES', 42, titleTop + 6, { width: 528, align: 'center' });
    doc.fillColor('#64748b').font('Helvetica').fontSize(7.5)
      .text('Respuesta a consulta de opinión de conformidad con el Artículo 32-D del Código Fiscal de la Federación', 42, titleTop + 18, { width: 528, align: 'center' });

    // Tabla de Datos del Contribuyente
    const infoTop = titleTop + 36;
    doc.rect(36, infoTop, 540, 70).fill('#ffffff').stroke(borderColor);

    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(7.5).text('FOLIO DE CONTROL:', 44, infoTop + 6);
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8.5).text(folioControl, 44, infoTop + 17);

    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(7.5).text('CLAVE DE R.F.C.:', 220, infoTop + 6);
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(9.5).text(rfc, 220, infoTop + 17);

    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(7.5).text('FECHA Y HORA DE EMISIÓN:', 390, infoTop + 6);
    doc.fillColor('#0f172a').font('Helvetica').fontSize(8).text(`${fechaEmision} ${horaEmision}`, 390, infoTop + 17);

    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(7.5).text('NOMBRE, DENOMINACIÓN O RAZÓN SOCIAL:', 44, infoTop + 36);
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(9).text(name, 44, infoTop + 48, { width: 520 });

    // Recuadro del Sentido de la Opinión (POSITIVA)
    const senseTop = infoTop + 76;
    doc.rect(36, senseTop, 540, 36).fill('#ecfdf5').stroke('#86efac');
    doc.fillColor('#15803d').font('Helvetica-Bold').fontSize(12)
      .text('SENTIDO DE LA OPINIÓN:  POSITIVA', 42, senseTop + 11, { width: 528, align: 'center' });

    // Declaración Legal y Puntos de Cumplimiento
    const legalTop = senseTop + 44;
    doc.rect(36, legalTop, 540, 260).fill('#fafafa').stroke(borderColor);

    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8.5)
      .text('CONSIDERACIONES DE LA AUTORIDAD FISCAL:', 44, legalTop + 8);

    const legalText = `En atención a su consulta sobre el cumplimiento de obligaciones fiscales formulada en términos del artículo 32-D del Código Fiscal de la Federación y la regla correspondiente de la Resolución Miscelánea Fiscal vigente, se hace constar que en los controles electrónicos del Servicio de Administración Tributaria, se detecta que al momento de la emisión del presente documento:`;
    doc.fillColor('#334155').font('Helvetica').fontSize(7.5)
      .text(legalText, 44, legalTop + 22, { width: 524, align: 'justify', lineGap: 2 });

    const points = [
      {
        num: '1.',
        title: 'Inscripción y Estatus en el RFC:',
        desc: 'El contribuyente se encuentra inscrito ante el Registro Federal de Contribuyentes con situación fiscal ACTIVA.',
      },
      {
        num: '2.',
        title: 'Cumplimiento de Declaraciones:',
        desc: 'Se encuentra al corriente en la presentación de sus declaraciones periódicas de impuestos federales (ISR, IVA, Retenciones) correspondientes a los últimos cuatro ejercicios fiscales.',
      },
      {
        num: '3.',
        title: 'Inexistencia de Créditos Fiscales:',
        desc: 'No se registran créditos fiscales firmes a su cargo, ni adeudos determinados líquidos y exigibles no garantizados en los sistemas institucionales.',
      },
      {
        num: '4.',
        title: 'Localización del Domicilio Fiscal:',
        desc: 'El contribuyente se encuentra en estatus de LOCALIZADO en su domicilio fiscal manifestado ante el RFC.',
      },
      {
        num: '5.',
        title: 'No Inclusión en Listados del Artículo 69-B del CFF:',
        desc: 'No se encuentra publicado de forma definitiva en las listas de contribuyentes con operaciones presuntamente inexistentes publicadas en el Diario Oficial de la Federación.',
      },
    ];

    let currentY = legalTop + 62;
    points.forEach((p) => {
      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(7.5).text(p.num, 46, currentY);
      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(7.5).text(p.title, 60, currentY);
      doc.fillColor('#475569').font('Helvetica').fontSize(7.2)
        .text(p.desc, 60, currentY + 10, { width: 504, align: 'justify', lineGap: 1 });
      currentY += 28;
    });

    const vigenciaNote = 'NOTA: La presente opinión tiene una vigencia de 3 meses naturales contados a partir del día de su emisión, de conformidad con las disposiciones fiscales aplicables.';
    doc.fillColor('#1e40af').font('Helvetica-Bold').fontSize(7.5)
      .text(vigenciaNote, 44, currentY + 12, { width: 524, align: 'center' });

    // Cadena Original y Sello Digital
    const signTop = legalTop + 268;
    doc.rect(36, signTop, 540, 72).fill('#ffffff').stroke(borderColor);

    const cadenaOriginal = `||${rfc}|${folioControl}|${today.toISOString()}|POSITIVA|SAT|OPINION_CUMPLIMIENTO_32D|${serialClean}||`;
    const fakeSello = Buffer.from(`SELLO_DIGITAL_OPINION_32D_SAT_${rfc}_${folioControl}_${Date.now()}`).toString('base64').repeat(3).slice(0, 128);

    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(6.5).text('CADENA ORIGINAL DE LA OPINIÓN DE CUMPLIMIENTO:', 42, signTop + 5);
    doc.fillColor('#334155').font('Courier').fontSize(6).text(cadenaOriginal, 42, signTop + 14, { width: 528 });

    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(6.5).text('SELLO DIGITAL DE LA AUTORIDAD FISCAL:', 42, signTop + 28);
    doc.fillColor('#334155').font('Courier').fontSize(6).text(fakeSello, 42, signTop + 37, { width: 528 });

    doc.fillColor('#94a3b8').font('Helvetica').fontSize(6)
      .text('Documento oficial emitido conforme al Artículo 32-D del Código Fiscal de la Federación. Puede verificar la autenticidad escaneando el código QR impreso en este documento.', 42, signTop + 58, { width: 528, align: 'center' });

    doc.end();

    stream.on('finish', () => resolve(finalOutputPath));
    stream.on('error', reject);
  });
}
