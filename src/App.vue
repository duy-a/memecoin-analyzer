<template>
  <main class="container">
    <input
      id="tokenAddress"
      v-model.trim="tokenAddress"
      type="text"
      class="token-input"
      placeholder="Enter Solana token address and press Enter"
      :disabled="loading"
      @keyup.enter="handleSubmit"
      aria-label="Solana token address"
      required
    />

    <p v-if="statusMessage" :class="['status-message', { error: hasError }]" aria-live="polite">
      {{ statusMessage }}
    </p>

    <pre v-if="combinedResponse" class="json-output">{{ formattedJson }}</pre>
  </main>
</template>

<script setup>
import { computed, ref } from 'vue';

const tokenAddress = ref('');
const loading = ref(false);
const statusMessage = ref('');
const hasError = ref(false);
const combinedResponse = ref(null);

const apiKey = import.meta.env.VITE_MORALIS_API_KEY ?? '';
const hasApiKey = computed(() => Boolean(apiKey));

const timeframeSelections = ['1min', '10min', '1h'];

function getDefaultDateRange() {
  const end = new Date();
  const start = new Date(end);
  start.setMonth(start.getMonth() - 1);

  return {
    fromDateIso: start.toISOString(),
    toDateIso: end.toISOString(),
  };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return response.json();
}

async function fetchDexscreenerOverview(address) {
  const url = `https://api.dexscreener.com/tokens/v1/solana/${encodeURIComponent(address)}`;
  return fetchJson(url);
}

async function fetchTokenHolders(address) {
  const url = `https://solana-gateway.moralis.io/token/mainnet/holders/${encodeURIComponent(address)}`;
  return fetchJson(url, {
    headers: {
      'X-API-Key': apiKey,
    },
  });
}

async function fetchOhlcv(pairAddress, timeframe, range) {
  const url = `https://solana-gateway.moralis.io/token/mainnet/pairs/${encodeURIComponent(
    pairAddress,
  )}/ohlcv?fromDate=${encodeURIComponent(range.fromDateIso)}&toDate=${encodeURIComponent(
    range.toDateIso,
  )}&timeframe=${encodeURIComponent(timeframe)}&currency=usd`;

  return fetchJson(url, {
    headers: {
      'X-API-Key': apiKey,
    },
  });
}

async function handleSubmit() {
  if (loading.value) {
    return;
  }

  statusMessage.value = '';
  hasError.value = false;
  combinedResponse.value = null;

  if (!tokenAddress.value) {
    statusMessage.value = 'Please enter a token address.';
    hasError.value = true;
    return;
  }

  if (!hasApiKey.value) {
    statusMessage.value = 'Moralis API key is not configured.';
    hasError.value = true;
    return;
  }

  loading.value = true;
  statusMessage.value = 'Fetching token data…';

  try {
    const priceUrl = `https://solana-gateway.moralis.io/token/mainnet/${encodeURIComponent(
      tokenAddress.value,
    )}/price`;

    const priceResponse = await fetchJson(priceUrl, {
      headers: {
        'X-API-Key': apiKey,
      },
    });

    const pairAddress = priceResponse?.pairAddress;

    if (!pairAddress) {
      throw new Error('Pair address not found in response.');
    }

    const dateRange = getDefaultDateRange();

    const [dexResult, holdersResult, ohlcvResults] = await Promise.all([
      Promise.resolve()
        .then(() => fetchDexscreenerOverview(tokenAddress.value))
        .then((data) => ({ status: 'fulfilled', value: data }))
        .catch((error) => ({ status: 'rejected', reason: error })),
      Promise.resolve()
        .then(() => fetchTokenHolders(tokenAddress.value))
        .then((data) => ({ status: 'fulfilled', value: data }))
        .catch((error) => ({ status: 'rejected', reason: error })),
      Promise.all(
        timeframeSelections.map((timeframe) =>
          Promise.resolve()
            .then(() => fetchOhlcv(pairAddress, timeframe, dateRange))
            .then((data) => ({ timeframe, status: 'fulfilled', value: data }))
            .catch((error) => ({ timeframe, status: 'rejected', reason: error })),
        ),
      ),
    ]);

    const ohlcv = {};
    for (const result of ohlcvResults) {
      if (result.status === 'fulfilled') {
        ohlcv[result.timeframe] = result.value;
      } else {
        ohlcv[result.timeframe] = { error: result.reason instanceof Error ? result.reason.message : String(result.reason) };
      }
    }

    const aggregated = {
      moralisPrice: priceResponse,
      dexscreener: dexResult.status === 'fulfilled'
        ? dexResult.value
        : { error: dexResult.reason instanceof Error ? dexResult.reason.message : String(dexResult.reason) },
      tokenHolders: holdersResult.status === 'fulfilled'
        ? holdersResult.value
        : { error: holdersResult.reason instanceof Error ? holdersResult.reason.message : String(holdersResult.reason) },
      ohlcv,
    };

    combinedResponse.value = aggregated;
    statusMessage.value = '';
  } catch (error) {
    hasError.value = true;
    statusMessage.value = error instanceof Error ? error.message : 'Unable to fetch token data.';
  } finally {
    loading.value = false;
  }
}

const formattedJson = computed(() =>
  combinedResponse.value ? JSON.stringify(combinedResponse.value, null, 2) : '',
);
</script>

<style scoped>
.container {
  margin: 0 auto;
  padding: 3rem 1.5rem;
  max-width: 720px;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.token-input {
  width: 100%;
  padding: 1rem 1.25rem;
  border-radius: 0.75rem;
  border: 1px solid #cbd5f5;
  font-size: 1rem;
  font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
}

.token-input:disabled {
  opacity: 0.6;
}

.status-message {
  margin: 0;
  font-size: 0.95rem;
  color: #1f2937;
}

.status-message.error {
  color: #b91c1c;
}

.json-output {
  background: #0f172a;
  color: #f8fafc;
  padding: 1.5rem;
  border-radius: 1rem;
  overflow: auto;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.9rem;
}
</style>
