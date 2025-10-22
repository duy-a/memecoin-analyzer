<template>
  <main class="app">
    <section class="control-panel">
      <header class="panel-header">
        <div>
          <h1>Aftershock Fibonacci Analyzer</h1>
          <p class="subtitle">
            Evaluate Solana tokens with the Aftershock Fibonacci correction strategy using on-demand, multi-timeframe OHLCV data.
          </p>
        </div>
        <div v-if="!hasApiKey" class="api-warning" role="alert">
          Missing Moralis API key. Set <code>VITE_MORALIS_API_KEY</code> to enable analysis.
        </div>
      </header>

      <form class="panel-grid" @submit.prevent="analyzeTokens">
        <label class="field span-2" for="tokenAddresses">
          <span class="field-label">Token address(es)</span>
          <textarea
            id="tokenAddresses"
            v-model.trim="tokenAddressesInput"
            placeholder="Enter one or multiple Solana token addresses, comma separated"
            :disabled="analyzing"
            rows="2"
          ></textarea>
          <p class="field-help">Example: <code>TokenA, TokenB, TokenC</code></p>
        </label>

        <label class="field">
          <span class="field-label">Timeframes</span>
          <select
            multiple
            v-model="selectedTimeframes"
            :disabled="analyzing"
            aria-label="Select one or more timeframes"
          >
            <option v-for="timeframe in availableTimeframes" :key="timeframe" :value="timeframe">
              {{ timeframe }}
            </option>
          </select>
          <p class="field-help">Select at least two short timeframes and one higher timeframe.</p>
        </label>

        <fieldset class="field">
          <legend class="field-label">Liquidity &amp; volume thresholds</legend>
          <div class="threshold-grid">
            <div class="threshold-group" v-for="group in thresholdGroups" :key="group.id">
              <span class="threshold-title">{{ group.label }}</span>
              <label class="threshold-field">
                Liquidity (USD)
                <input
                  type="number"
                  min="0"
                  v-model.number="thresholds[group.id].liquidity"
                  :disabled="analyzing"
                />
              </label>
              <label class="threshold-field">
                Volume 24h (USD)
                <input
                  type="number"
                  min="0"
                  v-model.number="thresholds[group.id].volume"
                  :disabled="analyzing"
                />
              </label>
              <label class="threshold-field">
                Transactions
                <input
                  type="number"
                  min="0"
                  v-model.number="thresholds[group.id].transactions"
                  :disabled="analyzing"
                />
              </label>
              <label class="threshold-field">
                Traders
                <input
                  type="number"
                  min="0"
                  v-model.number="thresholds[group.id].traders"
                  :disabled="analyzing"
                />
              </label>
            </div>
          </div>
        </fieldset>

        <fieldset class="field span-2">
          <legend class="field-label">Safety validation rules</legend>
          <div class="safety-grid">
            <label v-for="rule in safetyRuleList" :key="rule.id" class="safety-option">
              <input type="checkbox" v-model="safetyRules[rule.id]" :disabled="analyzing" />
              <span>{{ rule.label }}</span>
            </label>
          </div>
        </fieldset>

        <div class="actions">
          <button type="submit" :disabled="!hasApiKey || analyzing || selectedTimeframes.length === 0">
            {{ analyzing ? 'Analyzing…' : 'Analyze' }}
          </button>
          <p class="hint">Data refreshes only when you click Analyze.</p>
        </div>
      </form>

      <p v-if="analysisError" class="error" role="alert">{{ analysisError }}</p>
      <p v-if="analysisResults.length && lastAnalyzedAt" class="timestamp">
        Last analyzed at {{ formatDateTime(lastAnalyzedAt) }}
      </p>
    </section>

    <section class="results" aria-live="polite">
      <h2>Analysis results</h2>

      <p v-if="!analysisResults.length" class="placeholder">Results will appear here after you analyze one or more tokens.</p>

      <div v-else class="table-wrapper">
        <table class="results-table">
          <thead>
            <tr>
              <th>Token</th>
              <th>Price</th>
              <th>Liquidity</th>
              <th>24h Volume</th>
              <th>Traders</th>
              <th>Buy/Sell</th>
              <th>Setup</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <template v-for="result in analysisResults" :key="result.id">
              <tr
                class="summary-row"
                :class="[`status-${result.statusClass}`]"
                @click="toggleExpanded(result.id)"
              >
                <td>
                  <div class="token-cell">
                    <span class="token-name">{{ result.displayName }}</span>
                    <span class="token-symbol" v-if="result.symbol">{{ result.symbol }}</span>
                    <span class="token-address">{{ result.address }}</span>
                  </div>
                </td>
                <td>{{ result.formatted.price ?? '—' }}</td>
                <td>{{ result.formatted.liquidity ?? '—' }}</td>
                <td>{{ result.formatted.volume24h ?? '—' }}</td>
                <td>{{ result.formatted.traders ?? '—' }}</td>
                <td>{{ result.formatted.buySellRatio ?? '—' }}</td>
                <td>{{ result.status }}</td>
                <td class="expand-indicator" aria-hidden="true">
                  {{ expandedRows.has(result.id) ? '−' : '+' }}
                </td>
              </tr>
              <tr v-if="expandedRows.has(result.id)">
                <td colspan="8">
                  <div class="detail-grid">
                    <section class="detail-card">
                      <h3>Fibonacci levels</h3>
                      <table class="fib-table">
                        <thead>
                          <tr>
                            <th>Level</th>
                            <th>Price</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr v-for="level in result.fibonacciLevelEntries" :key="level.label">
                            <td>{{ level.label }}</td>
                            <td>{{ level.price }}</td>
                            <td>
                              <span :class="level.valid ? 'tag tag-success' : 'tag tag-warning'">
                                {{ level.valid ? 'In range' : 'Exceeded' }}
                              </span>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                      <p class="correction">Correction depth: {{ result.correctionLabel }}</p>
                    </section>

                    <section class="detail-card">
                      <h3>Entry plan</h3>
                      <table class="entry-table">
                        <thead>
                          <tr>
                            <th>Level</th>
                            <th>Allocation</th>
                            <th>Take profit</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr v-for="entry in result.entryPlan" :key="entry.level">
                            <td>{{ entry.level }}</td>
                            <td>{{ entry.allocation }}</td>
                            <td>{{ entry.takeProfit }}</td>
                          </tr>
                        </tbody>
                      </table>
                      <p class="risk">Stop loss: {{ result.stopLoss }} · Risk: {{ result.risk }}</p>
                    </section>

                    <section class="detail-card">
                      <h3>Validation summary</h3>
                      <ul class="validation-list">
                        <li v-for="item in result.validationFlags" :key="item.label">
                          <span :class="item.passed === true ? 'flag-pass' : item.passed === false ? 'flag-fail' : 'flag-unknown'">
                            {{ item.passed === true ? '✓' : item.passed === false ? '✗' : '?' }}
                          </span>
                          <span class="validation-label">{{ item.label }}</span>
                          <span class="validation-extra" v-if="item.detail">{{ item.detail }}</span>
                        </li>
                      </ul>
                    </section>

                    <section class="detail-card">
                      <h3>Multi-timeframe outlook</h3>
                      <ul class="timeframe-list">
                        <li>
                          <strong>{{ result.timeframeAnalysis.highest.timeframe }}</strong>
                          <span>{{ result.timeframeAnalysis.highest.notes }}</span>
                        </li>
                        <li>
                          <strong>{{ result.timeframeAnalysis.middle.timeframe }}</strong>
                          <span>{{ result.timeframeAnalysis.middle.notes }}</span>
                        </li>
                        <li>
                          <strong>{{ result.timeframeAnalysis.lowest.timeframe }}</strong>
                          <span>{{ result.timeframeAnalysis.lowest.notes }}</span>
                        </li>
                      </ul>
                    </section>

                    <section class="detail-card span-2">
                      <h3>Strategy notes</h3>
                      <ul class="notes">
                        <li v-for="note in result.notes" :key="note">{{ note }}</li>
                      </ul>
                    </section>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </section>
  </main>
</template>

<script setup>
import { computed, reactive, ref } from 'vue';

const availableTimeframes = [
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

const timeframeOrder = new Map(
  availableTimeframes.map((value, index) => [value, index]),
);

const defaultSelectedTimeframes = ['5min', '10min', '1h'];

const tokenAddressesInput = ref('');
const selectedTimeframes = ref([...defaultSelectedTimeframes]);

const thresholds = reactive({
  under1d: {
    liquidity: 60000,
    volume: 300000,
    transactions: 500,
    traders: 300,
  },
  days1to7: {
    liquidity: 150000,
    volume: 1500000,
    transactions: 1000,
    traders: 500,
  },
  over7d: {
    liquidity: 300000,
    volume: 3000000,
    transactions: 2000,
    traders: 800,
  },
});

const thresholdGroups = [
  { id: 'under1d', label: 'Token age &lt; 1 day' },
  { id: 'days1to7', label: 'Token age 1–7 days' },
  { id: 'over7d', label: 'Token age &gt; 7 days' },
];

const safetyRules = reactive({
  lockedLiquidity: true,
  creatorLiquidity: true,
  authorityRevoked: true,
  topHolders: true,
  sellTax: true,
  botVolume: true,
});

const safetyRuleList = [
  { id: 'lockedLiquidity', label: 'Locked or burned liquidity ≥ 70%' },
  { id: 'creatorLiquidity', label: 'Creator liquidity ≤ 20%' },
  { id: 'authorityRevoked', label: 'Mint and fee authority revoked' },
  { id: 'topHolders', label: 'Top 10 holders ≤ 35%' },
  { id: 'sellTax', label: 'Sell tax < 10%' },
  { id: 'botVolume', label: 'Bot trading volume ≤ 65%' },
];

const apiKey = import.meta.env.VITE_MORALIS_API_KEY;
const hasApiKey = computed(() => Boolean(apiKey));

const analyzing = ref(false);
const analysisError = ref('');
const analysisResults = ref([]);
const expandedRows = reactive(new Set());
const lastAnalyzedAt = ref(null);

function formatCurrency(value) {
  const numeric = normalizeNumber(value);
  if (numeric === null) return null;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: Math.abs(numeric) < 1 ? 6 : 2,
  }).format(numeric);
}

function formatNumber(value) {
  const numeric = normalizeNumber(value);
  if (numeric === null) return null;
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(numeric);
}

function formatRatio(value) {
  const numeric = normalizeNumber(value);
  if (numeric === null) return null;
  return numeric.toFixed(2);
}

function formatDateTime(date) {
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

function normalizeNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const sanitized = value.replace(/[,%$\s]/g, '');
    if (!sanitized) return null;
    const parsed = Number(sanitized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseTokenAddresses(input) {
  return input
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function getTimeframeCategory(timeframe) {
  const order = timeframeOrder.get(timeframe);
  if (order === undefined) return 'unknown';
  if (order <= timeframeOrder.get('10min')) {
    return 'short';
  }
  if (order >= timeframeOrder.get('1h')) {
    return 'high';
  }
  return 'mid';
}

function toggleExpanded(id) {
  if (expandedRows.has(id)) {
    expandedRows.delete(id);
  } else {
    expandedRows.add(id);
  }
}

async function analyzeTokens() {
  analysisError.value = '';
  expandedRows.clear();

  if (!hasApiKey.value) {
    analysisError.value = 'Moralis API key is not configured.';
    return;
  }

  const addresses = parseTokenAddresses(tokenAddressesInput.value);

  if (!addresses.length) {
    analysisError.value = 'Enter at least one token address to analyze.';
    return;
  }

  if (!selectedTimeframes.value.length) {
    analysisError.value = 'Select at least one timeframe to analyze.';
    return;
  }

  analyzing.value = true;
  analysisResults.value = [];

  try {
    const results = [];
    for (const address of addresses) {
      // eslint-disable-next-line no-await-in-loop
      const result = await analyzeSingleToken(address);
      results.push(result);
    }
    analysisResults.value = results;
    lastAnalyzedAt.value = new Date();
  } catch (error) {
    analysisError.value =
      error instanceof Error ? error.message : 'Unable to complete analysis.';
  } finally {
    analyzing.value = false;
  }
}

async function analyzeSingleToken(address) {
  const baseInfo = await fetchMoralisPrice(address);
  const dexInfo = await fetchDexscreenerOverview(address);

  const pairAddress = baseInfo.pairAddress || dexInfo?.pairAddress;

  if (!pairAddress) {
    return buildInsufficientDataResult({
      address,
      baseInfo,
      dexInfo,
      reason: 'Missing pair address',
    });
  }

  const timeframePayloads = await fetchTimeframeData(pairAddress);

  const candlesByTimeframe = timeframePayloads
    .map((payload) => ({
      timeframe: payload.timeframe,
      candles: extractCandles(payload.data),
      error: payload.error,
    }))
    .filter((entry) => entry.candles.length);

  const shortFrames = candlesByTimeframe.filter(
    (entry) => getTimeframeCategory(entry.timeframe) === 'short',
  );
  const highFrames = candlesByTimeframe.filter(
    (entry) => getTimeframeCategory(entry.timeframe) === 'high',
  );

  if (shortFrames.length < 2 || !highFrames.length) {
    return buildInsufficientDataResult({
      address,
      baseInfo,
      dexInfo,
      reason: 'Insufficient OHLCV coverage',
    });
  }

  const sortedFrames = [...candlesByTimeframe].sort(
    (a, b) => timeframeOrder.get(a.timeframe) - timeframeOrder.get(b.timeframe),
  );

  const lowestFrame = sortedFrames[0];
  const highestFrame = sortedFrames[sortedFrames.length - 1];
  const middleFrame = sortedFrames[Math.min(1, sortedFrames.length - 1)];

  const impulseAnalysis = analyzeImpulse(highestFrame.candles);

  if (!impulseAnalysis.validImpulse) {
    return buildInvalidResult({
      address,
      baseInfo,
      dexInfo,
      candlesByTimeframe: sortedFrames,
      reason: impulseAnalysis.reason ?? 'Impulse structure invalid',
    });
  }

  const currentPrice = getCurrentPrice(lowestFrame.candles) ?? baseInfo.priceUsd;

  const fibonacciLevels = computeFibonacciLevels(
    impulseAnalysis.swingHigh,
    impulseAnalysis.swingLow,
  );

  const correction = classifyCorrection(impulseAnalysis.swingHigh, impulseAnalysis.swingLow, currentPrice);
  const fibValidation = validateFibonacciLevels(fibonacciLevels, currentPrice);

  const timeframeOutlook = buildTimeframeOutlook({
    highest: highestFrame,
    middle: middleFrame,
    lowest: lowestFrame,
  });

  const liquidityCheck = evaluateLiquidity({ baseInfo, dexInfo, thresholds });
  const holderCheck = await evaluateHolders(address, dexInfo);
  const safetyCheck = evaluateSafety(dexInfo);
  const volumeCheck = evaluateVolume(dexInfo, baseInfo);
  const buySellRatio = volumeCheck?.ratio ?? dexInfo?.buySellRatio ?? null;

  const { validationFlags, safetyPassed } = compileValidationFlags({
    liquidityCheck,
    holderCheck,
    safetyCheck,
    volumeCheck,
  });

  const classification = classifySetup({
    correction,
    liquidityCheck,
    safetyPassed,
    holderCheck,
    impulseAnalysis,
    buySellRatio,
    volumeCheck,
  });

  const entryPlan = buildEntryPlan();

  const notes = buildStrategyNotes({
    classification,
    correction,
    impulseAnalysis,
    liquidityCheck,
    holderCheck,
    safetyCheck,
    volumeCheck,
  });

  return {
    id: `${address}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    address,
    displayName:
      dexInfo?.name || dexInfo?.baseToken?.name || baseInfo.symbol || address.slice(0, 8),
    symbol: dexInfo?.symbol || dexInfo?.baseToken?.symbol || baseInfo.symbol || null,
    status: classification,
    statusClass: classification.toLowerCase().replace(/\s+/g, '-'),
    formatted: {
      price: formatCurrency(currentPrice ?? baseInfo.priceUsd),
      liquidity: formatCurrency(dexInfo?.liquidityUsd ?? baseInfo.liquidityUsd),
      volume24h: formatCurrency(dexInfo?.volume24h ?? baseInfo.volume24h),
      traders: formatNumber(dexInfo?.traders24h ?? dexInfo?.traders ?? null),
      buySellRatio: formatRatio(buySellRatio),
    },
    fibonacciLevelEntries: Object.entries(fibValidation.levels).map(([label, level]) => ({
      label,
      price: formatCurrency(level.price) ?? '—',
      valid: level.valid,
    })),
    correctionLabel: correction.label,
    entryPlan,
    stopLoss: 'below 0.0',
    risk: '1–2% of total capital',
    validationFlags,
    timeframeAnalysis: timeframeOutlook,
    notes,
    baseInfo,
    dexInfo,
  };
}

function buildInsufficientDataResult({ address, baseInfo, dexInfo, reason }) {
  const entryPlan = buildEntryPlan();
  const levels = defaultFibonacciLevels();
  return {
    id: `${address}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    address,
    displayName:
      dexInfo?.name || dexInfo?.baseToken?.name || baseInfo?.symbol || address.slice(0, 8),
    symbol: dexInfo?.symbol || dexInfo?.baseToken?.symbol || baseInfo?.symbol || null,
    status: 'Insufficient Data',
    statusClass: 'insufficient',
    formatted: {
      price: formatCurrency(baseInfo?.priceUsd ?? dexInfo?.priceUsd ?? null),
      liquidity: formatCurrency(dexInfo?.liquidityUsd ?? baseInfo?.liquidityUsd ?? null),
      volume24h: formatCurrency(dexInfo?.volume24h ?? baseInfo?.volume24h ?? null),
      traders: formatNumber(dexInfo?.traders24h ?? null),
      buySellRatio: formatRatio(dexInfo?.buySellRatio ?? null),
    },
    fibonacciLevelEntries: Object.entries(levels).map(([label, price]) => ({
      label,
      price: formatCurrency(price) ?? '—',
      valid: false,
    })),
    correctionLabel: 'Unavailable',
    entryPlan,
    stopLoss: 'below 0.0',
    risk: '1–2% of total capital',
    validationFlags: [
      { label: 'Data availability', passed: false, detail: reason },
    ],
    timeframeAnalysis: {
      highest: { timeframe: '—', notes: 'Insufficient data' },
      middle: { timeframe: '—', notes: 'Insufficient data' },
      lowest: { timeframe: '—', notes: 'Insufficient data' },
    },
    notes: [reason],
    baseInfo,
    dexInfo,
  };
}

function buildInvalidResult({ address, baseInfo, dexInfo, candlesByTimeframe, reason }) {
  const entryPlan = buildEntryPlan();
  const levels = defaultFibonacciLevels();
  const lowestFrame = candlesByTimeframe[0];
  const highestFrame = candlesByTimeframe[candlesByTimeframe.length - 1];
  const middleFrame = candlesByTimeframe[Math.min(1, candlesByTimeframe.length - 1)];
  const timeframeAnalysis =
    candlesByTimeframe.length >= 3
      ? buildTimeframeOutlook({
          highest: highestFrame,
          middle: middleFrame,
          lowest: lowestFrame,
        })
      : {
          highest: { timeframe: highestFrame?.timeframe ?? '—', notes: 'Review macro structure' },
          middle: { timeframe: middleFrame?.timeframe ?? '—', notes: 'Retracement unclear' },
          lowest: { timeframe: lowestFrame?.timeframe ?? '—', notes: 'No rebound confirmation' },
        };

  return {
    id: `${address}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    address,
    displayName:
      dexInfo?.name || dexInfo?.baseToken?.name || baseInfo?.symbol || address.slice(0, 8),
    symbol: dexInfo?.symbol || dexInfo?.baseToken?.symbol || baseInfo?.symbol || null,
    status: 'Invalid',
    statusClass: 'invalid',
    formatted: {
      price: formatCurrency(dexInfo?.priceUsd ?? baseInfo?.priceUsd ?? null),
      liquidity: formatCurrency(dexInfo?.liquidityUsd ?? baseInfo?.liquidityUsd ?? null),
      volume24h: formatCurrency(dexInfo?.volume24h ?? baseInfo?.volume24h ?? null),
      traders: formatNumber(dexInfo?.traders24h ?? dexInfo?.traders ?? null),
      buySellRatio: formatRatio(dexInfo?.buySellRatio ?? null),
    },
    fibonacciLevelEntries: Object.entries(levels).map(([label, price]) => ({
      label,
      price: formatCurrency(price) ?? '—',
      valid: false,
    })),
    correctionLabel: 'Impulse invalid',
    entryPlan,
    stopLoss: 'below 0.0',
    risk: '1–2% of total capital',
    validationFlags: [
      { label: 'Impulse validation', passed: false, detail: reason },
    ],
    timeframeAnalysis,
    notes: [reason],
    baseInfo,
    dexInfo,
  };
}

function defaultFibonacciLevels() {
  return {
    '1.0': null,
    '0.702': null,
    '0.618': null,
    '0.5': null,
    '0.382': null,
    '0.236': null,
    '0.0': null,
  };
}

async function fetchMoralisPrice(address) {
  try {
    const response = await fetch(
      `https://solana-gateway.moralis.io/token/mainnet/${encodeURIComponent(address)}/price`,
      {
        headers: {
          'X-API-Key': apiKey,
        },
      },
    );

    if (!response.ok) {
      throw new Error(`Price request failed with status ${response.status}`);
    }

    const data = await response.json();
    return {
      priceUsd: normalizeNumber(
        data.usdPrice ?? data.priceUsd ?? data.usdValue ?? data.priceUSD ?? data.price,
      ),
      pairAddress: data.pairAddress ?? data.pair ?? data.data?.pairAddress ?? null,
      liquidityUsd: normalizeNumber(data.liquidity ?? data.liquidityUsd ?? data.totalLiquidityUsd),
      volume24h: normalizeNumber(data.volume24h ?? data.volume?.h24 ?? null),
      fdv: normalizeNumber(data.fdv ?? data.fullyDilutedValuation ?? null),
      symbol: data.tokenSymbol ?? data.symbol ?? null,
    };
  } catch (error) {
    return {
      priceUsd: null,
      pairAddress: null,
      liquidityUsd: null,
      volume24h: null,
      fdv: null,
      symbol: null,
      error: error instanceof Error ? error.message : 'Unable to fetch Moralis price',
    };
  }
}

async function fetchDexscreenerOverview(address) {
  try {
    const response = await fetch(
      `https://api.dexscreener.com/tokens/v1/solana/${encodeURIComponent(address)}`,
    );

    if (!response.ok) {
      throw new Error(`DexScreener request failed with status ${response.status}`);
    }

    const data = await response.json();
    const rootEntry = Array.isArray(data) ? data[0] : data;
    const pairInfo =
      rootEntry?.pairs?.[0] ??
      rootEntry?.pair ??
      rootEntry?.data ??
      rootEntry?.token ??
      rootEntry ?? {};

    const liquidityUsd = normalizeNumber(
      pairInfo.liquidity?.usd ?? pairInfo.liquidityUsd ?? pairInfo.liquidity,
    );
    const volume24h = normalizeNumber(
      pairInfo.volume?.h24 ?? pairInfo.volume24h ?? pairInfo['24hVolume'] ?? pairInfo.volume,
    );
    const traders24h = normalizeNumber(pairInfo.traders?.h24 ?? pairInfo.traders24h);
    const buyers = normalizeNumber(pairInfo.txns?.h24?.buys ?? pairInfo.buyers ?? null);
    const sellers = normalizeNumber(pairInfo.txns?.h24?.sells ?? pairInfo.sellers ?? null);
    const buySellRatio =
      buyers !== null && sellers !== null && sellers !== 0
        ? buyers / sellers
        : null;

    return {
      name: pairInfo.baseToken?.name ?? pairInfo.name ?? null,
      symbol: pairInfo.baseToken?.symbol ?? pairInfo.symbol ?? null,
      priceUsd: normalizeNumber(
        pairInfo.priceUsd ?? pairInfo.priceUSD ?? pairInfo.price?.usd ?? pairInfo.price,
      ),
      liquidityUsd,
      volume24h,
      traders24h,
      txns24h: normalizeNumber(pairInfo.txns?.h24?.total ?? pairInfo.txns24h ?? null),
      buyers,
      sellers,
      buySellRatio,
      fdv: normalizeNumber(pairInfo.fdv ?? pairInfo.fullyDilutedValuation ?? null),
      pairAddress:
        pairInfo.pairAddress ??
        pairInfo.address ??
        pairInfo.pair ??
        pairInfo.id ??
        pairInfo.pairAddress,
      marketCap: normalizeNumber(pairInfo.marketCap ?? pairInfo.mc ?? null),
      createdAt: pairInfo.pairCreatedAt ?? pairInfo.createdAt ?? null,
      baseToken: pairInfo.baseToken,
      safety: pairInfo.safety ?? null,
      holderStats: pairInfo.holderStats ?? null,
    };
  } catch (error) {
    return {
      name: null,
      symbol: null,
      priceUsd: null,
      liquidityUsd: null,
      volume24h: null,
      traders24h: null,
      txns24h: null,
      buyers: null,
      sellers: null,
      buySellRatio: null,
      fdv: null,
      pairAddress: null,
      marketCap: null,
      createdAt: null,
      baseToken: null,
      safety: null,
      holderStats: null,
      error: error instanceof Error ? error.message : 'Unable to fetch DexScreener data',
    };
  }
}

async function fetchTimeframeData(pairAddress) {
  const now = new Date();
  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const fromDateIso = from.toISOString();
  const toDateIso = now.toISOString();

  const payloads = [];

  for (const timeframe of selectedTimeframes.value) {
    // eslint-disable-next-line no-await-in-loop
    const result = await fetchSingleTimeframe({
      pairAddress,
      timeframe,
      fromDateIso,
      toDateIso,
    });
    payloads.push({ ...result, timeframe });
  }

  return payloads;
}

async function fetchSingleTimeframe({ pairAddress, timeframe, fromDateIso, toDateIso }) {
  try {
    const url =
      `https://solana-gateway.moralis.io/token/mainnet/pairs/${encodeURIComponent(
        pairAddress,
      )}/ohlcv?fromDate=${encodeURIComponent(fromDateIso)}&toDate=${encodeURIComponent(
        toDateIso,
      )}&timeframe=${encodeURIComponent(timeframe)}&currency=usd`;

    const response = await fetch(url, {
      headers: {
        'X-API-Key': apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`OHLCV request failed (${timeframe}) with status ${response.status}`);
    }

    return { data: await response.json(), error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Unable to fetch OHLCV data',
    };
  }
}

function extractCandles(response) {
  if (!response) return [];

  const candidates = Array.isArray(response)
    ? response
    : response.candles || response.result || response.data || response.items || [];

  const array = Array.isArray(candidates)
    ? candidates
    : Object.values(candidates).find((value) => Array.isArray(value)) || [];

  return array
    .map((item) => ({
      open: normalizeNumber(item.open ?? item.o),
      high: normalizeNumber(item.high ?? item.h),
      low: normalizeNumber(item.low ?? item.l),
      close: normalizeNumber(item.close ?? item.c),
      volume: normalizeNumber(item.volume ?? item.v),
      timestamp: item.t || item.timestamp || item.time || null,
    }))
    .filter((item) =>
      item.open !== null &&
      item.high !== null &&
      item.low !== null &&
      item.close !== null &&
      item.timestamp !== null,
    )
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

function getCurrentPrice(candles) {
  if (!candles.length) return null;
  const last = candles[candles.length - 1];
  return last.close;
}

function analyzeImpulse(candles) {
  if (!candles.length) {
    return {
      validImpulse: false,
      reason: 'No candle data for impulse analysis',
    };
  }

  let swingHigh = -Infinity;
  let swingLow = Infinity;

  for (const candle of candles) {
    if (candle.high > swingHigh) swingHigh = candle.high;
    if (candle.low < swingLow) swingLow = candle.low;
  }

  if (!Number.isFinite(swingHigh) || !Number.isFinite(swingLow) || swingHigh <= swingLow) {
    return {
      validImpulse: false,
      reason: 'Unable to determine swing high/low',
    };
  }

  const impulseGain = (swingHigh - swingLow) / swingLow;

  if (!Number.isFinite(impulseGain) || impulseGain < 0.3) {
    return {
      validImpulse: false,
      reason: 'Price failed to expand 30% from swing low',
    };
  }

  return {
    validImpulse: true,
    swingHigh,
    swingLow,
    impulseGain,
  };
}

function computeFibonacciLevels(high, low) {
  const ratios = {
    '1.0': 0,
    '0.702': 0.702,
    '0.618': 0.618,
    '0.5': 0.5,
    '0.382': 0.382,
    '0.236': 0.236,
    '0.0': 1,
  };

  const levels = {};
  for (const [label, ratio] of Object.entries(ratios)) {
    if (label === '1.0') {
      levels[label] = high;
    } else if (label === '0.0') {
      levels[label] = low;
    } else {
      levels[label] = high - (high - low) * ratio;
    }
  }

  return levels;
}

function validateFibonacciLevels(levels, currentPrice) {
  const validated = {};
  for (const [label, price] of Object.entries(levels)) {
    if (price === null) {
      validated[label] = { price, valid: false };
      continue;
    }
    if (label === '1.0') {
      validated[label] = { price, valid: currentPrice <= price };
    } else if (label === '0.0') {
      validated[label] = { price, valid: currentPrice >= price };
    } else {
      validated[label] = { price, valid: currentPrice <= price };
    }
  }
  return { levels: validated };
}

function classifyCorrection(high, low, currentPrice) {
  if (currentPrice === null) {
    return {
      label: 'Unknown',
      ratio: null,
    };
  }

  const range = high - low;
  const retracement = (high - currentPrice) / range;

  if (retracement < 0) {
    return { label: 'Beyond impulse high', ratio: retracement };
  }

  if (retracement >= 0.618 && retracement <= 0.786) {
    return { label: 'Shallow correction (0.618–0.786)', ratio: retracement };
  }
  if (retracement >= 0.382 && retracement <= 0.5) {
    return { label: 'Normal correction (0.382–0.5)', ratio: retracement };
  }
  if (retracement >= 0.236 && retracement <= 0.382) {
    return { label: 'Deep correction (0.236–0.382)', ratio: retracement };
  }
  if (retracement < 0.236) {
    return { label: 'Overshoot / invalid impulse', ratio: retracement };
  }

  return { label: 'Extended correction', ratio: retracement };
}

function buildTimeframeOutlook({ highest, middle, lowest }) {
  const highestTrend = determineTrend(highest.candles);
  const middleNotes = determineCorrectionNotes(middle.candles);
  const lowestNotes = determineMicroImpulse(lowest.candles);

  return {
    highest: {
      timeframe: highest.timeframe,
      trend: highestTrend.trend,
      notes: highestTrend.notes,
    },
    middle: {
      timeframe: middle.timeframe,
      correctionType: middleNotes.type,
      notes: middleNotes.notes,
    },
    lowest: {
      timeframe: lowest.timeframe,
      confirmation: lowestNotes.confirmation,
      notes: lowestNotes.notes,
    },
  };
}

function determineTrend(candles) {
  if (!candles.length) {
    return { trend: 'Unknown', notes: 'No data' };
  }

  const first = candles[0];
  const last = candles[candles.length - 1];
  const range = last.close - first.close;
  const percent = first.close !== 0 ? (range / first.close) * 100 : 0;

  if (percent > 5) {
    return { trend: 'Uptrend', notes: 'Higher timeframe impulse confirmed' };
  }
  if (percent < -5) {
    return { trend: 'Downtrend', notes: 'Momentum fading on higher timeframe' };
  }

  return { trend: 'Sideways', notes: 'Macro structure consolidating' };
}

function determineCorrectionNotes(candles) {
  if (!candles.length) {
    return { type: 'Unknown', notes: 'No data available' };
  }

  const highs = candles.map((candle) => candle.high);
  const lows = candles.map((candle) => candle.low);
  const maxHigh = Math.max(...highs);
  const minLow = Math.min(...lows);
  const last = candles[candles.length - 1];
  const retracement = (maxHigh - last.close) / (maxHigh - minLow);

  if (!Number.isFinite(retracement)) {
    return { type: 'Unknown', notes: 'Unable to determine retracement' };
  }

  if (retracement >= 0.382 && retracement <= 0.5) {
    return { type: 'Normal', notes: 'Retracement unfolding in ideal zone' };
  }
  if (retracement >= 0.236 && retracement < 0.382) {
    return { type: 'Deep', notes: 'Pullback reaching lower Fibonacci band' };
  }
  if (retracement > 0.618) {
    return { type: 'Shallow', notes: 'Mild correction relative to impulse' };
  }

  return { type: 'Extended', notes: 'Structure stretched beyond preferred zone' };
}

function determineMicroImpulse(candles) {
  if (candles.length < 2) {
    return { confirmation: 'Unknown', notes: 'Insufficient local data' };
  }

  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];

  if (last.close > prev.close && last.volume >= prev.volume) {
    return {
      confirmation: 'Rebound',
      notes: 'Bullish breakout candle confirmed with volume expansion',
    };
  }

  if (last.close > prev.close) {
    return {
      confirmation: 'Attempted rebound',
      notes: 'Price pushing higher but volume lagging',
    };
  }

  if (last.close === prev.close) {
    return {
      confirmation: 'Flat',
      notes: 'Local price action flat — monitor for breakout',
    };
  }

  return {
    confirmation: 'Breakdown risk',
    notes: 'Lower timeframe printing lower closes',
  };
}

function evaluateLiquidity({ baseInfo, dexInfo, thresholds: thresholdInput }) {
  const liquidity = dexInfo?.liquidityUsd ?? baseInfo?.liquidityUsd ?? null;
  const volume = dexInfo?.volume24h ?? baseInfo?.volume24h ?? null;
  const transactions = dexInfo?.txns24h ?? null;
  const traders = dexInfo?.traders24h ?? null;

  const ageInfo = resolveTokenAge(dexInfo);

  const threshold =
    ageInfo.category === 'under1d'
      ? thresholdInput.under1d
      : ageInfo.category === 'days1to7'
      ? thresholdInput.days1to7
      : thresholdInput.over7d;

  const passed =
    (liquidity === null || liquidity >= threshold.liquidity) &&
    (volume === null || volume >= threshold.volume) &&
    (transactions === null || transactions >= threshold.transactions) &&
    (traders === null || traders >= threshold.traders);

  return {
    passed,
    liquidity,
    volume,
    transactions,
    traders,
    threshold,
    ageInfo,
  };
}

function resolveTokenAge(dexInfo) {
  if (!dexInfo?.createdAt) {
    return { category: 'over7d', ageHours: null };
  }
  const createdAt = new Date(dexInfo.createdAt);
  if (Number.isNaN(createdAt.getTime())) {
    return { category: 'over7d', ageHours: null };
  }
  const now = Date.now();
  const ageHours = (now - createdAt.getTime()) / (1000 * 60 * 60);

  if (ageHours < 24) {
    return { category: 'under1d', ageHours };
  }
  if (ageHours <= 24 * 7) {
    return { category: 'days1to7', ageHours };
  }
  return { category: 'over7d', ageHours };
}

async function evaluateHolders(address, dexInfo) {
  const holders = await fetchHolders(address);
  const top10 = dexInfo?.holderStats?.top10Share ?? null;
  const whales = dexInfo?.holderStats?.whaleCount ?? null;
  const dolphins = dexInfo?.holderStats?.dolphinCount ?? null;
  const swapsShare = dexInfo?.holderStats?.swapShare ?? null;
  const growth1h = dexInfo?.holderStats?.growth1h ?? null;

  const passed =
    holders?.total !== null &&
    holders.total >= 100 &&
    (top10 === null || top10 <= 0.45) &&
    (whales === null || dolphins === null || whales <= dolphins * 3) &&
    (swapsShare === null || swapsShare >= 0.9);

  return {
    passed,
    holders,
    top10,
    whales,
    dolphins,
    swapsShare,
    growth1h,
  };
}

async function fetchHolders(address) {
  try {
    const response = await fetch(
      `https://solana-gateway.moralis.io/token/mainnet/holders/${encodeURIComponent(address)}`,
      {
        headers: {
          'X-API-Key': apiKey,
        },
      },
    );
    if (!response.ok) {
      throw new Error(`Holder request failed with status ${response.status}`);
    }
    const data = await response.json();
    const total = normalizeNumber(
      data?.total ??
        data?.totalHolders ??
        data?.result?.total ??
        data?.result?.totalHolders ??
        data?.holders?.total ??
        data?.pagination?.total,
    );
    return { total };
  } catch (error) {
    return { total: null, error: error instanceof Error ? error.message : 'Unable to fetch holders' };
  }
}

function evaluateSafety(dexInfo) {
  const safety = dexInfo?.safety ?? {};
  return {
    lockedLiquidity: toBooleanMetric(safety.lockedLiquidity ?? safety.locked ?? null),
    creatorLiquidity: toBooleanMetric(safety.creatorLiquidity ?? safety.creatorHoldings ?? null),
    authorityRevoked: toBooleanMetric(
      safety.mintAuthorityRevoked && safety.freezeAuthorityRevoked
        ? safety.mintAuthorityRevoked && safety.freezeAuthorityRevoked
        : null,
    ),
    topHolders: toBooleanMetric(
      dexInfo?.holderStats?.top10Share !== undefined
        ? dexInfo.holderStats.top10Share <= 0.35
        : null,
    ),
    sellTax: toBooleanMetric(safety.sellTax ?? safety.tax ?? null),
    botVolume: toBooleanMetric(safety.botVolume ?? null),
  };
}

function toBooleanMetric(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value;
  const numeric = normalizeNumber(value);
  if (numeric === null) return null;
  if (numeric <= 1) {
    return numeric <= 0.35;
  }
  return numeric >= 70;
}

function evaluateVolume(dexInfo, baseInfo) {
  const volume24h = dexInfo?.volume24h ?? baseInfo?.volume24h ?? null;
  const liquidity = dexInfo?.liquidityUsd ?? baseInfo?.liquidityUsd ?? null;
  const fdv = dexInfo?.fdv ?? baseInfo?.fdv ?? null;
  const buyers = dexInfo?.buyers ?? null;
  const sellers = dexInfo?.sellers ?? null;

  const ratio =
    buyers !== null && sellers !== null && sellers !== 0 ? buyers / sellers : null;

  const fdvMultiple =
    fdv !== null && liquidity !== null && liquidity !== 0 ? fdv / liquidity : null;

  return {
    volume24h,
    ratio,
    fdvMultiple,
    valid: ratio === null || (ratio >= 1 && ratio <= 3),
    strong: ratio !== null && ratio >= 1.5 && ratio <= 3,
    fdvValid: fdvMultiple === null || fdvMultiple <= 10,
  };
}

function compileValidationFlags({ liquidityCheck, holderCheck, safetyCheck, volumeCheck }) {
  const validationFlags = [];

  validationFlags.push({
    label: 'Liquidity & volume',
    passed: liquidityCheck.passed,
    detail: formatLiquidityDetail(liquidityCheck),
  });

  validationFlags.push({
    label: 'Safety rules',
    passed: evaluateSafetyToggles(safetyCheck),
    detail: summarizeSafety(safetyCheck),
  });

  validationFlags.push({
    label: 'Holder distribution',
    passed: holderCheck.passed,
    detail: summarizeHolders(holderCheck),
  });

  validationFlags.push({
    label: 'Market behavior',
    passed: volumeCheck.valid && volumeCheck.fdvValid,
    detail: summarizeMarket(volumeCheck),
  });

  return { validationFlags, safetyPassed: evaluateSafetyToggles(safetyCheck) };
}

function formatLiquidityDetail(check) {
  const liquidity = formatCurrency(check.liquidity);
  const volume = formatCurrency(check.volume);
  const txns = formatNumber(check.transactions);
  const traders = formatNumber(check.traders);

  return [
    liquidity ? `Liquidity ${liquidity}` : null,
    volume ? `Volume ${volume}` : null,
    txns ? `${txns} txns/24h` : null,
    traders ? `${traders} traders/24h` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function evaluateSafetyToggles(safetyCheck) {
  const required = [];
  if (safetyRules.lockedLiquidity) required.push(safetyCheck.lockedLiquidity);
  if (safetyRules.creatorLiquidity) required.push(safetyCheck.creatorLiquidity);
  if (safetyRules.authorityRevoked) required.push(safetyCheck.authorityRevoked);
  if (safetyRules.topHolders) required.push(safetyCheck.topHolders);
  if (safetyRules.sellTax) required.push(safetyCheck.sellTax);
  if (safetyRules.botVolume) required.push(safetyCheck.botVolume);

  if (required.some((value) => value === false)) {
    return false;
  }

  if (required.every((value) => value === null)) {
    return null;
  }

  return true;
}

function summarizeSafety(safetyCheck) {
  const labels = [
    { id: 'lockedLiquidity', label: 'Locked ≥70%' },
    { id: 'creatorLiquidity', label: 'Creator ≤20%' },
    { id: 'authorityRevoked', label: 'Authority revoked' },
    { id: 'topHolders', label: 'Top 10 ≤35%' },
    { id: 'sellTax', label: 'Sell tax <10%' },
    { id: 'botVolume', label: 'Bot volume ≤65%' },
  ];

  return labels
    .map(({ id, label }) => {
      const value = safetyCheck[id];
      if (value === true) return `${label}: ✓`;
      if (value === false) return `${label}: ✗`;
      return `${label}: data unavailable`;
    })
    .join(' · ');
}

function summarizeHolders(holderCheck) {
  const entries = [];
  if (holderCheck.holders?.total !== null) {
    entries.push(`Holders ${formatNumber(holderCheck.holders.total)}`);
  } else {
    entries.push('Holders data unavailable');
  }
  if (holderCheck.top10 !== null) {
    entries.push(`Top10 ${Math.round(holderCheck.top10 * 100)}%`);
  }
  if (holderCheck.swapsShare !== null) {
    entries.push(`Swaps ${Math.round(holderCheck.swapsShare * 100)}%`);
  }
  if (holderCheck.growth1h !== null) {
    entries.push(`1h growth ${formatRatio(holderCheck.growth1h)}`);
  }
  return entries.join(' · ');
}

function summarizeMarket(volumeCheck) {
  const entries = [];
  if (volumeCheck.volume24h !== null) {
    entries.push(`Volume ${formatCurrency(volumeCheck.volume24h)}`);
  }
  if (volumeCheck.ratio !== null) {
    entries.push(`Buy/Sell ${formatRatio(volumeCheck.ratio)}`);
  }
  if (volumeCheck.fdvMultiple !== null) {
    entries.push(`FDV multiple ${formatRatio(volumeCheck.fdvMultiple)}`);
  }
  return entries.join(' · ');
}

function classifySetup({
  correction,
  liquidityCheck,
  safetyPassed,
  holderCheck,
  impulseAnalysis,
  buySellRatio,
  volumeCheck,
}) {
  if (liquidityCheck.passed === false || safetyPassed === false || holderCheck.passed === false) {
    return 'Avoid';
  }

  if (!impulseAnalysis.validImpulse) {
    return 'Invalid';
  }

  if (correction.label.includes('Normal') && volumeCheck.strong && buySellRatio !== null) {
    return 'High Probability';
  }

  if (correction.label.includes('Shallow') || correction.label.includes('Deep')) {
    return 'Valid';
  }

  return 'Invalid';
}

function buildEntryPlan() {
  return [
    { level: 0.5, allocation: '20%', takeProfit: 0.618 },
    { level: 0.382, allocation: '30%', takeProfit: 0.5 },
    { level: 0.236, allocation: '50%', takeProfit: 0.382 },
    { level: 0.618, allocation: 'small', takeProfit: 0.702 },
  ];
}

function buildStrategyNotes({
  classification,
  correction,
  impulseAnalysis,
  liquidityCheck,
  holderCheck,
  safetyCheck,
  volumeCheck,
}) {
  const notes = [];

  notes.push(`Impulse gain: ${(impulseAnalysis.impulseGain * 100).toFixed(2)}%`);
  notes.push(`Correction: ${correction.label}`);
  notes.push(`Liquidity check: ${liquidityCheck.passed ? 'pass' : 'review thresholds'}`);
  notes.push(
    `Safety: ${evaluateSafetyToggles(safetyCheck) === false ? 'fails configured toggles' : 'meets configured toggles'}`,
  );
  notes.push(
    `Buy/Sell flow: ${
      volumeCheck.ratio === null
        ? 'data unavailable'
        : volumeCheck.ratio >= 1
        ? 'buyers in control'
        : 'sellers dominating'
    }`,
  );
  notes.push(`Setup classification: ${classification}`);

  return notes;
}
</script>

<style scoped>
.app {
  padding: 2rem clamp(1rem, 3vw, 2.5rem);
  display: flex;
  flex-direction: column;
  gap: 2.5rem;
}

.control-panel {
  background: #ffffff;
  border-radius: 1.25rem;
  padding: clamp(1.5rem, 2vw, 2rem);
  box-shadow: 0 20px 45px rgba(15, 23, 42, 0.12);
  position: sticky;
  top: 1rem;
  z-index: 1;
}

.panel-header {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.panel-header h1 {
  margin: 0;
  font-size: clamp(1.75rem, 3vw, 2.25rem);
  color: #0f172a;
}

.subtitle {
  margin: 0;
  color: #475569;
}

.api-warning {
  background: rgba(220, 38, 38, 0.1);
  color: #b91c1c;
  padding: 0.75rem 1rem;
  border-radius: 0.75rem;
  font-weight: 600;
}

.panel-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1.5rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.field-label {
  font-weight: 700;
  color: #111827;
}

textarea,
select,
input[type='number'] {
  font: inherit;
  border-radius: 0.75rem;
  border: 1px solid #cbd5f5;
  padding: 0.75rem 1rem;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

textarea:focus,
select:focus,
input[type='number']:focus {
  outline: none;
  border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
}

textarea {
  resize: vertical;
}

select[multiple] {
  min-height: 160px;
}

.field-help {
  margin: 0;
  font-size: 0.85rem;
  color: #94a3b8;
}

.threshold-grid {
  display: grid;
  gap: 1rem;
}

.threshold-group {
  background: #f8fafc;
  border-radius: 0.75rem;
  padding: 1rem;
  display: grid;
  gap: 0.75rem;
}

.threshold-title {
  font-weight: 600;
  color: #0f172a;
}

.threshold-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.9rem;
  color: #334155;
}

.safety-grid {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
}

.safety-option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 500;
  color: #0f172a;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  align-items: flex-start;
}

button {
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: white;
  padding: 0.75rem 1.5rem;
  font-size: 1rem;
  font-weight: 600;
  border: none;
  border-radius: 0.75rem;
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

.hint {
  margin: 0;
  color: #94a3b8;
  font-size: 0.85rem;
}

.error {
  color: #dc2626;
  font-weight: 600;
}

.timestamp {
  margin: 0;
  color: #475569;
  font-size: 0.9rem;
}

.results {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.results h2 {
  margin: 0;
  font-size: 1.5rem;
  color: #0f172a;
}

.placeholder {
  color: #94a3b8;
}

.table-wrapper {
  overflow-x: auto;
}

.results-table {
  width: 100%;
  border-collapse: collapse;
  background: #ffffff;
  border-radius: 1rem;
  overflow: hidden;
  box-shadow: 0 16px 35px rgba(15, 23, 42, 0.1);
}

.results-table th,
.results-table td {
  padding: 1rem;
  text-align: left;
  border-bottom: 1px solid #e2e8f0;
}

.results-table tbody tr:last-child td {
  border-bottom: none;
}

.summary-row {
  cursor: pointer;
  transition: background 0.2s ease;
}

.summary-row:hover {
  background: #f8fafc;
}

.token-cell {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.token-name {
  font-weight: 600;
  color: #0f172a;
}

.token-symbol {
  color: #6366f1;
  font-weight: 600;
}

.token-address {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  color: #94a3b8;
  font-size: 0.8rem;
}

.expand-indicator {
  width: 2rem;
  text-align: center;
  font-weight: 700;
  color: #6366f1;
}

.detail-grid {
  display: grid;
  gap: 1.5rem;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  background: #f8fafc;
  padding: 1.5rem;
  border-radius: 0.75rem;
}

.detail-card {
  background: #ffffff;
  border-radius: 0.75rem;
  padding: 1rem;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.detail-card h3 {
  margin: 0;
  font-size: 1.05rem;
  color: #0f172a;
}

.detail-card.span-2 {
  grid-column: span 2;
}

.fib-table,
.entry-table {
  width: 100%;
  border-collapse: collapse;
}

.fib-table th,
.fib-table td,
.entry-table th,
.entry-table td {
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid #e2e8f0;
  font-size: 0.9rem;
}

.tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.25rem 0.6rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
}

.tag-success {
  background: rgba(34, 197, 94, 0.15);
  color: #15803d;
}

.tag-warning {
  background: rgba(234, 179, 8, 0.18);
  color: #b45309;
}

.validation-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.validation-label {
  font-weight: 600;
  color: #0f172a;
}

.validation-extra {
  display: block;
  color: #475569;
  font-size: 0.85rem;
}

.flag-pass,
.flag-fail,
.flag-unknown {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 999px;
  font-weight: 700;
  margin-right: 0.5rem;
}

.flag-pass {
  background: rgba(34, 197, 94, 0.2);
  color: #15803d;
}

.flag-fail {
  background: rgba(239, 68, 68, 0.15);
  color: #b91c1c;
}

.flag-unknown {
  background: rgba(148, 163, 184, 0.2);
  color: #475569;
}

.timeframe-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  color: #334155;
}

.notes {
  margin: 0;
  padding-left: 1rem;
  color: #1f2937;
}

.notes li {
  margin-bottom: 0.35rem;
}

.status-high-probability {
  border-left: 4px solid #22c55e;
}

.status-valid {
  border-left: 4px solid #3b82f6;
}

.status-invalid {
  border-left: 4px solid #f97316;
}

.status-avoid {
  border-left: 4px solid #ef4444;
}

.status-insufficient {
  border-left: 4px solid #94a3b8;
}

@media (max-width: 768px) {
  .control-panel {
    position: static;
  }

  .detail-card.span-2 {
    grid-column: span 1;
  }
}
</style>
