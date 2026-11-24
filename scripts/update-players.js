#!/usr/bin/env node
/* Завантажує поточний рейтинг ФНТУ та зберігає його у players.js.
 * Запуск: node scripts/update-players.js   (потрібен Node.js 18+)
 * Браузер не може звертатися до ligas.io напряму (CORS), тому дані оновлюються
 * цим скриптом: вручну або щодня через GitHub Actions. */
const fs = require('fs');
const path = require('path');

const ORG = 'uttf';
const RANKING = 'men'; // загальний рейтинг (чоловіки й жінки)
const OUT = path.join(__dirname, '..', 'players.js');

(async () => {
  const today = new Date().toISOString().slice(0, 10);
  const url = `https://ligas.io/api/organizations/${ORG}/rankings/${RANKING}/items/${today}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} для ${url}`);
  const items = await res.json();
  if (!Array.isArray(items) || items.length < 100) throw new Error('Несподівана відповідь API: замало гравців');

  const field = (it, key) => ((it.fields || []).find(f => f.key === key) || {}).value || '';
  const rows = items
    .filter(it => it.userName && typeof it.value === 'number')
    .map(it => [
      it.userName.replace(/\s+/g, ' ').trim(),
      Math.round(it.value * 10) / 10,                                   // рейтинг
      Math.round((typeof it.secondValue === 'number' ? it.secondValue : it.value) * 10) / 10, // рейтинг для посіву
      it.weight || 0,                                                   // вага
      field(it, 'city'),
      Number(field(it, 'birthyear')) || 0,
      field(it, 'sex')
    ]);

  const data = { updated: today, rows };
  fs.writeFileSync(OUT, 'window.FNTU_PLAYERS=' + JSON.stringify(data) + ';\n');
  console.log(`Збережено ${rows.length} гравців (${today}) -> ${OUT}`);
})().catch(e => { console.error(e.message); process.exit(1); });
