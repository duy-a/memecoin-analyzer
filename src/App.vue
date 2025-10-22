<template>
  <main class="container">
    <header>
      <h1>Memecoin Analyzer</h1>
      <p class="subtitle">
        Enter a Solana token address to look up its associated pair address via Moralis.
      </p>
    </header>

    <form class="lookup" @submit.prevent="fetchPairAddress">
      <label for="tokenAddress">Token address</label>
      <input
        id="tokenAddress"
        v-model.trim="tokenAddress"
        type="text"
        placeholder="Enter Solana token address"
        :disabled="loading"
        required
      />
      <button type="submit" :disabled="loading || !tokenAddress">
        {{ loading ? 'Fetching…' : 'Get pair address' }}
      </button>
    </form>

    <section class="status" aria-live="polite">
      <p v-if="!hasApiKey" class="error">
        Missing Moralis API key. Set <code>VITE_MORALIS_API_KEY</code> in your environment to enable requests.
      </p>
      <p v-else-if="errorMessage" class="error">{{ errorMessage }}</p>
      <p v-else-if="pairAddress" class="result">
        Pair address: <span class="value">{{ pairAddress }}</span>
      </p>
      <p v-else class="placeholder">Submit a token address to fetch its pair address.</p>
    </section>

    <section v-if="pairAddress" class="ohlcv">
      <h2>OHLCV data</h2>

      <div class="controls">
        <label class="control-label" for="fromDate">
          From date
          <input
            id="fromDate"
            type="date"
            v-model="fromDateInput"
            :max="toDateInput"
          />
        </label>

        <label class="control-label" for="toDate">
          To date
          <input id="toDate" type="date" v-model="toDateInput" :min="fromDateInput" />
        </label>
      </div>

      <p v-if="dateError" class="error">{{ dateError }}</p>

      <div class="timeframes">
        <article v-for="config in timeframeConfigs" :key="config.id" class="timeframe-card">
          <div class="timeframe-header">
            <span class="timeframe-title">{{ config.label }}</span>
            <label class="control-label" :for="`timeframe-${config.id}`">
              Timeframe
              <select :id="`timeframe-${config.id}`" v-model="config.timeframe">
                <option v-for="option in timeframeOptions" :key="option" :value="option">
                  {{ option }}
                </option>
              </select>
            </label>
          </div>

          <div class="card-content">
            <p v-if="config.loading" class="placeholder">Loading…</p>
            <p v-else-if="config.error" class="error">{{ config.error }}</p>
            <pre v-else-if="config.data">{{ JSON.stringify(config.data, null, 2) }}</pre>
            <p v-else class="placeholder">Adjust the settings to load data.</p>
          </div>
        </article>
      </div>
    </section>
  </main>
</template>

<script setup>
import { computed, ref, watch } from 'vue';

const tokenAddress = ref('');
const pairAddress = ref('');
const errorMessage = ref('');
const loading = ref(false);

const apiKey = import.meta.env.VITE_MORALIS_API_KEY;
const hasApiKey = computed(() => Boolean(apiKey));

const timeframeOptions = [
  '1s',
  '10s',
  '30s',
  '1min',
  '5min',
  '10min',
  '30min',
  '1h',
  '4h',
  '12h',
  '1d',
  '1w',
  '1M',
];

const timeframeConfigs = ref([
  { id: 'tf-1', label: 'Shortest timeframe', timeframe: '1min', data: null, error: '', loading: false },
  { id: 'tf-2', label: 'Medium timeframe', timeframe: '10min', data: null, error: '', loading: false },
  { id: 'tf-3', label: 'Longest timeframe', timeframe: '1h', data: null, error: '', loading: false },
]);

function formatDateInput(date) {
  return date.toISOString().slice(0, 10);
}

function getDefaultFromDate() {
  const date = new Date();
  date.setMonth(date.getMonth() - 1);
  date.setHours(0, 0, 0, 0);
  return date;
}

const now = new Date();
const fromDateInput = ref(formatDateInput(getDefaultFromDate()));
const toDateInput = ref(formatDateInput(now));
const dateError = ref('');

function resetOhlcvState() {
  timeframeConfigs.value.forEach((config) => {
    config.data = null;
    config.error = '';
    config.loading = false;
  });
}

function resolveDateRange() {
  const currentTime = new Date();
  const start = new Date(`${fromDateInput.value}T00:00:00`);
  const end = new Date(`${toDateInput.value}T00:00:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    dateError.value = 'Please provide valid start and end dates.';
    return null;
  }

  end.setHours(
    currentTime.getHours(),
    currentTime.getMinutes(),
    currentTime.getSeconds(),
    currentTime.getMilliseconds(),
  );

  if (end <= start) {
    dateError.value = 'End date must be after the start date.';
    return null;
  }

  dateError.value = '';

  return {
    fromDateIso: start.toISOString(),
    toDateIso: end.toISOString(),
  };
}

async function fetchOhlcvForConfig(config, pair, fromDateIso, toDateIso) {
  config.loading = true;
  config.error = '';
  config.data = null;

  try {
    const url = `https://solana-gateway.moralis.io/token/mainnet/pairs/${encodeURIComponent(
      pair,
    )}/ohlcv?fromDate=${encodeURIComponent(fromDateIso)}&toDate=${encodeURIComponent(
      toDateIso,
    )}&timeframe=${encodeURIComponent(config.timeframe)}&currency=usd`;

    const response = await fetch(url, {
      headers: {
        'X-API-Key': apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    config.data = await response.json();
  } catch (error) {
    config.error = error instanceof Error ? error.message : 'Unable to fetch OHLCV data.';
  } finally {
    config.loading = false;
  }
}

async function fetchAllOhlcvData() {
  if (!hasApiKey.value || !pairAddress.value) {
    return;
  }

  const range = resolveDateRange();

  if (!range) {
    timeframeConfigs.value.forEach((config) => {
      config.loading = false;
      config.data = null;
      config.error = dateError.value;
    });
    return;
  }

  await Promise.all(
    timeframeConfigs.value.map((config) =>
      fetchOhlcvForConfig(config, pairAddress.value, range.fromDateIso, range.toDateIso),
    ),
  );
}

watch([fromDateInput, toDateInput], () => {
  if (pairAddress.value) {
    fetchAllOhlcvData();
  }
});

watch(
  () => timeframeConfigs.value.map((config) => config.timeframe).join('|'),
  () => {
    if (pairAddress.value) {
      fetchAllOhlcvData();
    }
  },
);

async function fetchPairAddress() {
  if (!hasApiKey.value) {
    errorMessage.value = 'Moralis API key is not configured.';
    return;
  }

  if (!tokenAddress.value) {
    errorMessage.value = 'Please enter a token address.';
    return;
  }

  loading.value = true;
  errorMessage.value = '';
  pairAddress.value = '';
  resetOhlcvState();

  try {
    const response = await fetch(
      `https://solana-gateway.moralis.io/token/mainnet/${encodeURIComponent(tokenAddress.value)}/price`,
      {
        headers: {
          'X-API-Key': apiKey,
        },
      },
    );

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const data = await response.json();

    if (!data.pairAddress) {
      throw new Error('Pair address not found in response.');
    }

    pairAddress.value = data.pairAddress;
    fetchAllOhlcvData();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Unable to fetch pair address.';
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.container {
  margin: 0 auto;
  padding: 3rem 1.5rem;
  max-width: 640px;
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

header {
  text-align: center;
}

.subtitle {
  color: #475569;
  margin: 0.5rem 0 0;
}

.lookup {
  display: grid;
  gap: 0.75rem;
}

label {
  font-weight: 600;
  color: #0f172a;
}

input {
  padding: 0.75rem 1rem;
  border: 1px solid #cbd5f5;
  border-radius: 0.75rem;
  font-size: 1rem;
  transition: border-color 0.2s ease;
}

input:focus {
  outline: none;
  border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
}

button {
  padding: 0.75rem 1rem;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: white;
  border: none;
  border-radius: 0.75rem;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s ease, opacity 0.2s ease;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

button:not(:disabled):hover {
  transform: translateY(-1px);
}

.status {
  background: white;
  border-radius: 1rem;
  padding: 1.5rem;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
}

.placeholder {
  color: #94a3b8;
}

.error {
  color: #dc2626;
}

.result {
  font-weight: 600;
  color: #0f172a;
}

.value {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  word-break: break-all;
}

.ohlcv {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.ohlcv h2 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
}

.controls {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
}

.control-label {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  font-weight: 600;
  color: #0f172a;
}

select {
  padding: 0.75rem 1rem;
  border: 1px solid #cbd5f5;
  border-radius: 0.75rem;
  font-size: 1rem;
  transition: border-color 0.2s ease;
  background-color: white;
}

select:focus {
  outline: none;
  border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
}

.timeframes {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.timeframe-card {
  background: white;
  border-radius: 1rem;
  padding: 1.5rem;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.timeframe-header {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.timeframe-title {
  font-weight: 600;
  color: #0f172a;
}

.card-content {
  flex: 1;
}

.card-content pre {
  background: #0f172a;
  color: #f8fafc;
  padding: 1rem;
  border-radius: 0.75rem;
  overflow-x: auto;
  font-size: 0.85rem;
  max-height: 320px;
}

.card-content .placeholder {
  color: #94a3b8;
}
</style>
