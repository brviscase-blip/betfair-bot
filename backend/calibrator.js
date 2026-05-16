require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const { getPredictionHistory, saveCalibration } = require('./db');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function runWeeklyCalibration() {
  const history = await getPredictionHistory(200);
  const resolved = history.filter(h => h.result !== 'PENDING');

  if (resolved.length < 10) return null;

  const wins = resolved.filter(h => h.result === 'WIN').length;

  const oldestDate = resolved[resolved.length - 1]?.date || resolved[0]?.date;
  const newestDate = resolved[0]?.date;
  const periodDays = oldestDate && newestDate
    ? Math.ceil((new Date(newestDate) - new Date(oldestDate)) / (1000 * 60 * 60 * 24)) + 1
    : resolved.length;

  const historyText = resolved.map(h =>
    `${h.date} | ${h.sport_title || '?'} | ${h.match} | tipo:${h.prediction} | conf:${h.confidence}% | odd:${h.best_odd ?? '?'} | ${h.result}`
  ).join('\n');

  const prompt = `Você é um analista quantitativo de apostas esportivas. Analise o histórico de previsões abaixo e identifique padrões de acerto e erro para calibrar um sistema de apostas automatizado.

HISTÓRICO (${resolved.length} apostas resolvidas | win rate geral: ${((wins / resolved.length) * 100).toFixed(1)}% | período: ${periodDays} dias):
${historyText}

Analise e identifique (somente o que os dados permitirem confirmar):
1. Win rate por tipo de previsão (HOME / DRAW / AWAY)
2. Se apostas com confiança mais alta realmente acertam mais
3. Win rate por liga/campeonato
4. Padrões relevantes (ex: odds muito altas, séries de erros em contextos específicos)

Responda APENAS com JSON válido:
{
  "notes": [
    "nota objetiva e acionável para o sistema de análise",
    "nota 2",
    "nota 3"
  ],
  "overall_win_rate": número entre 0 e 1,
  "sample_size": ${resolved.length},
  "period_days": ${periodDays},
  "generated_at": "${new Date().toISOString().split('T')[0]}"
}

Máximo 6 notas. Cada nota deve ser diretamente aplicável ao processo de decisão do bot. Se não houver dados suficientes para uma conclusão, não inclua a nota.`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].text;
    const json = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(json);

    await saveCalibration(parsed);
    return parsed;
  } catch {
    return null;
  }
}

module.exports = { runWeeklyCalibration };
