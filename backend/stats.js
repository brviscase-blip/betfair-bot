require('dotenv').config();
const axios = require('axios');

const BASE = 'https://api.football-data.org/v4';
const TOKEN = process.env.FOOTBALL_DATA_TOKEN;

const SPORT_TO_COMP = {
  soccer_brazil_campeonato: 'BSA',
  soccer_brazil_serie_b:    'BSB',
  soccer_spain_la_liga:     'PD',
  soccer_england_premier_league: 'PL',
  soccer_uefa_champs_league: 'CL',
  soccer_germany_bundesliga: 'BL1',
  soccer_italy_serie_a:     'SA',
  soccer_france_ligue_one:  'FL1',
};

// Session cache to avoid repeated calls
const cache = {};

async function fd(path) {
  if (cache[path]) return cache[path];
  const res = await axios.get(`${BASE}${path}`, {
    headers: { 'X-Auth-Token': TOKEN },
    timeout: 8000,
  });
  // Respect rate limit header as requested by the API
  const remaining = parseInt(res.headers['x-requests-available-minute'] ?? '10');
  if (remaining <= 2) await new Promise(r => setTimeout(r, 62000));
  cache[path] = res.data;
  return res.data;
}

function normalize(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function fuzzyFind(teams, name) {
  const n = normalize(name);
  return teams.find(t =>
    normalize(t.name) === n ||
    normalize(t.shortName) === n ||
    normalize(t.tla) === n ||
    normalize(t.name).includes(n) ||
    n.includes(normalize(t.name)) ||
    normalize(t.shortName).includes(n) ||
    n.includes(normalize(t.shortName))
  );
}

function extractForm(matches, teamId) {
  if (!matches?.length) return 'N/A';
  return matches.slice(0, 5).map(m => {
    const isHome = m.homeTeam.id === teamId;
    const myScore  = isHome ? m.score.fullTime.home : m.score.fullTime.away;
    const oppScore = isHome ? m.score.fullTime.away : m.score.fullTime.home;
    if (myScore == null) return '?';
    if (myScore > oppScore) return 'V';
    if (myScore < oppScore) return 'D';
    return 'E';
  }).join('');
}

async function getMatchStats(homeTeam, awayTeam, sportKey) {
  if (!TOKEN) return null;
  const compCode = SPORT_TO_COMP[sportKey];
  if (!compCode) return null;

  try {
    const [teamsData, standingsData] = await Promise.all([
      fd(`/competitions/${compCode}/teams`),
      fd(`/competitions/${compCode}/standings`),
    ]);

    const home = fuzzyFind(teamsData.teams, homeTeam);
    const away = fuzzyFind(teamsData.teams, awayTeam);
    if (!home && !away) return null;

    const table = standingsData.standings?.[0]?.table || [];
    const homeSt = table.find(e => e.team.id === home?.id);
    const awaySt = table.find(e => e.team.id === away?.id);

    // Fetch recent matches per team (respects cache)
    const [homeMData, awayMData] = await Promise.all([
      home ? fd(`/teams/${home.id}/matches?status=FINISHED&limit=5`) : Promise.resolve(null),
      away ? fd(`/teams/${away.id}/matches?status=FINISHED&limit=5`) : Promise.resolve(null),
    ]);

    const homeForm = homeMData ? extractForm(homeMData.matches, home.id) : 'N/A';
    const awayForm = awayMData ? extractForm(awayMData.matches, away.id) : 'N/A';

    return {
      homeForm,
      awayForm,
      homePosition: homeSt ? `${homeSt.position}º (${homeSt.points}pts)` : 'N/A',
      awayPosition: awaySt ? `${awaySt.position}º (${awaySt.points}pts)` : 'N/A',
      homeGoalsAvg: homeSt ? (homeSt.goalsFor / Math.max(homeSt.playedGames, 1)).toFixed(1) : null,
      awayGoalsAvg: awaySt ? (awaySt.goalsFor / Math.max(awaySt.playedGames, 1)).toFixed(1) : null,
      homeWins: homeSt?.won ?? null,
      awayWins: awaySt?.won ?? null,
    };
  } catch {
    return null;
  }
}

module.exports = { getMatchStats };
