import { fetchAggregatedTokenData } from '../../src/services/tokenData.js';

export const config = {
  path: '/raw/:token',
};

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

function jsonResponse(payload, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...JSON_HEADERS,
      ...headers,
    },
  });
}

export default async function handler(request, context) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...JSON_HEADERS,
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  const url = new URL(request.url);
  const tokenFromParams = context?.params?.token ?? null;
  const tokenFromQuery = url.searchParams.get('token');
  let tokenAddress = tokenFromParams ?? tokenFromQuery ?? '';

  if (!tokenAddress && url.pathname) {
    const match = url.pathname.match(/\/raw\/(.+)$/);
    if (match) {
      tokenAddress = match[1];
    }
  }

  tokenAddress = tokenAddress.trim();

  if (!tokenAddress) {
    return jsonResponse({ error: 'Token address is required.' }, { status: 400 });
  }

  const apiKey = process.env.VITE_MORALIS_API_KEY ?? '';

  if (!apiKey) {
    return jsonResponse({ error: 'Moralis API key is not configured.' }, { status: 500 });
  }

  try {
    const data = await fetchAggregatedTokenData(tokenAddress, { apiKey });
    return jsonResponse(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch token data.';
    return jsonResponse({ error: message }, { status: 502 });
  }
}
