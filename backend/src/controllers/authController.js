const pool = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

exports.signup = async (req, res) => {
  const { email, password } = req.body;

if (!email || !password || password.length < 6) {
  return res.status(400).json({ message: 'Please provide a valid email and a password of at least 6 characters.' });
}

  try {
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const result = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [email, password_hash]
    );

    res.status(201).json({ user: result.rows });
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
    let user = null;
    const result = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (Array.isArray(result)) {
      // mysql2 -> [rows, fields] ó rows directamente según wrapper
      const rows = Array.isArray(result[0]) ? result[0] : result;
      user = rows && rows.length ? rows[0] : null;
    } else if (result && result.rows) {
      // pg
      user = result.rows.length ? result.rows[0] : null;
    }

    if (!user) return res.status(401).json({ message: 'Credenciales inválidas' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: 'Credenciales inválidas' });

    const payload = {
      user: {
        id: user.id,
      },
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN },
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
