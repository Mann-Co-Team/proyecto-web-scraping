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

    // MySQL: use ? placeholders and read insertId from the result
    const [insertResult] = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES (?, ?)',
      [email, password_hash]
    );

    const insertedId = insertResult && insertResult.insertId ? insertResult.insertId : null;
    res.status(201).json({ user: { id: insertedId, email } });
  } catch (error) {
    // Handle both Postgres and MySQL duplicate-key errors
    if (error.code === '23505' || error.code === 'ER_DUP_ENTRY' || error.errno === 1062) {
      return res.status(409).json({ message: 'Email already in use.' });
    }
    console.error(error);
    res.status(500).json({ message: 'Server error during signup.' });
  }
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  try {
    // MySQL (mysql2) usage: pool.query returns [rows, fields]
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    const user = rows && rows.length ? rows[0] : null;

    if (!user) return res.status(401).json({ message: 'Credenciales inválidas' });

    // password is stored in `password_hash`
    const match = await bcrypt.compare(password, user.password_hash);
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
