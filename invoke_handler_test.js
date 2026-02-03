import { handler } from './index.js';
import dotenv from "dotenv";
dotenv.config();
function buildMultipart(fields = {}, files = []) {
  const boundary = '----WebKitFormBoundary' + Date.now().toString(16);
  const parts = [];

  for (const [name, value] of Object.entries(fields)) {
    parts.push(`--${boundary}\r\n`);
    parts.push(`Content-Disposition: form-data; name="${name}"\r\n\r\n`);
    parts.push(`${value}\r\n`);
  }

  for (const file of files) {
    const filename = file.filename || 'file';
    const fieldName = file.fieldName || 'files';
    const contentType = file.contentType || 'application/octet-stream';
    const contentBuffer = Buffer.isBuffer(file.content)
      ? file.content
      : Buffer.from(file.content || '', 'utf8');

    parts.push(`--${boundary}\r\n`);
    parts.push(
      `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n`
    );
    parts.push(`Content-Type: ${contentType}\r\n\r\n`);
    parts.push(contentBuffer);
    parts.push('\r\n');
  }

  parts.push(`--${boundary}--\r\n`);

  const buffers = parts.map((p) => (typeof p === 'string' ? Buffer.from(p) : p));
  const full = Buffer.concat(buffers);
  return { buffer: full, boundary };
}

// Datos de ejemplo
const fields = {
  name: 'Juan Perez',
  email: 'juan@example.com',
  phone: '+5491122334455',
  subject: 'Consulta de prueba',
  message: 'Este es un mensaje de prueba enviado desde invoke_handler_test.js',
  promo: 'true',
  reminders: 'false',
};

// Archivos de ejemplo (puedes sustituir por Buffer desde fs.readFileSync)
const files = [
  {
    filename: 'prueba.txt',
    contentType: 'text/plain',
    content: Buffer.from('Contenido de prueba\nLinea 2\n'),
  },
  {
    filename: 'imagen-ficticia.jpg',
    contentType: 'image/jpeg',
    content: Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43]), // bytes ficticios
  },
];

const { buffer, boundary } = buildMultipart(fields, files);

const event = {
  body: buffer.toString('base64'),
  isBase64Encoded: true,
  headers: {
    'content-type': `multipart/form-data; boundary=${boundary}`,
  },
};

// Ajusta estas variables de entorno según sea necesario antes de ejecutar
process.env.NOTIFICATION_EMAIL = process.env.NOTIFICATION_EMAIL || 'no-reply@example.com';
process.env.TO_EMAIL = process.env.TO_EMAIL || 'destino@example.com';
process.env.AMZAWS_ACCESS_KEY_ID = process.env.AMZAWS_ACCESS_KEY_ID || 'AKIA_TEST';
process.env.AMZAWS_SECRET_ACCESS_KEY = process.env.AMZAWS_SECRET_ACCESS_KEY || 'SECRET_TEST';

(async () => {
  try {
    const res = await handler(event);
    console.log('Handler response:', res);
  } catch (err) {
    console.error('Error calling handler:', err);
  }
})();
