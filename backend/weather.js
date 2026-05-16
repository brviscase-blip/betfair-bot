require('dotenv').config();
const axios = require('axios');

const API_KEY = process.env.OPENWEATHER_KEY;

// Mapa time → cidade do estádio
const TEAM_CITY = {
  // Brasileirão Série A
  'Atletico Mineiro': 'Belo Horizonte', 'Atlético Mineiro': 'Belo Horizonte',
  'Flamengo': 'Rio de Janeiro', 'Vasco da Gama': 'Rio de Janeiro', 'Fluminense': 'Rio de Janeiro', 'Botafogo': 'Rio de Janeiro',
  'São Paulo': 'São Paulo', 'Corinthians': 'São Paulo', 'Palmeiras': 'São Paulo', 'Santos': 'Santos',
  'Internacional': 'Porto Alegre', 'Grêmio': 'Porto Alegre',
  'Cruzeiro': 'Belo Horizonte', 'Atletico Goianiense': 'Goiânia', 'Goiás': 'Goiânia',
  'Cuiabá': 'Cuiabá', 'Fortaleza': 'Fortaleza', 'Ceará': 'Fortaleza',
  'Bahia': 'Salvador', 'Vitória': 'Salvador', 'Sport Recife': 'Recife', 'Nautico': 'Recife',
  'Athletico Paranaense': 'Curitiba', 'Coritiba': 'Curitiba',
  'Red Bull Bragantino': 'Bragança Paulista', 'Mirassol': 'Mirassol',
  'São Bernardo': 'São Bernardo do Campo', 'Operario PR': 'Ponta Grossa',
  'Novorizontino': 'Novo Horizonte', 'Gremio Novorizontino': 'Novo Horizonte',
  'America Mineiro': 'Belo Horizonte', 'América Mineiro': 'Belo Horizonte',
  // Premier League
  'Arsenal': 'London', 'Chelsea': 'London', 'Tottenham Hotspur': 'London',
  'West Ham United': 'London', 'Crystal Palace': 'London', 'Brentford': 'London',
  'Fulham': 'London', 'Wimbledon': 'London',
  'Manchester City': 'Manchester', 'Manchester United': 'Manchester',
  'Liverpool': 'Liverpool', 'Everton': 'Liverpool',
  'Aston Villa': 'Birmingham', 'Wolverhampton Wanderers': 'Wolverhampton',
  'Newcastle United': 'Newcastle upon Tyne', 'Sunderland': 'Sunderland',
  'Brighton': 'Brighton', 'Southampton': 'Southampton', 'Ipswich Town': 'Ipswich',
  'Leicester City': 'Leicester', 'Nottingham Forest': 'Nottingham',
  'Leeds United': 'Leeds', 'Burnley': 'Burnley',
  // La Liga
  'Real Madrid': 'Madrid', 'Atletico Madrid': 'Madrid', 'Getafe': 'Madrid',
  'Barcelona': 'Barcelona', 'Espanyol': 'Barcelona', 'Girona': 'Girona',
  'Sevilla': 'Seville', 'Real Betis': 'Seville',
  'Valencia': 'Valencia', 'Villarreal': 'Villarreal', 'Athletic Club': 'Bilbao',
  'Real Sociedad': 'San Sebastián', 'Osasuna': 'Pamplona',
  // Champions League / outros cobertos dinamicamente
};

async function getWeather(homeTeam) {
  if (!API_KEY) return null;
  const city = TEAM_CITY[homeTeam];
  if (!city) return null;

  try {
    const { data } = await axios.get('https://api.openweathermap.org/data/2.5/weather', {
      params: { q: city, appid: API_KEY, units: 'metric', lang: 'pt_br' },
      timeout: 5000,
    });

    const desc = data.weather?.[0]?.description || '';
    const temp = Math.round(data.main?.temp ?? 0);
    const wind = (data.wind?.speed ?? 0).toFixed(1);
    const rain = data.rain?.['1h'] ? `${data.rain['1h']}mm/h` : null;

    const alerts = [];
    if (data.wind?.speed > 10) alerts.push(`🌬️ Vento forte (${wind}m/s)`);
    if (rain) alerts.push(`🌧️ Chuva (${rain})`);
    if (temp < 5) alerts.push(`🥶 Frio intenso (${temp}°C)`);
    if (temp > 35) alerts.push(`🥵 Calor extremo (${temp}°C)`);

    return {
      city,
      description: `${desc}, ${temp}°C, vento ${wind}m/s${rain ? `, chuva ${rain}` : ''}`,
      alerts: alerts.length > 0 ? alerts.join(' | ') : null,
    };
  } catch {
    return null;
  }
}

module.exports = { getWeather };
