(async () => {
  const TOKEN_KEY = '402example_token';
  const ARC_TESTNET = {
    chainId: '0x4CEF52', // 5042002 in hex
    chainName: 'Arc Testnet',
    nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
    rpcUrls: ['https://5042002.rpc.thirdweb.com'],
    blockExplorerUrls: ['https://testnet.arcscan.app'],
  };

  let params = null;
  let userAddress = null;

  // If we have a stored token, try to reveal content immediately
  const stored = localStorage.getItem(TOKEN_KEY);
  if (stored) {
    const ok = await tryReveal(stored);
    if (ok) return;
    localStorage.removeItem(TOKEN_KEY);
  }

  // Load payment params from server
  try {
    const res = await fetch('/api/payment-params');
    params = await res.json();
    document.getElementById('pay-amount').textContent = params.amount;
  } catch {
    setOverlaySub('Server unavailable. Try reloading.');
    return;
  }

  window.connectWallet = async function () {
    if (!window.ethereum) {
      alert('MetaMask not found. Please install it.');
      return;
    }

    // Request accounts
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    userAddress = accounts[0];

    // Switch to / add Arc testnet
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: ARC_TESTNET.chainId }],
      });
    } catch (err) {
      if (err.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [ARC_TESTNET],
        });
      } else {
        throw err;
      }
    }

    show('step-connect', false);
    show('step-pay', true);
    setOverlaySub(`Connected: ${userAddress.slice(0, 6)}…${userAddress.slice(-4)}`);
  };

  window.pay = async function () {
    document.getElementById('pay-btn').disabled = true;
    show('step-pay', false);
    show('step-pending', true);
    setPending('Waiting for signature…');

    try {
      const validAfter = 0;
      const validBefore = Math.floor(Date.now() / 1000) + 300; // 5 min window
      const nonce = ethers.hexlify(ethers.randomBytes(32));

      const typedData = {
        domain: {
          name: params.usdcName,
          version: params.usdcVersion,
          chainId: params.chainId,
          verifyingContract: params.usdcContract,
        },
        types: {
          TransferWithAuthorization: [
            { name: 'from',        type: 'address' },
            { name: 'to',          type: 'address' },
            { name: 'value',       type: 'uint256' },
            { name: 'validAfter',  type: 'uint256' },
            { name: 'validBefore', type: 'uint256' },
            { name: 'nonce',       type: 'bytes32' },
          ],
        },
        primaryType: 'TransferWithAuthorization',
        message: {
          from: userAddress,
          to: params.serverAddress,
          value: params.amountRaw,
          validAfter,
          validBefore,
          nonce,
        },
      };

      const signature = await window.ethereum.request({
        method: 'eth_signTypedData_v4',
        params: [userAddress, JSON.stringify(typedData)],
      });

      setPending('Submitting on-chain…');
      setOverlaySub('Confirming payment…');

      const res = await fetch('/api/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: userAddress,
          value: params.amountRaw,
          validAfter,
          validBefore,
          nonce,
          signature,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Payment failed');

      localStorage.setItem(TOKEN_KEY, data.token);
      show('step-pending', false);
      show('step-done', true);
      setOverlaySub('Payment confirmed!');

      setTimeout(() => tryReveal(data.token), 600);
    } catch (err) {
      show('step-pending', false);
      show('step-pay', true);
      document.getElementById('pay-btn').disabled = false;
      setOverlaySub('Payment failed. Try again.');
      console.error(err);
      alert(err.message);
    }
  };

  async function tryReveal(token) {
    const res = await fetch('/api/content', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return false;
    const { content } = await res.json();
    document.getElementById('gated-text').textContent = content;
    document.getElementById('gated-overlay').classList.add('revealed');
    document.getElementById('payment-ui').classList.add('hidden');
    return true;
  }

  function show(id, visible) {
    document.getElementById(id).classList.toggle('hidden', !visible);
  }

  function setOverlaySub(text) {
    document.getElementById('overlay-sub').textContent = text;
  }

  function setPending(text) {
    document.getElementById('pending-msg').textContent = text;
  }
})();
