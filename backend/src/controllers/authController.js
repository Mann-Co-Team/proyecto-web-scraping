const pool = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const normalizeRows = (dbResult) => {
  if (Array.isArray(dbResult)) {
    return Array.isArray(dbResult[0]) ? dbResult[0] : dbResult;
  }
  if (dbResult && dbResult.rows) {
    return dbResult.rows;
  }
  return [];
};

exports.signup = async (req, res) => {
  const { email, password } = req.body;

if (!email || !password || password.length < 6) {
  return res.status(400).json({ message: 'Please provide a valid email and a password of at least 6 characters.' });
}

  try {
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    await pool.query(
      'INSERT INTO users (email, password_hash) VALUES (?, ?)',
      [email, password_hash]
    );

    const [rows] = await pool.query(
      'SELECT id, email FROM users WHERE id = LAST_INSERT_ID()'
    );

    res.status(201).json({ user: rows });
  } catch (error) {
    if (error.code === '23505') { // Unique violation
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
        res.json({ token });
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

    res.json({
      message: 'Token de recuperación generado. Úsalo en los próximos 60 minutos.',
      token,
    });
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

    res.json({ message: 'Contraseña actualizada correctamente. Ahora puedes iniciar sesión.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'No se pudo actualizar la contraseña.' });
  }
};