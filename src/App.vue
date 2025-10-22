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

    <section class="token-overview" aria-live="polite">
      <h2>Token overview</h2>

      <p v-if="tokenOverviewError" class="error">{{ tokenOverviewError }}</p>
      <p v-else-if="tokenOverviewLoading" class="placeholder">Loading token information…</p>

      <div v-else-if="tokenOverviewRequested" class="token-overview-content">
        <dl class="token-overview-grid">
          <div class="token-overview-item">
            <dt>Current price</dt>
            <dd>{{ formattedTokenOverview.price ?? '—' }}</dd>
          </div>
          <div class="token-overview-item">
            <dt>24h volume</dt>
            <dd>{{ formattedTokenOverview.volume24h ?? '—' }}</dd>
          </div>
          <div class="token-overview-item">
            <dt>24h price change</dt>
            <dd>{{ formattedTokenOverview.priceChange24h ?? '—' }}</dd>
          </div>
          <div class="token-overview-item">
            <dt>Total holders</dt>
            <dd>{{ formattedTokenOverview.holders ?? '—' }}</dd>
          </div>
        </dl>
        <p v-if="!hasTokenOverviewData" class="placeholder muted">
          No overview data is available for this token yet.
        </p>
      </div>

      <p v-else class="placeholder">Submit a token address to view token details.</p>
    </section>

    <section class="ohlcv">
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
            <p v-if="!pairAddress" class="placeholder">Fetch a pair address to load OHLCV data.</p>
            <p v-else-if="config.loading" class="placeholder">Loading…</p>
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

function createEmptyTokenOverview() {
  return {
    price: null,
    volume24h: null,
    priceChange24h: null,
    holders: null,
  };
}

const tokenOverview = ref(createEmptyTokenOverview());
const tokenOverviewRequested = ref(false);
const tokenOverviewLoading = ref(false);
const tokenOverviewError = ref('');

const hasTokenOverviewData = computed(() =>
  Object.values(tokenOverview.value).some(
    (value) => value !== null && value !== undefined,
  ),
);

function normalizeNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const sanitized = value.replace(/[,%$\s]/g, '');
    if (!sanitized) {
      return null;
    }

    const parsed = Number(sanitized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function formatCurrency(value) {
  const normalized = normalizeNumber(value);

  if (normalized === null) {
    return null;
  }

  const maximumFractionDigits = Math.abs(normalized) < 1 ? 6 : 2;

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits,
  }).format(normalized);
}

function formatNumber(value) {
  const normalized = normalizeNumber(value);

  if (normalized === null) {
    return null;
  }

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(normalized);
}

function formatPercentage(value) {
  const normalized = normalizeNumber(value);

  if (normalized === null) {
    return null;
  }

  const formatted = normalized.toFixed(2);
  const sign = normalized > 0 ? '+' : '';

  return `${sign}${formatted}%`;
}

const formattedTokenOverview = computed(() => ({
  price: formatCurrency(tokenOverview.value.price),
  volume24h: formatCurrency(tokenOverview.value.volume24h),
  priceChange24h: formatPercentage(tokenOverview.value.priceChange24h),
  holders: formatNumber(tokenOverview.value.holders),
}));

async function fetchDexscreenerOverview(address) {
  const url = `https://api.dexscreener.com/tokens/v1/solana/${encodeURIComponent(address)}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`DexScreener request failed with status ${response.status}`);
  }

  const data = await response.json();
  const rootEntry = Array.isArray(data) ? data[0] : data;
  const pairInfo =
    rootEntry?.pairs?.[0] ?? rootEntry?.pair ?? rootEntry?.data ?? rootEntry?.token ?? rootEntry;

  if (!pairInfo || typeof pairInfo !== 'object') {
    return {
      priceUsd: null,
      volume24h: null,
      priceChange24h: null,
    };
  }

  return {
    priceUsd: normalizeNumber(
      pairInfo.priceUsd ?? pairInfo.priceUSD ?? pairInfo.price?.usd ?? pairInfo.price,
    ),
    volume24h: normalizeNumber(
      pairInfo.volume?.h24 ?? pairInfo.volume24h ?? pairInfo['24hVolume'] ?? pairInfo.volume,
    ),
    priceChange24h: normalizeNumber(
      pairInfo.priceChange?.h24 ??
        pairInfo.priceChange24h ??
        pairInfo.priceChange24Hour ??
        pairInfo.priceChange,
    ),
  };
}

async function fetchTokenHoldersCount(address) {
  const url = `https://solana-gateway.moralis.io/token/mainnet/holders/${encodeURIComponent(
    address,
  )}`;

  const response = await fetch(url, {
    headers: {
      'X-API-Key': apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`Token holder request failed with status ${response.status}`);
  }

  const data = await response.json();
  const candidates = [
    data?.total,
    data?.totalHolders,
    data?.result?.total,
    data?.result?.totalHolders,
    data?.holders?.total,
    data?.pagination?.total,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeNumber(candidate);
    if (normalized !== null) {
      return normalized;
    }
  }

  return null;
}

async function loadAdditionalTokenOverview(address) {
  const errors = [];

  const [dexResult, holdersResult] = await Promise.allSettled([
    fetchDexscreenerOverview(address),
    fetchTokenHoldersCount(address),
  ]);

  if (dexResult.status === 'fulfilled') {
    const { priceUsd, volume24h, priceChange24h } = dexResult.value;

    if (tokenOverview.value.price === null && priceUsd !== null) {
      tokenOverview.value.price = priceUsd;
    }

    if (volume24h !== null) {
      tokenOverview.value.volume24h = volume24h;
    }

    if (priceChange24h !== null) {
      tokenOverview.value.priceChange24h = priceChange24h;
    }
  } else {
    const message =
      dexResult.reason instanceof Error
        ? `Unable to fetch price and volume data: ${dexResult.reason.message}`
        : 'Unable to fetch price and volume data.';
    errors.push(message);
  }

  if (holdersResult.status === 'fulfilled') {
    if (holdersResult.value !== null) {
      tokenOverview.value.holders = holdersResult.value;
    }
  } else {
    const message =
      holdersResult.reason instanceof Error
        ? `Unable to fetch holder data: ${holdersResult.reason.message}`
        : 'Unable to fetch holder data.';
    errors.push(message);
  }

  if (errors.length) {
    tokenOverviewError.value = errors.join(' ');
  }
}

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
    tokenOverviewRequested.value = false;
    tokenOverview.value = createEmptyTokenOverview();
    tokenOverviewError.value = '';
    tokenOverviewLoading.value = false;
    return;
  }

  if (!tokenAddress.value) {
    errorMessage.value = 'Please enter a token address.';
    tokenOverviewRequested.value = false;
    tokenOverview.value = createEmptyTokenOverview();
    tokenOverviewError.value = '';
    tokenOverviewLoading.value = false;
    return;
  }

  loading.value = true;
  errorMessage.value = '';
  pairAddress.value = '';
  resetOhlcvState();

  tokenOverviewRequested.value = true;
  tokenOverviewLoading.value = true;
  tokenOverviewError.value = '';
  tokenOverview.value = createEmptyTokenOverview();

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

    const moralisPrice = normalizeNumber(
      data.usdPrice ?? data.priceUsd ?? data.usdValue ?? data.priceUSD ?? data.price,
    );

    if (moralisPrice !== null) {
      tokenOverview.value.price = moralisPrice;
    }

    if (!data.pairAddress) {
      throw new Error('Pair address not found in response.');
    }

    pairAddress.value = data.pairAddress;
    await loadAdditionalTokenOverview(tokenAddress.value);
    fetchAllOhlcvData();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Unable to fetch pair address.';
    if (!tokenOverviewError.value) {
      tokenOverviewError.value = errorMessage.value;
    }
  } finally {
    loading.value = false;
    tokenOverviewLoading.value = false;
  }
}
</script>

<style scoped>
.container {
  margin: 0 auto;
  padding: 3rem 1.5rem;
  max-width: 1120px;
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

.token-overview {
  background: white;
  border-radius: 1rem;
  padding: 1.5rem;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.token-overview h2 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
}

.token-overview-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.token-overview-grid {
  margin: 0;
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.token-overview-item {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 1rem;
  border-radius: 0.75rem;
  background: #f8fafc;
}

.token-overview-item dt {
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  font-weight: 600;
  text-transform: uppercase;
  color: #64748b;
}

.token-overview-item dd {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: #0f172a;
}

.token-overview .muted {
  color: #94a3b8;
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
  gap: 1.5rem;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
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

@media (min-width: 900px) {
  .timeframe-header {
    flex-direction: row;
    align-items: flex-end;
    justify-content: space-between;
    gap: 1rem;
  }
}
</style>
