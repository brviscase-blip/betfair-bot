require('dotenv').config();
const axios = require('axios');
const { getPendingPredictions, updatePredictionResult } = require('./db');

const BASE = 'https://api.football-data.org/v4';
const TOKEN = process.env.FOOTBALL_DATA_TOKEN;

const SPORT_TO_COMP = {
  soccer_brazil_campeonato:      'BSA',
  soccer_spain_la_liga:          'PD',
  soccer_england_premier_league: 'PL',
  soccer_uefa_champs_league:     'CL',
  soccer_germany_bundesliga:     'BL1',
  soccer_italy_serie_a:          'SA',
  soccer_france_ligue_one:       'FL1',
};

function normalize(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function teamMatch(fdTeam, oddsName) {
  const n = normalize(oddsName);
  return (
    normalize(fdTeam.name) === n ||
    normalize(fdTeam.shortName) === n ||
    normalize(fdTeam.name).includes(n) ||
    n.includes(normalize(fdTeam.name)) ||
    normalize(fdTeam.shortName).includes(n) ||
    n.includes(normalize(fdTeam.shortName))
  );
}

async function fetchFinishedMatches(compCode, dateFrom, dateTo) {
  try {
    const { data } = await axios.get(`${BASE}/competitions/${compCode}/matches`, {
      headers: { 'X-Auth-Token': TOKEN },
      params: { status: 'FINISHED', dateFrom, dateTo },
      timeout: 8000,
    });
    return data.matches || [];
  } catch {
    return [];
  }
}

function getOutcome(match) {
  const h = match.score.fullTime.home;
  const a = match.score.fullTime.away;
  if (h == null || a == null) return null;
  if (h > a) return 'HOME';
  if (a > h) return 'AWAY';
  return 'DRAW';
}

async function checkDailyResults() {
  if (!TOKEN) return 0;

  const pending = await getPendingPredictions();
  if (!pending.length) return 0;

  // Group by competition code + date
  const groups = {};
  for (const p of pending) {
    if (!p.sport_key) continue;
    const compCode = SPORT_TO_COMP[p.sport_key];
    if (!compCode) continue;
    const date = (p.commence_time || p.date + 'T12:00:00Z').split('T')[0];
    const key = `${compCode}|${date}`;
    if (!groups[key]) groups[key] = { compCode, date, predictions: [] };
    groups[key].predictions.push(p);
  }

  let checked = 0;
  for (const { compCode, date, predictions } of Object.values(groups)) {
    // Include next day in range for late-night matches
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);
    const dateTo = nextDay.toISOString().split('T')[0];

    const matches = await fetchFinishedMatches(compCode, date, dateTo);

    for (const pred of predictions) {
      const found = matches.find(m =>
        teamMatch(m.homeTeam, pred.home_team) && teamMatch(m.awayTeam, pred.away_team)
      );
      if (!found) continue;

      const outcome = getOutcome(found);
      if (!outcome) continue;

      const result = outcome === pred.prediction ? 'WIN' : 'LOSS';
      await updatePredictionResult(pred.id, result);
      checked++;
    }
  }

  return checked;
}

module.exports = { checkDailyResults };
