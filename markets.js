require('dotenv').config();
const axios = require('axios');
const { getToken } = require('./auth');

const BR_API = 'https://ero.betfair.bet.br/www/sports/exchange/readonly/v1/bymarket';

// Busca odds de uma lista de market IDs
async function getMarketsByIds(marketIds) {
  try {
    const token = await getToken();
    const response = await axios.get(BR_API, {
      params: {
        _ak: process.env.BETFAIR_APP_KEY,
        alt: 'json',
        currencyCode: 'BRL',
        locale: 'pt_BR',
        marketIds: marketIds.join(','),
        rollupLimit: 5,
        rollupModel: 'STAKE',
        types: 'MARKET_STATE,RUNNER_STATE,RUNNER_EXCHANGE_PRICES_BEST,MARKET_DESCRIPTION,EVENT',
      },
      headers: { 'X-Authentication': token },
    });

    const markets = [];
    const data = response.data;

    for (const eventType of (data.eventTypes || [])) {
      for (const eventNode of (eventType.eventNodes || [])) {
        for (const marketNode of (eventNode.marketNodes || [])) {
          if (!marketNode.state?.inplay && marketNode.state?.status === 'OPEN') {
            markets.push({
              marketId: marketNode.marketId,
              marketStartTime: marketNode.description?.marketTime,
              event: {
                name: eventNode.event?.name || 'Jogo desconhecido',
                id: eventNode.eventId,
              },
              runners: (marketNode.runners || []).map(r => ({
                selectionId: r.id,
                runnerName: r.description?.runnerName,
                ex: {
                  availableToBack: r.exchange?.availableToBack || [],
                  availableToLay: r.exchange?.availableToLay || [],
                },
              })),
            });
          }
        }
      }
    }

    return markets;
  } catch (error) {
    console.error('Erro ao buscar mercados:', error.response?.data || error.message);
    return [];
  }
}

// Busca jogos de futebol pré-jogo — usa IDs conhecidos como seed
async function getFootballMarkets() {
  // Market IDs de futebol conhecidos — serão atualizados dinamicamente
  const seedMarketIds = [
    '1.257420782', '1.257422705', '1.257421819', '1.257879109',
    '1.257979522', '1.257979766', '1.257953870', '1.257964723',
    '1.257974891', '1.257965528', '1.257891938', '1.257891573',
    '1.257890768', '1.257944768', '1.257752406',
  ];

  return await getMarketsByIds(seedMarketIds);
}

// Busca odds de um mercado específico
async function getMarketOdds(marketId) {
  const markets = await getMarketsByIds([marketId]);
  return markets[0] || null;
}

module.exports = { getFootballMarkets, getMarketOdds };