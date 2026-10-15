import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import forge from 'node-forge';
import { ZipArchive } from 'archiver';
import { spawn, execSync } from 'child_process';
import fs from 'fs';
import readline from 'readline';
import { generateCsfPdf, generateOpinion32dPdf, getDefaultDownloadsDir } from './csfGenerator.js';
import logger from './config/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Prevenir que excepciones o promesas no capturadas detengan el servidor
process.on('uncaughtException', (err) => {
  logger.error('[FATAL SERVER ERROR] Excepción no capturada:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  logger.error('[FATAL SERVER ERROR] Rechazo de promesa no capturado:', reason);
});

// ============================================================
// Helper para resolver la ruta de Python (cross-platform)
// ============================================================
function getPythonExePath() {
  const isWin = process.platform === 'win32';
  const rootVenv = path.join(__dirname, '..', '.venv', isWin ? 'Scripts' : 'bin', isWin ? 'python.exe' : 'python');
  if (fs.existsSync(rootVenv)) return rootVenv;
  const nominasVenv = path.join(__dirname, '..', 'tools', 'nominas', '.venv', isWin ? 'Scripts' : 'bin', isWin ? 'python.exe' : 'python');
  if (fs.existsSync(nominasVenv)) return nominasVenv;

  if (isWin) {
    try {
      execSync('python --version', { stdio: 'ignore' });
      return 'python';
    } catch (_) {}
    try {
      execSync('py --version', { stdio: 'ignore' });
      return 'py';
    } catch (_) {}
  }
  return isWin ? 'python' : 'python3';
}

function findClientXmlDirectory(clientId, clientRfc, moduleType = 'all') {
  // 1. Storage específico de nóminas
  if (moduleType === 'nominas') {
    const nominasDir = path.join(__dirname, '..', 'scratch', 'xml_nominas', clientId);
    if (fs.existsSync(nominasDir) && fs.readdirSync(nominasDir).length > 0) return nominasDir;
    if (clientRfc) {
      const toolsNomDir = path.join(__dirname, '..', 'tools', 'nominas', clientRfc.toUpperCase().trim());
      if (fs.existsSync(toolsNomDir)) return toolsNomDir;
    }
  }

  // 2. Storage directo por clientId o por RFC
  const storageDir = path.join(__dirname, '..', 'scratch', 'xml_storage', clientId);
  if (fs.existsSync(storageDir) && fs.readdirSync(storageDir).some(f => f.toLowerCase().endsWith('.xml') || f.toLowerCase().endsWith('.zip'))) {
    return storageDir;
  }
  if (clientRfc) {
    const rfcStorage = path.join(__dirname, '..', 'scratch', 'xml_storage', clientRfc.toUpperCase().trim());
    if (fs.existsSync(rfcStorage) && fs.readdirSync(rfcStorage).some(f => f.toLowerCase().endsWith('.xml') || f.toLowerCase().endsWith('.zip'))) {
      return rfcStorage;
    }
  }

  // 3. Comprobantes descargados en tools/nominas/${clientRfc}
  if (clientRfc) {
    const toolsNomDir = path.join(__dirname, '..', 'tools', 'nominas', clientRfc.toUpperCase().trim());
    if (fs.existsSync(toolsNomDir)) return toolsNomDir;
  }

  // 4. Extracciones temporales en scratch/temp_facturas_runs
  const tempRunsDir = path.join(__dirname, '..', 'scratch', 'temp_facturas_runs');
  if (fs.existsSync(tempRunsDir)) {
    const matches = fs.readdirSync(tempRunsDir).filter(d => d.includes(clientId) || (clientRfc && d.includes(clientRfc.toUpperCase().trim())));
    if (matches.length > 0) {
      matches.sort((a, b) => {
        try {
          return fs.statSync(path.join(tempRunsDir, b)).mtimeMs - fs.statSync(path.join(tempRunsDir, a)).mtimeMs;
        } catch (e) { return 0; }
      });
      return path.join(tempRunsDir, matches[0]);
    }
  }

  // 5. Fallback a scratch general
  return path.join(__dirname, '..', 'scratch');
}

const app = express();
app.set('trust proxy', 1);
const prisma = new PrismaClient();

// ============================================================
// Configuración desde variables de entorno
// ============================================================
const {
  PORT = 3001,
  JWT_SECRET = 'cambiar-en-produccion',
  JWT_EXPIRES_IN = '8h',
  MASTER_PASSWORD = 'FirmaVault2024!',
  ADMIN_PASSWORD = 'AdminSAT2024!',
  ENCRYPTION_KEY = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2',
  CORS_ORIGINS = 'http://localhost:5173,http://localhost:3001',
  NODE_ENV = 'development',
} = process.env;

// ============================================================
// Validaciones de arranque
// ============================================================
const INSECURE_SECRETS = ['cambiar-en-produccion', 'secret', 'jwt-secret', ''];
if (NODE_ENV === 'production') {
  if (INSECURE_SECRETS.includes(JWT_SECRET)) {
    logger.error('❌ FATAL: JWT_SECRET tiene un valor inseguro. Configura un secreto fuerte en .env antes de ejecutar en producción.');
    process.exit(1);
  }
  if (!process.env.ENCRYPTION_KEY || ENCRYPTION_KEY === 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2') {
    logger.error('❌ FATAL: ENCRYPTION_KEY es insegura o usa el valor por defecto. Genera una llave de 64 caracteres Hex (32 bytes) para producción.');
    process.exit(1);
  }
}
if (NODE_ENV !== 'production') {
  console.warn('\n⚠️  AVISO: NODE_ENV no es "production". CORS abierto y rate limits elevados.');
}

// Hash de la master password al inicio (async, no bloquea el event loop)
let masterPasswordHash;
let adminPasswordHash;

try {
  masterPasswordHash = bcrypt.hashSync(MASTER_PASSWORD, 10);
  adminPasswordHash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
} catch (e) {
  logger.error('Error inicializando contraseñas maestras', e);
  process.exit(1);
}

// ============================================================
// Middleware de seguridad
// ============================================================

// Helmet — headers de seguridad HTTP
app.use(helmet({
  contentSecurityPolicy: NODE_ENV === 'production' ? undefined : false,
  crossOriginEmbedderPolicy: false,
}));

// CORS — restringir orígenes
const allowedOrigins = CORS_ORIGINS.split(',').map(o => o.trim());
app.use(cors({
  origin: NODE_ENV === 'production'
    ? allowedOrigins
    : true,  // En desarrollo, permitir todo
  credentials: true,
}));

// Rate limiting — protección contra ataques de fuerza bruta
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutos
  max: NODE_ENV === 'production' ? 10000 : 100000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones. Intenta de nuevo más tarde.' },
});
app.use(generalLimiter);

// Rate limiting para login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutos
  max: NODE_ENV === 'production' ? 100 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de login. Intenta de nuevo más tarde.' },
});

app.use(express.json({ limit: '10mb' }));

// Multer con límite de tamaño (2MB por archivo es suficiente para certificados .cer y .key)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024,  // 2MB
    files: 2,
  },
});

// ============================================================
// Cifrado AES-256-GCM para contraseñas de e.firma
// ============================================================
const ALGO = 'aes-256-gcm';
const KEY = Buffer.from(ENCRYPTION_KEY, 'hex');

function encryptPassword(plaintext) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  // Formato: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decryptPassword(encryptedStr) {
  const parts = encryptedStr.split(':');
  // Si no tiene el formato de cifrado, es un password en texto plano (legacy)
  if (parts.length !== 3) return encryptedStr;

  const [ivHex, authTagHex, encrypted] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ============================================================
// Middleware de autenticación JWT
// ============================================================
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }
  if (!token) {
    return res.status(401).json({ error: 'Token de autenticación requerido' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

// ============================================================
// Rutas de autenticación (sin proteger)
// ============================================================
app.post('/api/auth/login', loginLimiter, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Se requiere la contraseña' });
    }

    const isMasterValid = await bcrypt.compare(password, masterPasswordHash);
    const isAdminValid = await bcrypt.compare(password, adminPasswordHash);
    if (!isMasterValid && !isAdminValid) {
      return res.status(401).json({ error: 'Contraseña incorrecta' });
    }

    const role = isAdminValid ? 'admin' : 'user';
    const token = jwt.sign({ role, iat: Math.floor(Date.now() / 1000) }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });

    res.json({ success: true, token, expiresIn: JWT_EXPIRES_IN });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('/api/auth/verify', (req, res) => {
  const authHeader = req.headers.authorization;
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) token = authHeader.split(' ')[1];
  else if (req.query && req.query.token) token = req.query.token;
  
  if (!token) return res.json({ success: false, error: 'Token de autenticación requerido' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ success: true, user: decoded });
  } catch (err) {
    res.json({ success: false, error: 'Token inválido o expirado' });
  }
});

// ============================================================

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', environment: process.env.NODE_ENV });
});

// Helper para auditoría inmutable de accesos sensibles (Art. 19-A y 69 CFF)
async function logAuditEvent({ action, resource, resourceId = null, rfc = null, clientId = null, details = null, req = null }) {
  try {
    const ipAddress = req ? (req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip) : null;
    const userAgent = req ? req.headers['user-agent'] : null;
    await prisma.auditLog.create({
      data: {
        action,
        resource,
        resourceId: resourceId ? String(resourceId) : null,
        rfc: rfc ? String(rfc) : null,
        clientId: clientId ? String(clientId) : null,
        details: typeof details === 'object' ? JSON.stringify(details) : (details ? String(details) : null),
        ipAddress: ipAddress ? String(ipAddress) : null,
        userAgent: userAgent ? String(userAgent) : null
      }
    });
  } catch (err) {
    logger.error('Failed to log audit event:', err);
  }
}

// Todas las rutas de la API protegidas con JWT
// ============================================================
app.use('/api/clients', authMiddleware);

app.get('/api/clients', async (req, res) => {
  try {
    const clients = await prisma.client.findMany({
      include: {
        csdCertificates: {
          orderBy: { createdAt: 'desc' }
        }
      },
      orderBy: { name: 'asc' }
    });
    // Seguridad Top-Tier: NUNCA enviar contraseñas descifradas en listados masivos
    const safeClients = clients.map(c => ({
      id: c.id,
      rfc: c.rfc,
      name: c.name,
      validFrom: c.validFrom,
      validTo: c.validTo,
      photo: c.photo,
      curp: c.curp,
      email: c.email,
      certSerialNumber: c.certSerialNumber,
      issuer: c.issuer,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      hasCer: Boolean(c.cerFile),
      hasKey: Boolean(c.keyFile),
      hasPassword: Boolean(c.password),
      hasCredentials: Boolean(c.cerFile && c.keyFile && c.password),
      hasCsd: Boolean(c.csdCertificates && c.csdCertificates.length > 0),
      csdCertificates: (c.csdCertificates || []).map(csd => ({
        id: csd.id,
        branchName: csd.branchName || 'Única',
        validFrom: csd.validFrom,
        validTo: csd.validTo,
        certSerialNumber: csd.certSerialNumber,
        createdAt: csd.createdAt,
        hasCer: Boolean(csd.cerFile),
        hasKey: Boolean(csd.keyFile),
        hasPassword: Boolean(csd.password)
      }))
    }));
    res.json(safeClients);
  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
});

// Endpoint seguro bajo demanda para revelar/copiar contraseña con auditoría obligatoria
app.post('/api/clients/:id/reveal-password', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const client = await prisma.client.findUnique({ where: { id } });
    if (!client) {
      return res.status(404).json({ error: 'Contribuyente no encontrado' });
    }
    const decrypted = decryptPassword(client.password);
    await logAuditEvent({
      action: 'REVEAL_PASSWORD',
      resource: 'Client',
      resourceId: client.id,
      rfc: client.rfc,
      clientId: client.id,
      details: { role: req.user?.role || 'user' },
      req
    });
    return res.json({ success: true, password: decrypted, rfc: client.rfc });
  } catch (error) {
    logger.error('Error revelando contraseña de cliente:', error);
    return res.status(500).json({ error: 'Error al obtener contraseña' });
  }
});

// Endpoint seguro bajo demanda para contraseña CSD con auditoría obligatoria
app.post('/api/clients/:clientId/csd/:csdId/reveal-password', authMiddleware, async (req, res) => {
  try {
    const { clientId, csdId } = req.params;
    const csd = await prisma.csdCredential.findUnique({
      where: { id: csdId },
      include: { client: true }
    });
    if (!csd || csd.clientId !== clientId) {
      return res.status(404).json({ error: 'Certificado CSD no encontrado' });
    }
    const decrypted = decryptPassword(csd.password);
    await logAuditEvent({
      action: 'REVEAL_CSD_PASSWORD',
      resource: 'CsdCredential',
      resourceId: csd.id,
      rfc: csd.client?.rfc,
      clientId: clientId,
      details: { branchName: csd.branchName, role: req.user?.role || 'user' },
      req
    });
    return res.json({ success: true, password: decrypted });
  } catch (error) {
    logger.error('Error revelando contraseña CSD:', error);
    return res.status(500).json({ error: 'Error al obtener contraseña CSD' });
  }
});

// Bitácora de auditoría para trazabilidad de cumplimiento fiscal
app.get('/api/audit-logs', authMiddleware, async (req, res) => {
  try {
    const logs = await prisma.auditLog.findMany({
      take: 100,
      orderBy: { createdAt: 'desc' }
    });
    return res.json({ success: true, logs });
  } catch (error) {
    logger.error('Error consultando bitácora de auditoría:', error);
    return res.status(500).json({ error: 'Error consultando auditoría' });
  }
});


// Helper function to extract data from a .cer file using node-forge
function parseCertificate(cerBuffer) {
  try {
    const b64 = cerBuffer.toString('base64');
    const pem = '-----BEGIN CERTIFICATE-----\n' + b64.match(/.{1,64}/g).join('\n') + '\n-----END CERTIFICATE-----';
    
    const cert = forge.pki.certificateFromPem(pem);
    
    const subject = cert.subject.attributes;
    
    // En certificados del SAT:
    // OID 2.5.4.45 (x500UniqueIdentifier) contiene el RFC (12 o 13 caracteres)
    // OID 2.5.4.5 (serialNumber) contiene la CURP en Personas Físicas (18 caracteres)
    const rfcAttr = subject.find(attr => attr.type === '2.5.4.45' || attr.shortName === 'x500UniqueIdentifier');
    const curpAttr = subject.find(attr => attr.type === '2.5.4.5' || attr.name === 'serialNumber');
    
    let rfc = rfcAttr?.value;
    let curp = curpAttr?.value;

    // En certificados de Personas Morales, el SAT coloca:
    // OID 2.5.4.45 = "RFC_EMPRESA / RFC_REPRESENTANTE_LEGAL"
    // Ejemplo: "DAR141125IK5 / PALR910830BG2"
    if (rfc && rfc.includes('/')) {
      const parts = rfc.split('/').map(p => p.trim());
      // La Persona Moral tiene 12 caracteres y la física (representante) tiene 13
      const moralPart = parts.find(p => p.length === 12);
      if (moralPart) {
        rfc = moralPart;
      } else {
        rfc = parts[0];
      }
    }
    if (rfc) rfc = rfc.trim().toUpperCase();

    // Si por algún certificado antiguo no vino el OID 2.5.4.45:
    if (!rfc) {
      if (curp && (curp.length === 12 || curp.length === 13)) {
        rfc = curp;
        curp = null;
      } else {
        rfc = curp;
      }
    }

    // Validar CURP: solo para Personas Físicas (13 caracteres de RFC y 18 de CURP)
    if (rfc && rfc.length === 12) {
      curp = null;
    } else if (curp) {
      if (curp === rfc || curp.length !== 18) {
        curp = null;
      }
    }
    
    const name = subject.find(attr => attr.name === 'commonName')?.value 
               || subject.find(attr => attr.shortName === 'O')?.value;
               
    // Extraer Correo
    const email = subject.find(attr => attr.name === 'emailAddress')?.value || null;
    
    // Extraer número de serie del certificado decodificando el HEX a ASCII
    // SAT pads with '3', for example '323030...' -> '200...'
    let certSerialNumber = cert.serialNumber || '';
    if (certSerialNumber && certSerialNumber.length > 20) {
      let asciiSerial = '';
      for (let i = 0; i < certSerialNumber.length; i += 2) {
        asciiSerial += String.fromCharCode(parseInt(certSerialNumber.substr(i, 2), 16));
      }
      certSerialNumber = asciiSerial;
    }
               
    // Extraer Autoridad Emisora (Issuer)
    let issuer = cert.issuer.attributes.find(attr => attr.shortName === 'O' || attr.name === 'organizationName')?.value;
    if (!issuer) issuer = cert.issuer.attributes.find(attr => attr.shortName === 'CN' || attr.name === 'commonName')?.value;
    if (!issuer) issuer = 'SERVICIO DE ADMINISTRACION TRIBUTARIA';

    // Detección precisa de Tipo de Certificado: e.firma (FIEL) vs CSD (Sello Digital)
    const ouAttr = subject.find(attr => attr.type === '2.5.4.11' || attr.name === 'organizationalUnitName' || attr.shortName === 'OU');
    const extKeyUsage = cert.extensions?.find(e => e.name === 'extKeyUsage' || e.id === '2.5.29.37');
    const keyUsage = cert.extensions?.find(e => e.name === 'keyUsage' || e.id === '2.5.29.15');

    const hasOU = Boolean(ouAttr && ouAttr.value);
    const hasClientAuth = Boolean(extKeyUsage && extKeyUsage.clientAuth);
    const isCsd = hasOU || (!hasClientAuth && keyUsage && !keyUsage.dataEncipherment);
    const branchName = ouAttr?.value ? String(ouAttr.value).trim() : (isCsd ? 'Única' : null);

    return {
      rfc: rfc || 'UNKNOWN_RFC',
      name: name || 'Desconocido',
      validFrom: cert.validity.notBefore,
      validTo: cert.validity.notAfter,
      publicKey: cert.publicKey,
      curp: curp,
      email: email,
      certSerialNumber: certSerialNumber,
      issuer: issuer,
      isCsd,
      isFiel: !isCsd,
      branchName
    };
  } catch (error) {
    console.error('Error parsing .cer:', error);
    throw new Error('El archivo .cer no es válido o está dañado. Asegúrate de subir el certificado oficial del SAT (.cer).');
  }
}

// Helper function to validate password and decrypt .key
function validatePrivateKey(keyBuffer, password) {
  try {
    const derBuffer = forge.util.createBuffer(keyBuffer.toString('binary'));
    const asn1 = forge.asn1.fromDer(derBuffer);
    
    // SAT .key files are DER-encoded PKCS#8 EncryptedPrivateKeyInfo.
    const privateKey = forge.pki.decryptPrivateKeyInfo(asn1, password);
    if (!privateKey) {
      throw new Error('La contraseña ingresada es incorrecta o no coincide con el archivo .key seleccionado.');
    }
    return privateKey;
  } catch (error) {
    console.error('Error decrypting .key:', error.message);
    throw new Error('La contraseña de la e.firma es incorrecta o no coincide con el archivo .key seleccionado. Por favor, verifica que la contraseña esté bien escrita o que hayas seleccionado la llave correcta.');
  }
}

app.post('/api/clients', upload.fields([{ name: 'cerFile', maxCount: 1 }, { name: 'keyFile', maxCount: 1 }]), async (req, res) => {
  try {
    const { password } = req.body;
    
    if (!req.files || !req.files.cerFile || !req.files.keyFile) {
      return res.status(400).json({ error: 'Faltan los archivos .cer y/o .key' });
    }
    if (!password) {
      return res.status(400).json({ error: 'Se requiere la contraseña de la e.firma' });
    }

    const cerBuffer = req.files.cerFile[0].buffer;
    const keyBuffer = req.files.keyFile[0].buffer;

    // 1. Validar y descifrar la llave privada con la contraseña (asegura 100% que la clave sea correcta)
    const privateKey = validatePrivateKey(keyBuffer, password);
    
    // 2. Extraer y validar el certificado (.cer)
    const certData = parseCertificate(cerBuffer);

    // Validar que el archivo sea una e.firma (FIEL) y no un CSD
    if (certData.isCsd) {
      return res.status(400).json({
        error: `El archivo seleccionado es un Certificado de Sello Digital (CSD${certData.branchName ? ` - Sucursal: ${certData.branchName}` : ''}). Para registrar un contribuyente se requiere su e.firma (FIEL) para el acceso a portales del SAT. Puedes cargar tus Sellos Digitales posteriormente en la pestaña "Sello Digital (CSD)" de Ajustes.`
      });
    }

    // 3. Validar correspondencia criptográfica exacta entre .cer y .key
    if (certData.publicKey && certData.publicKey.n && privateKey.n) {
      if (certData.publicKey.n.compareTo(privateKey.n) !== 0) {
        return res.status(400).json({
          error: 'El archivo .cer y el archivo .key no corresponden a la misma e.firma (la llave pública y la llave privada no coinciden). Asegúrate de seleccionar el par correcto.'
        });
      }
    }

    // 4. Verificar si ya existe un cliente con ese RFC
    const existingClient = await prisma.client.findUnique({
      where: { rfc: certData.rfc }
    });

    if (existingClient) {
      const currentValidTo = new Date(existingClient.validTo);
      const newValidTo = new Date(certData.validTo);

      // Solo permitir actualizar si la fecha de vigencia del nuevo certificado es MÁS RECIENTE
      if (newValidTo.getTime() <= currentValidTo.getTime()) {
        const currentStr = currentValidTo.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
        const newStr = newValidTo.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
        return res.status(400).json({
          error: `No se puede actualizar: El contribuyente "${existingClient.name}" (${certData.rfc}) ya tiene un certificado vigente hasta el ${currentStr}. El archivo que intentas subir vence el ${newStr} (no es más reciente). Solo se permite actualizar con un certificado de vigencia posterior.`
        });
      }

      // Si es una renovación más reciente, actualizar las credenciales del cliente existente
      await prisma.client.update({
        where: { id: existingClient.id },
        data: {
          validFrom: certData.validFrom,
          validTo: certData.validTo,
          certSerialNumber: certData.certSerialNumber,
          issuer: certData.issuer,
          password: encryptPassword(password),
          cerFile: cerBuffer,
          keyFile: keyBuffer,
          ...(certData.email ? { email: certData.email } : {}),
        }
      });

      await logAuditEvent({
        action: 'RENEW_CREDENTIALS',
        resource: 'Client',
        resourceId: existingClient.id,
        rfc: existingClient.rfc,
        clientId: existingClient.id,
        details: { validTo: certData.validTo },
        req
      });

      return res.status(200).json({
        success: true,
        isRenewal: true,
        client: {
          id: existingClient.id,
          rfc: existingClient.rfc,
          name: existingClient.name,
          validTo: certData.validTo
        },
        message: `e.Firma de "${existingClient.name}" actualizada y renovada exitosamente.`
      });
    }

    // Si es un cliente nuevo:
    const newClient = await prisma.client.create({
      data: {
        rfc: certData.rfc,
        name: certData.name,
        validFrom: certData.validFrom,
        validTo: certData.validTo,
        curp: certData.curp,
        email: certData.email,
        certSerialNumber: certData.certSerialNumber,
        issuer: certData.issuer,
        password: encryptPassword(password),
        cerFile: cerBuffer,
        keyFile: keyBuffer,
      }
    });

    await logAuditEvent({
      action: 'CREATE_CLIENT',
      resource: 'Client',
      resourceId: newClient.id,
      rfc: newClient.rfc,
      clientId: newClient.id,
      details: { name: newClient.name, validTo: newClient.validTo },
      req
    });

    res.status(201).json({ 
      success: true, 
      client: {
        id: newClient.id,
        rfc: newClient.rfc,
        name: newClient.name,
        validTo: newClient.validTo
      },
      message: 'Cliente guardado y validado con éxito'
    });

  } catch (error) {
    console.error('Error al agregar cliente:', error);
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Ya existe un contribuyente registrado con este RFC.' });
    }
    res.status(400).json({ error: error.message || 'Error al procesar la e.firma' });
  }
});

app.get('/api/clients/backup', async (req, res) => {
  try {
    const clients = await prisma.client.findMany({
      include: { csdCertificates: true }
    });

    res.attachment(`Credenciales.zip`);
    const archive = new ZipArchive({
      zlib: { level: 9 }
    });

    archive.on('error', (err) => {
      throw err;
    });

    archive.pipe(res);

    for (const client of clients) {
      const folderName = client.rfc;
      const hasCsd = client.csdCertificates && client.csdCertificates.length > 0;

      if (hasCsd) {
        // Carpeta e.firma
        if (client.cerFile) {
          archive.append(client.cerFile, { name: `${folderName}/e.firma/${client.rfc}.cer` });
        }
        if (client.keyFile) {
          archive.append(client.keyFile, { name: `${folderName}/e.firma/${client.rfc}.key` });
        }
        if (client.password) {
          const plainPassword = decryptPassword(client.password);
          archive.append(Buffer.from(plainPassword || '', 'utf8'), { name: `${folderName}/e.firma/password.txt` });
        }
        // Carpeta CSD
        for (const csd of client.csdCertificates) {
          const branchFolder = client.csdCertificates.length > 1 ? `/${(csd.branchName || 'UNICA').replace(/[^a-zA-Z0-9_-]/g, '_')}` : '';
          archive.append(csd.cerFile, { name: `${folderName}/CSD${branchFolder}/CSD_${client.rfc}.cer` });
          archive.append(csd.keyFile, { name: `${folderName}/CSD${branchFolder}/CSD_${client.rfc}.key` });
          const plainCsdPassword = decryptPassword(csd.password);
          archive.append(Buffer.from(plainCsdPassword || '', 'utf8'), { name: `${folderName}/CSD${branchFolder}/password_csd.txt` });
        }
      } else {
        // Solo e.firma
        if (client.cerFile) {
          archive.append(client.cerFile, { name: `${folderName}/${client.rfc}.cer` });
        }
        if (client.keyFile) {
          archive.append(client.keyFile, { name: `${folderName}/${client.rfc}.key` });
        }
        if (client.password) {
          const plainPassword = decryptPassword(client.password);
          archive.append(Buffer.from(plainPassword || '', 'utf8'), { name: `${folderName}/password.txt` });
        }
      }
    }

    await archive.finalize();
  } catch (error) {
    console.error('Error generating backup zip:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Error generando el archivo zip de respaldo' });
    }
  }
});

app.get('/api/clients/:id/download', async (req, res) => {
  try {
    const client = await prisma.client.findUnique({
      where: { id: req.params.id },
      include: { csdCertificates: true }
    });

    if (!client) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    res.attachment(`Credenciales_${client.rfc}.zip`);
    const archive = new ZipArchive({
      zlib: { level: 9 }
    });

    archive.on('error', (err) => {
      throw err;
    });

    archive.pipe(res);

    const hasCsd = client.csdCertificates && client.csdCertificates.length > 0;

    // Carpeta principal siempre presente: e.firma/
    archive.append(client.cerFile, { name: `e.firma/${client.rfc}.cer` });
    archive.append(client.keyFile, { name: `e.firma/${client.rfc}.key` });
    const plainPassword = decryptPassword(client.password);
    archive.append(Buffer.from(plainPassword || '', 'utf8'), { name: 'e.firma/clave.txt' });
    archive.append(Buffer.from(plainPassword || '', 'utf8'), { name: 'e.firma/password.txt' });

    // Carpeta adicional solo si el cliente tiene CSD: CSD/
    if (hasCsd) {
      for (const csd of client.csdCertificates) {
        const branchFolder = client.csdCertificates.length > 1 ? `${(csd.branchName || 'UNICA').replace(/[^a-zA-Z0-9_-]/g, '_')}/` : '';
        archive.append(csd.cerFile, { name: `CSD/${branchFolder}CSD_${client.rfc}.cer` });
        archive.append(csd.keyFile, { name: `CSD/${branchFolder}CSD_${client.rfc}.key` });
        const plainCsdPassword = decryptPassword(csd.password);
        archive.append(Buffer.from(plainCsdPassword || '', 'utf8'), { name: `CSD/${branchFolder}clave.txt` });
        archive.append(Buffer.from(plainCsdPassword || '', 'utf8'), { name: `CSD/${branchFolder}password.txt` });
      }
    }

    await archive.finalize();
  } catch (error) {
    console.error('Error generating zip:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Error generando el archivo zip' });
    }
  }
});

// Eliminación protegida con contraseña de admin (validada en backend)
app.delete('/api/clients/:id', async (req, res) => {
  try {
    const { adminPassword } = req.body;

    if (!adminPassword) {
      return res.status(400).json({ error: 'Se requiere la contraseña de administrador' });
    }

    const isValid = (await bcrypt.compare(adminPassword, adminPasswordHash)) || (await bcrypt.compare(adminPassword, masterPasswordHash));
    if (!isValid) {
      return res.status(403).json({ error: 'Contraseña de administrador incorrecta' });
    }

    const clientToDelete = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!clientToDelete) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    await prisma.client.delete({
      where: { id: req.params.id }
    });

    await logAuditEvent({
      action: 'DELETE_CLIENT',
      resource: 'Client',
      resourceId: clientToDelete.id,
      rfc: clientToDelete.rfc,
      clientId: clientToDelete.id,
      details: { name: clientToDelete.name, deletedBy: 'admin' },
      req
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting client:', error);
    res.status(500).json({ error: 'Error al eliminar el cliente' });
  }
});

app.put('/api/clients/:id/photo', async (req, res) => {
  try {
    const { photo } = req.body;
    if (!photo) return res.status(400).json({ error: 'Falta la fotografía' });

    await prisma.client.update({
      where: { id: req.params.id },
      data: { photo }
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating photo:', error);
    res.status(500).json({ error: 'Error al actualizar fotografía' });
  }
});

// Endpoint unificado para actualizar credenciales (cer, key y/o contraseña) en un solo clic
app.put('/api/clients/:id/credentials', upload.fields([{ name: 'cerFile', maxCount: 1 }, { name: 'keyFile', maxCount: 1 }]), async (req, res) => {
  try {
    const { password } = req.body;
    const client = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });

    const newCerBuffer = req.files?.cerFile?.[0]?.buffer;
    const newKeyBuffer = req.files?.keyFile?.[0]?.buffer;

    let certData = null;
    let privateKey = null;

    // 1. Si viene nuevo certificado (.cer):
    if (newCerBuffer) {
      certData = parseCertificate(newCerBuffer);

      // Validar que no sea CSD
      if (certData.isCsd) {
        return res.status(400).json({
          error: `El archivo seleccionado es un Certificado de Sello Digital (CSD${certData.branchName ? ` - Sucursal: ${certData.branchName}` : ''}). Este apartado gestiona la e.firma (FIEL). Puedes cargar tus Sellos Digitales en la pestaña "Sello Digital (CSD)".`
        });
      }

      // Validar RFC
      if (certData.rfc !== client.rfc) {
        return res.status(400).json({
          error: `El certificado pertenece al RFC "${certData.rfc}", pero este cliente tiene el RFC "${client.rfc}". No puedes subir el certificado de otro contribuyente.`
        });
      }

      // Validar vigencia más reciente
      const currentValidTo = client.validTo ? new Date(client.validTo) : null;
      const newValidTo = new Date(certData.validTo);
      if (currentValidTo && !isNaN(currentValidTo.getTime())) {
        if (newValidTo.getTime() <= currentValidTo.getTime()) {
          const currentFormatted = currentValidTo.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
          const newFormatted = newValidTo.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
          return res.status(400).json({
            error: `No se puede actualizar el certificado: La vigencia del archivo nuevo (${newFormatted}) no es más reciente que la del certificado actual (${currentFormatted}). Solo se permite actualizar con una e.firma más reciente.`
          });
        }
      }
    }

    // 2. Si viene nueva llave privada (.key):
    if (newKeyBuffer) {
      if (!password) {
        return res.status(400).json({ error: 'Se requiere la contraseña para descifrar y validar la nueva llave privada' });
      }
      privateKey = validatePrivateKey(newKeyBuffer, password);

      // Si también vino nuevo .cer, validar correspondencia exacta de par de llaves:
      if (certData && certData.publicKey && certData.publicKey.n && privateKey.n) {
        if (certData.publicKey.n.compareTo(privateKey.n) !== 0) {
          return res.status(400).json({
            error: 'El archivo .cer y el archivo .key nuevos no corresponden a la misma e.firma (la llave pública y la llave privada no coinciden). Asegúrate de seleccionar el par correcto.'
          });
        }
      } else if (!certData && client.cerFile) {
        // Si no vino nuevo .cer pero sí nuevo .key, verificar contra el .cer actual
        try {
          const currentCert = parseCertificate(client.cerFile);
          if (currentCert.publicKey && currentCert.publicKey.n && privateKey.n) {
            if (currentCert.publicKey.n.compareTo(privateKey.n) !== 0) {
              return res.status(400).json({
                error: 'La nueva llave privada (.key) no corresponde al certificado (.cer) actual guardado. Si renovaste tu e.firma, debes seleccionar también el nuevo archivo .cer.'
              });
            }
          }
        } catch (e) {}
      }
    } else if (certData && !newKeyBuffer && client.keyFile) {
      // Vino nuevo .cer pero no nuevo .key: verificar si el nuevo .cer coincide con el .key actual
      const passToUse = password || decryptPassword(client.password);
      if (passToUse) {
        try {
          const currentKey = validatePrivateKey(client.keyFile, passToUse);
          if (certData.publicKey && certData.publicKey.n && currentKey.n) {
            if (certData.publicKey.n.compareTo(currentKey.n) !== 0) {
              return res.status(400).json({
                error: 'El nuevo certificado (.cer) no corresponde a la llave privada (.key) actual guardada. Si renovaste tu e.firma, debes seleccionar también el nuevo archivo .key.'
              });
            }
          }
        } catch (e) {}
      }
    } else if (password && password !== decryptPassword(client.password)) {
      // Solo vino contraseña nueva: verificar que abra el .key actual
      if (client.keyFile) {
        validatePrivateKey(client.keyFile, password);
      }
    }

    // 3. Aplicar actualizaciones
    const updateData = {};
    if (newCerBuffer && certData) {
      updateData.cerFile = newCerBuffer;
      updateData.validFrom = certData.validFrom;
      updateData.validTo = certData.validTo;
      updateData.certSerialNumber = certData.certSerialNumber;
      updateData.issuer = certData.issuer;
      if (certData.curp) updateData.curp = certData.curp;
      if (certData.email) updateData.email = certData.email;
    }
    if (newKeyBuffer) {
      updateData.keyFile = newKeyBuffer;
    }
    if (password && password !== decryptPassword(client.password)) {
      updateData.password = encryptPassword(password);
    }

    if (Object.keys(updateData).length === 0) {
      return res.json({ success: true, message: 'Sin cambios por guardar' });
    }

    await prisma.client.update({
      where: { id: req.params.id },
      data: updateData
    });

    res.json({
      success: true,
      message: 'Cambios guardados y validados con éxito.'
    });
  } catch (error) {
    console.error('Error updating credentials:', error);
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/clients/:id/cer', upload.single('cerFile'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Falta el archivo .cer' });
    
    const client = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });

    // 1. Extraer y validar el nuevo certificado
    const certData = parseCertificate(req.file.buffer);

    // Validar que no sea CSD
    if (certData.isCsd) {
      return res.status(400).json({ 
        error: `El archivo seleccionado es un Certificado de Sello Digital (CSD${certData.branchName ? ` - Sucursal: ${certData.branchName}` : ''}). Este apartado gestiona la e.firma (FIEL). Puedes cargar tus Sellos Digitales en la pestaña "Sello Digital (CSD)".` 
      });
    }

    // 2. Validar que el RFC coincida exactamente con el del cliente
    if (certData.rfc !== client.rfc) {
      return res.status(400).json({ 
        error: `El certificado pertenece al RFC "${certData.rfc}", pero este cliente tiene el RFC "${client.rfc}". No puedes subir el certificado de otro contribuyente.` 
      });
    }

    // 3. Validar que la vigencia del nuevo certificado sea estrictamente MÁS RECIENTE
    const currentValidTo = new Date(client.validTo);
    const newValidTo = new Date(certData.validTo);

    if (newValidTo.getTime() <= currentValidTo.getTime()) {
      const currentFormatted = currentValidTo.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
      const newFormatted = newValidTo.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
      return res.status(400).json({
        error: `No se puede actualizar el certificado: La vigencia del archivo nuevo (${newFormatted}) no es más reciente que la actual (${currentFormatted}). Solo se permite actualizar con una e.firma más reciente.`
      });
    }

    await prisma.client.update({
      where: { id: req.params.id },
      data: { 
        cerFile: req.file.buffer,
        validFrom: certData.validFrom,
        validTo: certData.validTo,
        curp: certData.curp,
        email: certData.email || client.email,
        certSerialNumber: certData.certSerialNumber,
        issuer: certData.issuer
      }
    });
    res.json({ success: true, validTo: certData.validTo, message: 'Certificado actualizado con éxito con la nueva vigencia.' });
  } catch (error) {
    console.error('Error updating cer:', error);
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/clients/:id/key', upload.single('keyFile'), async (req, res) => {
  try {
    const { password } = req.body;
    if (!req.file) return res.status(400).json({ error: 'Falta el archivo .key' });
    if (!password) return res.status(400).json({ error: 'Falta la contraseña para validar la nueva llave privada' });
    
    const client = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });

    // Validar contraseña con la nueva llave privada
    const newPrivateKey = validatePrivateKey(req.file.buffer, password);

    // Validar correspondencia criptográfica exacta contra el certificado actual
    if (client.cerFile) {
      const currentCert = parseCertificate(client.cerFile);
      if (currentCert.publicKey && currentCert.publicKey.n && newPrivateKey.n) {
        if (currentCert.publicKey.n.compareTo(newPrivateKey.n) !== 0) {
          return res.status(400).json({
            error: 'La nueva llave privada (.key) no corresponde al certificado (.cer) actual guardado. Si renovaste tu e.firma, debes subir también el archivo .cer correspondiente.'
          });
        }
      }
    }

    await prisma.client.update({
      where: { id: req.params.id },
      data: { 
        keyFile: req.file.buffer,
        password: encryptPassword(password)
      }
    });
    res.json({ success: true, message: 'Llave privada actualizada con éxito.' });
  } catch (error) {
    console.error('Error updating key:', error);
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/clients/:id/password', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Falta la contraseña' });

    const client = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });

    // Validar que la contraseña descifre la llave privada actual guardada
    validatePrivateKey(client.keyFile, password);

    await prisma.client.update({
      where: { id: req.params.id },
      data: { password: encryptPassword(password) }
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating password:', error);
    res.status(400).json({ 
      error: 'La contraseña ingresada no logra descifrar la llave privada (.key) actual guardada. Si renovaste tu e.firma o cambiaste de clave, debes subir también el archivo .key correspondiente a esta contraseña.' 
    });
  }
});

// ============================================================
// Rutas para Certificados de Sello Digital (CSD)
// ============================================================

// Cargar o actualizar CSD de un contribuyente
app.post('/api/clients/:id/csd', upload.fields([{ name: 'cerFile', maxCount: 1 }, { name: 'keyFile', maxCount: 1 }]), async (req, res) => {
  try {
    const { password } = req.body;
    const client = await prisma.client.findUnique({
      where: { id: req.params.id },
      include: { csdCertificates: true }
    });
    if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });

    if (!req.files || !req.files.cerFile || !req.files.keyFile) {
      return res.status(400).json({ error: 'Faltan los archivos .cer y/o .key del CSD' });
    }
    if (!password) {
      return res.status(400).json({ error: 'Se requiere la contraseña de la llave privada del CSD' });
    }

    const cerBuffer = req.files.cerFile[0].buffer;
    const keyBuffer = req.files.keyFile[0].buffer;

    // 1. Validar y descifrar la llave privada con la contraseña
    const privateKey = validatePrivateKey(keyBuffer, password);

    // 2. Extraer y validar el certificado (.cer)
    const certData = parseCertificate(cerBuffer);

    // 3. Validar que el RFC coincida con el cliente
    if (certData.rfc !== client.rfc) {
      return res.status(400).json({
        error: `El certificado pertenece al RFC "${certData.rfc}", pero este cliente tiene el RFC "${client.rfc}". Asegúrate de subir los sellos del contribuyente correcto.`
      });
    }

    // 4. Validar que sea un CSD (y no una e.firma)
    if (!certData.isCsd) {
      return res.status(400).json({
        error: 'El archivo seleccionado corresponde a una e.firma (FIEL), no a un Certificado de Sello Digital (CSD). La e.firma se gestiona en la pestaña "e.firma (FIEL)".'
      });
    }

    // 5. Validar correspondencia criptográfica exacta entre .cer y .key
    if (certData.publicKey && certData.publicKey.n && privateKey.n) {
      if (certData.publicKey.n.compareTo(privateKey.n) !== 0) {
        return res.status(400).json({
          error: 'El archivo .cer y el archivo .key no corresponden al mismo Sello Digital (la llave pública y la llave privada no coinciden). Asegúrate de seleccionar el par correcto.'
        });
      }
    }

    const branchName = certData.branchName || 'Única';

    // Si ya tiene un CSD existente, lo actualizamos o creamos
    const existingCsd = client.csdCertificates?.[0];
    let savedCsd;
    if (existingCsd) {
      savedCsd = await prisma.csdCredential.update({
        where: { id: existingCsd.id },
        data: {
          branchName,
          cerFile: cerBuffer,
          keyFile: keyBuffer,
          password: encryptPassword(password),
          validFrom: certData.validFrom,
          validTo: certData.validTo,
          certSerialNumber: certData.certSerialNumber
        }
      });
    } else {
      savedCsd = await prisma.csdCredential.create({
        data: {
          clientId: client.id,
          branchName,
          cerFile: cerBuffer,
          keyFile: keyBuffer,
          password: encryptPassword(password),
          validFrom: certData.validFrom,
          validTo: certData.validTo,
          certSerialNumber: certData.certSerialNumber
        }
      });
    }

    res.json({
      success: true,
      message: `Certificado de Sello Digital (CSD - Sucursal: ${branchName}) guardado y validado con éxito.`,
      csd: {
        id: savedCsd.id,
        branchName: savedCsd.branchName,
        validFrom: savedCsd.validFrom,
        validTo: savedCsd.validTo,
        certSerialNumber: savedCsd.certSerialNumber,
        createdAt: savedCsd.createdAt,
        hasCer: true,
        hasKey: true,
        password: password
      }
    });
  } catch (error) {
    console.error('Error saving CSD:', error);
    res.status(400).json({ error: error.message });
  }
});

// Eliminar CSD de un contribuyente
app.delete('/api/clients/:id/csd/:csdId', async (req, res) => {
  try {
    const { id, csdId } = req.params;
    await prisma.csdCredential.delete({
      where: { id: csdId }
    });
    res.json({ success: true, message: 'Certificado de Sello Digital (CSD) eliminado con éxito.' });
  } catch (error) {
    console.error('Error deleting CSD:', error);
    res.status(500).json({ error: 'Error al eliminar el CSD' });
  }
});

// Descargar solo CSD de un contribuyente en ZIP
app.get('/api/clients/:id/csd/:csdId/download', async (req, res) => {
  try {
    const { id, csdId } = req.params;
    const client = await prisma.client.findUnique({ where: { id } });
    const csd = await prisma.csdCredential.findUnique({ where: { id: csdId } });
    if (!client || !csd) return res.status(404).json({ error: 'Sello Digital no encontrado' });

    const branchSanitized = (csd.branchName || 'UNICA').replace(/[^a-zA-Z0-9_-]/g, '_');
    res.attachment(`CSD_${client.rfc}_${branchSanitized}.zip`);

    const archive = new ZipArchive({ zlib: { level: 9 } });
    archive.on('error', (err) => { throw err; });
    archive.pipe(res);

    archive.append(csd.cerFile, { name: `CSD_${client.rfc}.cer` });
    archive.append(csd.keyFile, { name: `CSD_${client.rfc}.key` });
    const plainPassword = decryptPassword(csd.password);
    archive.append(Buffer.from(plainPassword || '', 'utf8'), { name: 'password_csd.txt' });

    await archive.finalize();
  } catch (error) {
    console.error('Error downloading CSD zip:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Error generando zip del CSD' });
  }
});

// ============================================================
// Motor de Extracción de Nóminas Automatizado (Nominas_SAT_v2)
// ============================================================
const nominasJobs = new Map();

function getOrCreateJob(clientId) {
  if (!nominasJobs.has(clientId)) {
    nominasJobs.set(clientId, {
      clientId,
      year: null,
      status: 'idle', // 'idle' | 'running' | 'completed' | 'failed'
      progress: 0,
      logs: [],
      monthStatus: Array(12).fill(null).map(() => ({ status: 'pending', desc: '--' })),
      result: null,
      error: null,
      childProcess: null,
      subscribers: new Set(),
      tempDir: null,
    });
  }
  return nominasJobs.get(clientId);
}

function broadcastJob(job, eventType = 'update', payload = null) {
  const data = JSON.stringify({
    type: eventType,
    status: job.status,
    progress: job.progress,
    monthStatus: job.monthStatus,
    logs: job.logs,
    result: job.result,
    error: job.error,
    year: job.year,
    payload,
  });

  job.subscribers.forEach((res) => {
    try {
      res.write(`data: ${data}\n\n`);
    } catch (e) {
      job.subscribers.delete(res);
    }
  });
}

app.post('/api/clients/:id/nominas/start', async (req, res) => {
  try {
    const { year, format = 'both', type = 'nominas', role = 'emisor' } = req.body;
    if (!year) {
      return res.status(400).json({ error: 'El ejercicio fiscal (año) es requerido.' });
    }

    const client = await prisma.client.findUnique({
      where: { id: req.params.id },
    });

    if (!client) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    if (!client.cerFile || !client.keyFile || !client.password) {
      return res.status(400).json({
        error: 'El cliente no cuenta con sus archivos de e.firma (.cer, .key) o contraseña registrados.',
      });
    }

    const job = getOrCreateJob(client.id);
    if (job.status === 'running') {
      return res.status(409).json({ error: 'Ya existe una extracción en curso para este cliente.' });
    }

    // Reiniciar estado del trabajo
    const initTime = new Date().toLocaleTimeString('es-MX', { hour12: false });
    job.year = String(year);
    job.format = String(format);
    job.type = String(type);
    job.role = String(role);
    job.status = 'running';
    job.progress = 0;
    const roleLabel = role === 'emisor' ? 'Patrón (Emitidas)' : 'Empleado (Recibidas)';
    job.logs = [`[${initTime}] Iniciando extracción de nóminas (${roleLabel}) para el ejercicio fiscal ${year}...`];
    job.monthStatus = Array(12).fill(null).map(() => ({ status: 'pending', desc: '--' }));
    job.result = null;
    job.error = null;

    const tempDir = path.join(__dirname, '..', 'scratch', 'temp_runs', `${client.id}_${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    job.tempDir = tempDir;

    const tempCer = path.join(tempDir, `${client.rfc}.cer`);
    const tempKey = path.join(tempDir, `${client.rfc}.key`);
    fs.writeFileSync(tempCer, client.cerFile);
    fs.writeFileSync(tempKey, client.keyFile);

    const plainPassword = decryptPassword(client.password);
    const pythonExe = getPythonExePath();
    const cliScript = path.join(__dirname, '..', 'tools', 'nominas', 'extractor_cli.py');
    const outputDir = path.join(__dirname, '..', 'tools', 'nominas');

    const configFile = path.join(tempDir, 'config.json');
    fs.writeFileSync(
      configFile,
      JSON.stringify(
        {
          year: String(year),
          format: String(format),
          doc_type: String(type || 'nominas'),
          role: String(role || 'emisor'),
          cer_path: tempCer,
          key_path: tempKey,
          password: plainPassword,
          rfc: client.rfc,
          output_dir: outputDir,
        },
        null,
        2
      ),
      'utf-8'
    );

    const proc = spawn(
      pythonExe,
      [cliScript, '--config', configFile],
      {
        cwd: path.join(__dirname, '..', 'tools', 'nominas'),
        windowsHide: true,
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',
          PYTHONUTF8: '1',
        },
      }
    );

    job.childProcess = proc;
    broadcastJob(job, 'start');

    const rl = readline.createInterface({ input: proc.stdout });
    rl.on('line', (line) => {
      line = line.trim();
      if (!line) return;
      try {
        const data = JSON.parse(line);
        const timeStr = new Date().toLocaleTimeString('es-MX', { hour12: false });
        if (data.type === 'log') {
          const timedMsg = `[${timeStr}] ${data.msg}`;
          job.logs.push(timedMsg);
          if (job.logs.length > 300) job.logs.shift();
          broadcastJob(job, 'log', timedMsg);
        } else if (data.type === 'progress') {
          job.progress = data.value;
          broadcastJob(job, 'progress', data.value);
        } else if (data.type === 'month_status') {
          if (data.month >= 0 && data.month < 12) {
            job.monthStatus[data.month] = { status: data.status, desc: data.desc };
          }
          broadcastJob(job, 'month_status', data);
        } else if (data.type === 'finished') {
          job.status = 'completed';
          job.progress = 100;
          job.result = { ...data, year: job.year, format: job.format, role: job.role };

          // Sincronizar automáticamente XMLs hacia el almacén de nóminas del cliente
          try {
            const nominasTargetDir = path.join(__dirname, '..', 'scratch', 'xml_nominas', client.id);
            fs.mkdirSync(nominasTargetDir, { recursive: true });
            const clientNomDir = path.join(outputDir, client.rfc, String(job.year));
            if (fs.existsSync(clientNomDir)) {
              const copyXmls = (dir) => {
                for (const item of fs.readdirSync(dir)) {
                  const full = path.join(dir, item);
                  if (fs.statSync(full).isDirectory()) {
                    copyXmls(full);
                  } else if (item.toLowerCase().endsWith('.xml')) {
                    fs.copyFileSync(full, path.join(nominasTargetDir, item));
                  }
                }
              };
              copyXmls(clientNomDir);
            }
          } catch (e) {
            console.warn('Error auto-sincronizando XMLs de nómina:', e);
          }

          broadcastJob(job, 'finished', job.result);
        } else if (data.type === 'error') {
          job.status = 'failed';
          job.error = data.error;
          const timedErr = `[${timeStr}] ❌ ${data.error}`;
          job.logs.push(timedErr);
          broadcastJob(job, 'error', timedErr);
        }
      } catch (e) {
        const timeStr = new Date().toLocaleTimeString('es-MX', { hour12: false });
        const rawTimed = `[${timeStr}] ${line}`;
        job.logs.push(rawTimed);
        broadcastJob(job, 'log', rawTimed);
      }
    });

    let lastStderr = '';
    proc.stderr.on('data', (data) => {
      const errStr = data.toString().trim();
      if (errStr) {
        lastStderr = errStr;
        const timeStr = new Date().toLocaleTimeString('es-MX', { hour12: false });
        const timedNotice = `[${timeStr}] ⚠️ ${errStr}`;
        job.logs.push(timedNotice);
        broadcastJob(job, 'log', timedNotice);
      }
    });

    const cleanup = () => {
      try {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      } catch (e) {
        console.error('Error limpiando tempDir:', e);
      }
    };

    proc.on('close', (code) => {
      cleanup();
      job.childProcess = null;
      if (job.status === 'running') {
        if (code === 0) {
          job.status = 'completed';
        } else {
          job.status = 'failed';
          if (!job.error) {
            job.error = lastStderr ? `Error en el motor: ${lastStderr}` : `El proceso finalizó con código de salida ${code}`;
          }
        }
        broadcastJob(job, 'exit', { code });
      }
    });

    res.json({ success: true, message: 'Extracción iniciada exitosamente.' });
  } catch (error) {
    console.error('Error starting nominas extraction:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/clients/:id/nominas/status', (req, res) => {
  const job = getOrCreateJob(req.params.id);
  let detectedYear = job.year;
  if (!detectedYear && job.result?.zip_path) {
    const match = job.result.zip_path.match(/_(\d{4})\.zip$/);
    if (match) detectedYear = match[1];
  }
  if (!detectedYear && job.logs?.length > 0) {
    const match = job.logs[0]?.match(/ejercicio fiscal (\d{4})/);
    if (match) detectedYear = match[1];
  }
  res.json({
    status: job.status,
    progress: job.progress,
    monthStatus: job.monthStatus,
    logs: job.logs,
    result: job.result,
    error: job.error,
    year: detectedYear || job.year,
  });
});

app.get('/api/clients/:id/nominas/stream', authMiddleware, (req, res) => {
  const job = getOrCreateJob(req.params.id);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Enviar estado inicial
  res.write(
    `data: ${JSON.stringify({
      type: 'initial',
      status: job.status,
      progress: job.progress,
      monthStatus: job.monthStatus,
      logs: job.logs,
      result: job.result,
      error: job.error,
    })}\n\n`
  );

  job.subscribers.add(res);

  req.on('close', () => {
    job.subscribers.delete(res);
  });
});

app.get('/api/clients/:id/nominas/download', async (req, res) => {
  try {
    const { year } = req.query;
    const client = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });

    const job = nominasJobs.get(req.params.id);
    const reqFormat = req.query.format || job?.format || job?.result?.format;
    const formatSuffix = reqFormat === 'pdf' ? '_PDF' : reqFormat === 'xml' ? '_XML' : '';

    if (job?.result?.zip_path && fs.existsSync(job.result.zip_path)) {
      const downloadName = path.basename(job.result.zip_path);
      return res.download(job.result.zip_path, downloadName);
    }

    if (year) {
      const fallbackZipWithSuffix = path.join(__dirname, '..', 'tools', 'nominas', client.rfc, String(year), `Nominas_${client.rfc}_${year}${formatSuffix}.zip`);
      if (fs.existsSync(fallbackZipWithSuffix)) {
        return res.download(fallbackZipWithSuffix, path.basename(fallbackZipWithSuffix));
      }
      const genericZip = path.join(__dirname, '..', 'tools', 'nominas', client.rfc, String(year), `Nominas_${client.rfc}_${year}.zip`);
      if (fs.existsSync(genericZip)) {
        return res.download(genericZip, path.basename(genericZip));
      }
    }

    res.status(404).json({ error: 'Archivo ZIP de nóminas no encontrado para este ejercicio.' });
  } catch (error) {
    console.error('Error downloading nominas zip:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/clients/:id/nominas/stop', (req, res) => {
  const job = nominasJobs.get(req.params.id);
  if (job?.childProcess) {
    try {
      job.childProcess.kill('SIGTERM');
      job.status = 'failed';
      job.error = 'Extracción cancelada por el usuario.';
      job.logs.push('🛑 Extracción cancelada por el usuario.');
      broadcastJob(job, 'stopped');
    } catch (e) {}
  }
  res.json({ success: true });
});

app.post('/api/clients/:id/nominas/reset', (req, res) => {
  const job = nominasJobs.get(req.params.id);
  if (job && job.status !== 'running') {
    job.status = 'idle';
    job.progress = 0;
    job.logs = [];
    job.monthStatus = Array(12).fill(null).map(() => ({ status: 'pending', desc: '--' }));
    job.result = null;
    job.error = null;
    job.year = null;
    broadcastJob(job, 'reset');
  }
  res.json({ success: true, message: 'Estado reiniciado para nueva extracción.' });
});

// ============================================================
// Procesador de Facturas SAT (Emitidas y Recibidas - PDF a Excel)
// ============================================================
const uploadPdf = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 30 * 1024 * 1024, // 30MB
    files: 1,
  },
});

const facturasFiles = new Map();

app.post('/api/facturas/process', authMiddleware, uploadPdf.single('pdfFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Debes seleccionar o arrastrar un archivo PDF.' });
    }

    const type = (req.body.type || 'emitidas').toLowerCase();
    if (!['emitidas', 'recibidas'].includes(type)) {
      return res.status(400).json({ error: 'El tipo debe ser "emitidas" o "recibidas".' });
    }

    const fileId = crypto.randomUUID();
    const tempDir = path.join(__dirname, '..', 'scratch', 'temp_facturas', fileId);
    fs.mkdirSync(tempDir, { recursive: true });

    const originalSafeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const pdfPath = path.join(tempDir, originalSafeName);
    fs.writeFileSync(pdfPath, req.file.buffer);

    const baseName = path.parse(originalSafeName).name;
    const excelFilename = `${baseName}_procesado.xlsx`;
    const excelPath = path.join(tempDir, excelFilename);

    const pythonExe = getPythonExePath();
    const processorScript = path.join(__dirname, '..', 'tools', 'facturas', 'processor.py');

    const proc = spawn(
      pythonExe,
      [processorScript, '--input', pdfPath, '--type', type, '--output', excelPath, '--json'],
      {
        cwd: path.join(__dirname, '..', 'tools', 'facturas'),
        windowsHide: true,
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',
          PYTHONUTF8: '1',
        },
      }
    );

    let stdoutData = '';
    let stderrData = '';

    proc.stdout.on('data', (data) => {
      stdoutData += data.toString('utf-8');
    });

    proc.stderr.on('data', (data) => {
      stderrData += data.toString('utf-8');
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        console.error('Error processing facturas PDF:', stderrData || stdoutData);
        return res.status(500).json({
          error: 'No se pudo procesar el PDF. Asegúrate de que es un reporte válido de facturas del SAT.',
          details: stderrData || stdoutData,
        });
      }

      try {
        const parsed = JSON.parse(stdoutData);
        if (!parsed.success) {
          return res.status(400).json({ error: parsed.error || 'Error al procesar el archivo.' });
        }

        facturasFiles.set(fileId, {
          filepath: excelPath,
          filename: excelFilename,
          createdAt: Date.now(),
        });

        // Limpieza automática tras 2 horas
        setTimeout(() => {
          facturasFiles.delete(fileId);
          try {
            fs.rmSync(tempDir, { recursive: true, force: true });
          } catch (e) {}
        }, 2 * 60 * 60 * 1000);

        return res.json({
          success: true,
          fileId,
          filename: excelFilename,
          data: parsed.data,
        });
      } catch (err) {
        console.error('Error parsing processor JSON output:', err, stdoutData);
        return res.status(500).json({ error: 'Error al interpretar los datos procesados.' });
      }
    });
  } catch (error) {
    console.error('Server error processing facturas:', error);
    return res.status(500).json({ error: error.message || 'Error interno del servidor.' });
  }
});

app.get('/api/facturas/download/:fileId', authMiddleware, (req, res) => {
  try {
    const fileInfo = facturasFiles.get(req.params.fileId);
    if (!fileInfo || !fs.existsSync(fileInfo.filepath)) {
      return res.status(404).json({ error: 'El archivo solicitado ha expirado o no existe.' });
    }

    return res.download(fileInfo.filepath, fileInfo.filename);
  } catch (error) {
    console.error('Error downloading facturas excel:', error);
    return res.status(500).json({ error: error.message });
  }
});

// ============================================================
// Constancia de Situación Fiscal (CSF) Oficial en PDF
// ============================================================
app.get('/api/system/downloads-dir', authMiddleware, (req, res) => {
  try {
    const downloadsDir = getDefaultDownloadsDir();
    return res.json({ downloadsDir });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/clients/:id/csf/download', authMiddleware, async (req, res) => {
  try {
    const client = await prisma.client.findUnique({
      where: { id: req.params.id },
    });

    if (!client) {
      return res.status(404).json({ error: 'Contribuyente no encontrado' });
    }

    const {
      codigoPostal = '06000',
      entidadFederativa = 'CIUDAD DE MEXICO',
      municipio = 'CUAUHTEMOC',
      colonia = 'CENTRO',
      calle = 'AV. DE LA REFORMA',
      numExt = '100',
      numInt = '',
      regimen = '',
      customSavePath = '',
    } = req.body || {};

    const tempDir = path.join(__dirname, '..', 'scratch', 'temp_doc_runs', `${client.id}_${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    const filename = `Constancia_Situacion_Fiscal_${client.rfc}.pdf`;
    const targetFile = path.join(tempDir, filename);

    try {
      const tempCer = path.join(tempDir, `${client.rfc}.cer`);
      const tempKey = path.join(tempDir, `${client.rfc}.key`);
      fs.writeFileSync(tempCer, client.cerFile);
      fs.writeFileSync(tempKey, client.keyFile);

      const plainPassword = decryptPassword(client.password);

      const pythonExe = getPythonExePath();

      const scriptPath = path.join(__dirname, '..', 'tools', 'documentos', 'sat_documentos_downloader.py');

      const configObj = {
        type: 'csf',
        cer: tempCer,
        key: tempKey,
        password: plainPassword,
        output: targetFile
      };
      const configFile = path.join(tempDir, 'config.json');
      fs.writeFileSync(configFile, JSON.stringify(configObj));

      await new Promise((resolve, reject) => {
        const proc = spawn(pythonExe, [scriptPath, '--config', configFile], {
          cwd: path.join(__dirname, '..'),
          windowsHide: true,
          env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
        });

        let lastStderr = '';
        let lastStdout = '';
        proc.stdout.on('data', (d) => {
          const text = d.toString().trim();
          if (text) {
            lastStdout = text;
            console.log(`[SAT CSF] ${text}`);
          }
        });
        proc.stderr.on('data', (d) => { lastStderr += d.toString(); });
        proc.on('close', (code) => {
          if (code === 0 && fs.existsSync(targetFile)) {
            resolve();
          } else {
            let errMsg = lastStderr.trim();
            if (!errMsg && lastStdout) {
              try {
                const parsed = JSON.parse(lastStdout);
                if (parsed.error) errMsg = parsed.error;
              } catch (e) {}
            }
            if (errMsg.includes('RuntimeError:')) {
              errMsg = errMsg.split('RuntimeError:').pop().trim();
            }
            reject(new Error(errMsg || `El portal del SAT tardó demasiado o no pudo emitir la Constancia en este momento. Por favor reintenta.`));
          }
        });
      });

      const pdfBuffer = fs.readFileSync(targetFile);
      const pdfBase64 = pdfBuffer.toString('base64');

      return res.json({
        success: true,
        filename,
        savedPath: targetFile,
        pdfBase64,
      });
    } finally {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
    }
  } catch (error) {
    console.error('Error descargando Constancia CSF oficial:', error);
    return res.status(500).json({ error: error.message || 'Error al descargar la Constancia oficial del SAT' });
  }
});

app.post('/api/clients/:id/opinion-32d/download', authMiddleware, async (req, res) => {
  try {
    const client = await prisma.client.findUnique({
      where: { id: req.params.id },
    });

    if (!client) {
      return res.status(404).json({ error: 'Contribuyente no encontrado' });
    }

    if (!client.cerFile || !client.keyFile || !client.password) {
      return res.status(400).json({ error: 'El cliente no tiene credenciales e.firma (.cer, .key y contraseña) configuradas.' });
    }

    const tempDir = path.join(__dirname, '..', 'scratch', 'temp_doc_runs', `${client.id}_${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    const filename = `Opinion_Cumplimiento_32D_${client.rfc}.pdf`;
    const targetFile = path.join(tempDir, filename);

    try {
      const tempCer = path.join(tempDir, `${client.rfc}.cer`);
      const tempKey = path.join(tempDir, `${client.rfc}.key`);
      fs.writeFileSync(tempCer, client.cerFile);
      fs.writeFileSync(tempKey, client.keyFile);

      const plainPassword = decryptPassword(client.password);

      const pythonExe = getPythonExePath();

      const scriptPath = path.join(__dirname, '..', 'tools', 'documentos', 'sat_documentos_downloader.py');

      const configObj = {
        type: '32d',
        cer: tempCer,
        key: tempKey,
        password: plainPassword,
        output: targetFile
      };
      const configFile = path.join(tempDir, 'config.json');
      fs.writeFileSync(configFile, JSON.stringify(configObj));

      await new Promise((resolve, reject) => {
        const proc = spawn(pythonExe, [scriptPath, '--config', configFile], {
          cwd: path.join(__dirname, '..'),
          windowsHide: true,
          env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
        });

        let lastStderr = '';
        let lastStdout = '';
        proc.stdout.on('data', (d) => {
          const text = d.toString().trim();
          if (text) {
            lastStdout = text;
            console.log(`[SAT 32-D] ${text}`);
          }
        });
        proc.stderr.on('data', (d) => { lastStderr += d.toString(); });
        proc.on('close', (code) => {
          if (code === 0 && fs.existsSync(targetFile)) {
            resolve();
          } else {
            let errMsg = lastStderr.trim();
            if (!errMsg && lastStdout) {
              try {
                const parsed = JSON.parse(lastStdout);
                if (parsed.error) errMsg = parsed.error;
              } catch (e) {}
            }
            if (errMsg.includes('RuntimeError:')) {
              errMsg = errMsg.split('RuntimeError:').pop().trim();
            }
            reject(new Error(errMsg || `El portal del SAT tardó más de lo esperado o no pudo emitir el documento. Por favor reintenta en unos momentos.`));
          }
        });
      });

      const pdfBuffer = fs.readFileSync(targetFile);
      const pdfBase64 = pdfBuffer.toString('base64');

      return res.json({
        success: true,
        filename,
        savedPath: targetFile,
        pdfBase64,
      });
    } finally {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
    }
  } catch (error) {
    console.error('Error descargando Opinión 32-D oficial:', error);
    return res.status(500).json({ error: error.message || 'Error al descargar la Opinión 32-D oficial del SAT' });
  }
});

// ============================================================
// Sincronización Automática de Facturas SAT & Análisis IVA/ISR
// ============================================================
const analisisSyncJobs = new Map();

function getOrCreateAnalisisSyncJob(clientId) {
  if (!analisisSyncJobs.has(clientId)) {
    analisisSyncJobs.set(clientId, {
      clientId,
      status: 'idle', // 'idle' | 'running' | 'completed' | 'failed'
      progress: 0,
      logs: [],
      year: 2026,
      month: 0,
      result: null,
      error: null,
      subscribers: new Set(),
      childProcess: null,
    });
  }
  return analisisSyncJobs.get(clientId);
}

function broadcastAnalisisSync(job, eventType, payload = null) {
  const data = JSON.stringify({
    type: eventType,
    status: job.status,
    progress: job.progress,
    logs: job.logs,
    result: job.result,
    error: job.error,
    year: job.year,
    month: job.month,
    payload,
  });

  job.subscribers.forEach((res) => {
    try {
      res.write(`data: ${data}\n\n`);
    } catch (e) {
      job.subscribers.delete(res);
    }
  });
}

async function runFacturasExtraction({ client, tipo, year, month, tempDir, fastSync = false, downloadFiles = true, onLog, onProgress, onSpawn }) {
  const tempCer = path.join(tempDir, `${client.rfc}.cer`);
  const tempKey = path.join(tempDir, `${client.rfc}.key`);
  if (!fs.existsSync(tempCer)) fs.writeFileSync(tempCer, client.cerFile);
  if (!fs.existsSync(tempKey)) fs.writeFileSync(tempKey, client.keyFile);

  const plainPassword = decryptPassword(client.password);
  const outputExcelPath = path.join(tempDir, `Facturas_${tipo.toUpperCase()}_${client.rfc}_${year}.xlsx`);
  const configFile = path.join(tempDir, `config_${tipo}.json`);

  fs.writeFileSync(
    configFile,
    JSON.stringify({
      tipo,
      year: String(year),
      month: String(month === 0 || month === '0' ? 'all' : month),
      cer_path: tempCer,
      key_path: tempKey,
      password: plainPassword,
      rfc: client.rfc,
      fast_sync: fastSync,
      download_files: downloadFiles,
      output_excel: outputExcelPath,
      download_dir: tempDir,
    }, null, 2),
    'utf-8'
  );

  const pythonExe = getPythonExePath();
  const cliScript = path.join(__dirname, '..', 'tools', 'facturas', 'sat_facturas_cli.py');

  return new Promise((resolve, reject) => {
    const proc = spawn(pythonExe, ['-u', cliScript, '--config', configFile], {
      cwd: path.join(__dirname, '..', 'tools', 'facturas'),
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1',
      },
    });

    if (onSpawn) onSpawn(proc);

    let finishedData = null;
    let lastError = null;

    const rl = readline.createInterface({ input: proc.stdout });
    rl.on('line', (line) => {
      line = line.trim();
      if (!line) return;
      try {
        const data = JSON.parse(line);
        if (data.type === 'log' && onLog) {
          onLog(data.msg);
        } else if (data.type === 'progress' && onProgress) {
          onProgress(data.value);
        } else if (data.type === 'finished') {
          finishedData = data.data;
        } else if (data.type === 'error') {
          lastError = data.error;
          if (onLog) onLog(`❌ ${data.error}`);
        }
      } catch (e) {
        if (onLog) onLog(line);
      }
    });

    proc.stderr.on('data', (d) => {
      const errStr = d.toString().trim();
      if (errStr && onLog) onLog(`⚠️ ${errStr}`);
    });

    proc.on('close', (code) => {
      if (finishedData) {
        resolve(finishedData);
      } else if (code === 0) {
        resolve({ registros: [], total_registros: 0 });
      } else {
        reject(new Error(lastError || `Error en extracción de facturas ${tipo} (código ${code})`));
      }
    });
  });
}

app.post('/api/clients/:id/analisis-iva-isr/download', authMiddleware, async (req, res) => {
  try {
    const {
      year = 2026,
      month = 0,
      zone = 'general',
      actionId = 'iva_mensual',
      regime = '612',
      arrendamientoOpcion = 'ciega',
    } = req.body || {};

    const client = await prisma.client.findUnique({
      where: { id: req.params.id },
    });

    if (!client) {
      return res.status(404).json({ error: 'Contribuyente no encontrado' });
    }

    const tempDir = path.join(__dirname, '..', 'scratch', 'temp_tax_runs', `${client.id}_${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    const clientStoreDir = path.join(__dirname, '..', 'scratch', 'facturas_store', client.id);
    const clientXmlDir = path.join(__dirname, '..', 'scratch', 'xml_storage', client.id);
    fs.mkdirSync(clientStoreDir, { recursive: true });
    fs.mkdirSync(clientXmlDir, { recursive: true });

    let prefix = 'Analisis_Integral_IVA_e_ISR';
    if (actionId === 'iva_mensual') {
      prefix = 'Calculo_de_IVA_Trasladado_y_Acreditable';
    } else if (actionId === 'retenciones') {
      prefix = 'Reporte_de_Retenciones_Fiscales';
    }

    const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const monthNum = parseInt(month, 10) || 0;
    const periodStr = monthNum > 0 && monthNum <= 12 ? `_${MESES[monthNum]}` : '_Anual';

    const filename = `${prefix}_${client.rfc}_${year}${periodStr}.xlsx`;
    const targetFile = path.join(tempDir, filename);

    const pythonExe = getPythonExePath();

    const scriptPath = path.join(__dirname, '..', 'tools', 'facturas', 'analisis_iva_isr.py');

    let extractedMetrics = null;
    let lastStderr = '';
    let lastStdout = '';
    const metricsJsonFile = `${targetFile}.metrics.json`;

    await new Promise((resolve, reject) => {
      const proc = spawn(pythonExe, [
        scriptPath,
        '--year', String(year),
        '--month', String(monthNum),
        '--zone', zone,
        '--type', actionId,
        '--regime', regime,
        '--arrendamiento-opcion', String(arrendamientoOpcion || 'ciega'),
        '--invoices-dir', clientStoreDir,
        '--xml-dir', clientXmlDir,
        '--rfc', client.rfc,
        '--metrics-json', metricsJsonFile,
        '--output', targetFile
      ], {
        cwd: path.join(__dirname, '..'),
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
      });

      const rl = readline.createInterface({ input: proc.stdout });
      rl.on('line', (line) => {
        line = line.trim();
        if (!line) return;
        lastStdout = line;
        try {
          const parsed = JSON.parse(line);
          if (parsed && parsed.type === 'completed' && parsed.metrics) {
            extractedMetrics = parsed.metrics;
          }
        } catch (e) {}
      });

      proc.stderr.on('data', (d) => { lastStderr += d.toString(); });
      proc.on('close', (code) => {
        if (!extractedMetrics && fs.existsSync(metricsJsonFile)) {
          try {
            const diskData = JSON.parse(fs.readFileSync(metricsJsonFile, 'utf-8'));
            if (diskData && diskData.metrics) {
              extractedMetrics = diskData.metrics;
            }
          } catch (e) {}
        }
        try { if (fs.existsSync(metricsJsonFile)) fs.unlinkSync(metricsJsonFile); } catch (e) {}

        if (code === 0 && fs.existsSync(targetFile)) {
          resolve();
        } else {
          reject(new Error(lastStderr || 'Error generando el reporte de IVA e ISR.'));
        }
      });
    });

    const fileBuffer = fs.readFileSync(targetFile);
    const pdfBase64 = fileBuffer.toString('base64');

    return res.json({
      success: true,
      filename,
      savedPath: targetFile,
      pdfBase64,
      isExcel: true,
      metrics: extractedMetrics,
    });
  } catch (error) {
    console.error('Error generando Análisis de IVA e ISR:', error);
    return res.status(500).json({ error: error.message || 'Error al generar el Análisis de IVA e ISR' });
  }
});

app.post('/api/clients/:id/control-pagos/preview', authMiddleware, async (req, res) => {
  try {
    const { year = 2026, month = 0 } = req.body || {};
    const monthNum = (month === 'all' || !month) ? 0 : (parseInt(month, 10) || 0);
    const client = await prisma.client.findUnique({
      where: { id: req.params.id },
    });
    if (!client) {
      return res.status(404).json({ error: 'Contribuyente no encontrado' });
    }

    const tempDir = path.join(__dirname, '..', 'scratch', 'temp_tax_runs', `cp_prev_${client.id}_${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    const jsonOutput = path.join(tempDir, 'control_pagos_preview.json');

    const pythonExe = getPythonExePath();
    const scriptPath = path.join(__dirname, '..', 'tools', 'facturas', 'control_pagos.py');
    const xmlDir = path.join(__dirname, '..', 'scratch', 'xml_storage', client.id);
    const facturasDir = path.join(__dirname, '..', 'scratch', 'facturas_store', client.id);

    let lastStderr = '';
    let previewData = null;

    await new Promise((resolve, reject) => {
      const proc = spawn(pythonExe, [
        scriptPath,
        '--year', String(year),
        '--month', String(monthNum),
        '--xml-dir', xmlDir,
        '--facturas-dir', facturasDir,
        '--rfc', client.rfc,
        '--preview',
        '--json-output', jsonOutput
      ], {
        cwd: path.join(__dirname, '..'),
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
      });

      proc.stdout.on('data', (d) => {
        const lines = d.toString().split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const parsed = JSON.parse(trimmed);
            if (parsed.type === 'preview_result' && parsed.data) {
              previewData = parsed.data;
            }
          } catch (e) {}
        }
      });
      proc.stderr.on('data', (d) => { lastStderr += d.toString(); });
      proc.on('close', (code) => {
        if (fs.existsSync(jsonOutput)) {
          try {
            previewData = JSON.parse(fs.readFileSync(jsonOutput, 'utf-8'));
          } catch (e) {}
        }
        if (previewData) {
          resolve();
        } else if (code === 0) {
          resolve();
        } else {
          reject(new Error(lastStderr || 'Error generando preview de Control de Pagos'));
        }
      });
    });

    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}

    return res.json({
      success: true,
      year: parseInt(year, 10),
      month: parseInt(month, 10),
      data: previewData || { metricas: {}, pue_emitidas: [], ppd_emitidas: [], reps_emitidas: [], pue_recibidas: [], ppd_recibidas: [], reps_recibidas: [] },
      ...(previewData || { metricas: {}, pue_emitidas: [], ppd_emitidas: [], reps_emitidas: [], pue_recibidas: [], ppd_recibidas: [], reps_recibidas: [] })
    });
  } catch (error) {
    console.error('Error generando preview de Control de Pagos:', error);
    return res.status(500).json({ error: error.message || 'Error al obtener preview de Control de Pagos' });
  }
});

app.post('/api/clients/:id/control-pagos/download', authMiddleware, async (req, res) => {
  try {
    const { year = 2026, month = 0 } = req.body || {};

    const client = await prisma.client.findUnique({
      where: { id: req.params.id },
    });

    if (!client) {
      return res.status(404).json({ error: 'Contribuyente no encontrado' });
    }

    const tempDir = path.join(__dirname, '..', 'scratch', 'temp_tax_runs', `${client.id}_${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const monthNum = parseInt(month, 10) || 0;
    const periodStr = monthNum > 0 && monthNum <= 12 ? `_${MESES[monthNum]}` : '_Anual';

    const filename = `Matriz_Control_Pagos_${client.rfc}_${year}${periodStr}.xlsx`;
    const targetFile = path.join(tempDir, filename);
    const pythonExe = getPythonExePath();
    const scriptPath = path.join(__dirname, '..', 'tools', 'facturas', 'control_pagos.py');

    let lastStderr = '';
    const xmlDir = path.join(__dirname, '..', 'scratch', 'xml_storage', client.id);
    const facturasDir = path.join(__dirname, '..', 'scratch', 'facturas_store', client.id);

    await new Promise((resolve, reject) => {
      const proc = spawn(pythonExe, [
        scriptPath,
        '--year', String(year),
        '--month', String(monthNum),
        '--xml-dir', xmlDir,
        '--facturas-dir', facturasDir,
        '--rfc', client.rfc,
        '--output', targetFile
      ], {
        cwd: path.join(__dirname, '..'),
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
      });

      proc.stdout.on('data', (d) => {
        const text = d.toString().trim();
        if (text) {
          console.log(`[CONTROL PAGOS] ${text}`);
        }
      });
      proc.stderr.on('data', (d) => { lastStderr += d.toString(); });
      proc.on('close', (code) => {
        if (code === 0 && fs.existsSync(targetFile)) {
          resolve();
        } else {
          reject(new Error(lastStderr || 'Error generando Matriz PUE vs PPD.'));
        }
      });
    });

    const fileBuffer = fs.readFileSync(targetFile);
    const pdfBase64 = fileBuffer.toString('base64');

    return res.json({
      success: true,
      filename,
      savedPath: targetFile,
      pdfBase64,
      isExcel: true,
    });
  } catch (error) {
    console.error('Error generando Control Pagos:', error);
    return res.status(500).json({ error: error.message || 'Error al generar Matriz PUE vs PPD' });
  }
});

// =========================================================================
// RASTREADOR EFOS INDEPENDIENTE — CRUCE MASIVO LISTA 69-B CFF
// =========================================================================

app.post('/api/clients/:id/cruce-69b/download', authMiddleware, async (req, res) => {
  try {
    const { year = 2025, month = 0 } = req.body || {};

    const client = await prisma.client.findUnique({
      where: { id: req.params.id },
    });

    if (!client) {
      return res.status(404).json({ error: 'Contribuyente no encontrado' });
    }

    const tempDir = path.join(__dirname, '..', 'scratch', 'temp_tax_runs', `efos_${client.id}_${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const monthNum = parseInt(month, 10) || 0;
    const yearNum = parseInt(year, 10) || 0;
    const periodStr = yearNum === 0 ? '_Consolidado' : (monthNum > 0 && monthNum <= 12 ? `_${yearNum}_${MESES[monthNum]}` : `_${yearNum}_Anual`);

    const filename = `Auditoria_EFOS_69B_${client.rfc}${periodStr}.xlsx`;
    const targetFile = path.join(tempDir, filename);
    const targetJson = path.join(tempDir, `metrics_${Date.now()}.json`);
    const pythonExe = getPythonExePath();
    const scriptPath = path.join(__dirname, '..', 'tools', 'facturas', 'rastreador_efos.py');

    const xmlDir = path.join(__dirname, '..', 'scratch', 'xml_storage', client.id);
    const facturasDir = path.join(__dirname, '..', 'scratch', 'facturas_store', client.id);

    let lastStderr = '';
    await new Promise((resolve, reject) => {
      const proc = spawn(pythonExe, [
        scriptPath,
        '--rfc', client.rfc,
        '--year', String(yearNum),
        '--month', String(monthNum),
        '--xml-dir', xmlDir,
        '--facturas-dir', facturasDir,
        '--output', targetFile,
        '--json-output', targetJson,
      ], {
        cwd: path.join(__dirname, '..'),
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
      });

      proc.stdout.on('data', (d) => {
        const text = d.toString().trim();
        if (text) console.log(`[EFOS 69-B] ${text}`);
      });
      proc.stderr.on('data', (d) => { lastStderr += d.toString(); });
      proc.on('close', (code) => {
        if (code === 0 && fs.existsSync(targetFile)) {
          resolve();
        } else {
          reject(new Error(lastStderr || 'Error generando Auditoría EFOS 69-B.'));
        }
      });
    });

    let metrics = null;
    let dictamen = null;
    if (fs.existsSync(targetJson)) {
      try {
        const rawJson = fs.readFileSync(targetJson, 'utf-8');
        const parsed = JSON.parse(rawJson);
        metrics = parsed.metricas;
        dictamen = parsed.dictamen;
      } catch (e) {}
    }

    const fileBuffer = fs.readFileSync(targetFile);
    const pdfBase64 = fileBuffer.toString('base64');

    return res.json({
      success: true,
      filename,
      savedPath: targetFile,
      pdfBase64,
      isExcel: true,
      metrics,
      dictamen,
    });
  } catch (error) {
    console.error('Error generando Auditoría EFOS 69-B:', error);
    return res.status(500).json({ error: error.message || 'Error al generar Auditoría EFOS 69-B' });
  }
});

app.post('/api/clients/:id/cruce-69b/preview', authMiddleware, async (req, res) => {
  try {
    const { year = 2025, month = 0 } = req.body || {};

    const client = await prisma.client.findUnique({
      where: { id: req.params.id },
    });

    if (!client) {
      return res.status(404).json({ error: 'Contribuyente no encontrado' });
    }

    const tempDir = path.join(__dirname, '..', 'scratch', 'temp_tax_runs', `preview_efos_${client.id}_${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    const monthNum = parseInt(month, 10) || 0;
    const yearNum = parseInt(year, 10) || 0;
    const targetJson = path.join(tempDir, `preview_${Date.now()}.json`);
    const pythonExe = getPythonExePath();
    const scriptPath = path.join(__dirname, '..', 'tools', 'facturas', 'rastreador_efos.py');

    const xmlDir = path.join(__dirname, '..', 'scratch', 'xml_storage', client.id);
    const facturasDir = path.join(__dirname, '..', 'scratch', 'facturas_store', client.id);

    let lastStderr = '';
    await new Promise((resolve, reject) => {
      const proc = spawn(pythonExe, [
        scriptPath,
        '--rfc', client.rfc,
        '--year', String(yearNum),
        '--month', String(monthNum),
        '--xml-dir', xmlDir,
        '--facturas-dir', facturasDir,
        '--json-output', targetJson,
      ], {
        cwd: path.join(__dirname, '..'),
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
      });

      proc.stderr.on('data', (d) => { lastStderr += d.toString(); });
      proc.on('close', (code) => {
        if (code === 0 && fs.existsSync(targetJson)) {
          resolve();
        } else {
          reject(new Error(lastStderr || 'Error generando vista previa EFOS 69-B.'));
        }
      });
    });

    const rawJson = fs.readFileSync(targetJson, 'utf-8');
    const data = JSON.parse(rawJson);

    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Error generando vista previa EFOS:', error);
    return res.status(500).json({ error: error.message || 'Error al obtener vista previa EFOS' });
  }
});

app.post('/api/clients/:id/cruce-69b/lookup-rfc', authMiddleware, async (req, res) => {
  try {
    const { rfc } = req.body || {};
    if (!rfc) {
      return res.status(400).json({ error: 'El RFC es requerido para la consulta.' });
    }

    const cleanRfc = String(rfc).toUpperCase().replace(/[^A-Z0-9&Ñ]/g, '');
    const pythonExe = getPythonExePath();

    const pyCode = `
import json, sys
from tools.facturas.sat_efos_validator import check_rfc_efos, get_efos_catalog_stats
res = check_rfc_efos("${cleanRfc}")
stats = get_efos_catalog_stats()
print(json.dumps({"hit": res, "stats": stats}))
`;

    let stdout = '';
    let stderr = '';
    await new Promise((resolve, reject) => {
      const proc = spawn(pythonExe, ['-c', pyCode], {
        cwd: path.join(__dirname, '..'),
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
      });
      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', (d) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(stderr || 'Error en consulta RFC.'));
      });
    });

    const parsed = JSON.parse(stdout.trim());
    return res.json({
      success: true,
      rfc: cleanRfc,
      isEfos: Boolean(parsed.hit),
      efosInfo: parsed.hit,
      catalogStats: parsed.stats,
    });
  } catch (error) {
    console.error('Error consultando RFC en 69-B:', error);
    return res.status(500).json({ error: error.message || 'Error al consultar RFC' });
  }
});

// =========================================================================
// PRE-CÁLCULO DIOT (ART. 32 FRACC. VIII LIVA) — CARGA BATCH SAT + EXCEL
// =========================================================================

app.post('/api/clients/:id/diot/download', authMiddleware, async (req, res) => {
  try {
    const { year = 2025, month = 0, format = 'zip' } = req.body || {};

    const client = await prisma.client.findUnique({
      where: { id: req.params.id },
    });

    if (!client) {
      return res.status(404).json({ error: 'Contribuyente no encontrado' });
    }

    const tempDir = path.join(__dirname, '..', 'scratch', 'temp_tax_runs', `diot_${client.id}_${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const monthNum = parseInt(month, 10) || 0;
    const yearNum = parseInt(year, 10) || 0;
    const periodStr = yearNum === 0 ? '_Consolidado' : (monthNum > 0 && monthNum <= 12 ? `_${yearNum}_${MESES[monthNum]}` : `_${yearNum}_Anual`);

    const excelFile = path.join(tempDir, `Papel_Trabajo_DIOT_${client.rfc}${periodStr}.xlsx`);
    const txtTradFile = path.join(tempDir, `DIOT_DEM_Tradicional_${client.rfc}${periodStr}.txt`);
    const txt2025File = path.join(tempDir, `DIOT_2025_54_Campos_${client.rfc}${periodStr}.txt`);
    const zipFile = path.join(tempDir, `Paquete_DIOT_${client.rfc}${periodStr}.zip`);
    const targetJson = path.join(tempDir, `metrics_${Date.now()}.json`);

    const pythonExe = getPythonExePath();
    const scriptPath = path.join(__dirname, '..', 'tools', 'facturas', 'precalculo_diot.py');

    const xmlDir = path.join(__dirname, '..', 'scratch', 'xml_storage', client.id);
    const facturasDir = path.join(__dirname, '..', 'scratch', 'facturas_store', client.id);

    let lastStderr = '';
    await new Promise((resolve, reject) => {
      const proc = spawn(pythonExe, [
        scriptPath,
        '--rfc', client.rfc,
        '--year', String(yearNum),
        '--month', String(monthNum),
        '--xml-dir', xmlDir,
        '--facturas-dir', facturasDir,
        '--output-excel', excelFile,
        '--output-txt-trad', txtTradFile,
        '--output-txt-2025', txt2025File,
        '--output-zip', zipFile,
        '--json-output', targetJson,
      ], {
        cwd: path.join(__dirname, '..'),
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
      });

      proc.stdout.on('data', (d) => {
        const text = d.toString().trim();
        if (text) console.log(`[DIOT] ${text}`);
      });
      proc.stderr.on('data', (d) => { lastStderr += d.toString(); });
      proc.on('close', (code) => {
        if (code === 0 && (fs.existsSync(excelFile) || fs.existsSync(zipFile))) {
          resolve();
        } else {
          reject(new Error(lastStderr || 'Error generando Pre-cálculo DIOT.'));
        }
      });
    });

    let metrics = null;
    if (fs.existsSync(targetJson)) {
      try {
        const rawJson = fs.readFileSync(targetJson, 'utf-8');
        const parsed = JSON.parse(rawJson);
        metrics = parsed.metricas;
      } catch (e) {}
    }

    let targetDownloadFile = zipFile;
    let filename = path.basename(zipFile);
    let isZip = true;
    let isExcel = false;
    let isTxt = false;

    if (format === 'excel' && fs.existsSync(excelFile)) {
      targetDownloadFile = excelFile;
      filename = path.basename(excelFile);
      isZip = false;
      isExcel = true;
    } else if (format === 'txt2025' && fs.existsSync(txt2025File)) {
      targetDownloadFile = txt2025File;
      filename = path.basename(txt2025File);
      isZip = false;
      isTxt = true;
    } else if (format === 'txtTrad' && fs.existsSync(txtTradFile)) {
      targetDownloadFile = txtTradFile;
      filename = path.basename(txtTradFile);
      isZip = false;
      isTxt = true;
    }

    const fileBuffer = fs.readFileSync(targetDownloadFile);
    const pdfBase64 = fileBuffer.toString('base64');

    return res.json({
      success: true,
      filename,
      savedPath: targetDownloadFile,
      pdfBase64,
      isZip,
      isExcel,
      isTxt,
      metrics,
    });
  } catch (error) {
    console.error('Error generando Pre-cálculo DIOT:', error);
    return res.status(500).json({ error: error.message || 'Error al generar Pre-cálculo DIOT' });
  }
});

app.post('/api/clients/:id/diot/preview', authMiddleware, async (req, res) => {
  try {
    const { year = 2025, month = 0 } = req.body || {};

    const client = await prisma.client.findUnique({
      where: { id: req.params.id },
    });

    if (!client) {
      return res.status(404).json({ error: 'Contribuyente no encontrado' });
    }

    const tempDir = path.join(__dirname, '..', 'scratch', 'temp_tax_runs', `preview_diot_${client.id}_${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    const monthNum = parseInt(month, 10) || 0;
    const yearNum = parseInt(year, 10) || 0;
    const targetJson = path.join(tempDir, `preview_${Date.now()}.json`);
    const pythonExe = getPythonExePath();
    const scriptPath = path.join(__dirname, '..', 'tools', 'facturas', 'precalculo_diot.py');

    const xmlDir = path.join(__dirname, '..', 'scratch', 'xml_storage', client.id);
    const facturasDir = path.join(__dirname, '..', 'scratch', 'facturas_store', client.id);

    let lastStderr = '';
    await new Promise((resolve, reject) => {
      const proc = spawn(pythonExe, [
        scriptPath,
        '--rfc', client.rfc,
        '--year', String(yearNum),
        '--month', String(monthNum),
        '--xml-dir', xmlDir,
        '--facturas-dir', facturasDir,
        '--json-output', targetJson,
      ], {
        cwd: path.join(__dirname, '..'),
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
      });

      proc.stderr.on('data', (d) => { lastStderr += d.toString(); });
      proc.on('close', (code) => {
        if (code === 0 && fs.existsSync(targetJson)) {
          resolve();
        } else {
          reject(new Error(lastStderr || 'Error generando vista previa DIOT.'));
        }
      });
    });

    const rawJson = fs.readFileSync(targetJson, 'utf-8');
    const data = JSON.parse(rawJson);

    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Error generando vista previa DIOT:', error);
    return res.status(500).json({ error: error.message || 'Error al obtener vista previa DIOT' });
  }
});

// ============================================================
// ENDPOINTS VALIDADOR DE CANCELACIONES SAT (ART. 29-A CFF)
// ============================================================
app.post('/api/clients/:id/cancelaciones/preview', authMiddleware, async (req, res) => {
  try {
    const { year = 0, month = 0, scope = 'all', liveCheck = false, maxLive = 150 } = req.body || {};

    const client = await prisma.client.findUnique({
      where: { id: req.params.id },
    });

    if (!client) {
      return res.status(404).json({ error: 'Contribuyente no encontrado' });
    }

    const tempDir = path.join(__dirname, '..', 'scratch', 'temp_tax_runs', `canc_prev_${client.id}_${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    const monthNum = parseInt(month, 10) || 0;
    const yearNum = parseInt(year, 10) || 0;
    const targetJson = path.join(tempDir, `preview_${Date.now()}.json`);
    const pythonExe = getPythonExePath();
    const scriptPath = path.join(__dirname, '..', 'tools', 'facturas', 'validador_cancelaciones.py');

    const xmlDir = path.join(__dirname, '..', 'scratch', 'xml_storage', client.id);
    const facturasDir = path.join(__dirname, '..', 'scratch', 'facturas_store', client.id);

    const scriptArgs = [
      scriptPath,
      '--rfc', client.rfc,
      '--year', String(yearNum),
      '--month', String(monthNum),
      '--scope', String(scope || 'all'),
      '--xml-dir', xmlDir,
      '--facturas-dir', facturasDir,
      '--json-output', targetJson,
    ];

    if (liveCheck) {
      scriptArgs.push('--live-check');
      scriptArgs.push('--max-live');
      scriptArgs.push(String(maxLive || 150));
    }

    let lastStderr = '';
    await new Promise((resolve, reject) => {
      const proc = spawn(pythonExe, scriptArgs, {
        cwd: path.join(__dirname, '..'),
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
      });

      proc.stdout.on('data', (d) => {
        const text = d.toString().trim();
        if (text) console.log(`[CANCELACIONES] ${text}`);
      });
      proc.stderr.on('data', (d) => { lastStderr += d.toString(); });
      proc.on('close', (code) => {
        if (code === 0 && fs.existsSync(targetJson)) {
          resolve();
        } else {
          reject(new Error(lastStderr || 'Error en auditoría de cancelaciones.'));
        }
      });
    });

    const rawJson = fs.readFileSync(targetJson, 'utf-8');
    const data = JSON.parse(rawJson);

    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Error en vista previa de cancelaciones:', error);
    return res.status(500).json({ error: error.message || 'Error al obtener auditoría de cancelaciones' });
  }
});

app.post('/api/clients/:id/cancelaciones/download', authMiddleware, async (req, res) => {
  try {
    const { year = 0, month = 0, scope = 'all' } = req.body || {};

    const client = await prisma.client.findUnique({
      where: { id: req.params.id },
    });

    if (!client) {
      return res.status(404).json({ error: 'Contribuyente no encontrado' });
    }

    const tempDir = path.join(__dirname, '..', 'scratch', 'temp_tax_runs', `canc_down_${client.id}_${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const monthNum = parseInt(month, 10) || 0;
    const yearNum = parseInt(year, 10) || 0;
    const periodStr = yearNum === 0 ? '_Consolidado' : (monthNum > 0 && monthNum <= 12 ? `_${yearNum}_${MESES[monthNum]}` : `_${yearNum}_Anual`);

    const excelFile = path.join(tempDir, `Auditoria_Cancelaciones_SAT_${client.rfc}${periodStr}.xlsx`);
    const targetJson = path.join(tempDir, `metrics_${Date.now()}.json`);

    const pythonExe = getPythonExePath();
    const scriptPath = path.join(__dirname, '..', 'tools', 'facturas', 'validador_cancelaciones.py');

    const xmlDir = path.join(__dirname, '..', 'scratch', 'xml_storage', client.id);
    const facturasDir = path.join(__dirname, '..', 'scratch', 'facturas_store', client.id);

    let lastStderr = '';
    await new Promise((resolve, reject) => {
      const proc = spawn(pythonExe, [
        scriptPath,
        '--rfc', client.rfc,
        '--year', String(yearNum),
        '--month', String(monthNum),
        '--scope', String(scope || 'all'),
        '--xml-dir', xmlDir,
        '--facturas-dir', facturasDir,
        '--output-excel', excelFile,
        '--json-output', targetJson,
      ], {
        cwd: path.join(__dirname, '..'),
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
      });

      proc.stdout.on('data', (d) => {
        const text = d.toString().trim();
        if (text) console.log(`[CANCELACIONES] ${text}`);
      });
      proc.stderr.on('data', (d) => { lastStderr += d.toString(); });
      proc.on('close', (code) => {
        if (code === 0 && fs.existsSync(excelFile)) {
          resolve();
        } else {
          reject(new Error(lastStderr || 'Error generando dictamen de cancelaciones.'));
        }
      });
    });

    let metrics = null;
    if (fs.existsSync(targetJson)) {
      try {
        const rawJson = fs.readFileSync(targetJson, 'utf-8');
        metrics = JSON.parse(rawJson);
      } catch (e) {}
    }

    const fileBuffer = fs.readFileSync(excelFile);
    const pdfBase64 = fileBuffer.toString('base64');
    const filename = path.basename(excelFile);

    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}

    return res.json({
      success: true,
      filename,
      savedPath: excelFile,
      pdfBase64,
      isExcel: true,
      metrics,
    });
  } catch (error) {
    console.error('Error descargando dictamen de cancelaciones:', error);
    return res.status(500).json({ error: error.message || 'Error al descargar dictamen de cancelaciones' });
  }
});

app.post('/api/clients/:id/analisis-iva-isr/preview', authMiddleware, async (req, res) => {
  try {
    const {
      year = 2026,
      month = 0,
      zone = 'general',
      regime = '612',
      arrendamientoOpcion = 'ciega',
    } = req.body || {};

    const client = await prisma.client.findUnique({
      where: { id: req.params.id },
    });

    if (!client) {
      return res.status(404).json({ error: 'Contribuyente no encontrado' });
    }

    const tempDir = path.join(__dirname, '..', 'scratch', 'temp_tax_runs', `preview_${client.id}_${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    const targetFile = path.join(tempDir, 'preview.xlsx');

    const clientStoreDir = path.join(__dirname, '..', 'scratch', 'facturas_store', client.id);
    const clientXmlDir = path.join(__dirname, '..', 'scratch', 'xml_storage', client.id);
    fs.mkdirSync(clientStoreDir, { recursive: true });
    fs.mkdirSync(clientXmlDir, { recursive: true });

    const emitidasFile = path.join(clientStoreDir, `${year}_emitidas.json`);
    const recibidasFile = path.join(clientStoreDir, `${year}_recibidas.json`);
    const metaFile = path.join(clientStoreDir, `${year}_meta.json`);
    const hasXmlFiles = fs.existsSync(clientXmlDir) && fs.readdirSync(clientXmlDir).some(f => f.endsWith('.xml') || f.endsWith('.zip'));
    const hasSyncData = fs.existsSync(emitidasFile) || fs.existsSync(recibidasFile) || fs.existsSync(metaFile) || hasXmlFiles;

    if (!hasSyncData && !req.body.force) {
      // Sin sincronización previa para este ejercicio: devolver tablero limpio en ceros ($0.00)
      const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      return res.json({
        success: true,
        metrics: {
          has_real_data: false,
          ingresos: 0,
          gastos: 0,
          iva_trasladado: 0,
          iva_acreditable: 0,
          saldo_iva: 0,
          utilidad_isr: 0,
          retencion_iva: 0,
          retencion_isr: 0,
          regime,
          is_resico: regime === 'resico' || regime === '626',
          mensual: Array.from({ length: 12 }, (_, i) => ({
            mes: i + 1,
            nombre: MESES[i + 1],
            ingresos: 0,
            ventas_16: 0,
            ventas_8: 0,
            gastos: 0,
            compras_16: 0,
            compras_8: 0,
            iva_trasladado: 0,
            iva_acreditable: 0,
            saldo_iva: 0,
            ret_iva: 0,
            ret_isr: 0,
            utilidad_isr: 0,
          })),
          retenciones: [],
          detalle_gastos: [],
        },
      });
    }

    const monthNum = (month === 'all' || !month) ? 0 : (parseInt(month, 10) || 0);
    let safeZone = 'general';
    if (zone === 'fronteriza_norte' || zone === 'fronteriza_sur') {
      safeZone = zone;
    }

    const pythonExe = getPythonExePath();

    const scriptPath = path.join(__dirname, '..', 'tools', 'facturas', 'analisis_iva_isr.py');

    let extractedMetrics = null;
    let lastStderr = '';
    const metricsJsonFile = `${targetFile}.metrics.json`;

    await new Promise((resolve, reject) => {
      const proc = spawn(pythonExe, [
        scriptPath,
        '--year', String(year),
        '--month', String(monthNum),
        '--zone', safeZone,
        '--type', 'completo',
        '--regime', regime,
        '--arrendamiento-opcion', String(arrendamientoOpcion || 'ciega'),
        '--invoices-dir', clientStoreDir,
        '--xml-dir', clientXmlDir,
        '--rfc', client.rfc,
        '--metrics-json', metricsJsonFile,
        '--output', targetFile
      ], {
        cwd: path.join(__dirname, '..'),
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
      });

      const rl = readline.createInterface({ input: proc.stdout });
      rl.on('line', (line) => {
        line = line.trim();
        if (!line) return;
        try {
          const parsed = JSON.parse(line);
          if (parsed && parsed.type === 'completed' && parsed.metrics) {
            extractedMetrics = parsed.metrics;
          }
        } catch (e) {}
      });

      proc.stderr.on('data', (d) => { lastStderr += d.toString(); });
      proc.on('close', (code) => {
        if (!extractedMetrics && fs.existsSync(metricsJsonFile)) {
          try {
            const diskData = JSON.parse(fs.readFileSync(metricsJsonFile, 'utf-8'));
            if (diskData && diskData.metrics) {
              extractedMetrics = diskData.metrics;
            }
          } catch (e) {}
        }
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}

        if (code === 0 && extractedMetrics) {
          resolve();
        } else {
          reject(new Error(lastStderr || 'Error al calcular la vista previa del análisis.'));
        }
      });
    });

    if (extractedMetrics && hasSyncData) {
      extractedMetrics.has_real_data = true;
      extractedMetrics.is_synced = true;
    }

    return res.json({
      success: true,
      metrics: extractedMetrics,
    });
  } catch (error) {
    console.error('Error en vista previa de Análisis de IVA e ISR:', error);
    return res.status(500).json({ error: error.message || 'Error en vista previa de Análisis' });
  }
});

app.get('/api/clients/:id/analisis-iva-isr/sync-status', authMiddleware, async (req, res) => {
  try {
    const clientId = req.params.id;
    const year = req.query.year || '2026';
    const job = getOrCreateAnalisisSyncJob(clientId);

    const clientStoreDir = path.join(__dirname, '..', 'scratch', 'facturas_store', clientId);
    const metaFile = path.join(clientStoreDir, `${year}_meta.json`);
    let storedMeta = null;
    if (fs.existsSync(metaFile)) {
      try {
        storedMeta = JSON.parse(fs.readFileSync(metaFile, 'utf-8'));
      } catch (e) {}
    }

    const clientXmlDir = path.join(__dirname, '..', 'scratch', 'xml_storage', clientId);
    const xmlCount = fs.existsSync(clientXmlDir)
      ? fs.readdirSync(clientXmlDir).filter(f => f.endsWith('.xml') || f.endsWith('.zip')).length
      : 0;

    const emitidasFile = path.join(clientStoreDir, `${year}_emitidas.json`);
    const recibidasFile = path.join(clientStoreDir, `${year}_recibidas.json`);
    const hasStoredData = fs.existsSync(emitidasFile) || fs.existsSync(recibidasFile) || xmlCount > 0;

    if (!storedMeta && xmlCount > 0) {
      storedMeta = {
        lastSync: new Date().toISOString(),
        year,
        emitidasCount: 0,
        recibidasCount: xmlCount,
        source: 'xml_storage'
      };
    }

    return res.json({
      success: true,
      job: {
        status: job.status === 'running' ? 'running' : 'idle',
        progress: job.status === 'running' ? job.progress : 0,
        logs: job.logs.slice(-25),
        error: job.status === 'running' ? job.error : null,
        year: job.year,
      },
      storedMeta,
      hasStoredData,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/clients/:id/analisis-iva-isr/sync-events', authMiddleware, (req, res) => {
  const clientId = req.params.id;
  const job = getOrCreateAnalisisSyncJob(clientId);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  job.subscribers.add(res);

  // Enviar estado inicial inmediato
  const initial = JSON.stringify({
    type: 'init',
    status: job.status,
    progress: job.progress,
    logs: job.logs.slice(-30),
    result: job.result,
    error: job.error,
    year: job.year,
  });
  res.write(`data: ${initial}\n\n`);

  req.on('close', () => {
    job.subscribers.delete(res);
  });
});

app.post('/api/clients/:id/analisis-iva-isr/sync-sat', authMiddleware, async (req, res) => {
  try {
    const { year = 2026, month = 'all' } = req.body || {};
    const clientId = req.params.id;

    const client = await prisma.client.findUnique({
      where: { id: clientId },
    });

    if (!client) {
      return res.status(404).json({ error: 'Contribuyente no encontrado.' });
    }

    if (!client.cerFile || !client.keyFile || !client.password) {
      return res.status(400).json({
        error: 'El contribuyente no cuenta con e.firma completa (.cer, .key y contraseña) registrada para conectarse con el SAT.'
      });
    }

    const job = getOrCreateAnalisisSyncJob(clientId);

    if (job.status === 'running') {
      return res.json({
        success: true,
        message: 'La sincronización con el SAT ya se encuentra en curso.',
        status: 'running',
      });
    }

    // Inicializar job
    job.status = 'running';
    job.progress = 5;
    job.logs = [`[${new Date().toLocaleTimeString()}] Iniciando sesión segura en Portal del SAT para ${client.rfc} (${client.name})...`];
    job.year = year;
    job.month = month;
    job.error = null;
    job.result = null;
    broadcastAnalisisSync(job, 'start');

    // Responder de inmediato al cliente HTTP
    res.json({
      success: true,
      message: 'Sincronización oficial iniciada en segundo plano.',
      status: 'running',
    });

    // Ejecutar en segundo plano
    (async () => {
      const tempDir = path.join(__dirname, '..', 'scratch', 'temp_sat_sync', `${client.id}_${Date.now()}`);
      const clientStoreDir = path.join(__dirname, '..', 'scratch', 'facturas_store', client.id);
      fs.mkdirSync(tempDir, { recursive: true });
      fs.mkdirSync(clientStoreDir, { recursive: true });

      try {
        job.progress = 10;
        job.logs.push(`[${new Date().toLocaleTimeString()}] Conectando con el SAT en segundo plano...`);
        broadcastAnalisisSync(job, 'progress');

        const syncResult = await runFacturasExtraction({
          client,
          tipo: 'ambos',
          year,
          month,
          tempDir,
          fastSync: true,
          downloadFiles: false,
          onSpawn: (proc) => {
            job.childProcess = proc;
          },
          onLog: (msg) => {
            job.logs.push(msg);
            if (job.logs.length > 200) job.logs.shift();
            broadcastAnalisisSync(job, 'log');
          },
          onProgress: (p) => {
            job.progress = Math.max(job.progress || 10, Math.min(95, Math.round(p)));
            broadcastAnalisisSync(job, 'progress');
          }
        });

        const emitidasList = (syncResult && syncResult.emitidas) || [];
        const recibidasList = (syncResult && syncResult.recibidas) || [];

        // Guardar JSON de emitidas
        const emitidasPath = path.join(clientStoreDir, `${year}_emitidas.json`);
        fs.writeFileSync(emitidasPath, JSON.stringify(emitidasList, null, 2), 'utf-8');

        // Guardar JSON de recibidas
        const recibidasPath = path.join(clientStoreDir, `${year}_recibidas.json`);
        fs.writeFileSync(recibidasPath, JSON.stringify(recibidasList, null, 2), 'utf-8');

        // Guardar metadata
        const meta = {
          lastSync: new Date().toISOString(),
          rfc: client.rfc,
          year,
          emitidasCount: emitidasList.length,
          recibidasCount: recibidasList.length,
        };
        fs.writeFileSync(path.join(clientStoreDir, `${year}_meta.json`), JSON.stringify(meta, null, 2), 'utf-8');

        job.progress = 100;
        job.status = 'completed';
        job.result = meta;
        job.logs.push(`[${new Date().toLocaleTimeString()}] ✅ Sincronización oficial finalizada con éxito (${emitidasList.length} emitidas, ${recibidasList.length} recibidas).`);
        broadcastAnalisisSync(job, 'completed', meta);
      } catch (err) {
        if (job.isCancelled) {
          job.status = 'idle';
          job.progress = 0;
          job.error = null;
          broadcastAnalisisSync(job, 'stopped');
          return;
        }
        console.error('Error en sincronización SAT en segundo plano:', err);
        job.status = 'failed';
        let cleanErr = err.message || 'Error durante la comunicación con el SAT.';
        if (cleanErr.includes('Ha ocurrido un error al procesar su última acción') || cleanErr.includes('referencia')) {
          cleanErr = 'El servidor del SAT reportó una interrupción temporal en la sesión ("Ha ocurrido un error al procesar su última acción"). Se reinició el entorno y cookies de forma limpia para que puedas reintentar.';
        }
        job.error = cleanErr;
        job.logs.push(`[${new Date().toLocaleTimeString()}] ❌ Error: ${job.error}`);
        broadcastAnalisisSync(job, 'error', { error: job.error });
      } finally {
        job.childProcess = null;
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (e) {}
      }
    })();
  } catch (error) {
    console.error('Error iniciando sync-sat:', error);
    return res.status(500).json({ error: error.message || 'Error al iniciar sincronización.' });
  }
});

app.post('/api/clients/:id/analisis-iva-isr/sync-cancel', authMiddleware, (req, res) => {
  const clientId = req.params.id;
  const job = analisisSyncJobs.get(clientId);
  if (job) {
    job.isCancelled = true;
    if (job.childProcess) {
      try {
        const pid = job.childProcess.pid;
        if (process.platform === 'win32' && pid) {
          try {
            spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true });
          } catch (e) {}
        } else {
          job.childProcess.kill('SIGTERM');
        }
      } catch (e) {}
      job.childProcess = null;
    }
    job.status = 'idle';
    job.progress = 0;
    job.error = null;
    job.logs.push(`[${new Date().toLocaleTimeString()}] 🛑 Sincronización cancelada por el usuario.`);
    broadcastAnalisisSync(job, 'stopped');
  }
  res.json({ success: true, message: 'Sincronización cancelada exitosamente.' });
});

app.get('/api/documentacion-tecnica-pdf', (req, res) => {
  const pdfPath = path.join(__dirname, '..', 'Documentacion_Tecnica_Extraccion_CFDI_SAT.pdf');
  if (!fs.existsSync(pdfPath)) {
    return res.status(404).json({ error: 'Documento PDF no encontrado' });
  }
  res.download(pdfPath, 'Documentacion_Tecnica_Extraccion_CFDI_SAT.pdf');
});

app.post('/api/clients/:id/analisis-iva-isr/upload-xml', authMiddleware, upload.array('files'), async (req, res) => {
  try {
    const client = await prisma.client.findUnique({
      where: { id: req.params.id },
    });

    if (!client) {
      return res.status(404).json({ error: 'Contribuyente no encontrado' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No se recibieron archivos XML o ZIP.' });
    }

    const xmlStorageDir = path.join(__dirname, '..', 'scratch', 'xml_storage', client.id);
    fs.mkdirSync(xmlStorageDir, { recursive: true });

    let count = 0;
    for (const file of req.files) {
      const destPath = path.join(xmlStorageDir, `${Date.now()}_${file.originalname}`);
      fs.writeFileSync(destPath, file.buffer);
      count++;
    }

    return res.json({
      success: true,
      message: `${count} archivo(s) XML / ZIP cargado(s) exitosamente para ${client.rfc}.`,
      count,
    });
  } catch (error) {
    console.error('Error al subir archivos XML:', error);
    return res.status(500).json({ error: error.message || 'Error al guardar los archivos XML.' });
  }
});

app.post('/api/clients/:id/resumen-nominas/upload-xml', authMiddleware, upload.array('files'), async (req, res) => {
  try {
    const client = await prisma.client.findUnique({
      where: { id: req.params.id },
    });

    if (!client) {
      return res.status(404).json({ error: 'Contribuyente no encontrado' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No se recibieron archivos XML o ZIP.' });
    }

    const xmlStorageDir = path.join(__dirname, '..', 'scratch', 'xml_nominas', client.id);
    fs.mkdirSync(xmlStorageDir, { recursive: true });

    let count = 0;
    for (const file of req.files) {
      const destPath = path.join(xmlStorageDir, `${Date.now()}_${file.originalname}`);
      fs.writeFileSync(destPath, file.buffer);
      count++;
    }

    return res.json({
      success: true,
      message: `${count} recibo(s) de nómina cargado(s) exitosamente para ${client.rfc}.`,
      count,
    });
  } catch (error) {
    console.error('Error al subir archivos de nómina:', error);
    return res.status(500).json({ error: error.message || 'Error al guardar los archivos de nómina.' });
  }
});

app.post('/api/clients/:id/resumen-nominas/preview', authMiddleware, async (req, res) => {
  try {
    const { year = 2026, month = 0 } = req.body || {};
    const monthNum = (month === 'all' || !month) ? 0 : (parseInt(month, 10) || 0);
    const client = await prisma.client.findUnique({
      where: { id: req.params.id },
    });
    if (!client) {
      return res.status(404).json({ error: 'Contribuyente no encontrado' });
    }

    const tempDir = path.join(__dirname, '..', 'scratch', 'temp_tax_runs', `rn_prev_${client.id}_${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    const jsonOutput = path.join(tempDir, 'resumen_nominas_preview.json');

    const pythonExe = getPythonExePath();
    const scriptPath = path.join(__dirname, '..', 'tools', 'nominas', 'resumen_nominas.py');
    let xmlDir = findClientXmlDirectory(client.id, client.rfc, 'nominas');

    let lastStderr = '';
    let previewData = null;

    await new Promise((resolve, reject) => {
      const proc = spawn(pythonExe, [
        scriptPath,
        '--year', String(year),
        '--month', String(monthNum),
        '--xml-dir', xmlDir,
        '--rfc', client.rfc,
        '--preview',
        '--json-output', jsonOutput
      ], {
        cwd: path.join(__dirname, '..'),
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
      });

      proc.stdout.on('data', (d) => {
        const lines = d.toString().split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const parsed = JSON.parse(trimmed);
            if (parsed.type === 'preview_result' && parsed.data) {
              previewData = parsed.data;
            }
          } catch (e) {}
        }
      });
      proc.stderr.on('data', (d) => { lastStderr += d.toString(); });
      proc.on('close', (code) => {
        if (fs.existsSync(jsonOutput)) {
          try {
            previewData = JSON.parse(fs.readFileSync(jsonOutput, 'utf-8'));
          } catch (e) {}
        }
        if (previewData) {
          resolve();
        } else if (code === 0) {
          resolve();
        } else {
          reject(new Error(lastStderr || 'Error generando preview de Resumen de Nóminas'));
        }
      });
    });

    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}

    return res.json({
      success: true,
      year: parseInt(year, 10),
      month: parseInt(month, 10),
      data: previewData || { metricas: {}, mensual: [], trabajadores: [] },
      ...(previewData || { metricas: {}, mensual: [], trabajadores: [] })
    });
  } catch (error) {
    console.error('Error generando preview de Resumen de Nóminas:', error);
    return res.status(500).json({ error: error.message || 'Error al obtener preview de Resumen de Nóminas' });
  }
});

app.post('/api/clients/:id/resumen-nominas/download', authMiddleware, async (req, res) => {
  try {
    const { year = 2026, month = 0 } = req.body || {};

    const client = await prisma.client.findUnique({
      where: { id: req.params.id },
    });

    if (!client) {
      return res.status(404).json({ error: 'Contribuyente no encontrado' });
    }

    const tempDir = path.join(__dirname, '..', 'scratch', 'temp_tax_runs', `nominas_${client.id}_${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const monthNum = parseInt(month, 10) || 0;
    const periodStr = monthNum > 0 && monthNum <= 12 ? `_${MESES[monthNum]}` : '_Anual';

    const filename = `Resumen_Nominas_${client.rfc}_${year}${periodStr}.xlsx`;
    const targetFile = path.join(tempDir, filename);
    const pythonExe = getPythonExePath();
    const scriptPath = path.join(__dirname, '..', 'tools', 'nominas', 'resumen_nominas.py');

    let lastStderr = '';
    let xmlDir = findClientXmlDirectory(client.id, client.rfc, 'nominas');

    await new Promise((resolve, reject) => {
      const proc = spawn(pythonExe, [
        scriptPath,
        '--year', String(year),
        '--month', String(monthNum),
        '--xml-dir', xmlDir,
        '--output', targetFile
      ], {
        cwd: path.join(__dirname, '..'),
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
      });

      proc.stdout.on('data', (d) => {
        const text = d.toString().trim();
        if (text) {
          console.log(`[RESUMEN NOMINAS] ${text}`);
        }
      });
      proc.stderr.on('data', (d) => { lastStderr += d.toString(); });
      proc.on('close', (code) => {
        if (code === 0 && fs.existsSync(targetFile)) {
          resolve();
        } else {
          reject(new Error(lastStderr || 'Error generando Resumen de Nóminas.'));
        }
      });
    });

    const fileBuffer = fs.readFileSync(targetFile);
    const pdfBase64 = fileBuffer.toString('base64');

    return res.json({
      success: true,
      filename,
      savedPath: targetFile,
      pdfBase64,
      isExcel: true,
    });
  } catch (error) {
    console.error('Error generando Resumen Nominas:', error);
    return res.status(500).json({ error: error.message || 'Error al generar Resumen de Nóminas' });
  }
});

// ============================================================
// 1. Confronta Visor del SAT vs. CFDI (Detección de Discrepancias)
// ============================================================
app.post('/api/clients/:id/confronta-sat/preview', authMiddleware, async (req, res) => {
  try {
    const { year = 2026 } = req.body || {};
    const client = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!client) return res.status(404).json({ error: 'Contribuyente no encontrado' });

    const tempDir = path.join(__dirname, '..', 'scratch', 'temp_tax_runs', `conf_prev_${client.id}_${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    const jsonOutput = path.join(tempDir, 'confronta_preview.json');

    const pythonExe = getPythonExePath();
    const scriptPath = path.join(__dirname, '..', 'tools', 'auditoria', 'confronta_sat.py');
    let xmlDir = path.join(__dirname, '..', 'scratch', 'xml_storage', client.id);
    if (!fs.existsSync(xmlDir) || fs.readdirSync(xmlDir).filter(f => f.endsWith('.xml')).length === 0) {
      const rfcDir = path.join(__dirname, '..', 'scratch', 'xml_storage', client.rfc || '');
      if (fs.existsSync(rfcDir) && fs.readdirSync(rfcDir).filter(f => f.endsWith('.xml')).length > 0) {
        xmlDir = rfcDir;
      } else {
        const fallbackScratch = path.join(__dirname, '..', 'scratch');
        if (fs.existsSync(fallbackScratch) && fs.readdirSync(fallbackScratch).some(f => f.endsWith('.xml'))) {
          xmlDir = fallbackScratch;
        }
      }
    }

    const facturasDir = path.join(__dirname, '..', 'scratch', 'facturas_store', client.id);
    const facturasDirRfc = path.join(__dirname, '..', 'scratch', 'facturas_store', client.rfc || '');
    const activeFacturasDir = (fs.existsSync(facturasDir) && fs.readdirSync(facturasDir).length > 0)
      ? facturasDir
      : (fs.existsSync(facturasDirRfc) && fs.readdirSync(facturasDirRfc).length > 0)
        ? facturasDirRfc
        : '';

    let lastStderr = '';
    let previewData = null;

    await new Promise((resolve, reject) => {
      const proc = spawn(pythonExe, [
        scriptPath,
        '--year', String(year),
        '--xml-dir', xmlDir,
        '--facturas-dir', activeFacturasDir,
        '--rfc', client.rfc || '',
        '--name', client.name || 'Contribuyente',
        '--preview',
        '--json-output', jsonOutput
      ], {
        cwd: path.join(__dirname, '..'),
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
      });

      proc.stdout.on('data', (d) => {
        const lines = d.toString().split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const parsed = JSON.parse(trimmed);
            if (parsed.type === 'preview_result' && parsed.data) {
              previewData = parsed.data;
            }
          } catch (e) {}
        }
      });
      proc.stderr.on('data', (d) => { lastStderr += d.toString(); });
      proc.on('close', (code) => {
        if (fs.existsSync(jsonOutput)) {
          try { previewData = JSON.parse(fs.readFileSync(jsonOutput, 'utf-8')); } catch (e) {}
        }
        if (previewData || code === 0) resolve();
        else reject(new Error(lastStderr || 'Error generando preview de Confronta SAT'));
      });
    });

    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}

    return res.json({
      success: true,
      year: parseInt(year, 10),
      data: previewData,
      ...(previewData || {})
    });
  } catch (error) {
    console.error('Error generando preview Confronta SAT:', error);
    return res.status(500).json({ error: error.message || 'Error en Confronta SAT' });
  }
});

app.post('/api/clients/:id/confronta-sat/download', authMiddleware, async (req, res) => {
  try {
    const { year = 2026 } = req.body || {};
    const client = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!client) return res.status(404).json({ error: 'Contribuyente no encontrado' });

    const tempDir = path.join(__dirname, '..', 'scratch', 'temp_tax_runs', `conf_dl_${client.id}_${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    const filename = `Confronta_Visor_SAT_${client.rfc}_${year}.xlsx`;
    const targetFile = path.join(tempDir, filename);
    const pythonExe = getPythonExePath();
    const scriptPath = path.join(__dirname, '..', 'tools', 'auditoria', 'confronta_sat.py');
    let xmlDir = path.join(__dirname, '..', 'scratch', 'xml_storage', client.id);
    if (!fs.existsSync(xmlDir) || fs.readdirSync(xmlDir).filter(f => f.endsWith('.xml')).length === 0) {
      const rfcDir = path.join(__dirname, '..', 'scratch', 'xml_storage', client.rfc || '');
      if (fs.existsSync(rfcDir) && fs.readdirSync(rfcDir).filter(f => f.endsWith('.xml')).length > 0) {
        xmlDir = rfcDir;
      } else {
        const fallbackScratch = path.join(__dirname, '..', 'scratch');
        if (fs.existsSync(fallbackScratch) && fs.readdirSync(fallbackScratch).some(f => f.endsWith('.xml'))) {
          xmlDir = fallbackScratch;
        }
      }
    }

    const facturasDir = path.join(__dirname, '..', 'scratch', 'facturas_store', client.id);
    const facturasDirRfc = path.join(__dirname, '..', 'scratch', 'facturas_store', client.rfc || '');
    const activeFacturasDir = (fs.existsSync(facturasDir) && fs.readdirSync(facturasDir).length > 0)
      ? facturasDir
      : (fs.existsSync(facturasDirRfc) && fs.readdirSync(facturasDirRfc).length > 0)
        ? facturasDirRfc
        : '';

    let lastStderr = '';
    await new Promise((resolve, reject) => {
      const proc = spawn(pythonExe, [
        scriptPath,
        '--year', String(year),
        '--xml-dir', xmlDir,
        '--facturas-dir', activeFacturasDir,
        '--rfc', client.rfc || '',
        '--name', client.name || 'Contribuyente',
        '--output', targetFile
      ], {
        cwd: path.join(__dirname, '..'),
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
      });
      proc.stderr.on('data', (d) => { lastStderr += d.toString(); });
      proc.on('close', (code) => {
        if (code === 0 && fs.existsSync(targetFile)) resolve();
        else reject(new Error(lastStderr || 'Error generando Cédula de Confronta SAT.'));
      });
    });

    const fileBuffer = fs.readFileSync(targetFile);
    const pdfBase64 = fileBuffer.toString('base64');
    return res.json({ success: true, filename, savedPath: targetFile, pdfBase64, isExcel: true });
  } catch (error) {
    console.error('Error descargando Confronta SAT:', error);
    return res.status(500).json({ error: error.message || 'Error al descargar Confronta SAT' });
  }
});

// ============================================================
// 2. Conciliación Bancaria vs. CFDI (Art. 59 CFF y Art. 5 LIVA)
// ============================================================
app.post('/api/clients/:id/conciliacion-bancaria/upload-estado-cuenta', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    const client = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!client) return res.status(404).json({ error: 'Contribuyente no encontrado' });
    if (!req.file) return res.status(400).json({ error: 'No se recibió archivo de estado de cuenta.' });

    const bankDir = path.join(__dirname, '..', 'scratch', 'bancos', client.id);
    fs.mkdirSync(bankDir, { recursive: true });

    const ext = path.extname(req.file.originalname) || '.xlsx';
    const destPath = path.join(bankDir, `estado_cuenta_${Date.now()}${ext}`);
    fs.writeFileSync(destPath, req.file.buffer);

    return res.json({
      success: true,
      filename: req.file.originalname,
      savedPath: destPath,
      message: 'Estado de cuenta bancario cargado con éxito para conciliación.'
    });
  } catch (error) {
    console.error('Error al subir estado de cuenta bancario:', error);
    return res.status(500).json({ error: error.message || 'Error al guardar estado de cuenta.' });
  }
});

app.post('/api/clients/:id/conciliacion-bancaria/preview', authMiddleware, async (req, res) => {
  try {
    const { year = 2026 } = req.body || {};
    const client = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!client) return res.status(404).json({ error: 'Contribuyente no encontrado' });

    const tempDir = path.join(__dirname, '..', 'scratch', 'temp_tax_runs', `banco_prev_${client.id}_${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    const jsonOutput = path.join(tempDir, 'conciliacion_preview.json');

    const bankDir = path.join(__dirname, '..', 'scratch', 'bancos', client.id);
    let bankFile = '';
    if (fs.existsSync(bankDir)) {
      const files = fs.readdirSync(bankDir).filter(f => f.endsWith('.xlsx') || f.endsWith('.xls') || f.endsWith('.csv'));
      if (files.length > 0) {
        files.sort((a, b) => fs.statSync(path.join(bankDir, b)).mtimeMs - fs.statSync(path.join(bankDir, a)).mtimeMs);
        bankFile = path.join(bankDir, files[0]);
      }
    }

    const pythonExe = getPythonExePath();
    const scriptPath = path.join(__dirname, '..', 'tools', 'bancos', 'conciliacion_bancaria.py');
    let xmlDir = path.join(__dirname, '..', 'scratch', 'xml_storage', client.id);
    if (!fs.existsSync(xmlDir) || fs.readdirSync(xmlDir).filter(f => f.endsWith('.xml')).length === 0) {
      const fallbackScratch = path.join(__dirname, '..', 'scratch');
      if (fs.existsSync(fallbackScratch) && fs.readdirSync(fallbackScratch).some(f => f.endsWith('.xml'))) {
        xmlDir = fallbackScratch;
      }
    }

    const runArgs = [
      scriptPath,
      '--year', String(year),
      '--xml-dir', xmlDir,
      '--rfc', client.rfc || '',
      '--name', client.name || 'Contribuyente',
      '--preview',
      '--json-output', jsonOutput
    ];
    if (bankFile) {
      runArgs.push('--bank-file', bankFile);
    }

    let lastStderr = '';
    let previewData = null;

    await new Promise((resolve, reject) => {
      const proc = spawn(pythonExe, runArgs, {
        cwd: path.join(__dirname, '..'),
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
      });
      proc.stdout.on('data', (d) => {
        const lines = d.toString().split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const parsed = JSON.parse(trimmed);
            if (parsed.type === 'preview_result' && parsed.data) {
              previewData = parsed.data;
            }
          } catch (e) {}
        }
      });
      proc.stderr.on('data', (d) => { lastStderr += d.toString(); });
      proc.on('close', (code) => {
        if (fs.existsSync(jsonOutput)) {
          try { previewData = JSON.parse(fs.readFileSync(jsonOutput, 'utf-8')); } catch (e) {}
        }
        if (previewData || code === 0) resolve();
        else reject(new Error(lastStderr || 'Error en conciliación bancaria'));
      });
    });

    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}

    return res.json({
      success: true,
      year: parseInt(year, 10),
      data: previewData,
      ...(previewData || {})
    });
  } catch (error) {
    console.error('Error generando preview de Conciliación Bancaria:', error);
    return res.status(500).json({ error: error.message || 'Error en Conciliación Bancaria' });
  }
});

app.post('/api/clients/:id/conciliacion-bancaria/download', authMiddleware, async (req, res) => {
  try {
    const { year = 2026 } = req.body || {};
    const client = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!client) return res.status(404).json({ error: 'Contribuyente no encontrado' });

    const tempDir = path.join(__dirname, '..', 'scratch', 'temp_tax_runs', `banco_dl_${client.id}_${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    const filename = `Conciliacion_Bancaria_${client.rfc}_${year}.xlsx`;
    const targetFile = path.join(tempDir, filename);

    const bankDir = path.join(__dirname, '..', 'scratch', 'bancos', client.id);
    let bankFile = '';
    if (fs.existsSync(bankDir)) {
      const files = fs.readdirSync(bankDir).filter(f => f.endsWith('.xlsx') || f.endsWith('.xls') || f.endsWith('.csv'));
      if (files.length > 0) {
        files.sort((a, b) => fs.statSync(path.join(bankDir, b)).mtimeMs - fs.statSync(path.join(bankDir, a)).mtimeMs);
        bankFile = path.join(bankDir, files[0]);
      }
    }

    const pythonExe = getPythonExePath();
    const scriptPath = path.join(__dirname, '..', 'tools', 'bancos', 'conciliacion_bancaria.py');
    let xmlDir = path.join(__dirname, '..', 'scratch', 'xml_storage', client.id);
    if (!fs.existsSync(xmlDir) || fs.readdirSync(xmlDir).filter(f => f.endsWith('.xml')).length === 0) {
      const fallbackScratch = path.join(__dirname, '..', 'scratch');
      if (fs.existsSync(fallbackScratch) && fs.readdirSync(fallbackScratch).some(f => f.endsWith('.xml'))) {
        xmlDir = fallbackScratch;
      }
    }

    const runArgs = [
      scriptPath,
      '--year', String(year),
      '--xml-dir', xmlDir,
      '--rfc', client.rfc || '',
      '--name', client.name || 'Contribuyente',
      '--output', targetFile
    ];
    if (bankFile) runArgs.push('--bank-file', bankFile);

    let lastStderr = '';
    await new Promise((resolve, reject) => {
      const proc = spawn(pythonExe, runArgs, {
        cwd: path.join(__dirname, '..'),
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
      });
      proc.stderr.on('data', (d) => { lastStderr += d.toString(); });
      proc.on('close', (code) => {
        if (code === 0 && fs.existsSync(targetFile)) resolve();
        else reject(new Error(lastStderr || 'Error generando Cédula de Conciliación Bancaria.'));
      });
    });

    const fileBuffer = fs.readFileSync(targetFile);
    const pdfBase64 = fileBuffer.toString('base64');
    return res.json({ success: true, filename, savedPath: targetFile, pdfBase64, isExcel: true });
  } catch (error) {
    console.error('Error descargando Conciliación Bancaria:', error);
    return res.status(500).json({ error: error.message || 'Error al descargar Conciliación Bancaria' });
  }
});

// ============================================================
// 3. Generador de Pólizas Contables (Anexo 24 RMF / Contpaqi / COI)
// ============================================================
app.post('/api/clients/:id/polizas/preview', authMiddleware, async (req, res) => {
  try {
    const { year = 2026, month = 0 } = req.body || {};
    const monthNum = (month === 'all' || !month) ? 0 : (parseInt(month, 10) || 0);
    const client = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!client) return res.status(404).json({ error: 'Contribuyente no encontrado' });

    const tempDir = path.join(__dirname, '..', 'scratch', 'temp_tax_runs', `pol_prev_${client.id}_${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    const jsonOutput = path.join(tempDir, 'polizas_preview.json');

    const pythonExe = getPythonExePath();
    const scriptPath = path.join(__dirname, '..', 'tools', 'contabilidad', 'generador_polizas.py');
    let xmlDir = findClientXmlDirectory(client.id, client.rfc, 'polizas');
    const facturasDir = path.join(__dirname, '..', 'scratch', 'facturas_store', client.id);

    let lastStderr = '';
    let previewData = null;

    await new Promise((resolve, reject) => {
      const proc = spawn(pythonExe, [
        scriptPath,
        '--year', String(year),
        '--month', String(monthNum),
        '--xml-dir', xmlDir,
        '--facturas-dir', facturasDir,
        '--rfc', client.rfc || '',
        '--name', client.name || 'Contribuyente',
        '--preview',
        '--json-output', jsonOutput
      ], {
        cwd: path.join(__dirname, '..'),
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
      });

      proc.stdout.on('data', (d) => {
        const lines = d.toString().split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const parsed = JSON.parse(trimmed);
            if (parsed.type === 'preview_result' && parsed.data) {
              previewData = parsed.data;
            }
          } catch (e) {}
        }
      });
      proc.stderr.on('data', (d) => { lastStderr += d.toString(); });
      proc.on('close', (code) => {
        if (fs.existsSync(jsonOutput)) {
          try { previewData = JSON.parse(fs.readFileSync(jsonOutput, 'utf-8')); } catch (e) {}
        }
        if (previewData || code === 0) resolve();
        else reject(new Error(lastStderr || 'Error generando preview de Pólizas'));
      });
    });

    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}

    return res.json({
      success: true,
      year: parseInt(year, 10),
      month: monthNum,
      data: previewData,
      ...(previewData || {})
    });
  } catch (error) {
    console.error('Error generando preview de Pólizas:', error);
    return res.status(500).json({ error: error.message || 'Error en Pólizas Contables' });
  }
});

app.post('/api/clients/:id/polizas/download', authMiddleware, async (req, res) => {
  try {
    const { year = 2026, month = 0, format = 'excel' } = req.body || {};
    const monthNum = (month === 'all' || !month) ? 0 : (parseInt(month, 10) || 0);
    const client = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!client) return res.status(404).json({ error: 'Contribuyente no encontrado' });

    const tempDir = path.join(__dirname, '..', 'scratch', 'temp_tax_runs', `pol_dl_${client.id}_${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    const ext = format === 'contpaqi' ? '.txt' : format === 'coi' ? '.csv' : '.xlsx';
    const filename = `Polizas_Anexo24_${client.rfc}_${year}_M${monthNum}_${format}${ext}`;
    const targetFile = path.join(tempDir, filename);

    const pythonExe = getPythonExePath();
    const scriptPath = path.join(__dirname, '..', 'tools', 'contabilidad', 'generador_polizas.py');
    let xmlDir = findClientXmlDirectory(client.id, client.rfc, 'polizas');
    const facturasDir = path.join(__dirname, '..', 'scratch', 'facturas_store', client.id);

    let lastStderr = '';
    await new Promise((resolve, reject) => {
      const proc = spawn(pythonExe, [
        scriptPath,
        '--year', String(year),
        '--month', String(monthNum),
        '--xml-dir', xmlDir,
        '--facturas-dir', facturasDir,
        '--rfc', client.rfc || '',
        '--name', client.name || 'Contribuyente',
        '--format', format,
        '--output', targetFile
      ], {
        cwd: path.join(__dirname, '..'),
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
      });
      proc.stderr.on('data', (d) => { lastStderr += d.toString(); });
      proc.on('close', (code) => {
        if (code === 0 && fs.existsSync(targetFile)) resolve();
        else reject(new Error(lastStderr || 'Error generando archivo de Pólizas.'));
      });
    });

    const fileBuffer = fs.readFileSync(targetFile);
    const pdfBase64 = fileBuffer.toString('base64');
    return res.json({
      success: true,
      filename,
      savedPath: targetFile,
      pdfBase64,
      isExcel: format === 'excel',
      isTxt: format === 'contpaqi',
      isCsv: format === 'coi'
    });
  } catch (error) {
    console.error('Error descargando Pólizas:', error);
    return res.status(500).json({ error: error.message || 'Error al descargar Pólizas' });
  }
});

app.post('/api/open-path', authMiddleware, (req, res) => {
  try {
    const { targetPath, openFile = false } = req.body || {};
    if (!targetPath) {
      return res.status(400).json({ error: 'Ruta no especificada' });
    }

    const normalizedPath = path.normalize(targetPath);

    if (fs.existsSync(normalizedPath)) {
      const stats = fs.statSync(normalizedPath);
      let child;
      if (stats.isFile()) {
        if (openFile) {
          child = spawn('cmd.exe', ['/c', 'start', '""', normalizedPath], { detached: true, stdio: 'ignore', windowsHide: true });
        } else {
          child = spawn('explorer.exe', [`/select,${normalizedPath}`], { detached: true, stdio: 'ignore', windowsHide: false });
        }
      } else {
        child = spawn('explorer.exe', [normalizedPath], { detached: true, stdio: 'ignore', windowsHide: false });
      }
      child?.unref();
      return res.json({ success: true, opened: normalizedPath });
    }

    // Si el archivo específico no existe, abrir la carpeta contenedora si existe
    const parentDir = path.dirname(normalizedPath);
    if (fs.existsSync(parentDir)) {
      const child = spawn('explorer.exe', [parentDir], { detached: true, stdio: 'ignore', windowsHide: false });
      child?.unref();
      return res.json({ success: true, opened: parentDir, note: 'Carpeta contenedora abierta' });
    }

    return res.status(404).json({ error: 'Ruta no encontrada en el disco' });
  } catch (err) {
    console.error('Error abriendo ruta en explorador:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ============================================================
// Extracción Automatizada de Facturas SAT (Emitidas y Recibidas)
// ============================================================
const facturasJobs = new Map();

function normalizeFacturasResult(resObj) {
  if (!resObj || !Array.isArray(resObj.registros)) return resObj;
  resObj.registros = resObj.registros.map((item) => {
    if (!item || typeof item !== 'object') return item;
    const fecha = item['Fecha de Emisión'] || item['Fecha de EmisiÃ³n'] || item['fecha_emision'] || item['FechaEmision'] || '';
    const nombre = item['Nombre o Razón Social'] || item['Nombre o RazÃ³n Social'] || item['nombre_emisor'] || item['nombre_receptor'] || item['nombre'] || '';
    const estado = item['Estado del Comprobante'] || item['estado'] || item['Estado'] || 'Vigente';
    const efecto = item['Efecto del Comprobante'] || item['efecto'] || item['Efecto'] || 'Ingreso';
    return {
      ...item,
      'Fecha de Emisión': fecha,
      'Nombre o Razón Social': nombre,
      'Estado del Comprobante': estado,
      'Efecto del Comprobante': efecto,
    };
  });
  return resObj;
}

function getOrCreateFacturasJob(clientId) {
  if (!facturasJobs.has(clientId)) {
    const defaultJob = {
      status: 'idle',
      progress: 0,
      logs: [],
      tipo: 'emitidas',
      year: String(new Date().getFullYear()),
      month: String(new Date().getMonth() + 1),
      result: null,
      error: null,
      subscribers: new Set(),
      childProcess: null,
      tempDir: null,
    };

    // Intentar restaurar última ejecución completada si existe en scratch/temp_facturas_runs
    try {
      const runsBase = path.join(__dirname, '..', 'scratch', 'temp_facturas_runs');
      if (fs.existsSync(runsBase)) {
        const matchingRuns = fs.readdirSync(runsBase)
          .filter((f) => f.startsWith(`${clientId}_`))
          .map((f) => {
            const fullPath = path.join(runsBase, f);
            try {
              return { name: f, fullPath, mtime: fs.statSync(fullPath).mtimeMs };
            } catch (e) {
              return null;
            }
          })
          .filter(Boolean)
          .sort((a, b) => b.mtime - a.mtime);

        if (matchingRuns.length > 0) {
          const latestRun = matchingRuns[0];
          const resultJsonPath = path.join(latestRun.fullPath, 'result.json');
          if (fs.existsSync(resultJsonPath)) {
            const savedRes = JSON.parse(fs.readFileSync(resultJsonPath, 'utf-8'));
            if (savedRes && savedRes.filename) {
              const fileId = savedRes.fileId || crypto.randomUUID();
              const excelLocal = path.join(latestRun.fullPath, savedRes.filename);
              if (fs.existsSync(excelLocal)) {
                facturasFiles.set(fileId, {
                  filepath: excelLocal,
                  filename: savedRes.filename,
                  createdAt: Date.now(),
                });
                savedRes.fileId = fileId;

                if (savedRes.zipFilename) {
                  const zipLocal = path.join(latestRun.fullPath, savedRes.zipFilename);
                  if (fs.existsSync(zipLocal)) {
                    const zipId = savedRes.zipFileId || crypto.randomUUID();
                    facturasFiles.set(zipId, {
                      filepath: zipLocal,
                      filename: savedRes.zipFilename,
                      createdAt: Date.now(),
                    });
                    savedRes.zipFileId = zipId;
                  }
                }

                defaultJob.status = 'completed';
                defaultJob.progress = 100;
                defaultJob.result = normalizeFacturasResult(savedRes);
                defaultJob.tipo = savedRes.tipo || 'emitidas';
                defaultJob.year = savedRes.year || String(new Date().getFullYear());
                defaultJob.month = savedRes.month || 'all';
                defaultJob.tempDir = latestRun.fullPath;
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn('[FACTURAS] No se pudo restaurar sesión previa:', e.message);
    }

    facturasJobs.set(clientId, defaultJob);
  }
  return facturasJobs.get(clientId);
}

function broadcastFacturasJob(job, eventType, payload = null) {
  const data = JSON.stringify({
    type: eventType,
    status: job.status,
    progress: job.progress,
    currentPhase: job.currentPhase || null,
    logs: job.logs,
    result: job.result,
    error: job.error,
    tipo: job.tipo,
    year: job.year,
    month: job.month,
    payload,
  });

  job.subscribers.forEach((res) => {
    try {
      res.write(`data: ${data}\n\n`);
    } catch (e) {
      job.subscribers.delete(res);
    }
  });
}

app.post('/api/clients/:id/facturas/start', authMiddleware, async (req, res) => {
  try {
    const { tipo = 'emitidas', year = String(new Date().getFullYear()), month = String(new Date().getMonth() + 1) } = req.body;

    const client = await prisma.client.findUnique({
      where: { id: req.params.id },
    });

    if (!client) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    if (!client.cerFile || !client.keyFile || !client.password) {
      return res.status(400).json({
        error: 'El cliente no cuenta con sus archivos de e.firma (.cer, .key) o contraseña registrados.',
      });
    }

    const job = getOrCreateFacturasJob(client.id);
    if (job.status === 'running') {
      return res.status(409).json({ error: 'Ya existe una extracción de facturas en curso para este cliente.' });
    }

    const initTime = new Date().toLocaleTimeString('es-MX', { hour12: false });
    job.tipo = String(tipo);
    job.year = String(year);
    job.month = String(month);
    job.status = 'running';
    job.progress = 5;
    const monthLabel = String(month) === 'all' ? 'Todo el año' : `Mes ${month}`;
    job.logs = [`[${initTime}] Iniciando extracción automatizada de facturas ${tipo} (${monthLabel} ${year})...`];
    job.currentPhase = null;
    job.result = null;
    job.error = null;

    const fileId = crypto.randomUUID();
    const tempDir = path.join(__dirname, '..', 'scratch', 'temp_facturas_runs', `${client.id}_${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    job.tempDir = tempDir;

    const tempCer = path.join(tempDir, `${client.rfc}.cer`);
    const tempKey = path.join(tempDir, `${client.rfc}.key`);
    fs.writeFileSync(tempCer, client.cerFile);
    fs.writeFileSync(tempKey, client.keyFile);

    const plainPassword = decryptPassword(client.password);
    const monthTag = String(month) === 'all' ? 'ANUAL' : `M${month}`;
    const excelFilename = `Facturas_${tipo.toUpperCase()}_${client.rfc}_${year}_${monthTag}.xlsx`;
    const outputExcelPath = path.join(tempDir, excelFilename);

    const configFile = path.join(tempDir, 'config.json');
    fs.writeFileSync(
      configFile,
      JSON.stringify(
        {
          tipo,
          year: String(year),
          month: String(month),
          cer_path: tempCer,
          key_path: tempKey,
          password: plainPassword,
          rfc: client.rfc,
          output_excel: outputExcelPath,
          download_dir: tempDir,
        },
        null,
        2
      ),
      'utf-8'
    );

    const pythonExe = getPythonExePath();
    const cliScript = path.join(__dirname, '..', 'tools', 'facturas', 'sat_facturas_cli.py');

    const proc = spawn(
      pythonExe,
      ['-u', cliScript, '--config', configFile],
      {
        cwd: path.join(__dirname, '..', 'tools', 'facturas'),
        windowsHide: true,
        env: {
          ...process.env,
          PYTHONUNBUFFERED: '1',
          PYTHONIOENCODING: 'utf-8',
          PYTHONUTF8: '1',
        },
      }
    );

    job.childProcess = proc;
    broadcastFacturasJob(job, 'start');

    const rl = readline.createInterface({ input: proc.stdout });
    rl.on('line', async (line) => {
      line = line.trim();
      if (!line) return;
      try {
        const data = JSON.parse(line);
        const timeStr = new Date().toLocaleTimeString('es-MX', { hour12: false });
        if (data.type === 'log') {
          const timedMsg = `[${timeStr}] ${data.msg}`;
          job.logs.push(timedMsg);
          if (job.logs.length > 200) job.logs.shift();
          broadcastFacturasJob(job, 'log', timedMsg);
        } else if (data.type === 'progress') {
          job.progress = Math.max(job.progress || 0, data.value);
          broadcastFacturasJob(job, 'progress', job.progress);
        } else if (data.type === 'phase') {
          job.currentPhase = data;
          broadcastFacturasJob(job, 'phase', data);
        } else if (data.type === 'finished') {
          job.status = 'completed';
          job.progress = 100;

          // Registrar excel en el Map de descargas
          facturasFiles.set(fileId, {
            filepath: outputExcelPath,
            filename: excelFilename,
            createdAt: Date.now(),
          });

          // Copiar automáticamente el Excel a la carpeta Descargas del usuario (C:\Users\Gio\Downloads)
          const downloadsDir = getDefaultDownloadsDir();
          const userExcelPath = path.join(downloadsDir, excelFilename);
          let userExcelSaved = false;
          try {
            if (fs.existsSync(outputExcelPath)) {
              fs.copyFileSync(outputExcelPath, userExcelPath);
              userExcelSaved = true;
              console.log(`[FACTURAS] Excel guardado automáticamente en Descargas: ${userExcelPath}`);
            }
          } catch (e) {
            console.error('[FACTURAS] Error al copiar Excel a Descargas:', e);
          }

          let zipFileId = null;
          let userZipPath = null;
          const zipFilename = data.data.zip_filename || `Facturas_${tipo.toUpperCase()}_${client.rfc}_${year}_PDF_XML.zip`;
          let finalZipPath = data.data.zip_path;

          // Si el ZIP no se creó en el CLI pero comprobantes_dir existe, crearlo como respaldo
          if ((!finalZipPath || !fs.existsSync(finalZipPath)) && data.data.comprobantes_dir && fs.existsSync(data.data.comprobantes_dir)) {
            try {
              const fallbackZip = path.join(tempDir, zipFilename);
              const archiver = (await import('archiver')).default;
              
              await new Promise((resolve, reject) => {
                const output = fs.createWriteStream(fallbackZip);
                const archive = archiver('zip', { zlib: { level: 9 } });
                
                output.on('close', resolve);
                archive.on('error', reject);
                
                archive.pipe(output);
                archive.directory(data.data.comprobantes_dir, false);
                archive.finalize();
              });

              if (fs.existsSync(fallbackZip) && fs.statSync(fallbackZip).size > 0) {
                finalZipPath = fallbackZip;
              }
            } catch (errZip) {
              console.error('[FACTURAS] Error al generar ZIP de respaldo:', errZip);
            }
          }

          if (finalZipPath && fs.existsSync(finalZipPath)) {
            zipFileId = crypto.randomUUID();
            facturasFiles.set(zipFileId, {
              filepath: finalZipPath,
              filename: zipFilename,
              createdAt: Date.now(),
            });

            // Copiar también el ZIP a la carpeta Descargas del usuario
            try {
              userZipPath = path.join(downloadsDir, zipFilename);
              fs.copyFileSync(finalZipPath, userZipPath);
              console.log(`[FACTURAS] ZIP guardado automáticamente en Descargas: ${userZipPath}`);
            } catch (e) {
              console.error('[FACTURAS] Error al copiar ZIP a Descargas:', e);
            }
          }

          // Contar total de comprobantes descargados
          let archivosCount = data.data.archivos_count || data.data.archivosCount || 0;
          if (!archivosCount && data.data.comprobantes_dir && fs.existsSync(data.data.comprobantes_dir)) {
            try {
              const countFiles = (dir) => {
                let cnt = 0;
                for (const item of fs.readdirSync(dir)) {
                  const full = path.join(dir, item);
                  if (fs.statSync(full).isDirectory()) cnt += countFiles(full);
                  else cnt++;
                }
                return cnt;
              };
              archivosCount = countFiles(data.data.comprobantes_dir);
            } catch (e) {}
          }

          // Respaldar automáticamente los XMLs en el almacén de auditoría del cliente (buscando en subcarpetas de meses)
          if (data.data.comprobantes_dir && fs.existsSync(data.data.comprobantes_dir)) {
            const clientXmlDir = path.join(__dirname, '..', 'scratch', 'xml_storage', client.id);
            fs.mkdirSync(clientXmlDir, { recursive: true });
            try {
              const copyXmls = (dir) => {
                for (const item of fs.readdirSync(dir)) {
                  const full = path.join(dir, item);
                  if (fs.statSync(full).isDirectory()) {
                    copyXmls(full);
                  } else if (item.toLowerCase().endsWith('.xml')) {
                    fs.copyFileSync(full, path.join(clientXmlDir, item));
                  }
                }
              };
              copyXmls(data.data.comprobantes_dir);
            } catch (e) {}
          }

          job.result = normalizeFacturasResult({
            fileId,
            filename: excelFilename,
            savedExcelPath: userExcelSaved ? userExcelPath : outputExcelPath,
            downloadsDir,
            zipFileId,
            zipFilename,
            savedZipPath: userZipPath || finalZipPath,
            archivosCount,
            archivos_count: archivosCount,
            ...data.data,
            zip_path: finalZipPath,
          });

          // Guardar result.json en tempDir para persistencia ante reloads
          try {
            fs.writeFileSync(path.join(tempDir, 'result.json'), JSON.stringify(job.result, null, 2), 'utf-8');
          } catch (e) {}

          broadcastFacturasJob(job, 'finished', job.result);
        } else if (data.type === 'error') {
          job.status = 'failed';
          job.error = data.error;
          const timedErr = `[${timeStr}] ❌ ${data.error}`;
          job.logs.push(timedErr);
          broadcastFacturasJob(job, 'error', timedErr);
        }
      } catch (e) {
        const timeStr = new Date().toLocaleTimeString('es-MX', { hour12: false });
        const rawTimed = `[${timeStr}] ${line}`;
        job.logs.push(rawTimed);
        broadcastFacturasJob(job, 'log', rawTimed);
      }
    });

    let lastStderr = '';
    proc.stderr.on('data', (data) => {
      const errStr = data.toString().trim();
      if (errStr) {
        lastStderr = errStr;
        const timeStr = new Date().toLocaleTimeString('es-MX', { hour12: false });
        const timedNotice = `[${timeStr}] ⚠️ ${errStr}`;
        job.logs.push(timedNotice);
        broadcastFacturasJob(job, 'log', timedNotice);
      }
    });

    proc.on('close', (code) => {
      job.childProcess = null;
      if (job.status === 'running') {
        if (code === 0) {
          job.status = 'completed';
        } else {
          job.status = 'failed';
          if (!job.error) {
            job.error = lastStderr ? `Error en el motor: ${lastStderr}` : `El proceso finalizó con código de salida ${code}`;
          }
        }
        broadcastFacturasJob(job, 'exit', { code });
      }
    });

    res.json({ success: true, message: 'Extracción de facturas iniciada.' });
  } catch (error) {
    console.error('Error starting facturas extraction:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/clients/:id/facturas/status', authMiddleware, (req, res) => {
  const job = getOrCreateFacturasJob(req.params.id);
  res.json({
    status: job.status,
    progress: job.progress,
    currentPhase: job.currentPhase || null,
    logs: job.logs,
    result: normalizeFacturasResult(job.result),
    error: job.error,
    tipo: job.tipo,
    year: job.year,
    month: job.month,
  });
});

app.get('/api/clients/:id/facturas/stream', authMiddleware, (req, res) => {
  const job = getOrCreateFacturasJob(req.params.id);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  res.write(
    `data: ${JSON.stringify({
      type: 'initial',
      status: job.status,
      progress: job.progress,
      currentPhase: job.currentPhase || null,
      logs: job.logs,
      result: normalizeFacturasResult(job.result),
      error: job.error,
      tipo: job.tipo,
      year: job.year,
      month: job.month,
    })}\n\n`
  );

  job.subscribers.add(res);

  req.on('close', () => {
    job.subscribers.delete(res);
  });
});

app.post('/api/clients/:id/facturas/stop', authMiddleware, (req, res) => {
  const job = facturasJobs.get(req.params.id);
  if (job?.childProcess) {
    try {
      const pid = job.childProcess.pid;
      if (process.platform === 'win32' && pid) {
        try {
          spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true });
        } catch (e) {}
      } else {
        job.childProcess.kill('SIGTERM');
      }
      job.status = 'failed';
      job.error = 'Extracción cancelada por el usuario.';
      job.logs.push('🛑 Extracción cancelada por el usuario.');
      broadcastFacturasJob(job, 'stopped');
    } catch (e) {}
  }
  res.json({ success: true });
});

app.post('/api/clients/:id/facturas/reset', authMiddleware, (req, res) => {
  const job = facturasJobs.get(req.params.id);
  if (job) {
    if (job.childProcess) {
      try {
        const pid = job.childProcess.pid;
        if (process.platform === 'win32' && pid) {
          spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true });
        } else {
          job.childProcess.kill('SIGTERM');
        }
      } catch (e) {}
      job.childProcess = null;
    }
    if (job.tempDir) {
      try {
        fs.rmSync(job.tempDir, { recursive: true, force: true });
      } catch (e) {}
      job.tempDir = null;
    }
    job.status = 'idle';
    job.progress = 0;
    job.logs = [];
    job.result = null;
    job.error = null;
    broadcastFacturasJob(job, 'reset');
  }
  res.json({ success: true });
});

// ============================================================
// Servir archivos estáticos del frontend (producción)
// ============================================================
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// ============================================================
// Manejo de errores global
// ============================================================
app.use((err, req, res, _next) => {
  logger.error('Unhandled route error:', err);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ============================================================
// Graceful shutdown
// ============================================================
async function gracefulShutdown(signal) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  gracefulShutdown('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});

// ============================================================
// Iniciar servidor
// ============================================================
async function bootstrap() {
  // Hash passwords asíncronamente antes de aceptar peticiones
  masterPasswordHash = await bcrypt.hash(MASTER_PASSWORD, 10);
  adminPasswordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  app.listen(PORT, () => {
    console.log(`\n🔒 FirmaVault SAT Server`);
    console.log(`   Environment: ${NODE_ENV}`);
    console.log(`   Port: ${PORT}`);
    console.log(`   CORS: ${NODE_ENV === 'production' ? allowedOrigins.join(', ') : 'all origins (dev mode)'}`);
    console.log(`   Ready at http://localhost:${PORT}\n`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
