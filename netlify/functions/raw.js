import { fetchAggregatedTokenData } from '../../src/services/tokenData.js';

export const config = {
  path: '/raw/:token',
};

export default async function handler(event) {
  const tokenFromParams = event.pathParameters?.token ?? null;
  const tokenFromQuery = event.queryStringParameters?.token ?? null;
  let tokenAddress = tokenFromParams ?? tokenFromQuery ?? '';

  if (!tokenAddress && event.path) {
    const match = event.path.match(/\/raw\/(.+)$/);
    if (match) {
      tokenAddress = match[1];
    }
  }

  tokenAddress = tokenAddress.trim();

  if (!tokenAddress) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: 'Token address is required.' }),
    };
  }

  const apiKey = process.env.VITE_MORALIS_API_KEY ?? '';

  if (!apiKey) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: 'Moralis API key is not configured.' }),
    };
  }

  try {
    const data = await fetchAggregatedTokenData(tokenAddress, { apiKey });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(data),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch token data.';

    return {
      statusCode: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: message }),
    };
  }
}
