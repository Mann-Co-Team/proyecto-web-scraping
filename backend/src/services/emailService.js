const nodemailer = require('nodemailer');

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const EMAIL_SERVICE = process.env.EMAIL_SERVICE;
const EMAIL_HOST = process.env.EMAIL_HOST;
const EMAIL_PORT = process.env.EMAIL_PORT;
const EMAIL_SECURE = process.env.EMAIL_SECURE;
const EMAIL_FROM = process.env.EMAIL_FROM;

let transporter = null;

const toBoolean = (value, defaultValue = undefined) => {
  if (typeof value === 'undefined' || value === null) return defaultValue;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return defaultValue;
  return ['true', '1', 'yes', 'y'].includes(normalized);
};

const resolveTransportConfig = () => {
  if (!EMAIL_USER || !EMAIL_PASS) {
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

exports.sendMail = async ({ to, subject, text, html }) => {
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
};
