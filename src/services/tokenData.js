const DEFAULT_TIMEFRAME_SELECTIONS = ['1min', '10min', '1h'];

export function getDefaultDateRange() {
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

async function fetchTokenHolders(address, apiKey) {
  const url = `https://solana-gateway.moralis.io/token/mainnet/holders/${encodeURIComponent(address)}`;
  return fetchJson(url, {
    headers: {
      'X-API-Key': apiKey,
    },
  });
}

async function fetchOhlcv(pairAddress, timeframe, range, apiKey) {
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

export async function fetchAggregatedTokenData(
  tokenAddress,
  { apiKey, timeframeSelections = DEFAULT_TIMEFRAME_SELECTIONS, range } = {},
) {
  if (!tokenAddress) {
    throw new Error('Token address is required.');
  }

  if (!apiKey) {
    throw new Error('Moralis API key is not configured.');
  }

  const resolvedRange = range ?? getDefaultDateRange();

  const priceUrl = `https://solana-gateway.moralis.io/token/mainnet/${encodeURIComponent(
    tokenAddress,
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

  const [dexResult, holdersResult, ohlcvResults] = await Promise.all([
    Promise.resolve()
      .then(() => fetchDexscreenerOverview(tokenAddress))
      .then((data) => ({ status: 'fulfilled', value: data }))
      .catch((error) => ({ status: 'rejected', reason: error })),
    Promise.resolve()
      .then(() => fetchTokenHolders(tokenAddress, apiKey))
      .then((data) => ({ status: 'fulfilled', value: data }))
      .catch((error) => ({ status: 'rejected', reason: error })),
    Promise.all(
      timeframeSelections.map((timeframe) =>
        Promise.resolve()
          .then(() => fetchOhlcv(pairAddress, timeframe, resolvedRange, apiKey))
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
      ohlcv[result.timeframe] = {
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      };
    }
  }

  return {
    moralisPrice: priceResponse,
    dexscreener:
      dexResult.status === 'fulfilled'
        ? dexResult.value
        : {
            error:
              dexResult.reason instanceof Error
                ? dexResult.reason.message
                : String(dexResult.reason),
          },
    tokenHolders:
      holdersResult.status === 'fulfilled'
        ? holdersResult.value
        : {
            error:
              holdersResult.reason instanceof Error
                ? holdersResult.reason.message
                : String(holdersResult.reason),
          },
    ohlcv,
  };
}

export { DEFAULT_TIMEFRAME_SELECTIONS };
