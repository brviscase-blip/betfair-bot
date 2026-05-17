require('dotenv').config();
const axios = require('axios');

const BASE_URL = 'https://api.the-odds-api.com/v4';

const SPORTS = [
  'soccer_brazil_campeonato',
  'soccer_spain_la_liga',
  'soccer_uefa_champs_league',
];

const BOOKMAKER_LABELS = {
  betfair_ex_eu: 'Betfair',
  betano:        'Betano',
  bet365:        'Bet365',
  unibet:        'Unibet',
  pinnacle:      'Pinnacle',
};

async function getTodaysMatches() {
  const allMatches = [];
  const today = new Date().toDateString();

  for (const sport of SPORTS) {
    try {
      const { data } = await axios.get(`${BASE_URL}/sports/${sport}/odds`, {
        params: {
          apiKey: process.env.ODDS_API_KEY,
          regions: 'eu',
          markets: 'h2h',
          oddsFormat: 'decimal',
          dateFormat: 'iso',
        },
        timeout: 10000,
      });

      const todayMatches = (data || []).filter(m => {
        const matchDate = new Date(m.commence_time).toDateString();
        return matchDate === today;
      });

      allMatches.push(...todayMatches);
    } catch (err) {
      if (err.response?.status === 404) {
        console.log(`[odds] ${sport}: temporada encerrada ou liga inativa — ignorando`);
      } else {
        console.error(`[odds] Erro ao buscar ${sport}: ${err.message}`);
      }
    }
  }

  return allMatches;
}

function formatOddsForMatch(match) {
  const bookmakers = match.bookmakers || [];
  const oddsMap = {};

  for (const bm of bookmakers) {
    const label = BOOKMAKER_LABELS[bm.key] || bm.title;
    const h2h = bm.markets?.find(m => m.key === 'h2h');
    if (!h2h) continue;

    const home = h2h.outcomes?.find(o => o.name === match.home_team);
    const away = h2h.outcomes?.find(o => o.name === match.away_team);
    const draw = h2h.outcomes?.find(o => o.name === 'Draw');

    oddsMap[label] = {
      home: home?.price || null,
      draw: draw?.price || null,
      away: away?.price || null,
    };
  }

  return oddsMap;
}

function getBestOdds(match, prediction) {
  const bookmakers = match.bookmakers || [];
  let best = { house: null, odd: 0 };
  const outcomeKey = prediction === 'HOME' ? match.home_team
    : prediction === 'AWAY' ? match.away_team : 'Draw';

  for (const bm of bookmakers) {
    const h2h = bm.markets?.find(m => m.key === 'h2h');
    if (!h2h) continue;
    const outcome = h2h.outcomes?.find(o => o.name === outcomeKey);
    if (outcome && outcome.price > best.odd) {
      best = { house: BOOKMAKER_LABELS[bm.key] || bm.title, odd: outcome.price };
    }
  }

  return best;
}

module.exports = { getTodaysMatches, formatOddsForMatch, getBestOdds };
