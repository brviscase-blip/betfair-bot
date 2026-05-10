require('dotenv').config();
const axios = require('axios');
const { getToken } = require('./auth');

const API_URL = 'https://api.betfair.com/exchange/betting/json-rpc/v1';

async function apiCall(method, params) {
  const token = await getToken();
  const response = await axios.post(
    API_URL,
    [{ jsonrpc: '2.0', method: `SportsAPING/v1.0/${method}`, params, id: 1 }],
    {
      headers: {
        'X-Application': process.env.BETFAIR_APP_KEY,
        'X-Authentication': token,
        'Content-Type': 'application/json',
      },
    }
  );
  return response.data[0].result;
}

// Busca jogos de futebol pré-jogo nas próximas 24h
async function getFootballMarkets() {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const markets = await apiCall('listMarketCatalogue', {
    filter: {
      eventTypeIds: ['1'], // 1 = Futebol
      marketCountries: ['BR'],
      marketTypeCodes: ['MATCH_ODDS'],
      marketStartTime: {
        from: now.toISOString(),
        to: tomorrow.toISOString(),
      },
      inPlayOnly: false,
    },
    marketProjection: ['EVENT', 'RUNNER_DESCRIPTION', 'MARKET_START_TIME'],
    maxResults: 20,
    sort: 'FIRST_TO_START',
  });

  return markets || [];
}

// Busca odds de um mercado específico
async function getMarketOdds(marketId) {
  const books = await apiCall('listMarketBook', {
    marketIds: [marketId],
    priceProjection: {
      priceData: ['EX_BEST_OFFERS'],
      exBestOffersOverrides: { bestPricesDepth: 3 },
    },
  });

  return books?.[0] || null;
}

module.exports = { getFootballMarkets, getMarketOdds };
