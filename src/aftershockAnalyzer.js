const MAX_SETUP_SCORE = 75;
const DEFAULT_THRESHOLDS = {
  minLiquidity: 50000,
  minVolume: 100000,
  minPriceChange: 30,
  minHolders: 50,
};

export function analyzeTokenAftershock(tokenOverview, timeframeConfigs, thresholds = {}) {
  // ===== User-adjustable thresholds =====
  const resolvedThresholds = resolveThresholds(thresholds);
  const { minLiquidity, minVolume, minPriceChange, minHolders } = resolvedThresholds;
  const fibSet = [0.702, 0.618, 0.5, 0.382, 0.236];

  const overviewRef = tokenOverview?.value ?? tokenOverview ?? {};
  const configs = Array.isArray(timeframeConfigs)
    ? timeframeConfigs
    : timeframeConfigs?.value ?? [];

  const priceRaw = toNumber(overviewRef?.price);
  const volume24hRaw = toNumber(overviewRef?.volume24h);
  const change24hRaw = toNumber(overviewRef?.priceChange24h);
  const holdersRaw = toNumber(overviewRef?.holders);
  const liquidityRaw = toNumber(overviewRef?.dexLiquidity);

  const price = Number.isFinite(priceRaw) ? priceRaw : null;
  const volume24h = Number.isFinite(volume24hRaw) ? volume24hRaw : 0;
  const change24h = Number.isFinite(change24hRaw) ? change24hRaw : 0;
  const holders = Number.isFinite(holdersRaw) ? holdersRaw : 0;
  const liquidity = Number.isFinite(liquidityRaw) ? liquidityRaw : 0;

  const ohlcv10m = extractResult(configs[0]);
  const ohlcv30m = extractResult(configs[1]);
  const ohlcv1h = extractResult(configs[2]);

  const timeframeMeta = buildTimeframeMeta(configs, [
    { key: 'short', fallbackLabel: 'Shortest timeframe' },
    { key: 'medium', fallbackLabel: 'Medium timeframe' },
    { key: 'long', fallbackLabel: 'Longest timeframe' },
  ]);

  const evidenceBase = {
    currentPrice: priceRaw,
    liquidity: liquidityRaw,
    volume24h: volume24hRaw,
    holders: holdersRaw,
    change24h: change24hRaw,
    thresholds: resolvedThresholds,
    ohlcv: {
      short: { ...timeframeMeta.short, candles: ohlcv10m },
      medium: { ...timeframeMeta.medium, candles: ohlcv30m },
      long: { ...timeframeMeta.long, candles: ohlcv1h },
    },
  };

  if (!ohlcv10m.length || !ohlcv30m.length || !ohlcv1h.length) {
    return {
      verdict: 'No Trade',
      setup_score: 0,
      setup_score_max: MAX_SETUP_SCORE,
      reasons: [
        {
          tag: 'DATA',
          detail: 'Missing timeframe data',
          points: 0,
          maxPoints: MAX_SETUP_SCORE,
        },
      ],
      evidence: evidenceBase,
    };
  }

  const reasons = [];
  const addReason = (tag, detail, points = null, maxPoints = null) => {
    reasons.push({ tag, detail, points, maxPoints });
  };
  let score = 0;

  if (liquidity < minLiquidity) {
    addReason(
      'LIQ_LOW',
      `Liquidity ${formatUsd(liquidity)} < ${formatUsd(minLiquidity)}`,
      0,
      10,
    );
  } else {
    score += 10;
    addReason(
      'LIQ_OK',
      `Liquidity ${formatUsd(liquidity)} ≥ ${formatUsd(minLiquidity)}`,
      10,
      10,
    );
  }

  if (volume24h < minVolume) {
    addReason(
      'VOL_LOW',
      `24h Volume ${formatUsd(volume24h)} < ${formatUsd(minVolume)}`,
      0,
      10,
    );
  } else {
    score += 10;
    addReason(
      'VOL_OK',
      `24h Volume ${formatUsd(volume24h)} ≥ ${formatUsd(minVolume)}`,
      10,
      10,
    );
  }

  if (change24h < minPriceChange) {
    addReason(
      'IMPULSE_WEAK',
      `24h price change ${formatPercent(change24h)} < ${minPriceChange}%`,
      0,
      10,
    );
  } else {
    score += 10;
    addReason(
      'IMPULSE_STRONG',
      `24h price change ${formatPercent(change24h)} ≥ ${minPriceChange}%`,
      10,
      10,
    );
  }

  if (holders < minHolders) {
    addReason(
      'HOLDERS_LOW',
      `${formatCount(holders)} holders < ${formatCount(minHolders)}`,
      0,
      5,
    );
  } else {
    score += 5;
    addReason(
      'HOLDERS_OK',
      `${formatCount(holders)} holders ≥ ${formatCount(minHolders)}`,
      5,
      5,
    );
  }

  const highs = ohlcv1h.map((candle) => candle.high);
  const lows = ohlcv1h.map((candle) => candle.low);
  const swingHigh = Math.max(...highs);
  const swingLow = Math.min(...lows);

  if (!Number.isFinite(swingHigh) || !Number.isFinite(swingLow) || swingHigh <= swingLow || swingLow <= 0) {
    addReason(
      'IMPULSE_RANGE_INVALID',
      'Not enough data to anchor Fibonacci swing on the long timeframe',
    );
    return {
      verdict: 'No Trade',
      setup_score: score,
      setup_score_max: MAX_SETUP_SCORE,
      reasons,
      evidence: {
        ...evidenceBase,
        swingHigh,
        swingLow,
      },
    };
  }

  const gainPct = ((swingHigh - swingLow) / swingLow) * 100;
  addReason(
    'IMPULSE_RANGE',
    `Low ${formatPrice(swingLow)} → High ${formatPrice(swingHigh)} (${formatPercent(gainPct)})`,
  );

  const fib = { '0': swingLow, '1': swingHigh, 0: swingLow, 1: swingHigh };
  const swingRange = swingHigh - swingLow;
  fibSet.forEach((level) => {
    fib[level] = swingHigh - swingRange * level;
  });

  const fibLevels = buildFibLevelDetails(fib, fibSet, price);

  const zoneBands = {
    'mid-range': [fib[0.5], fib[0.382]],
    'upper zone': [fib[0.382], fib[0.236]],
    'deep retrace': [fib[0.702], fib[0.618]],
  };

  let zone = 'none';
  if (price !== null) {
    if (between(price, zoneBands['mid-range'])) zone = 'mid-range';
    else if (between(price, zoneBands['upper zone'])) zone = 'upper zone';
    else if (between(price, zoneBands['deep retrace'])) zone = 'deep retrace';
  }

  if (zone !== 'none') {
    score += 15;
    const [lower, upper] = zoneBands[zone];
    addReason(
      'ZONE_OK',
      `Price ${formatPrice(price)} in ${zone} (${formatPrice(lower)}–${formatPrice(upper)})`,
      15,
      15,
    );
  } else {
    addReason(
      'ZONE_NONE',
      `Price ${formatPrice(price)} outside 0.702–0.236 retracement band`,
      0,
      15,
    );
  }

  const trendShort = trend(ohlcv10m);
  const trendMid = trend(ohlcv30m);
  const trendLong = trend(ohlcv1h);
  const upCount = [trendShort, trendMid, trendLong].filter((value) => value === 'up').length;
  let mtf = 'low';
  if (upCount === 3) mtf = 'high';
  else if (upCount === 2) mtf = 'medium';
  let mtfPoints = 0;
  let mtfMaxPoints = 15;
  if (mtf === 'high') {
    score += 15;
    mtfPoints = 15;
  } else if (mtf === 'medium') {
    score += 8;
    mtfPoints = 8;
  }
  addReason(
    `MTF_${mtf.toUpperCase()}`,
    `Trends: 10m=${trendShort}, 30m=${trendMid}, 1h=${trendLong}`,
    mtfPoints,
    mtfMaxPoints,
  );

  const reaction = recentReaction(ohlcv10m, fib);
  if (reaction.ok) {
    score += 10;
    addReason('REACTION_STRONG', reaction.detail, 10, 10);
  } else if (reaction.warn) {
    score += 5;
    addReason('REACTION_WEAK', reaction.detail, 5, 10);
  } else {
    addReason('REACTION_FAIL', reaction.detail, 0, 10);
  }

  let verdict = 'Avoid / Not Valid';
  if (score >= 70) verdict = 'Valid High Probability';
  else if (score >= 50) verdict = 'Valid Low Probability';

  const impulseSource = {
    ...(timeframeMeta.long ?? {}),
    candles: ohlcv1h.length,
  };

  return {
    verdict,
    setup_score: score,
    setup_score_max: MAX_SETUP_SCORE,
    reasons,
    evidence: {
      ...evidenceBase,
      swingLow,
      swingHigh,
      fib,
      fibLevels,
      impulseGainPct: gainPct,
      mtf: { short: trendShort, mid: trendMid, long: trendLong },
      impulseSource,
    },
  };
}

function extractResult(config) {
  if (!config) return [];
  const data = config?.data?.result ?? config?.data ?? [];
  if (!Array.isArray(data)) return [];
  return data.map(normalizeCandle).filter(Boolean);
}

function normalizeCandle(candle) {
  const open = toNumber(candle?.open);
  const high = toNumber(candle?.high);
  const low = toNumber(candle?.low);
  const close = toNumber(candle?.close);
  if (![open, high, low, close].every(Number.isFinite)) {
    return null;
  }
  return { open, high, low, close };
}

function buildTimeframeMeta(configs, descriptors) {
  const meta = {};
  descriptors.forEach((descriptor, index) => {
    const config = configs?.[index] ?? {};
    meta[descriptor.key] = {
      label: config.label ?? descriptor.fallbackLabel,
      timeframe: config.timeframe ?? null,
    };
  });
  return meta;
}

function buildFibLevelDetails(fib, fibSet, price) {
  const priceValue = Number.isFinite(price) ? price : null;
  const orderedLevels = [1, ...fibSet, 0];
  return orderedLevels.map((level) => {
    const fibPrice = fib[level];
    const numericLevel = typeof level === 'number' ? level : Number(level);
    let isValid = null;
    if (priceValue !== null && Number.isFinite(fibPrice)) {
      if (numericLevel === 1) {
        isValid = priceValue <= fibPrice;
      } else if (numericLevel === 0) {
        isValid = priceValue >= fibPrice;
      } else {
        isValid = priceValue >= fibPrice;
      }
    }
    return { level, price: fibPrice, isValid };
  });
}

function trend(ohlcv) {
  if (!Array.isArray(ohlcv) || ohlcv.length < 50) return 'neutral';
  const closes = ohlcv.map((candle) => candle.close);
  const ema20 = EMA(closes, 20);
  const ema50 = EMA(closes, 50);
  const last = closes[closes.length - 1];
  if (ema20 > ema50 && last > ema20) return 'up';
  if (ema20 < ema50 && last < ema20) return 'down';
  return 'neutral';
}

function EMA(values, length) {
  if (!Array.isArray(values) || values.length === 0) return NaN;
  const k = 2 / (length + 1);
  let ema = values[0];
  for (let i = 1; i < values.length; i += 1) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

function recentReaction(ohlcv, fib) {
  if (!Array.isArray(ohlcv) || ohlcv.length === 0) {
    return { ok: false, detail: 'No candles to assess reaction' };
  }
  const last = ohlcv[ohlcv.length - 1];
  const zoneLow = fib[0.618];
  const zoneHigh = fib[0.382];
  if (!Number.isFinite(zoneLow) || !Number.isFinite(zoneHigh)) {
    return { ok: false, detail: 'Fib levels unavailable for reaction check' };
  }
  const lowerBound = Math.min(zoneLow, zoneHigh);
  const upperBound = Math.max(zoneLow, zoneHigh);
  if (last.low > upperBound || last.high < lowerBound) {
    return { ok: false, detail: 'Latest candle is outside the 0.618–0.382 band' };
  }
  const wick = last.close > last.open ? last.low : last.high;
  const body = Math.abs(last.close - last.open);
  const denominator = body === 0 ? Number.EPSILON : body;
  const wickRatio = Math.abs((last.close - wick) / denominator);
  if (wickRatio > 1.5) {
    return { ok: true, detail: `Strong wick absorption ratio ${wickRatio.toFixed(2)}` };
  }
  if (wickRatio > 1.0) {
    return { warn: true, detail: `Moderate wick ratio ${wickRatio.toFixed(2)}` };
  }
  return { ok: false, detail: 'No absorption signal detected near Fib support' };
}

function between(value, range) {
  if (!Array.isArray(range) || range.length !== 2) return false;
  const [min, max] = range;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return false;
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  return value >= low && value <= high;
}

function resolveThresholds(overrides) {
  const source = overrides && typeof overrides === 'object' ? overrides : {};
  return {
    minLiquidity: coerceThreshold(source.minLiquidity, DEFAULT_THRESHOLDS.minLiquidity),
    minVolume: coerceThreshold(source.minVolume, DEFAULT_THRESHOLDS.minVolume),
    minPriceChange: coerceThreshold(source.minPriceChange, DEFAULT_THRESHOLDS.minPriceChange),
    minHolders: coerceThreshold(source.minHolders, DEFAULT_THRESHOLDS.minHolders),
  };
}

function coerceThreshold(value, fallback) {
  if (value === '' || value === null || value === undefined) {
    return fallback;
  }

  const normalized = typeof value === 'number' ? value : Number(value);
  if (Number.isFinite(normalized) && normalized >= 0) {
    return normalized;
  }

  return fallback;
}

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.replace(/[,$_%\s]/g, ''));
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  return NaN;
}

function formatUsd(value) {
  if (!Number.isFinite(value)) return '$0';
  return `$${formatCompact(value)}`;
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return '0%';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

function formatCount(value) {
  if (!Number.isFinite(value)) return '0';
  return formatCompact(value);
}

function formatPrice(value) {
  if (!Number.isFinite(value)) return 'n/a';
  const digits = Math.abs(value) < 1 ? 6 : 4;
  return value.toFixed(digits);
}

function formatCompact(value) {
  return Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}
