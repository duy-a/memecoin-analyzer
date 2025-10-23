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

    <section v-if="combinedResponse" class="json-section">
      <div class="action-buttons">
        <button
          type="button"
          class="copy-button"
          @click="copyJsonToClipboard"
          :disabled="!formattedJson"
        >
          Copy JSON
        </button>
        <button
          type="button"
          class="gpt-button"
          @click="openGptChat"
          :disabled="!formattedJson"
        >
          OpenGPT Chat
        </button>
      </div>
      <p v-if="copyFeedback" class="copy-feedback" aria-live="polite">{{ copyFeedback }}</p>
      <pre class="json-output">{{ formattedJson }}</pre>
    </section>
  </main>
</template>

<script setup>
import { computed, onBeforeUnmount, ref } from 'vue';

const tokenAddress = ref('');
const loading = ref(false);
const statusMessage = ref('');
const hasError = ref(false);
const combinedResponse = ref(null);
const copyFeedback = ref('');
let copyTimeoutId;

const apiKey = import.meta.env.VITE_MORALIS_API_KEY ?? '';
const hasApiKey = computed(() => Boolean(apiKey));

const timeframeSelections = ['1min', '10min', '1h'];
const gptChatUrl = 'https://chatgpt.com/g/g-68f9c00f3c9c8191ae2d561e5d564c85-aftershock-agent';

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
  copyFeedback.value = '';

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

function copyUsingTextarea(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  const successful = document.execCommand('copy');
  document.body.removeChild(textarea);
  if (!successful) {
    throw new Error('Fallback copy command was unsuccessful.');
  }
}

async function copyJsonToClipboard() {
  if (!formattedJson.value) {
    return;
  }

  const jsonText = formattedJson.value;

  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(jsonText);
    } else {
      copyUsingTextarea(jsonText);
    }
    copyFeedback.value = 'JSON copied to clipboard!';
  } catch (error) {
    console.error('Failed to copy JSON to clipboard', error);
    try {
      copyUsingTextarea(jsonText);
      copyFeedback.value = 'JSON copied to clipboard!';
    } catch (fallbackError) {
      console.error('Fallback copy failed', fallbackError);
      copyFeedback.value = 'Unable to copy JSON.';
    }
  } finally {
    clearTimeout(copyTimeoutId);
    copyTimeoutId = setTimeout(() => {
      copyFeedback.value = '';
    }, 2000);
  }
}

async function openGptChat() {
  if (!formattedJson.value) {
    return;
  }

  const prompt = `Please analyze the following token data and provide insights.\n\n${formattedJson.value}`;

  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(prompt);
    } else {
      copyUsingTextarea(prompt);
    }
    copyFeedback.value = 'Prompt copied! Opening GPT chat…';
  } catch (error) {
    console.error('Failed to prepare prompt for GPT chat', error);
    copyFeedback.value = 'Opening GPT chat without copying prompt.';
  } finally {
    clearTimeout(copyTimeoutId);
    copyTimeoutId = setTimeout(() => {
      copyFeedback.value = '';
    }, 2000);

    try {
      const url = new URL(gptChatUrl);
      url.searchParams.set('q', prompt);
      window.open(url.toString(), '_blank', 'noopener,noreferrer');
    } catch (urlError) {
      console.error('Unable to open GPT chat with prompt parameter', urlError);
      window.open(gptChatUrl, '_blank', 'noopener,noreferrer');
    }
  }
}

onBeforeUnmount(() => {
  clearTimeout(copyTimeoutId);
});
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

.json-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.action-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.copy-button,
.gpt-button {
  align-self: flex-start;
  background: #1d4ed8;
  color: #f8fafc;
  border: none;
  padding: 0.6rem 1rem;
  border-radius: 0.6rem;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s ease, transform 0.1s ease;
  box-shadow: 0 10px 25px rgba(29, 78, 216, 0.25);
}

.copy-button:hover:not(:disabled),
.gpt-button:hover:not(:disabled) {
  background: #1e40af;
}

.copy-button:active:not(:disabled),
.gpt-button:active:not(:disabled) {
  transform: translateY(1px);
}

.copy-button:disabled,
.gpt-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  box-shadow: none;
}

.gpt-button {
  background: #0f766e;
  box-shadow: 0 10px 25px rgba(15, 118, 110, 0.25);
}

.gpt-button:hover:not(:disabled) {
  background: #0d5d57;
}

.copy-feedback {
  margin: 0;
  font-size: 0.85rem;
  color: #38bdf8;
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
