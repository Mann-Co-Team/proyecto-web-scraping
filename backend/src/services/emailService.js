const nodemailer = require('nodemailer');

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const EMAIL_SERVICE = process.env.EMAIL_SERVICE;
const EMAIL_HOST = process.env.EMAIL_HOST;
const EMAIL_PORT = process.env.EMAIL_PORT;
const EMAIL_SECURE = process.env.EMAIL_SECURE;
const EMAIL_FROM = process.env.EMAIL_FROM;

let transporter = null;
const hasEmailCredentials = () => Boolean(EMAIL_USER && EMAIL_PASS);

const toBoolean = (value, defaultValue = undefined) => {
  if (typeof value === 'undefined' || value === null) return defaultValue;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return defaultValue;
  return ['true', '1', 'yes', 'y'].includes(normalized);
};

const resolveTransportConfig = () => {
  if (!hasEmailCredentials()) {
    throw new Error('EMAIL_CREDENTIALS_MISSING');
  }

  const base = {
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS,
    },
  };

  if (EMAIL_SERVICE) {
    return {
      ...base,
      service: EMAIL_SERVICE,
    };
  }

  const port = EMAIL_PORT ? Number(EMAIL_PORT) : undefined;
  return {
    ...base,
    host: EMAIL_HOST || 'smtp.gmail.com',
    port: Number.isFinite(port) ? port : 465,
    secure: toBoolean(EMAIL_SECURE, !port || port === 465),
  };
};

const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport(resolveTransportConfig());
  }
  return transporter;
};
const resetTransporter = () => {
  if (transporter && typeof transporter.close === 'function') {
    try {
      transporter.close();
    } catch (_) {
      // ignore close failures
    }
  }
  transporter = null;
};

const buildHelpfulError = (code, message, cause, extra = {}) => {
  const error = new Error(code);
  error.help = message;
  if (cause) {
    error.cause = cause;
  }
  Object.assign(error, extra);
  return error;
};

const mapMailError = (error) => {
  if (!error) {
    return new Error('EMAIL_UNKNOWN_ERROR');
  }
  if (error.message === 'EMAIL_CREDENTIALS_MISSING') {
    return buildHelpfulError(
      'EMAIL_CREDENTIALS_MISSING',
      'Define EMAIL_USER y EMAIL_PASS en el archivo .env para habilitar el envío de correos.',
      error
    );
  }
  const message = String(error?.message || '').toLowerCase();
  const responseCode = error?.responseCode;
  const authFailure =
    error?.code === 'EAUTH' ||
    error?.code === 'EAUTHENTICATION' ||
    responseCode === 534 ||
    responseCode === 535 ||
    message.includes('invalid login') ||
    message.includes('authentication failed');
  if (authFailure) {
    return buildHelpfulError(
      'EMAIL_AUTH_FAILED',
      'Las credenciales SMTP fueron rechazadas. Si usas Gmail, crea una contraseña de aplicación (Cuenta de Google → Seguridad → Contraseñas de aplicaciones) y asigna ese valor a EMAIL_PASS.',
      error,
      { responseCode }
    );
  }
  const connectionFailure = ['ESOCKET', 'ECONNECTION', 'ETIMEDOUT'].includes(error?.code);
  if (connectionFailure) {
    return buildHelpfulError(
      'EMAIL_TRANSPORT_UNAVAILABLE',
      'No se pudo conectar al servidor SMTP. Revisa EMAIL_HOST/EMAIL_PORT o tu firewall saliente.',
      error,
      { responseCode }
    );
  }
  return error;
};

const verifyEmailTransport = async () => {
  if (!hasEmailCredentials()) {
    throw buildHelpfulError(
      'EMAIL_CREDENTIALS_MISSING',
      'Define EMAIL_USER y EMAIL_PASS en el archivo .env para habilitar el envío de correos.'
    );
  }
  try {
    const transport = getTransporter();
    await transport.verify();
    return true;
  } catch (error) {
    resetTransporter();
    throw mapMailError(error);
  }
};

exports.sendMail = async ({ to, subject, text, html }) => {
  if (!hasEmailCredentials()) {
    throw buildHelpfulError(
      'EMAIL_CREDENTIALS_MISSING',
      'Define EMAIL_USER y EMAIL_PASS en el archivo .env para habilitar el envío de correos.'
    );
  }

  try {
    const transport = getTransporter();
    const mailOptions = {
      from: EMAIL_FROM || `HabiTalca <${EMAIL_USER}>`,
      to,
      subject,
      text,
      html,
    };

    const info = await transport.sendMail(mailOptions);
    return info;
  } catch (error) {
    resetTransporter();
    throw mapMailError(error);
  }
};

exports.verifyEmailTransport = verifyEmailTransport;
exports.hasEmailCredentials = hasEmailCredentials;
