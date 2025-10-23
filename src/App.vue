<template>
  <main class="container">
    <header>
      <h1>Memecoin Analyzer</h1>
      <p class="subtitle">
        Enter a Solana token address to look up its associated pair address via Moralis.
      </p>
    </header>

    <form class="lookup" @submit.prevent="fetchPairAddress">
      <section class="parameters" aria-labelledby="parameters-heading">
        <h2 id="parameters-heading">Parameters</h2>

        <div class="parameters-dates">
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

        <div class="parameters-timeframes">
          <label
            v-for="config in timeframeConfigs"
            :key="config.id"
            class="control-label parameter-timeframe"
            :for="`timeframe-${config.id}`"
          >
            {{ config.label }}
            <select :id="`timeframe-${config.id}`" v-model="config.timeframe">
              <option v-for="option in timeframeOptions" :key="option" :value="option">
                {{ option }}
              </option>
            </select>
          </label>
        </div>
      </section>

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

      <p v-if="!hasApiKey" class="error status-message" aria-live="polite">
        Missing Moralis API key. Set <code>VITE_MORALIS_API_KEY</code> in your environment to enable requests.
      </p>
      <p v-else-if="errorMessage" class="error status-message" aria-live="polite">
        {{ errorMessage }}
      </p>
      <p v-else-if="!pairAddress" class="placeholder status-message" aria-live="polite">
        Submit a token address to analyze market data.
      </p>
    </form>

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
          <div class="token-overview-item">
            <dt>DEX liquidity</dt>
            <dd>{{ formattedTokenOverview.dexLiquidity ?? '—' }}</dd>
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

      <p v-if="dateError" class="error">{{ dateError }}</p>

      <div class="timeframes">
        <article v-for="config in timeframeConfigs" :key="config.id" class="timeframe-card">
          <div class="timeframe-header">
            <span class="timeframe-title">{{ config.label }}</span>
            <span class="timeframe-setting">Timeframe: {{ config.timeframe }}</span>
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

    <section class="aftershock" aria-live="polite">
      <h2>Aftershock strategy assessment</h2>

      <p v-if="!tokenOverviewRequested" class="placeholder">
        Submit a token address to run the Aftershock analysis.
      </p>
      <p v-else-if="timeframeLoading" class="placeholder">Calculating Aftershock setup…</p>
      <div v-else class="aftershock-content">
        <div class="aftershock-summary">
          <div class="summary-item">
            <span class="summary-label">Verdict</span>
            <span class="summary-value verdict">{{ aftershockAnalysis.verdict }}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Setup score</span>
            <span class="summary-value">
              {{ aftershockAnalysis.setup_score }}
              <template v-if="aftershockAnalysis.setup_score_max">
                / {{ aftershockAnalysis.setup_score_max }}
              </template>
            </span>
          </div>
        </div>

        <p v-if="aftershockDrawGuidance" class="aftershock-guidance">{{ aftershockDrawGuidance }}</p>

        <div v-if="aftershockFibLevels.length" class="aftershock-fib">
          <h3>Fibonacci retracement levels</h3>
          <ul>
            <li v-for="level in aftershockFibLevels" :key="level.key" class="fib-level">
              <span class="fib-label">Fib {{ level.levelLabel }}</span>
              <span class="fib-price">{{ level.formattedPrice ?? '—' }}</span>
              <span :class="['fib-status', `fib-status--${level.statusClass}`]">{{ level.statusText }}</span>
            </li>
          </ul>
        </div>

        <div v-if="aftershockAnalysis.reasons?.length" class="aftershock-reasons">
          <h3>Key factors</h3>
          <ul>
            <li v-for="reason in aftershockAnalysis.reasons" :key="`${reason.tag}-${reason.detail}`">
              <span class="reason-tag">{{ reason.tag }}</span>
              <span class="reason-detail">{{ reason.detail }}</span>
            </li>
          </ul>
        </div>

        <div v-if="aftershockOhlcvSources.length" class="aftershock-ohlcv">
          <h3>OHLCV inputs used in analysis</h3>
          <div class="aftershock-ohlcv-list">
            <article v-for="source in aftershockOhlcvSources" :key="source.key" class="aftershock-ohlcv-card">
              <header>
                <h4>{{ source.label }}</h4>
                <p class="aftershock-ohlcv-meta">
                  {{ source.candleCount }} candles · timeframe setting: {{ source.timeframe || 'n/a' }}
                </p>
              </header>
              <details>
                <summary>Show candles</summary>
                <pre>{{ source.serialized }}</pre>
              </details>
            </article>
          </div>
        </div>

        <details class="aftershock-evidence">
          <summary>Show evidence</summary>
          <pre>{{ formattedAftershockEvidence }}</pre>
        </details>
      </div>
    </section>
  </main>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { analyzeTokenAftershock } from './aftershockAnalyzer';

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
    dexLiquidity: null,
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
  dexLiquidity: formatCurrency(tokenOverview.value.dexLiquidity),
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
      liquidityUsd: null,
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
    liquidityUsd: normalizeNumber(
      pairInfo.liquidity?.usd ??
        pairInfo.liquidityUsd ??
        pairInfo.liquidityUSD ??
        pairInfo.liquidity?.usdValue ??
        pairInfo.liquidity,
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
    const { priceUsd, volume24h, priceChange24h, liquidityUsd } = dexResult.value;

    if (tokenOverview.value.price === null && priceUsd !== null) {
      tokenOverview.value.price = priceUsd;
    }

    if (volume24h !== null) {
      tokenOverview.value.volume24h = volume24h;
    }

    if (priceChange24h !== null) {
      tokenOverview.value.priceChange24h = priceChange24h;
    }

    if (liquidityUsd !== null && liquidityUsd !== undefined) {
      tokenOverview.value.dexLiquidity = liquidityUsd;
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

const timeframeLoading = computed(() =>
  timeframeConfigs.value.some((config) => config.loading),
);

const aftershockAnalysis = computed(() => {
  try {
    return analyzeTokenAftershock(tokenOverview, timeframeConfigs.value);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown analysis error';
    return {
      verdict: 'Error',
      setup_score: 0,
      setup_score_max: 0,
      reasons: [{ tag: 'ANALYSIS_ERROR', detail: message }],
      evidence: {},
    };
  }
});

const aftershockFibLevels = computed(() => {
  const levels = aftershockAnalysis.value?.evidence?.fibLevels;
  if (!Array.isArray(levels)) {
    return [];
  }

  const sorted = [...levels].sort((a, b) => {
    const aLevel = typeof a.level === 'number' ? a.level : Number(a.level);
    const bLevel = typeof b.level === 'number' ? b.level : Number(b.level);
    if (!Number.isFinite(aLevel) || !Number.isFinite(bLevel)) {
      return 0;
    }
    return bLevel - aLevel;
  });

  return sorted.map((entry) => {
    const formattedPrice = formatCurrency(entry.price);
    const normalizedLevel = typeof entry.level === 'number' ? entry.level : Number(entry.level);
    const levelLabel = Number.isFinite(normalizedLevel)
      ? normalizedLevel.toFixed(normalizedLevel === 0 || normalizedLevel === 1 ? 0 : 3)
          .replace(/0+$/, '')
          .replace(/\.$/, '')
      : entry.level;

    let statusText = 'Unknown';
    let statusClass = 'unknown';
    if (entry.isValid === true) {
      statusText = 'Holding';
      statusClass = 'valid';
    } else if (entry.isValid === false) {
      statusText = 'Breached';
      statusClass = 'invalid';
    }

    return {
      key: `${entry.level}`,
      level: entry.level,
      levelLabel,
      formattedPrice,
      statusText,
      statusClass,
    };
  });
});

const formattedAftershockEvidence = computed(() => {
  const evidence = aftershockAnalysis.value?.evidence;
  if (!evidence || Object.keys(evidence).length === 0) {
    return 'No evidence available.';
  }
  return JSON.stringify(evidence, null, 2);
});

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

const aftershockDrawGuidance = computed(() => {
  const impulseSource = aftershockAnalysis.value?.evidence?.impulseSource;
  if (!impulseSource) {
    return '';
  }

  if (!impulseSource.candles) {
    const label = impulseSource.label ?? 'impulse timeframe';
    return `Insufficient candles in the ${label.toLowerCase()} dataset to anchor Fibonacci levels.`;
  }

  const timeframeLabel = impulseSource.label ?? 'Shortest timeframe';
  const timeframeSetting = impulseSource.timeframe ?? 'selected interval';
  return `Draw Fibonacci levels on the ${timeframeLabel.toLowerCase()} (${timeframeSetting}) chart — this is the dataset used to detect the impulse.`;
});

const aftershockOhlcvSources = computed(() => {
  const evidence = aftershockAnalysis.value?.evidence;
  const ohlcv = evidence?.ohlcv;
  if (!ohlcv || typeof ohlcv !== 'object') {
    return [];
  }

  const configSnapshot = timeframeConfigs.value ?? [];
  const fallbackMeta = {
    short: configSnapshot[0] ?? {},
    '10m': configSnapshot[0] ?? {},
    medium: configSnapshot[1] ?? {},
    '30m': configSnapshot[1] ?? {},
    long: configSnapshot[2] ?? {},
    '1h': configSnapshot[2] ?? {},
  };

  const orderMap = new Map([
    ['short', 0],
    ['10m', 0],
    ['medium', 1],
    ['30m', 1],
    ['long', 2],
    ['1h', 2],
  ]);

  const labelFallback = (key) => {
    if (key === 'short' || key === '10m') return 'Shortest timeframe';
    if (key === 'medium' || key === '30m') return 'Medium timeframe';
    if (key === 'long' || key === '1h') return 'Longest timeframe';
    return key;
  };

  return Object.entries(ohlcv)
    .map(([key, value]) => {
      const entry = Array.isArray(value) ? { candles: value } : value ?? {};
      const candles = Array.isArray(entry.candles) ? entry.candles : Array.isArray(value) ? value : [];
      const fallback = fallbackMeta[key] ?? {};
      const label = entry.label ?? fallback.label ?? labelFallback(key);
      const timeframeValue = entry.timeframe ?? fallback.timeframe ?? null;

      return {
        key,
        label,
        timeframe: timeframeValue ?? 'n/a',
        candleCount: candles.length,
        serialized: candles.length ? JSON.stringify(candles, null, 2) : '[]',
        order: orderMap.has(key) ? orderMap.get(key) : 99,
      };
    })
    .sort((a, b) => a.order - b.order)
    .map(({ order, ...rest }) => rest);
});

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

.parameters {
  background: white;
  border-radius: 1rem;
  padding: 1.5rem;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.parameters h2 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  color: #111827;
}

.parameters-dates {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
}

.parameters-timeframes {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
}

.parameter-timeframe {
  gap: 0.4rem;
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

.status-message {
  margin: 0;
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

.timeframe-setting {
  font-size: 0.9rem;
  color: #475569;
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

.aftershock {
  background: white;
  border-radius: 1rem;
  padding: 1.5rem;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.aftershock h2 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
}

.aftershock-content {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.aftershock-summary {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.aftershock-guidance {
  margin: 0;
  padding: 0.75rem 1rem;
  border-radius: 0.75rem;
  background: #eef2ff;
  color: #312e81;
  font-weight: 500;
}

.aftershock-fib {
  margin-top: 1.5rem;
}

.aftershock-fib h3 {
  margin: 0 0 0.75rem;
  font-size: 1rem;
  color: #111827;
}

.aftershock-fib ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.fib-level {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  border-radius: 0.75rem;
  background: #f8fafc;
}

.fib-label {
  font-weight: 600;
  color: #0f172a;
}

.fib-price {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  color: #1e293b;
}

.fib-status {
  font-size: 0.8125rem;
  font-weight: 600;
  padding: 0.35rem 0.65rem;
  border-radius: 999px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.fib-status--valid {
  background: rgba(16, 185, 129, 0.15);
  color: #047857;
}

.fib-status--invalid {
  background: rgba(239, 68, 68, 0.15);
  color: #b91c1c;
}

.fib-status--unknown {
  background: rgba(148, 163, 184, 0.15);
  color: #475569;
}

.summary-item {
  background: #eef2ff;
  border-radius: 0.75rem;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.summary-label {
  text-transform: uppercase;
  font-size: 0.75rem;
  letter-spacing: 0.05em;
  color: #4338ca;
  font-weight: 700;
}

.summary-value {
  font-size: 1.375rem;
  font-weight: 700;
  color: #1e1b4b;
}

.summary-value.verdict {
  text-transform: uppercase;
}

.aftershock-reasons h3 {
  margin: 0 0 0.5rem;
  font-size: 1.1rem;
  color: #1f2937;
}

.aftershock-reasons ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 0.75rem;
}

.aftershock-ohlcv {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.aftershock-ohlcv-list {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
}

.aftershock-ohlcv-card {
  background: #f8fafc;
  border-radius: 0.75rem;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.05);
}

.aftershock-ohlcv-card h4 {
  margin: 0;
  font-size: 1rem;
}

.aftershock-ohlcv-meta {
  margin: 0.25rem 0 0;
  color: #475569;
  font-size: 0.9rem;
}

.aftershock-ohlcv-card details {
  background: white;
  border-radius: 0.5rem;
  padding: 0.5rem 0.75rem;
}

.aftershock-ohlcv-card pre {
  background: transparent;
  margin: 0;
  max-height: 200px;
  overflow: auto;
  font-size: 0.75rem;
}

.aftershock-reasons li {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: baseline;
  padding: 0.75rem 1rem;
  border-radius: 0.75rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.reason-tag {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.8rem;
  font-weight: 600;
  color: #4338ca;
  background: rgba(67, 56, 202, 0.1);
  padding: 0.25rem 0.5rem;
  border-radius: 999px;
}

.reason-detail {
  color: #1f2937;
}

.aftershock-evidence summary {
  cursor: pointer;
  font-weight: 600;
  color: #4338ca;
}

.aftershock-evidence pre {
  margin-top: 0.75rem;
  background: #0f172a;
  color: #f8fafc;
  padding: 1rem;
  border-radius: 0.75rem;
  overflow-x: auto;
  font-size: 0.85rem;
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
