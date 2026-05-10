require('dotenv').config();
const https = require('https');
const fs = require('fs');
const axios = require('axios');

const cert = fs.readFileSync('./betfairbot.crt');
const key = fs.readFileSync('./betfairbot.key');

const agent = new https.Agent({ cert, key });

let sessionToken = null;
let lastLogin = null;

async function login() {
  try {
    const params = new URLSearchParams();
    params.append('username', process.env.BETFAIR_USERNAME);
    params.append('password', process.env.BETFAIR_PASSWORD);

    const response = await axios.post(
      'https://identitysso-cert.betfair.bet.br/api/certlogin',
      params,
      {
        httpsAgent: agent,
        headers: {
          'X-Application': process.env.BETFAIR_APP_KEY,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    if (response.data.loginStatus === 'SUCCESS') {
      sessionToken = response.data.sessionToken;
      lastLogin = new Date();
      console.log('✅ Login Betfair bem-sucedido');
      return sessionToken;
    } else {
      throw new Error(`Login falhou: ${response.data.loginStatus}`);
    }
  } catch (error) {
    console.error('❌ Erro no login:', error.message);
    throw error;
  }
}

async function getToken() {
  // Renova token a cada 6 horas
  const sixHours = 6 * 60 * 60 * 1000;
  if (!sessionToken || !lastLogin || (Date.now() - lastLogin) > sixHours) {
    await login();
  }
  return sessionToken;
}

module.exports = { login, getToken };
