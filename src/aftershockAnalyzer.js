export function analyzeTokenAftershock(tokenOverview, timeframeConfigs) {
  // === User Inputs (adjustable thresholds) ===
  const minLiquidity = 50000;
  const minVolume = 100000;
  const minPriceIncrease = 30; // percent
  const minHolders = 50;
  const fibLevels = [0.702, 0.618, 0.5, 0.382, 0.236];
  const allocation = { 0.5: 0.2, 0.382: 0.3, 0.236: 0.5 };
  const stopLossFactor = 0.98;

  void allocation;
  void stopLossFactor;

  const overviewRef = tokenOverview?.value ?? tokenOverview;
  const configs = Array.isArray(timeframeConfigs) ? timeframeConfigs : timeframeConfigs?.value ?? [];

  // === Extract data ===
  const price = toNumber(overviewRef?.price);
  const volume24h = toNumber(overviewRef?.volume24h);
  const change24h = toNumber(overviewRef?.priceChange24h);
  const holders = toNumber(overviewRef?.holders);
  const liquidity = toNumber(overviewRef?.dexLiquidity) || 0;
  const ohlcv10m = extractResult(configs[0]);
  const ohlcv30m = extractResult(configs[1]);
  const ohlcv1h = extractResult(configs[2]);

  // === Basic validation ===
  const reasons = [];
  let setupScore = 0;
  let verdict = 'Avoid / Not Valid';

  if (liquidity < minLiquidity) {
    reasons.push({ tag: 'LIQUIDITY_LOW', detail: `Liquidity $${formatCompact(liquidity)} < $${formatCompact(minLiquidity)}` });
  } else {
    setupScore += 10;
    reasons.push({ tag: 'LIQUIDITY_OK', detail: `Liquidity $${formatCompact(liquidity)} ≥ $${formatCompact(minLiquidity)}` });
  }

  if (volume24h < minVolume) {
    reasons.push({ tag: 'VOLUME_LOW', detail: `24h Volume $${formatCompact(volume24h)} < $${formatCompact(minVolume)}` });
  } else {
    setupScore += 10;
    reasons.push({ tag: 'VOLUME_OK', detail: `24h Volume $${formatCompact(volume24h)} ≥ $${formatCompact(minVolume)}` });
  }

  if (change24h < minPriceIncrease) {
    reasons.push({ tag: 'IMPULSE_WEAK', detail: `24h price change ${formatPercent(change24h)} < ${minPriceIncrease}%` });
  } else {
    setupScore += 10;
    reasons.push({ tag: 'IMPULSE_OK', detail: `24h price change ${formatPercent(change24h)} ≥ ${minPriceIncrease}%` });
  }

  if (holders < minHolders) {
    reasons.push({ tag: 'HOLDERS_LOW', detail: `${formatCompact(holders)} holders < ${minHolders}` });
  } else {
    setupScore += 5;
    reasons.push({ tag: 'HOLDERS_OK', detail: `${formatCompact(holders)} holders ≥ ${minHolders}` });
  }

  if (ohlcv10m.length === 0 || ohlcv30m.length === 0 || ohlcv1h.length === 0) {
    return {
      verdict: 'No Trade',
      setup_score: 0,
      reasons: [{ tag: 'DATA_MISSING', detail: 'Insufficient OHLCV data' }],
      evidence: {
        liquidity,
        volume24h,
        holders,
        change24h,
      },
    };
  }

  // === Detect Impulse ===
  const impulse = detectImpulse(ohlcv10m);
  if (!impulse) {
    reasons.push({ tag: 'IMPULSE_FAIL', detail: 'No valid 30%+ impulse found' });
    return { verdict: 'Avoid / Not Valid', setup_score: setupScore, reasons, evidence: { liquidity, volume24h, holders, change24h } };
  }
  const [swingLow, swingHigh, gainPct] = impulse;
  reasons.push({
    tag: 'IMPULSE_FOUND',
    detail: `Impulse +${(gainPct * 100).toFixed(1)}% from ${swingLow.toFixed(6)} to ${swingHigh.toFixed(6)}`,
  });
  setupScore += gainPct > 0.5 ? 10 : 5;

  // === Fibonacci Levels ===
  const fib = {};
  fibLevels.forEach((level) => {
    fib[level] = swingHigh - (swingHigh - swingLow) * level;
  });
  fib['0'] = swingLow;
  fib['1'] = swingHigh;

  // === Price position vs Fib ===
  const entryZone = getEntryZone(price, fib);
  if (entryZone !== 'none') {
    setupScore += 15;
    reasons.push({
      tag: 'CORRECTION_DEPTH_OK',
      detail: `Price ${price?.toFixed ? price.toFixed(6) : price} in ${entryZone} (${fib[0.618].toFixed(6)}–${fib[0.236].toFixed(6)})`,
    });
  } else {
    reasons.push({ tag: 'PRICE_OUTSIDE_ZONE', detail: `Price ${price} not between 0.618–0.236 retracement` });
  }

  // === Multi-timeframe trend check ===
  const t1 = getTrend(ohlcv10m);
  const t2 = getTrend(ohlcv30m);
  const t3 = getTrend(ohlcv1h);
  const trends = [t1, t2, t3];
  const upCount = trends.filter((t) => t === 'uptrend').length;
  let mtf = 'low';
  if (upCount === 3) mtf = 'high';
  else if (upCount === 2) mtf = 'medium';
  if (mtf === 'high') setupScore += 15;
  if (mtf === 'medium') setupScore += 8;
  reasons.push({ tag: 'MTF_' + mtf.toUpperCase(), detail: `Trends: 10m=${t1}, 30m=${t2}, 1h=${t3}` });

  // === Invalidations ===
  const invalids = detectInvalidPatterns(ohlcv30m);
  if (invalids.length > 0) {
    invalids.forEach((tag) => reasons.push({ tag, detail: 'Pattern invalidation detected' }));
    setupScore -= 20;
  }

  // === Reaction check (micro PA near Fib) ===
  const reaction = checkReaction(ohlcv10m, fib);
  if (reaction.ok) {
    setupScore += 10;
    reasons.push({ tag: 'REACTION_ABSORPTION_OK', detail: reaction.detail });
  } else if (reaction.warn) {
    setupScore += 5;
    reasons.push({ tag: 'REACTION_WEAK', detail: reaction.detail });
  } else {
    reasons.push({ tag: 'REACTION_FAIL', detail: reaction.detail });
    setupScore -= 10;
  }

  // === Verdict ===
  if (invalids.length > 0 || liquidity < minLiquidity || volume24h < minVolume) verdict = 'Avoid / Not Valid';
  else if (setupScore >= 70) verdict = 'Valid High Probability';
  else if (setupScore >= 50) verdict = 'Valid Low Probability';
  else verdict = 'Avoid / Not Valid';

  return {
    verdict,
    setup_score: setupScore,
    reasons,
    evidence: {
      swingLow,
      swingHigh,
      fib,
      price,
      impulseChangePct: gainPct * 100,
      liquidity,
      volume24h,
      holders,
      change24h,
      mtf: { '10m': t1, '30m': t2, '1h': t3 },
      invalidations: invalids,
    },
  };
}

function extractResult(config) {
  if (!config) return [];
  const data = config.data?.result ?? config.data ?? [];
  if (!Array.isArray(data)) return [];
  return data.map(normalizeCandle).filter(Boolean);
}

function normalizeCandle(candle) {
  const open = toNumber(candle?.open);
  const high = toNumber(candle?.high);
  const low = toNumber(candle?.low);
  const close = toNumber(candle?.close);
  if ([open, high, low, close].some((value) => !Number.isFinite(value))) {
    return null;
  }
  return { open, high, low, close };
}

function detectImpulse(ohlcv) {
  let bestGain = 0;
  let best = null;
  for (let i = 0; i < ohlcv.length - 6; i += 1) {
    const slice = ohlcv.slice(i, i + 6);
    const lows = slice.map((candle) => candle.low);
    const highs = slice.map((candle) => candle.high);
    if (lows.some((value) => value <= 0)) continue;
    const low = Math.min(...lows);
    const high = Math.max(...highs);
    const gain = (high - low) / low;
    if (gain > 0.3 && gain > bestGain) {
      best = [low, high, gain];
      bestGain = gain;
    }
  }
  return best;
}

function getEntryZone(price, fib) {
  if (!Number.isFinite(price)) return 'none';
  if (price <= fib[0.382] && price >= fib[0.5]) return 'mid-range';
  if (price <= fib[0.236] && price >= fib[0.382]) return 'upper zone';
  if (price <= fib[0.618] && price >= fib[0.702]) return 'deep retrace';
  return 'none';
}

function getTrend(ohlcv) {
  if (!Array.isArray(ohlcv) || ohlcv.length < 50) return 'neutral';
  const closes = ohlcv.map((candle) => candle.close);
  const ema20 = EMA(closes, 20);
  const ema50 = EMA(closes, 50);
  const last = closes[closes.length - 1];
  if (ema20 > ema50 && last > ema20) return 'uptrend';
  if (ema20 < ema50 && last < ema20) return 'downtrend';
  return 'neutral';
}

function EMA(values, length) {
  if (!Array.isArray(values) || values.length === 0) return NaN;
  const k = 2 / (length + 1);
  return values.reduce((prev, cur, index) => (index === 0 ? cur : cur * k + prev * (1 - k)));
}

function detectInvalidPatterns(ohlcv) {
  if (!Array.isArray(ohlcv) || ohlcv.length === 0) return [];
  const output = [];
  const highs = ohlcv.map((candle) => candle.high);
  const max1 = Math.max(...highs);
  const idx1 = highs.indexOf(max1);
  const highsAfter = highs.slice(idx1 + 1);
  if (highsAfter.length > 0) {
    const max2 = Math.max(...highsAfter);
    if (Math.abs(max1 - max2) / max1 < 0.01) output.push('DOUBLE_TOP_NEAR_HIGH');
  }
  const last = ohlcv[ohlcv.length - 1];
  if (last && last.low) {
    if (last.close < last.low * 0.618) output.push('CLOSE_BELOW_0.618');
  }
  return output;
}

function checkReaction(ohlcv, fib) {
  if (!Array.isArray(ohlcv) || ohlcv.length === 0) {
    return { ok: false, detail: 'No candles to assess reaction' };
  }
  const last = ohlcv[ohlcv.length - 1];
  const wick = last.close > last.open ? last.low : last.high;
  const body = Math.abs(last.close - last.open);
  const denominator = body === 0 ? Number.EPSILON : body;
  const wickRatio = Math.abs((last.close - wick) / denominator);
  if (wickRatio > 1.5) return { ok: true, detail: `Lower wick ratio ${wickRatio.toFixed(2)} suggests absorption` };
  if (wickRatio > 1.0) return { warn: true, detail: `Moderate wick ratio ${wickRatio.toFixed(2)}` };
  return { ok: false, detail: 'Weak or no absorption near Fib' };
}

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.replace(/[,$_%\s]/g, ''));
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  return NaN;
}

function formatCompact(value) {
  if (!Number.isFinite(value)) return '0';
  return Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return '0%';
  return `${value.toFixed(1)}%`;
}
