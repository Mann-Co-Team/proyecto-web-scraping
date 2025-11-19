const pool = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { sendMail } = require('../services/emailService');

const normalizeRows = (dbResult) => {
  if (Array.isArray(dbResult)) {
    return Array.isArray(dbResult[0]) ? dbResult[0] : dbResult;
  }
  if (dbResult && dbResult.rows) {
    return dbResult.rows;
  }
  return [];
};

const PUBLIC_USER_FIELDS = 'id, name, email, created_at, updated_at';

const sanitizeUser = (userRow) => {
  if (!userRow) return null;
  const { id, name, email, created_at, updated_at } = userRow;
  return {
    id,
    name: name || '',
    email,
    created_at,
    updated_at,
  };
};

const fetchPublicUserById = async (id) => {
  const rows = normalizeRows(
    await pool.query(`SELECT ${PUBLIC_USER_FIELDS} FROM users WHERE id = ? LIMIT 1`, [id])
  );
  return rows.length ? rows[0] : null;
};

const isDuplicateEmailError = (error) =>
  Boolean(error && (error.code === '23505' || error.code === 'ER_DUP_ENTRY' || error.errno === 1062));

exports.signup = async (req, res) => {
  const { email, password, name } = req.body;

  if (!email || !password || password.length < 6) {
    return res.status(400).json({ message: 'Please provide a valid email and a password of at least 6 characters.' });
  }

  try {
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const [result] = await pool.query(
      'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
      [name ? name.trim() : null, email, password_hash]
    );

    const userRow = await fetchPublicUserById(result.insertId);
    res.status(201).json({ user: sanitizeUser(userRow) });
  } catch (error) {
    if (isDuplicateEmailError(error)) {
      return res.status(409).json({ message: 'Email already in use.' });
    }
    console.error(error);
    res.status(500).json({ message: 'Server error during signup.' });
  }
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  try {
    // Compatible con mysql2 ([rows]) y con pg (result.rows)
    const rows = normalizeRows(await pool.query('SELECT * FROM users WHERE email = ?', [email]));
    const user = rows && rows.length ? rows[0] : null;

    if (!user) return res.status(401).json({ message: 'Credenciales inválidas' });

    const match = await bcrypt.compare(password, user.password_hash || user.password);
    if (!match) return res.status(401).json({ message: 'Credenciales inválidas' });

    const payload = {
      user: {
        id: user.id,
        email: user.email,
        name: user.name || '',
      },
    };

    const expiresEnv = process.env.JWT_EXPIRES_IN && process.env.JWT_EXPIRES_IN.trim();
    const expiresIn = expiresEnv
      ? (/^\d+$/.test(expiresEnv) ? Number(expiresEnv) : expiresEnv)
      : '1h';

    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: expiresIn || '1h' },
      (err, token) => {
        if (err) throw err;
        const responseUser = sanitizeUser(user);
        res.json({ token, user: responseUser });
      }
    );
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Error interno' });
  }
};

exports.requestPasswordReset = async (req, res) => {
  const { email } = req.body || {};
  if (!email) {
    return res.status(400).json({ message: 'Debes indicar el correo asociado a tu cuenta.' });
  }

  try {
    const users = normalizeRows(await pool.query('SELECT id FROM users WHERE email = ?', [email]));
    const user = users.length ? users[0] : null;
    if (!user) {
      // Respuesta genérica para no filtrar correos válidos
      return res.json({ message: 'Si el correo existe, recibirás instrucciones para recuperar tu contraseña.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    await pool.query(
      'INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)',
      [user.id, token, expiresAt]
    );
    const frontendBase = process.env.FRONTEND_BASE_URL || 'http://localhost:5173';
    const resetUrl = `${frontendBase}?resetToken=${token}`;
    const subject = 'Recuperación de contraseña ArriendosTalca';
    const plainText = `Recibimos una solicitud para restablecer tu contraseña. Usa el siguiente token dentro de 60 minutos y cópialo en la sección "Recuperar contraseña" del portal.

Token: ${token}
Portal: ${resetUrl}

Si no solicitaste este cambio, ignora este correo.`;
    const htmlBody = `
      <p>Hola,</p>
      <p>Recibimos una solicitud para restablecer tu contraseña. Usa el siguiente token dentro de 60 minutos y pégalo en la sección <strong>"Recuperar contraseña"</strong> del portal.</p>
      <p style="font-size:18px; font-weight:bold; letter-spacing:1px;">${token}</p>
      <p><a href="${resetUrl}" target="_blank" rel="noopener">Abrir portal</a></p>
      <p>Si no solicitaste este cambio, ignora este correo.</p>
    `;

    let emailSent = false;
    try {
      await sendMail({
        to: email,
        subject,
        text: plainText,
        html: htmlBody,
      });
      emailSent = true;
    } catch (mailError) {
      const logMethod = mailError.message === 'EMAIL_CREDENTIALS_MISSING' ? console.warn : console.error;
      logMethod('No se pudo enviar el correo de recuperación:', mailError.message);
    }

    const responsePayload = {
      message: emailSent
        ? 'Revisa tu correo para continuar con el restablecimiento.'
        : 'No se pudo enviar el correo automáticamente. Usa el token mostrado para continuar.',
    };
    if (!emailSent) {
      responsePayload.token = token;
    }

    res.json(responsePayload);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al generar el token de recuperación.' });
  }
};

exports.resetPassword = async (req, res) => {
  const { token, password } = req.body || {};
  if (!token || !password || password.length < 6) {
    return res.status(400).json({ message: 'Proporciona un token válido y una nueva contraseña de al menos 6 caracteres.' });
  }

  try {
    const rows = normalizeRows(
      await pool.query(
        `SELECT pr.id, pr.user_id, pr.expires_at, pr.used_at
         FROM password_resets pr
         WHERE pr.token = ?
           AND pr.used_at IS NULL
           AND pr.expires_at > NOW()
         LIMIT 1`,
        [token]
      )
    );

    const resetRequest = rows.length ? rows[0] : null;
    if (!resetRequest) {
      return res.status(400).json({ message: 'El token es inválido o ha expirado.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, resetRequest.user_id]);
    await pool.query('UPDATE password_resets SET used_at = NOW() WHERE id = ?', [resetRequest.id]);

    const userRows = normalizeRows(
      await pool.query('SELECT email FROM users WHERE id = ?', [resetRequest.user_id])
    );
    const userEmail = userRows.length ? userRows[0].email : null;
    if (userEmail) {
      try {
        await sendMail({
          to: userEmail,
          subject: 'Tu contraseña fue actualizada',
          text: 'Confirmamos que tu contraseña se actualizó correctamente. Si no fuiste tú, contacta al administrador de inmediato.',
          html: '<p>Confirmamos que tu contraseña se actualizó correctamente.</p><p>Si no fuiste tú, contacta al administrador de inmediato.</p>',
        });
      } catch (mailError) {
        const logMethod = mailError.message === 'EMAIL_CREDENTIALS_MISSING' ? console.warn : console.error;
        logMethod('No se pudo enviar el correo de confirmación:', mailError.message);
      }
    }

    res.json({ message: 'Contraseña actualizada correctamente. Revisa tu correo para la confirmación.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'No se pudo actualizar la contraseña.' });
  }
};

exports.getProfile = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: 'No autorizado.' });
  }

  try {
    const userRow = await fetchPublicUserById(userId);
    if (!userRow) {
      return res.status(404).json({ message: 'Usuario no encontrado.' });
    }
    res.json({ user: sanitizeUser(userRow) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'No se pudo obtener la información del usuario.' });
  }
};

exports.updateProfile = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: 'No autorizado.' });
  }

  const { name, email, password } = req.body || {};
  const updates = [];
  const values = [];

  if (typeof name !== 'undefined') {
    updates.push('name = ?');
    values.push(name === null ? null : String(name).trim());
  }

  if (typeof email !== 'undefined') {
    updates.push('email = ?');
    values.push(email);
  }

  if (typeof password !== 'undefined') {
    if (!password) {
      return res.status(400).json({ message: 'La nueva contraseña no puede estar vacía.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres.' });
    }
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    updates.push('password_hash = ?');
    values.push(passwordHash);
  }

  if (!updates.length) {
    return res.status(400).json({ message: 'No se enviaron cambios.' });
  }

  values.push(userId);

  try {
    await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
    const userRow = await fetchPublicUserById(userId);
    res.json({ message: 'Perfil actualizado.', user: sanitizeUser(userRow) });
  } catch (error) {
    if (isDuplicateEmailError(error)) {
      return res.status(409).json({ message: 'Ese correo ya está en uso.' });
    }
    console.error(error);
    res.status(500).json({ message: 'No se pudo actualizar el perfil.' });
  }
};