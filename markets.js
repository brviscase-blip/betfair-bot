require('dotenv').config();
const axios = require('axios');
const { getToken } = require('./auth');

const BR_API = 'https://ero.betfair.bet.br/www/sports/exchange/readonly/v1';

// Busca jogos de futebol pré-jogo nas próximas 24h via endpoint BR
async function getFootballMarkets() {
  try {
    const token = await getToken();

    const response = await axios.get(`${BR_API}/byevent`, {
      params: {
        _ak: process.env.BETFAIR_APP_KEY,
        alt: 'json',
        eventTypeIds: '1',
        types: 'MARKET_STATE,MARKET_RATES,MARKET_DESCRIPTION,EVENT,RUNNER_DESCRIPTION',
      },
      headers: {
        'X-Authentication': token,
        'Accept': 'application/json',
      },
    });

    const data = response.data;
    const markets = [];

    if (data.eventTypes) {
      for (const eventType of data.eventTypes) {
        for (const eventNode of (eventType.eventNodes || [])) {
          for (const marketNode of (eventNode.marketNodes || [])) {
            if (!marketNode.state?.inplay) {
              markets.push({
                marketId: marketNode.marketId,
                marketStartTime: marketNode.description?.marketTime,
                event: {
                  name: eventNode.event?.name || 'Jogo desconhecido',
                  id: eventNode.eventId,
                },
                runners: marketNode.runners || [],
              });
            }
          }
        }
      }
    }

    return markets.slice(0, 20);
  } catch (error) {
    console.error('Erro ao buscar mercados:', error.response?.data || error.message);
    return [];
  }
}

// Busca odds de um mercado específico via endpoint BR
async function getMarketOdds(marketId) {
  try {
    const token = await getToken();

    const response = await axios.get(`${BR_API}/bymarket`, {
      params: {
        _ak: process.env.BETFAIR_APP_KEY,
        alt: 'json',
        marketIds: marketId,
        types: 'MARKET_STATE,RUNNER_DESCRIPTION,RUNNER_STATE,MARKET_RATES',
      },
      headers: {
        'X-Authentication': token,
        'Accept': 'application/json',
      },
    });

    const data = response.data;

    for (const eventType of (data.eventTypes || [])) {
      for (const eventNode of (eventType.eventNodes || [])) {
        for (const marketNode of (eventNode.marketNodes || [])) {
          if (marketNode.marketId === marketId) {
            return {
              marketId,
              runners: (marketNode.runners || []).map(r => ({
                selectionId: r.id,
                runnerName: r.description?.runnerName,
                ex: {
                  availableToBack: r.exchange?.availableToBack || [],
                  availableToLay: r.exchange?.availableToLay || [],
                },
              })),
            };
          }
        }
      }
    }

    return null;
  } catch (error) {
    console.error('Erro ao buscar odds:', error.response?.data || error.message);
    return null;
  }
}

module.exports = { getFootballMarkets, getMarketOdds };