/**
 * Script para detener todos los procesos y servidores de FirmaVault SAT
 */
import { execSync } from 'child_process';

console.log('\n============================================================');
console.log('  🛑 Deteniendo FirmaVault SAT...');
console.log('============================================================\n');

function killPorts(ports) {
  let killedCount = 0;
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
        console.log(`  ✔ Proceso PID ${pid} detenido.`);
        killedCount++;
      } catch (_) {}
    }
  } catch (err) {
    console.error('  Error al inspeccionar puertos:', err.message);
  }

  return killedCount;
}

const killed = killPorts([3001, 5173]);

if (killed === 0) {
  console.log('  ℹ No se encontraron servidores activos en los puertos 3001 o 5173.');
} else {
  console.log(`\n  ✅ ${killed} proceso(s) detenido(s) con éxito.`);
}

console.log('\n============================================================');
console.log('  Listo. Todos los puertos quedaron liberados.');
console.log('============================================================\n');
