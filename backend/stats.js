require('dotenv').config();
const axios = require('axios');

const BASE = 'https://api.football-data.org/v4';
const TOKEN = process.env.FOOTBALL_DATA_TOKEN;

const SPORT_TO_COMP = {
  soccer_brazil_campeonato:      'BSA',
  soccer_brazil_serie_b:         'BSB',
  soccer_spain_la_liga:          'PD',
  soccer_england_premier_league: 'PL',
  soccer_uefa_champs_league:     'CL',
  soccer_germany_bundesliga:     'BL1',
  soccer_italy_serie_a:          'SA',
  soccer_france_ligue_one:       'FL1',
};

const cache = {};

async function fd(path) {
  if (cache[path]) return cache[path];
  const res = await axios.get(`${BASE}${path}`, {
    headers: { 'X-Auth-Token': TOKEN },
    timeout: 8000,
  });
  const remaining = parseInt(res.headers['x-requests-available-minute'] ?? '10');
  if (remaining <= 2) await new Promise(r => setTimeout(r, 62000));
  cache[path] = res.data;
  return res.data;
}

function normalize(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos: á→a, ã→a, ç→c, etc.
    .replace(/[^a-z0-9]/g, '');
}

function fuzzyFind(teams, name) {
  const n = normalize(name);
  return teams.find(t =>
    normalize(t.name) === n ||
    normalize(t.shortName) === n ||
    normalize(t.name).includes(n) ||
    n.includes(normalize(t.name)) ||
    normalize(t.shortName).includes(n) ||
    n.includes(normalize(t.shortName))
  );
}

function calcForm(matches, teamId) {
  return matches.slice(0, 5).map(m => {
    const isHome = m.homeTeam.id === teamId;
    const mine = isHome ? m.score.fullTime.home : m.score.fullTime.away;
    const opp  = isHome ? m.score.fullTime.away : m.score.fullTime.home;
    if (mine == null) return '?';
    return mine > opp ? 'V' : mine < opp ? 'D' : 'E';
  }).join('') || 'N/A';
}

function calcCleanSheets(matches, teamId) {
  return matches.filter(m => {
    const isHome = m.homeTeam.id === teamId;
    const conceded = isHome ? m.score.fullTime.away : m.score.fullTime.home;
    return conceded === 0;
  }).length;
}

function getMotivation(position, total, points, gapTop, gapBottom) {
  if (position === 1) return 'Líder — lutando pelo título';
  if (position <= 3 && gapTop <= 6) return 'Candidato ao título';
  if (position <= 6) return 'Briga por classificação europeia/continental';
  if (total && position >= total - 3) return `⚠️ Zona de rebaixamento (${position}º)`;
  if (total && position >= total - 6) return 'Lutando para evitar rebaixamento';
  return 'Meio de tabela — motivação neutra';
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
    const total = table.length;
    const homeSt = table.find(e => e.team.id === home?.id);
    const awaySt = table.find(e => e.team.id === away?.id);

    // Fetch recent matches (more to split home/away)
    const [homeMData, awayMData] = await Promise.all([
      home ? fd(`/teams/${home.id}/matches?status=FINISHED&limit=20`) : Promise.resolve(null),
      away ? fd(`/teams/${away.id}/matches?status=FINISHED&limit=20`) : Promise.resolve(null),
    ]);

    const homeAllMatches  = homeMData?.matches || [];
    const awayAllMatches  = awayMData?.matches || [];

    // Overall form
    const homeFormGeneral = calcForm(homeAllMatches, home?.id);
    const awayFormGeneral = calcForm(awayAllMatches, away?.id);

    // Home-specific form (only matches played at home)
    const homeAsHome = homeAllMatches.filter(m => m.homeTeam.id === home?.id);
    const homeFormHome = calcForm(homeAsHome, home?.id);

    // Away-specific form (only matches played away)
    const awayAsAway = awayAllMatches.filter(m => m.awayTeam.id === away?.id);
    const awayFormAway = calcForm(awayAsAway, away?.id);

    // Clean sheets
    const homeCleanSheets = calcCleanSheets(homeAllMatches.slice(0, 10), home?.id);
    const awayCleanSheets = calcCleanSheets(awayAllMatches.slice(0, 10), away?.id);

    // Goals conceded avg
    const homeGoalsConceded = homeSt ? (homeSt.goalsAgainst / Math.max(homeSt.playedGames, 1)).toFixed(1) : null;
    const awayGoalsConceded = awaySt ? (awaySt.goalsAgainst / Math.max(awaySt.playedGames, 1)).toFixed(1) : null;

    // H2H from combined match history
    const h2hMatches = homeAllMatches.filter(m =>
      (m.homeTeam.id === home?.id && m.awayTeam.id === away?.id) ||
      (m.homeTeam.id === away?.id && m.awayTeam.id === home?.id)
    ).slice(0, 5);

    let h2hLast3 = 'Sem dados';
    if (h2hMatches.length > 0) {
      h2hLast3 = h2hMatches.map(m => {
        const score = `${m.score.fullTime.home}-${m.score.fullTime.away}`;
        return `${m.homeTeam.shortName ?? m.homeTeam.name} ${score} ${m.awayTeam.shortName ?? m.awayTeam.name}`;
      }).join(' | ');
    }

    // Motivation context
    const homeLeader = table[0];
    const homeGapTop = homeLeader && homeSt ? homeLeader.points - homeSt.points : null;
    const lastRow = table[total - 1];
    const homeGapBottom = lastRow && homeSt ? homeSt.points - lastRow.points : null;
    const awayGapTop = homeLeader && awaySt ? homeLeader.points - awaySt.points : null;
    const awayGapBottom = lastRow && awaySt ? awaySt.points - lastRow.points : null;

    const homeMotivation = homeSt ? getMotivation(homeSt.position, total, homeSt.points, homeGapTop, homeGapBottom) : 'N/A';
    const awayMotivation = awaySt ? getMotivation(awaySt.position, total, awaySt.points, awayGapTop, awayGapBottom) : 'N/A';

    return {
      homeForm:          homeFormGeneral,
      awayForm:          awayFormGeneral,
      homeFormHome,
      awayFormAway,
      homePosition:      homeSt ? `${homeSt.position}º (${homeSt.points}pts)` : 'N/A',
      awayPosition:      awaySt ? `${awaySt.position}º (${awaySt.points}pts)` : 'N/A',
      homeGoalsAvg:      homeSt ? (homeSt.goalsFor / Math.max(homeSt.playedGames, 1)).toFixed(1) : null,
      awayGoalsAvg:      awaySt ? (awaySt.goalsFor / Math.max(awaySt.playedGames, 1)).toFixed(1) : null,
      homeGoalsConceded,
      awayGoalsConceded,
      homeCleanSheets:   `${homeCleanSheets}/10 jogos`,
      awayCleanSheets:   `${awayCleanSheets}/10 jogos`,
      h2hLast3,
      homeMotivation,
      awayMotivation,
    };
  } catch {
    return null;
  }
}

module.exports = { getMatchStats };
