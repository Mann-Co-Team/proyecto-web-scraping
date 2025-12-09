#!/usr/bin/env node
require('dotenv').config();

const { sendMail, verifyEmailTransport, hasEmailCredentials } = require('../src/services/emailService');

const getArgValue = (name) => {
  const prefix = `--${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
};

const targetEmail = getArgValue('to') || process.env.TEST_EMAIL_TO || process.env.EMAIL_USER;
const subject = getArgValue('subject') || 'Prueba de correo HabiTalca';

if (!targetEmail) {
  console.error('Debes indicar un destinatario con --to=correo@dominio.cl o configurar TEST_EMAIL_TO.');
  process.exit(1);
}

const buildBody = () => {
  const now = new Date().toISOString();
  const text = `Este es un correo de prueba enviado desde el script scripts/testEmail.js (${now}).`;
  const html = `<p>Este es un correo de prueba enviado desde <code>scripts/testEmail.js</code> (${now}).</p>`;
  return { text, html };
};

(async () => {
  if (!hasEmailCredentials()) {
    console.error('EMAIL_USER y EMAIL_PASS no están configurados. Actualiza tu .env antes de probar.');
    process.exit(1);
  }

  try {
    await verifyEmailTransport();
    console.log('Transporte SMTP verificado correctamente.');
  } catch (error) {
    console.error('La verificación del transporte falló:', error?.help || error?.message || error);
    if (error?.cause?.message) {
      console.error('Detalle SMTP:', error.cause.message);
    }
    process.exit(1);
  }

  const { text, html } = buildBody();
  try {
    const info = await sendMail({ to: targetEmail, subject, text, html });
    console.log('Correo enviado.');
    if (info?.messageId) {
      console.log('messageId:', info.messageId);
    }
    if (Array.isArray(info?.accepted) && info.accepted.length) {
      console.log('Destinatarios aceptados:', info.accepted.join(', '));
    }
    process.exit(0);
  } catch (error) {
    console.error('Error al enviar el correo:', error?.help || error?.message || error);
    if (error?.cause?.message) {
      console.error('Detalle SMTP:', error.cause.message);
    }
    process.exit(1);
  }
})();
