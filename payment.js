const { ethers } = require('ethers');

const USDC_ABI = [
  'function decimals() view returns (uint8)',
  'function name() view returns (string)',
  'function version() view returns (string)',
  'function authorizationState(address authorizer, bytes32 nonce) view returns (bool)',
  'function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)',
];

let provider;
let serverWallet;
let usdcContract;
let usdcDecimals;
let usdcName;
let usdcVersion;
let paymentAmountRaw;

async function init() {
  provider = new ethers.JsonRpcProvider(process.env.ARC_RPC_URL);
  serverWallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  usdcContract = new ethers.Contract(process.env.USDC_CONTRACT, USDC_ABI, serverWallet);
  usdcDecimals = await usdcContract.decimals();
  usdcName = await usdcContract.name();
  usdcVersion = await usdcContract.version();
  paymentAmountRaw = ethers.parseUnits(process.env.PAYMENT_AMOUNT_USDC || '1', usdcDecimals);
  const network = await provider.getNetwork();
  console.log(`Arc testnet chainId=${network.chainId}, server=${serverWallet.address}`);
  console.log(`USDC: ${usdcName} v${usdcVersion}, payment=${process.env.PAYMENT_AMOUNT_USDC} USDC`);
}

function getPaymentParams() {
  return {
    serverAddress: serverWallet.address,
    amount: process.env.PAYMENT_AMOUNT_USDC || '1',
    amountRaw: paymentAmountRaw.toString(),
    usdcContract: process.env.USDC_CONTRACT,
    chainId: parseInt(process.env.ARC_CHAIN_ID || '5042002'),
    // EIP-712 domain fields for MetaMask typed data signing
    usdcName,
    usdcVersion,
  };
}

async function submitPayment({ from, value, validAfter, validBefore, nonce, signature }) {
  // Validate payment is going to the right place with enough value
  if (BigInt(value) < paymentAmountRaw) {
    throw new Error(`Insufficient payment: got ${value}, need ${paymentAmountRaw}`);
  }
  if (BigInt(validBefore) < BigInt(Math.floor(Date.now() / 1000))) {
    throw new Error('Authorization has expired');
  }

  // Check nonce hasn't been used already (replay protection)
  const used = await usdcContract.authorizationState(from, nonce);
  if (used) throw new Error('Authorization nonce already used');

  const { v, r, s } = ethers.Signature.from(signature);

  const tx = await usdcContract.transferWithAuthorization(
    from,
    serverWallet.address,
    value,
    validAfter,
    validBefore,
    nonce,
    v, r, s
  );

  const receipt = await tx.wait();
  return receipt.hash;
}

module.exports = { init, getPaymentParams, submitPayment };
