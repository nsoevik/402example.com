require('dotenv').config();
const express = require('express');
const payment = require('./payment');
const auth = require('./auth');

const app = express();
app.use(express.json());
app.use(auth.middleware);

const HIDDEN_TEXT = `This is the secret content gated by HTTP 402 Payment Required.

You've just demonstrated that microtransactions on Arc testnet can gate
web content using the HTTP 402 status code — a mechanism reserved in the
HTTP spec since 1996 and finally practical with programmable stablecoins.

Payment confirmed. Welcome.`;

// GET / — browsers get the HTML page; API/curl clients get real HTTP 402
app.get('/', (req, res) => {
  const wantsHtml = req.accepts(['html', 'json']) === 'html';
  if (!wantsHtml) {
    res.set(
      'WWW-Authenticate',
      `Payment chain=arc-testnet, amount=${process.env.PAYMENT_AMOUNT_USDC || '1'}, token=USDC`
    );
    return res.status(402).json({
      error: 'Payment Required',
      message: 'Sign a USDC transferWithAuthorization on Arc testnet to access this content.',
      paymentParamsEndpoint: '/api/payment-params',
      payEndpoint: '/api/pay',
    });
  }
  res.sendFile(__dirname + '/public/index.html');
});

// GET /api/payment-params — returns what the client needs to build the EIP-3009 signature
app.get('/api/payment-params', (req, res) => {
  res.json(payment.getPaymentParams());
});

// POST /api/pay — client submits a signed EIP-3009 authorization
app.post('/api/pay', async (req, res) => {
  const { from, value, validAfter, validBefore, nonce, signature } = req.body;
  if (!from || !value || !validBefore || !nonce || !signature) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    const txHash = await payment.submitPayment({ from, value, validAfter, validBefore, nonce, signature });
    const token = auth.sign(from);
    res.json({ token, txHash });
  } catch (err) {
    console.error('Payment error:', err.message);
    res.status(402).json({ error: err.message });
  }
});

// GET /api/content — gated content, requires JWT
app.get('/api/content', (req, res) => {
  if (!req.auth) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ content: HIDDEN_TEXT });
});

app.use(express.static('public'));

async function start() {
  await payment.init();
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`402example.com running on http://localhost:${port}`));
}

start().catch(err => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});
