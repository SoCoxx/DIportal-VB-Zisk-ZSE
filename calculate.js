(async () => {
  const CONFIG = {
    from: '2026-07-01',                          // inclusive
    to: new Date().toISOString().slice(0, 10),   // today (last day may be partial)
    eic: null,                     // pin an OM by EIC; null = auto (prefer SUPPLY)
    profileRole: 'PS_MINUS',                     // Činná dodávka (export to grid)
    prices: { P1: 0.08211, P2: 0.04760, P3: 0.08092, P4: 0.04879 },
  };
  const easter = (y) => {
    const a=y%19,b=(y/100)|0,c=y%100,d=(b/4)|0,e=b%4,f=((b+8)/25)|0,g=((b-f+1)/3)|0,
      h=(19*a+b-d-g+15)%30,i=(c/4)|0,k=c%4,l=(32+2*e+2*i-h-k)%7,m=((a+11*h+22*l)/451)|0;
    return new Date(y,(((h+l-7*m+114)/31)|0)-1,((h+l-7*m+114)%31)+1);
  };
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const holidayCache = {};
  const isHoliday = (dateStr) => {
    const y = +dateStr.slice(0, 4);
    if (!holidayCache[y]) {
      const s = new Set([`${y}-01-01`,`${y}-01-06`,`${y}-05-01`,`${y}-05-08`,`${y}-07-05`,
        `${y}-08-29`,`${y}-09-15`,`${y}-11-01`,`${y}-11-17`,`${y}-12-24`,`${y}-12-25`,`${y}-12-26`]);
      const es = easter(y);
      const gf = new Date(es); gf.setDate(es.getDate() - 2); s.add(iso(gf));
      const em = new Date(es); em.setDate(es.getDate() + 1); s.add(iso(em));
      holidayCache[y] = s;
    }
    return holidayCache[y].has(dateStr);
  };
  const bandOf = (dateStr, hour) => {
    const dow = new Date(dateStr + 'T12:00:00').getDay();
    if (dow === 0 || dow === 6 || isHoliday(dateStr)) return 'P4';
    if (hour <= 9) return 'P1';
    if (hour <= 17) return 'P2';
    return 'P3';
  };

  const csrfResp = await fetch('/portal/api/security/checkUser', { headers: { accept: 'application/json' } });
  const csrf = csrfResp.headers.get('X-CSRF');
  const who = await csrfResp.json().catch(() => null);
  if (who?.data?.checkResult === 'NOT_AUTHENTICATED') { console.error('Nie ste prihlásený.'); return; }
  const hdrs = { 'content-type': 'application/json', accept: 'application/json', ...(csrf ? { 'x-csrf': csrf } : {}) };

  const user = (await (await fetch('/portal/api/commons/getUser', { headers: hdrs })).json())?.data;
  const bpa = user?.businessPartnerAssignments?.[0];
  if (!bpa) { console.error('Účet nemá priradeného obchodného partnera.'); return; }
  const businessPartnerId = bpa.businessPartnerId;
  const businessRoleId = (bpa.businessRoleIds || [])[0] || 'KZ';
  const source = user?.customizationParameters?.find(p => p.key === 'intervalData.defaultSource')?.value || 'KOC';
  console.log(`Partner: ${bpa.businessPartnerName} (${businessPartnerId}), rola ${businessRoleId}, zdroj ${source}`);

  let dps = null;
  try {
    const r = await fetch('/portal/api/delivery-points-list/loadDeliveryPoints', {
      method: 'POST', headers: hdrs,
      body: JSON.stringify({ filter: { onlyActive: true, smartMeterEnabled: null, dateFrom: '', dateTo: '' }, businessPartnerId, businessRoleId }),
    });
    if (r.status === 200) { const j = await r.json(); if (Array.isArray(j?.data)) dps = j.data; }
    else console.error('loadDeliveryPoints HTTP', r.status);
  } catch (e) { console.error('loadDeliveryPoints', e.message); }
  if (!dps?.length) { console.error('Nepodarilo sa načítať odberné miesta.'); return; }
  console.table(dps.map(d => ({ deliveryPointId: d.deliveryPointId, eic: d.eic, type: d.type, tarif: d.tarifType, interval: d.showIntervalData })));

  let cands = dps.filter(d => d.showIntervalData !== false);
  if (CONFIG.eic) cands = cands.filter(d => d.eic === CONFIG.eic || d.relatedEic === CONFIG.eic);
  cands.sort((a, b) => (b.type === 'SUPPLY') - (a.type === 'SUPPLY'));
  if (!cands.length) { console.error('Žiadne OM nevyhovuje filtru.', CONFIG.eic); return; }

  const call = async (dpId, from, to) => {
    const r = await fetch('/portal/api/interval-data/getProfileData', {
      method: 'POST', headers: hdrs,
      body: JSON.stringify({ filter: { deliveryPointId: dpId, from, to, profileRole: CONFIG.profileRole, loadProfileRoles: true }, businessPartnerId, businessRoleId, source }),
    });
    if (r.status !== 200) throw new Error('HTTP ' + r.status);
    return r.json();
  };

  const chunks = [];
  let cur = new Date(CONFIG.from + 'T00:00:00');
  const end = new Date(CONFIG.to + 'T00:00:00');
  while (cur <= end) {
    const ce = new Date(cur); ce.setDate(ce.getDate() + 6);
    chunks.push([iso(cur), iso(ce > end ? end : ce)]);
    cur = new Date(ce); cur.setDate(cur.getDate() + 1);
  }

  let dp = null, days = new Map();
  for (const cand of cands) {
    try {
      const probe = await call(cand.deliveryPointId, chunks[0][0], chunks[0][1]);
      if (probe?.data?.intervalDataProvided && probe?.data?.profileData?.dailyIntervalData?.length) {
        dp = cand;
        for (const d of probe.data.profileData.dailyIntervalData) days.set(d.date, d);
        console.log(`✔ OM ${cand.eic} (DP ${cand.deliveryPointId}, ${cand.type}), rola ${probe.data.profileData.profileRole}, jednotka ${probe.data.profileData.measuredValueUnit}`);
        break;
      }
      console.log(`– DP ${cand.deliveryPointId} (${cand.eic}): žiadne dáta pre ${CONFIG.profileRole}…`);
    } catch (e) { console.warn(`DP ${cand.deliveryPointId}:`, e.message); }
  }
  if (!dp) { console.error(`Žiadne OM nevrátilo ${CONFIG.profileRole} dáta.`); return; }

  for (const [f, t] of chunks.slice(1)) {
    const j = await call(dp.deliveryPointId, f, t);
    for (const d of (j?.data?.profileData?.dailyIntervalData || [])) days.set(d.date, d);
  }

  const agg = { P1:{kwh:0,eur:0}, P2:{kwh:0,eur:0}, P3:{kwh:0,eur:0}, P4:{kwh:0,eur:0} };
  const perDay = [], perMonth = {};
  let missing = 0;
  for (const date of [...days.keys()].sort()) {
    const day = days.get(date);
    let dayKwh = 0, dayEur = 0;
    for (const v of (day.values || [])) {
      if (typeof v.measuredValue !== 'number') { missing++; continue; }
      const kwh = v.measuredValue / 4;
      const band = bandOf(v.dateMeasuredAt || date, +String(v.measuredAt).slice(0, 2));
      agg[band].kwh += kwh; agg[band].eur += kwh * CONFIG.prices[band];
      dayKwh += kwh; dayEur += kwh * CONFIG.prices[band];
    }
    const mk = date.slice(0, 7);
    (perMonth[mk] ??= { kWh: 0, EUR: 0 });
    perMonth[mk].kWh += dayKwh; perMonth[mk].EUR += dayEur;
    perDay.push({ date, kWh: +dayKwh.toFixed(2), EUR: +dayEur.toFixed(3), portal_kWh: day.consumption ?? null });
  }

  const f2 = (x) => +x.toFixed(2);
  const names = { P1:'Pásmo 1 (00–10 prac.deň)', P2:'Pásmo 2 (10–18 prac.deň)', P3:'Pásmo 3 (18–24 prac.deň)', P4:'Pásmo 4 (víkend/sviatok)' };
  const totalKwh = Object.values(agg).reduce((s, a) => s + a.kwh, 0);
  const totalEur = Object.values(agg).reduce((s, a) => s + a.eur, 0);
  console.log(`\n%c=== PV EXPORT ${CONFIG.from} → ${CONFIG.to}  (OM ${dp.eic}) ===`, 'font-weight:bold');
  console.table(Object.fromEntries(Object.entries(agg).map(([b, a]) => [names[b], { kWh: f2(a.kwh), 'EUR/kWh': CONFIG.prices[b], EUR: f2(a.eur) }])));
  console.table(Object.fromEntries(Object.entries(perMonth).map(([m, v]) => [m, { kWh: f2(v.kWh), EUR: f2(v.EUR) }])));
  console.table(perDay);
  if (missing) console.warn(`${missing} 15-min slotov nemalo hodnotu — posledný deň býva neúplný.`);
  console.log(`%cSPOLU: ${f2(totalKwh)} kWh  =>  ${f2(totalEur)} €`, 'font-size:16px;font-weight:bold;color:#0a0');
  return { om: dp.eic, totalKwh: f2(totalKwh), totalEur: f2(totalEur), perMonth, bands: agg };
})();
