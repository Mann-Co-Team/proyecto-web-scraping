const nodemailer = require('nodemailer');

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

let transporter = null;

const getTransporter = () => {
  if (!EMAIL_USER || !EMAIL_PASS) {
    throw new Error('EMAIL_CREDENTIALS_MISSING');
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS,
      },
    });
  }
  return transporter;
};

exports.sendMail = async ({ to, subject, text, html }) => {
  const transport = getTransporter();

  const mailOptions = {
    from: `ArriendosTalca <${EMAIL_USER}>`,
    to,
    subject,
    text,
    html,
  };

  const info = await transport.sendMail(mailOptions);
  return info;
};
