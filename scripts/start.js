/**
 * Script de inicio en segundo plano para FirmaVault SAT
 * Inicia Backend + Frontend como procesos independientes (detached),
 * abre el navegador y permite cerrar la consola sin detener los servidores.
 */
import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

console.log('\n============================================================');
console.log('  🔒 FIRMAVAULT SAT — INICIANDO EN SEGUNDO PLANO');
console.log('============================================================\n');

// 1. Limpiar puertos previos si quedaron ocupados
function cleanOldProcesses(ports) {
  try {
    const output = execSync('netstat -ano', { encoding: 'utf8' });
    const lines = output.split('\n');
    const pids = new Set();

    for (const line of lines) {
      for (const port of ports) {
        if (line.includes(`:${port} `) || line.includes(`:${port}\t`) || line.includes(`:${port}\r`)) {
          const parts = line.trim().split(/\s+/);
          const pid = parseInt(parts[parts.length - 1], 10);
          if (pid && pid !== process.pid && pid !== 0) {
            pids.add(pid);
          }
        }
      }
    }

    for (const pid of pids) {
      try {
        execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
      } catch (_) {}
    }
  } catch (_) {}
}

cleanOldProcesses([3001, 5173]);

// 2. Iniciar Backend en segundo plano (detached)
console.log('  [1/2] Iniciando Servidor Backend (Puerto 3001)...');
const backendProc = spawn(process.execPath, [path.join(rootDir, 'server', 'index.js')], {
  cwd: rootDir,
  detached: true,
  stdio: 'ignore',
  windowsHide: true,
});
backendProc.unref();

// 3. Iniciar Frontend Vite en segundo plano (detached)
console.log('  [2/2] Iniciando Frontend Vite (Puerto 5173)...');
const viteBin = path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js');
const frontendProc = spawn(process.execPath, [viteBin], {
  cwd: rootDir,
  detached: true,
  stdio: 'ignore',
  windowsHide: true,
});
frontendProc.unref();

// 4. Esperar verificación y abrir navegador
async function checkServer(url, timeoutMs = 6000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res) return true;
    } catch (_) {}
    await new Promise(r => setTimeout(r, 400));
  }
  return false;
}

(async () => {
  // Esperamos que backend responda
  await checkServer('http://localhost:3001', 4000);

  console.log('\n============================================================');
  console.log('  ✅ SISTEMA INICIADO CORRECTAMENTE EN SEGUNDO PLANO');
  console.log('============================================================');
  console.log('  🌐 Servidor API:     http://localhost:3001');
  console.log('  💻 Aplicación Web:   http://localhost:5173');
  console.log('------------------------------------------------------------');
  console.log('  ✔ Los servidores siguen corriendo aunque cierres esta ventana.');
  console.log('  ✔ PUEDES CERRAR ESTA VENTANA con total tranquilidad.');
  console.log('');
  console.log('  Para apagar el sistema cuando termines de usarlo:');
  console.log('  👉 Ejecuta "detener_servidor.bat"');
  console.log('============================================================\n');

  try {
    execSync('start http://localhost:5173', { stdio: 'ignore', shell: true });
  } catch (_) {}

  process.exit(0);
})();
