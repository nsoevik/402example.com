const jwt = require('jsonwebtoken');

const SECRET = () => process.env.JWT_SECRET;

function sign(paymentId) {
  return jwt.sign({ paymentId, paid: true }, SECRET(), { expiresIn: '24h' });
}

function verify(token) {
  try {
    return jwt.verify(token, SECRET());
  } catch {
    return null;
  }
}

function middleware(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  req.auth = token ? verify(token) : null;
  next();
}

module.exports = { sign, verify, middleware };
