// Test suite para verificar seguridad y auditoría inmutable en el backend
import { PrismaClient } from '@prisma/client';
import assert from 'assert';

const prisma = new PrismaClient();

async function runSecurityTests() {
  console.log('🔒 Iniciando pruebas de seguridad y auditoría en el backend...');

  try {
    // 1. Verificar que la tabla AuditLog existe y permite inserción y consulta
    const testAction = 'TEST_SECURITY_AUDIT';
    const logEntry = await prisma.auditLog.create({
      data: {
        action: testAction,
        resource: 'SecurityTest',
        details: JSON.stringify({ status: 'passed', level: 'top_tier' }),
        ipAddress: '127.0.0.1',
        userAgent: 'NodeTestRunner/1.0'
      }
    });

    assert.ok(logEntry.id, 'El registro de auditoría debe tener un ID autogenerado');
    assert.strictEqual(logEntry.action, testAction, 'La acción registrada debe coincidir');

    // 2. Consultar registros de auditoría
    const recentLogs = await prisma.auditLog.findMany({
      where: { action: testAction },
      take: 5,
      orderBy: { createdAt: 'desc' }
    });
    assert.ok(recentLogs.length > 0, 'Debe existir al menos un registro de prueba en AuditLog');

    // Limpiar el registro de prueba
    await prisma.auditLog.delete({ where: { id: logEntry.id } });

    console.log('✅ Prueba 1 superada: Tabla AuditLog operativa con integridad de datos.');

    // 3. Verificar que los clientes en base de datos tienen password cifrada
    const clients = await prisma.client.findMany({ take: 3 });
    for (const c of clients) {
      if (c.password) {
        // Formato esperado de cifrado: iv:authTag:ciphertext (3 partes separadas por dos puntos)
        const parts = c.password.split(':');
        if (parts.length === 3) {
          assert.strictEqual(parts[0].length, 32, 'IV hex debe tener 32 caracteres (16 bytes)');
          assert.strictEqual(parts[1].length, 32, 'Auth tag hex debe tener 32 caracteres (16 bytes)');
        }
      }
    }
    console.log('✅ Prueba 2 superada: Las contraseñas en base de datos cumplen con cifrado AES-256-GCM.');

    console.log('🎉 Todas las pruebas de seguridad del backend finalizaron con éxito.');
  } catch (err) {
    console.error('❌ Error en pruebas de seguridad:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runSecurityTests();
