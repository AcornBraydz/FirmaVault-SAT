<div align="center">
  <h1>🔒 FirmaVault SAT</h1>
  <p><strong>Plataforma integral y segura para la administración de credenciales fiscales y descargas masivas de CFDI del SAT.</strong></p>
  
  <p>
    <img src="https://img.shields.io/badge/Node.js-18.0+-green.svg" alt="Node.js version">
    <img src="https://img.shields.io/badge/React-18-blue.svg" alt="React version">
    <img src="https://img.shields.io/badge/Python-3.9+-yellow.svg" alt="Python version">
    <img src="https://img.shields.io/badge/Security-AES--256--GCM-red.svg" alt="Security">
    <img src="https://img.shields.io/badge/License-MIT-purple.svg" alt="License">
  </p>
</div>

---

**FirmaVault SAT** es una solución de grado empresarial diseñada para simplificar y asegurar la gestión de credenciales fiscales del Servicio de Administración Tributaria (SAT) en México. Implementando altos estándares de seguridad con cifrado AES-256-GCM, la plataforma permite el almacenamiento seguro de archivos de la e.firma (`.cer`, `.key`), así como la automatización inteligente en la extracción y procesamiento de comprobantes fiscales (CFDI) y recibos de nómina.

## 🚀 Características Principales

- 🔐 **Gestión Segura de Credenciales** — Almacena certificados `.cer`, llaves privadas `.key` y contraseñas mediante cifrado AES-256-GCM de extremo a extremo.
- 🔔 **Monitoreo Inteligente de Vigencia** — Sistema de alertas visuales predictivas para certificados próximos a vencer.
- 📥 **Descarga Automatizada de Nóminas** — Conexión directa para la extracción masiva de recibos de nómina del portal del SAT.
- 🧾 **Procesador Avanzado de Facturas** — Conversión y estructuración automática de reportes PDF de facturas a formatos tabulares (Excel).
- 🔄 **Sincronización CFDI** — Descarga automatizada y clasificación de facturas emitidas y recibidas.
- 📦 **Respaldo Estructurado (ZIP)** — Exportación segura de credenciales de forma individual o masiva para auditorías.
- 🛡️ **Arquitectura Zero-Trust (JWT)** — Acceso restringido y protegido mediante autenticación por contraseña maestra y tokens JWT.

---

## 💻 Stack Tecnológico

El proyecto está construido sobre tecnologías modernas y robustas para garantizar escalabilidad y seguridad:

| Capa | Tecnologías Clave |
|---|---|
| **Frontend** | React 18, Tailwind CSS v4, Vite |
| **Backend** | Node.js, Express 5 |
| **Base de Datos** | SQLite, Prisma ORM |
| **Seguridad** | Helmet, JWT, bcrypt, AES-256-GCM, Rate Limiting |
| **Automatización SAT**| Python 3.9+, Selenium, openpyxl |

---

## 🛠️ Instalación y Entorno de Desarrollo

### Requisitos Previos

- **Node.js** (v18.0.0 o superior)
- **Python** (v3.9 o superior para los web scrapers de extracción)

### Pasos de Instalación

1. **Clonar el repositorio**
   ```bash
   git clone https://github.com/AcornBraydz/FirmaVault-SAT.git
   cd FirmaVault-SAT
   ```

2. **Instalar las dependencias de Node**
   ```bash
   npm install
   ```

3. **Configurar las variables de entorno**
   Copia el archivo de ejemplo para crear tu entorno local:
   ```bash
   cp .env.example .env
   ```
   > ⚠️ **Importante**: Edita el archivo `.env` con tus claves de encriptación (ver sección de Configuración más abajo).

### ⚡ Inicio Rápido en Windows (Fácil en 1 Clic)

1. **Instalación inicial (Solo la primera vez):**
   - Haz doble clic en **`instalar_todo.bat`**.
   - Verificará e instalará automáticamente Node.js, dependencias npm, librerías de Python (`requirements.txt`), base de datos SQLite y compilará la aplicación.

2. **Uso en el día a día:**
   - ▶️ **Para Iniciar:** Haz doble clic en **`iniciar_servidor.bat`**.
     - Levanta el sistema en segundo plano.
     - Abre automáticamente tu navegador en **http://localhost:5173**.
     - Puedes cerrar la ventana negra de CMD sin que se apague el sistema.
   - ⏹️ **Para Apagar:** Haz doble clic en **`detener_servidor.bat`** cuando termines de usarlo.

---

### Instalación Manual (Desarrolladores)

1. **Instalar dependencias de Node y Python**
   ```bash
   npm install
   pip install -r requirements.txt
   ```

2. **Configurar base de datos**
   ```bash
   npx prisma generate
   npx prisma db push
   ```

3. **Iniciar el Servidor**
   ```bash
   npm run dev          # Inicia el Frontend (Vite)
   npm run dev:server   # Inicia el Backend (Express)
   ```

---

## ⚙️ Configuración del Sistema (`.env`)

Asegúrate de definir correctamente las variables de entorno para que el motor criptográfico funcione adecuadamente.

| Variable | Descripción | Ejemplo de Valor |
|---|---|---|
| `PORT` | Puerto de escucha para el servidor Express | `3001` |
| `DATABASE_URL` | Cadena de conexión para SQLite (Prisma) | `file:./dev.db` |
| `JWT_SECRET` | Semilla para firmar los JSON Web Tokens | Generar con: `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"` |
| `JWT_EXPIRES_IN` | Tiempo de vida de la sesión | `8h` |
| `MASTER_PASSWORD` | Contraseña global de acceso al sistema | `tu-password-super-segura` |
| `ADMIN_PASSWORD` | Contraseña para operaciones destructivas (ej. borrar clientes) | `otra-password-diferente` |
| `ENCRYPTION_KEY` | **CRÍTICO:** Clave de 256-bits (64 caracteres hex) para cifrar credenciales. *Si se pierde, la base de datos es irrecuperable.* | Generar con: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `CORS_ORIGINS` | Dominios permitidos (separados por coma) | `https://app.tudominio.com` |
| `NODE_ENV` | Define si el sistema está en desarrollo o producción | `production` |

---

## 🚀 Despliegue a Producción

La plataforma está diseñada para ser fácilmente contenida y desplegada.

### Opción 1: Docker (Recomendada)
La manera más rápida y limpia de poner en marcha el sistema en un servidor.
```bash
docker compose up -d
```

### Opción 2: Despliegue Manual (Bare Metal)
Para servidores sin Docker:
```bash
# 1. Compilar los estáticos del frontend
npm run build

# 2. Iniciar el servicio en entorno productivo
NODE_ENV=production node server/index.js
```

---

<div align="center">
  <sub>Desarrollado para optimizar y asegurar la administración fiscal en México 🇲🇽</sub>
</div>
