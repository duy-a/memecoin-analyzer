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
          <div class="token-overview-item">
            <dt>DEX liquidity</dt>
            <dd>{{ formattedTokenOverview.liquidityUsd ?? '—' }}</dd>
          </div>
          <div class="token-overview-item">
            <dt>Largest holder share</dt>
            <dd>{{ formattedTokenOverview.creatorOwnership ?? '—' }}</dd>
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

    <section class="strategy">
      <h2>Aftershock strategy</h2>

      <p v-if="!aftershockAnalysis.ready" class="placeholder">
        Fetch a token, pair address, and OHLCV data to populate the strategy playbook.
      </p>

      <div v-else class="strategy-layout">
        <article class="strategy-card">
          <header class="strategy-card-header">
            <h3>Trading checklist</h3>
            <p class="muted">
              Validation across {{ aftershockAnalysis.timeframes.join(', ') }} timeframes.
            </p>
          </header>
          <ul class="checklist">
            <li v-for="check in aftershockAnalysis.checks" :key="check.id">
              <span class="status-pill" :class="check.status">{{ check.statusLabel }}</span>
              <div class="checklist-content">
                <span class="checklist-label">{{ check.label }}</span>
                <span class="checklist-value">{{ check.value }}</span>
                <p v-if="check.message" class="checklist-message">{{ check.message }}</p>
              </div>
            </li>
          </ul>
        </article>

        <article class="strategy-card">
          <header class="strategy-card-header">
            <h3>Fibonacci playbook</h3>
            <p class="muted" v-if="aftershockAnalysis.fib" key="fib-meta">
              Swing low {{ aftershockAnalysis.fib.swingLowLabel }} → swing high {{
                aftershockAnalysis.fib.swingHighLabel
              }} (Δ {{ aftershockAnalysis.fib.rangeLabel }})
            </p>
            <p class="muted" v-else>No reliable swing structure detected.</p>
          </header>

          <table v-if="aftershockAnalysis.fib" class="fib-table">
            <thead>
              <tr>
                <th>Level</th>
                <th>Buy zone</th>
                <th>Capital</th>
                <th>Target</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="entry in aftershockAnalysis.capitalPlan" :key="entry.level">
                <td>{{ entry.level }}</td>
                <td>{{ entry.price }}</td>
                <td>{{ entry.capitalShare }}</td>
                <td>{{ entry.target }}</td>
              </tr>
            </tbody>
          </table>
          <p v-else class="placeholder">Waiting for additional OHLCV data.</p>
        </article>

        <article class="strategy-card">
          <header class="strategy-card-header">
            <h3>Actionable insights</h3>
            <p class="muted">Current price {{ aftershockAnalysis.currentPriceLabel ?? '—' }}</p>
          </header>
          <ul class="insights">
            <li v-for="note in aftershockAnalysis.insights" :key="note">{{ note }}</li>
          </ul>
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
    liquidityUsd: null,
    creatorOwnership: null,
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
  liquidityUsd: formatCurrency(tokenOverview.value.liquidityUsd),
  creatorOwnership: formatPercentage(tokenOverview.value.creatorOwnership),
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
    liquidityUsd: normalizeNumber(
      pairInfo.liquidity?.usd ?? pairInfo.liquidityUSD ?? pairInfo.liquidityUsd,
    ),
  };
}

function resolveTopHolderPercentage(data) {
  const arrayCandidates = [
    data?.topHolders,
    data?.result,
    data?.holders,
    data?.items,
    data?.data,
  ];

  let best = null;

  for (const candidate of arrayCandidates) {
    if (!Array.isArray(candidate)) {
      continue;
    }

    candidate.forEach((entry) => {
      if (!entry || typeof entry !== 'object') {
        return;
      }

      const candidates = [
        entry.percentage,
        entry.percent,
        entry.share,
        entry.sharePercent,
        entry.ownerPercentage,
        entry.value,
      ];

      for (const option of candidates) {
        const normalized = normalizeNumber(option);
        if (normalized !== null) {
          if (best === null || normalized > best) {
            best = normalized;
          }
          break;
        }
      }
    });
  }

  if (best === null) {
    const direct = normalizeNumber(
      data?.ownerPercentage ?? data?.creatorPercentage ?? data?.creatorOwnership,
    );
    return direct;
  }

  return best;
}

async function fetchTokenHoldersStats(address) {
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
      return {
        totalHolders: normalized,
        topHolderPercentage: resolveTopHolderPercentage(data),
      };
    }
  }

  return {
    totalHolders: null,
    topHolderPercentage: resolveTopHolderPercentage(data),
  };
}

async function loadAdditionalTokenOverview(address) {
  const errors = [];

  const [dexResult, holdersResult] = await Promise.allSettled([
    fetchDexscreenerOverview(address),
    fetchTokenHoldersStats(address),
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

    if (liquidityUsd !== null) {
      tokenOverview.value.liquidityUsd = liquidityUsd;
    }
  } else {
    const message =
      dexResult.reason instanceof Error
        ? `Unable to fetch price and volume data: ${dexResult.reason.message}`
        : 'Unable to fetch price and volume data.';
    errors.push(message);
  }

  if (holdersResult.status === 'fulfilled') {
    const { totalHolders, topHolderPercentage } = holdersResult.value ?? {};

    if (totalHolders !== null) {
      tokenOverview.value.holders = totalHolders;
    }

    if (topHolderPercentage !== null) {
      tokenOverview.value.creatorOwnership = topHolderPercentage;
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
  { id: 'tf-1', label: 'Shortest timeframe', timeframe: '10min', data: null, error: '', loading: false },
  { id: 'tf-2', label: 'Medium timeframe', timeframe: '30min', data: null, error: '', loading: false },
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

function extractOhlcvSeries(raw) {
  if (!raw) {
    return [];
  }

  const arrayCandidates = [];

  if (Array.isArray(raw)) {
    arrayCandidates.push(raw);
  }

  const nestedKeys = ['items', 'data', 'results', 'values', 'candles', 'ohlcv', 'entries'];

  nestedKeys.forEach((key) => {
    const candidate = raw?.[key];
    if (Array.isArray(candidate)) {
      arrayCandidates.push(candidate);
    }
  });

  const source = arrayCandidates.find((candidate) => candidate.length) ?? [];

  const points = source
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const open = normalizeNumber(entry.open ?? entry.o ?? entry.Open ?? entry.price_open);
      const high = normalizeNumber(entry.high ?? entry.h ?? entry.High ?? entry.price_high);
      const low = normalizeNumber(entry.low ?? entry.l ?? entry.Low ?? entry.price_low);
      const close = normalizeNumber(entry.close ?? entry.c ?? entry.Close ?? entry.price_close);
      const volume = normalizeNumber(entry.volume ?? entry.v ?? entry.Volume ?? entry.baseVolume);

      const timestampRaw =
        entry.timestamp ?? entry.ts ?? entry.time ?? entry.t ?? entry.startTime ?? entry.start;

      const timestamp = (() => {
        if (timestampRaw instanceof Date) {
          return timestampRaw.getTime();
        }

        const parsed = Number(timestampRaw);
        if (Number.isFinite(parsed)) {
          return parsed > 0 && parsed < 1e12 ? parsed * 1000 : parsed;
        }

        if (typeof timestampRaw === 'string') {
          const date = new Date(timestampRaw);
          const time = date.getTime();
          if (!Number.isNaN(time)) {
            return time;
          }
        }

        return null;
      })();

      if (
        open === null &&
        high === null &&
        low === null &&
        close === null &&
        volume === null &&
        timestamp === null
      ) {
        return null;
      }

      return {
        open,
        high,
        low,
        close,
        volume,
        timestamp,
      };
    })
    .filter(Boolean);

  return points.sort((a, b) => {
    if (a.timestamp === null) {
      return -1;
    }
    if (b.timestamp === null) {
      return 1;
    }
    return a.timestamp - b.timestamp;
  });
}

function getSeriesForConfig(config) {
  if (!config) {
    return [];
  }

  return extractOhlcvSeries(config.data);
}

function average(values) {
  const filtered = values.filter((value) => Number.isFinite(value));
  if (!filtered.length) {
    return null;
  }
  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

function computeVolumeTrend(series) {
  if (!series.length) {
    return null;
  }

  const recent = series.slice(-12);
  if (recent.length < 6) {
    return null;
  }

  const midpoint = Math.floor(recent.length / 2);
  const earlier = recent.slice(0, midpoint).map((point) => point.volume ?? null);
  const later = recent.slice(midpoint).map((point) => point.volume ?? null);

  const earlierAverage = average(earlier);
  const laterAverage = average(later);

  if (earlierAverage === null || laterAverage === null || earlierAverage === 0) {
    return null;
  }

  const ratio = laterAverage / earlierAverage;

  return {
    ratio,
    trendUp: ratio >= 1.05,
  };
}

function computePriceImpulse(series) {
  if (!series.length) {
    return null;
  }

  const window = series.slice(-24);
  const closes = window.map((point) => point.close ?? null).filter((value) => value !== null);

  if (closes.length < 2) {
    return null;
  }

  const low = Math.min(...closes);
  const high = Math.max(...closes);
  const last = closes[closes.length - 1];

  if (!Number.isFinite(low) || !Number.isFinite(high) || low <= 0) {
    return null;
  }

  const changeFromLow = ((last - low) / low) * 100;
  const highChange = ((high - low) / low) * 100;

  return {
    changeFromLow,
    highChange,
    last,
    low,
    high,
  };
}

function computeFibLevels(series) {
  const recent = series.slice(-60).filter((point) => Number.isFinite(point.high) && Number.isFinite(point.low));

  if (recent.length < 2) {
    return null;
  }

  const highs = recent.map((point) => point.high);
  const lows = recent.map((point) => point.low);

  const swingHigh = Math.max(...highs);
  const swingLow = Math.min(...lows);

  if (!Number.isFinite(swingHigh) || !Number.isFinite(swingLow) || swingHigh <= swingLow) {
    return null;
  }

  const range = swingHigh - swingLow;
  const lastClose = recent[recent.length - 1]?.close ?? null;
  const retraceRatio =
    lastClose !== null && Number.isFinite(lastClose) ? (swingHigh - lastClose) / range : null;

  const fibLevels = [0.618, 0.5, 0.382, 0.236].map((ratio) => ({
    ratio,
    price: swingHigh - range * ratio,
  }));

  return {
    swingHigh,
    swingLow,
    range,
    lastClose,
    retraceRatio,
    fibLevels,
    extension702: swingHigh + range * 0.702,
  };
}

const timeframeSeries = computed(() => ({
  short: getSeriesForConfig(timeframeConfigs.value[0]),
  medium: getSeriesForConfig(timeframeConfigs.value[1]),
  long: getSeriesForConfig(timeframeConfigs.value[2]),
}));

function formatPrice(value) {
  const normalized = normalizeNumber(value);
  if (normalized === null) {
    return '—';
  }

  const maximumFractionDigits = Math.abs(normalized) < 1 ? 6 : 4;

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits,
  }).format(normalized);
}

const aftershockAnalysis = computed(() => {
  const overview = tokenOverview.value;
  const hasPair = Boolean(pairAddress.value);
  const { short, medium, long } = timeframeSeries.value;

  if (!hasPair || (!short.length && !medium.length && !long.length)) {
    return {
      ready: false,
      checks: [],
      fib: null,
      capitalPlan: [],
      insights: [],
      timeframes: [],
      currentPriceLabel: null,
    };
  }

  const checks = [];

  function addCheck(id, label, status, value, message) {
    const statusLabel =
      status === 'pass' ? 'Pass' : status === 'fail' ? 'Fail' : 'Review';

    checks.push({
      id,
      label,
      status,
      statusLabel,
      value,
      message,
    });
  }

  const volume24h = overview.volume24h;
  const volumeStatus =
    volume24h === null ? 'review' : volume24h >= 100000 ? 'pass' : 'fail';
  addCheck('volume', '24h volume ≥ $100k', volumeStatus, formattedTokenOverview.value.volume24h ?? '—');

  const liquidity = overview.liquidityUsd;
  const liquidityStatus =
    liquidity === null ? 'review' : liquidity >= 50000 ? 'pass' : 'fail';
  addCheck(
    'liquidity',
    'DEX liquidity ≥ $50k',
    liquidityStatus,
    formattedTokenOverview.value.liquidityUsd ?? '—',
  );

  const holders = overview.holders;
  const holdersStatus = holders === null ? 'review' : holders >= 50 ? 'pass' : 'fail';
  addCheck('holders', 'Holder count ≥ 50', holdersStatus, formattedTokenOverview.value.holders ?? '—');

  const creatorOwnership = overview.creatorOwnership;
  const creatorStatus =
    creatorOwnership === null ? 'review' : creatorOwnership <= 10 ? 'pass' : 'fail';
  addCheck(
    'creatorOwnership',
    'Largest holder ≤ 10%',
    creatorStatus,
    formattedTokenOverview.value.creatorOwnership ?? '—',
  );

  const impulse = computePriceImpulse(long.length ? long : medium);
  const priceChange = overview.priceChange24h;
  const impulseStatus = (() => {
    if (priceChange === null && !impulse) {
      return 'review';
    }

    const change = priceChange ?? impulse?.changeFromLow;
    if (change === null || change === undefined) {
      return 'review';
    }

    return change >= 30 ? 'pass' : 'fail';
  })();

  addCheck(
    'impulse',
    'Impulse ≥ +30% in 24h',
    impulseStatus,
    formattedTokenOverview.value.priceChange24h ??
      (impulse ? `${impulse.changeFromLow.toFixed(2)}%` : '—'),
    impulse && priceChange !== null && Math.abs(priceChange - impulse.changeFromLow) > 10
      ? 'Moralis OHLC and DEX price change differ notably; double-check momentum.'
      : undefined,
  );

  const volumeTrendInfo = computeVolumeTrend(short.length ? short : medium);
  const volumeTrendStatus = volumeTrendInfo ? (volumeTrendInfo.trendUp ? 'pass' : 'fail') : 'review';
  addCheck(
    'volumeTrend',
    'Volume rising on retrace',
    volumeTrendStatus,
    volumeTrendInfo ? `${(volumeTrendInfo.ratio * 100 - 100).toFixed(1)}% vs prior` : '—',
  );

  const fib = computeFibLevels(short.length ? short : medium);
  let correctionStatus = 'review';
  let correctionMessage;

  if (fib && fib.retraceRatio !== null) {
    correctionStatus = fib.retraceRatio <= 0.618 ? 'pass' : 'fail';
    if (fib.retraceRatio > 0.618) {
      correctionMessage = 'Retracement exceeded 61.8% — momentum may be invalid.';
    }
  }

  addCheck(
    'correctionDepth',
    'Pullback remains above 0.618',
    correctionStatus,
    fib && fib.retraceRatio !== null ? `${(fib.retraceRatio * 100).toFixed(1)}%` : '—',
    correctionMessage,
  );

  const fibPlan = [];
  const insights = [];

  if (fib) {
    const targetMap = {
      '0.618': '0.702',
      '0.5': '0.618',
      '0.382': '0.5',
      '0.236': '0.382',
    };

    const capitalDistribution = {
      '0.618': 'Optional',
      '0.5': '20%',
      '0.382': '30%',
      '0.236': '50%',
    };

    fib.fibLevels.forEach((level) => {
      const ratioLabel = level.ratio.toFixed(3);
      const capitalShare = capitalDistribution[ratioLabel] ?? '—';
      const targetLevel = targetMap[ratioLabel];
      let targetPriceLabel = '—';

      if (targetLevel) {
        targetPriceLabel =
          targetLevel === '0.702'
            ? formatPrice(fib.extension702)
            : formatPrice(fib.swingHigh - fib.range * Number(targetLevel));
      }

      fibPlan.push({
        level: ratioLabel,
        price: formatPrice(level.price),
        capitalShare,
        target: targetLevel ? `${targetLevel} → ${targetPriceLabel}` : '—',
      });
    });

    if (fibPlan.length) {
      insights.push(
        `Monitor reactions near ${fibPlan
          .map((entry) => `${entry.level} (${entry.price})`)
          .join(', ')} for staged entries.`,
      );
    }

    insights.push(
      `Extension target at 0.702 sits around ${formatPrice(fib.extension702)} after reclaiming the high.`,
    );

    if (fib.lastClose !== null) {
      const relative = ((fib.swingHigh - fib.lastClose) / fib.range) * 100;
      insights.push(`Current pullback depth: ${relative.toFixed(1)}% from swing high.`);
    }
  } else {
    insights.push('Collect additional candles to establish a reliable swing structure.');
  }

  if (volumeStatus === 'fail') {
    insights.push('24h volume is below the $100k safety threshold — consider skipping this setup.');
  }

  if (liquidityStatus === 'fail') {
    insights.push('Pool liquidity under $50k increases slippage risk.');
  }

  if (holdersStatus === 'fail') {
    insights.push('Holder count is thin; community traction may be weak.');
  }

  if (creatorStatus === 'fail') {
    insights.push('A whale/creator controls more than 10% of supply — high rug risk.');
  }

  const timeframeLabels = timeframeConfigs.value.map((config) => config.timeframe);

  return {
    ready: true,
    checks,
    fib: fib
      ? {
          swingHighLabel: formatPrice(fib.swingHigh),
          swingLowLabel: formatPrice(fib.swingLow),
          rangeLabel: formatPrice(fib.range),
        }
      : null,
    capitalPlan: fibPlan,
    insights,
    timeframes: timeframeLabels,
    currentPriceLabel: formattedTokenOverview.value.price ?? formatPrice(overview.price),
  };
});

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

.strategy {
  background: white;
  border-radius: 1rem;
  padding: 1.5rem;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.strategy h2 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
}

.strategy-layout {
  display: grid;
  gap: 1.5rem;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}

.strategy-card {
  background: #f8fafc;
  border-radius: 1rem;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.strategy-card-header h3 {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 700;
  color: #0f172a;
}

.strategy-card-header .muted {
  margin: 0.25rem 0 0;
  color: #64748b;
  font-size: 0.875rem;
}

.checklist {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.checklist li {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: auto 1fr;
  align-items: start;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.35rem 0.75rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #0f172a;
}

.status-pill.pass {
  background: rgba(34, 197, 94, 0.2);
  color: #166534;
}

.status-pill.fail {
  background: rgba(248, 113, 113, 0.25);
  color: #991b1b;
}

.status-pill.review {
  background: rgba(129, 140, 248, 0.2);
  color: #312e81;
}

.checklist-content {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.checklist-label {
  font-weight: 600;
  color: #0f172a;
}

.checklist-value {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.9rem;
  color: #334155;
}

.checklist-message {
  margin: 0;
  font-size: 0.85rem;
  color: #7c3aed;
}

.fib-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.fib-table th,
.fib-table td {
  padding: 0.5rem 0.75rem;
  text-align: left;
  border-bottom: 1px solid rgba(148, 163, 184, 0.35);
}

.fib-table th {
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #64748b;
}

.fib-table td {
  color: #0f172a;
  font-weight: 600;
}

.insights {
  margin: 0;
  padding-left: 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  color: #1f2937;
}

.insights li {
  font-size: 0.95rem;
  line-height: 1.4;
}

@media (max-width: 720px) {
  .checklist li {
    grid-template-columns: 1fr;
  }

  .status-pill {
    justify-content: flex-start;
  }
}
</style>
