'use client';

import { useEffect, useMemo, useState } from 'react';

type Place = { name: string; lat: number; lon: number };
type GeocodedPlace = { name: string; latitude: number; longitude: number; admin1?: string; admin2?: string; country_code?: string };
type SaleDay = { date: string; units: number; visitors: number | null; areaPopulation: number | null };
type WeatherDay = { date: string; max: number; rain: number };
type ForecastDay = { date: string; sales: number; visitors: number | null; weather: WeatherDay | null; holiday: string | null };
type WeatherReply = { daily: { time: string[]; temperature_2m_max: number[]; precipitation_sum?: number[] } };
type Holiday = { date: string; name: string; global?: boolean; counties?: string[] | null };

const areas: Place[] = [
  { name: 'Sydney CBD', lat: -33.8688, lon: 151.2093 }, { name: 'Parramatta', lat: -33.8151, lon: 151.0011 },
  { name: 'Miranda', lat: -34.036, lon: 151.1 }, { name: 'Blacktown', lat: -33.768, lon: 150.906 },
  { name: 'Penrith', lat: -33.751, lon: 150.694 }, { name: 'Bondi', lat: -33.891, lon: 151.276 },
  { name: 'Chatswood', lat: -33.797, lon: 151.18 }, { name: 'Liverpool', lat: -33.92, lon: 150.925 },
  { name: 'Campbelltown', lat: -34.065, lon: 150.814 },
];
const drinkTypes: Record<string, string[]> = {
  'Soft drinks': ['Coca-Cola Original Taste', 'Coca-Cola Zero Sugar', 'Solo Original Lemon', 'Sprite', 'Fanta Orange'],
  'Bottled water': ['Mount Franklin Still Water', 'Mount Franklin Sparkling Water', 'Pump Water'],
  'Energy drinks': ['V Energy', 'Red Bull Energy Drink', 'Mother Energy Drink'],
  'Sports drinks': ['Powerade', 'Gatorade'],
  Juice: ['Orange juice', 'Apple juice', 'Juice boxes'],
  'Iced tea & coffee': ['Lipton Ice Tea', 'Dare Iced Coffee', 'Iced coffee'],
};
const nf = new Intl.NumberFormat('en-AU');
const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const prettyDate = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' });
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

function readCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let value = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' && quoted && text[i + 1] === '"') { value += '"'; i++; }
    else if (c === '"') quoted = !quoted;
    else if ((c === ',' || c === '\n' || c === '\r') && !quoted) {
      row.push(value.trim()); value = '';
      if (c !== ',') { if (row.some(Boolean)) rows.push(row); row = []; if (c === '\r' && text[i + 1] === '\n') i++; }
    } else value += c;
  }
  row.push(value.trim()); if (row.some(Boolean)) rows.push(row); return rows;
}
function parseDate(value: string): string | null {
  const s = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}
function parseSalesCsv(text: string): SaleDay[] {
  const rows = readCsv(text); if (!rows.length) throw new Error('The CSV is empty.');
  const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '');
  const headerAt = rows.findIndex(r => r.some(x => ['date', 'saledate', 'salesdate'].includes(norm(x))) && r.some(x => ['unitssold', 'units', 'quantity', 'qty'].includes(norm(x))));
  if (headerAt < 0) throw new Error('Use date and units_sold columns.');
  const h = rows[headerAt].map(norm), dateCol = h.findIndex(x => ['date', 'saledate', 'salesdate'].includes(x)), unitsCol = h.findIndex(x => ['unitssold', 'units', 'quantity', 'qty'].includes(x));
  const visitorCol = h.findIndex(x => ['storevisitors', 'dailyvisitors', 'footfall', 'storetransactions', 'transactioncount', 'transactions'].includes(x));
  const populationCol = h.findIndex(x => ['annualareapopulation', 'areapopulation', 'suburbpopulation', 'annualpopulation', 'population'].includes(x));
  const totals = new Map<string, { units: number; visitorSum: number; visitorRows: number; populationSum: number; populationRows: number }>();
  for (const r of rows.slice(headerAt + 1)) {
    const d = parseDate(r[dateCol] || ''), units = Number((r[unitsCol] || '').replaceAll(',', ''));
    if (!d || !Number.isFinite(units) || units < 0) continue;
    const t = totals.get(d) || { units: 0, visitorSum: 0, visitorRows: 0, populationSum: 0, populationRows: 0 };
    t.units += units;
    if (visitorCol >= 0) { const v = Number((r[visitorCol] || '').replaceAll(',', '')); if (Number.isFinite(v) && v >= 0) { t.visitorSum += v; t.visitorRows++; } }
    if (populationCol >= 0) { const p = Number((r[populationCol] || '').replaceAll(',', '')); if (Number.isFinite(p) && p > 0) { t.populationSum += p; t.populationRows++; } }
    totals.set(d, t);
  }
  const result = [...totals].map(([date, t]) => ({ date, units: t.units, visitors: t.visitorRows ? t.visitorSum / t.visitorRows : null, areaPopulation: t.populationRows ? t.populationSum / t.populationRows : null })).sort((a, b) => a.date.localeCompare(b.date));
  if (!result.length) throw new Error('No valid daily sales rows were found.');
  return result.slice(-1461);
}

export default function ForecastDashboard() {
  const [place, setPlace] = useState(areas[0]);
  const [placeQuery, setPlaceQuery] = useState(areas[0].name);
  const [placeSuggestions, setPlaceSuggestions] = useState<Place[]>(areas);
  const [drinkType, setDrinkType] = useState('Soft drinks');
  const [product, setProduct] = useState(drinkTypes['Soft drinks'][0]);
  const [horizon, setHorizon] = useState(14);
  const [sales, setSales] = useState<SaleDay[]>([]);
  const [weatherData, setWeatherData] = useState<Map<string, WeatherDay>>(new Map());
  const [holidayData, setHolidayData] = useState<Holiday[]>([]);
  const [liveDataReady, setLiveDataReady] = useState(false);
  const [stock, setStock] = useState(0); const [incoming, setIncoming] = useState(0); const [safety, setSafety] = useState(0); const [usual, setUsual] = useState(75);
  const [rows, setRows] = useState<ForecastDay[]>([]); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('Upload sales if available, then create a forecast.');
  const latestVisitors = [...sales].reverse().find(x => x.visitors !== null);
  const estimatedSales = rows.reduce((a, r) => a + r.sales, 0);
  const order = Math.max(0, Math.ceil(estimatedSales + safety - stock - incoming));
  const visitorDays = sales.filter(s => s.visitors !== null && s.visitors > 0).length;
  const populationByYear = useMemo(() => {
    const grouped = new Map<number, number[]>();
    for (const sale of sales) {
      if (sale.areaPopulation === null) continue;
      const year = Number(sale.date.slice(0, 4));
      const values = grouped.get(year) || [];
      values.push(sale.areaPopulation);
      grouped.set(year, values);
    }
    return [...grouped.entries()].map(([year, values]) => ({ year, population: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) })).sort((a, b) => a.year - b.year);
  }, [sales]);
  const latestPopulation = populationByYear.at(-1) || null;
  const items = useMemo(() => drinkTypes[drinkType], [drinkType]);
  useEffect(() => { setLiveDataReady(false); setRows([]); }, [place.lat, place.lon, horizon]);
  useEffect(() => {
    const query = placeQuery.trim();
    const existing = areas.find(a => a.name.toLowerCase() === query.toLowerCase());
    if (existing) { setPlace(existing); setPlaceSuggestions(areas); return; }
    if (query.length < 3) { setPlaceSuggestions(areas); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=100&language=en&format=json&countryCode=AU`, { signal: controller.signal })
        .then(r => { if (!r.ok) throw Error('Suburb search unavailable'); return r.json() as Promise<{ results?: GeocodedPlace[] }>; })
        .then(data => {
          const results = (data.results || []).filter(x => x.country_code === 'AU' && x.admin1 === 'New South Wales' && x.latitude >= -34.3 && x.latitude <= -33.2 && x.longitude >= 150.3 && x.longitude <= 151.6);
          const options = results.map(x => ({ name: x.admin2 ? `${x.name}, ${x.admin2}` : x.name, lat: x.latitude, lon: x.longitude }));
          setPlaceSuggestions(options);
          const exact = options.find(x => x.name.toLowerCase() === query.toLowerCase() || x.name.split(',')[0].toLowerCase() === query.toLowerCase());
          if (exact) { setPlace(exact); setPlaceQuery(exact.name); }
        }).catch(() => { if (!controller.signal.aborted) setPlaceSuggestions([]); });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [placeQuery]);
  async function upload(file?: File) {
    if (!file) return;
    try { const loaded = parseSalesCsv(await file.text()); setSales(loaded); const v = loaded.filter(s => s.visitors !== null).length; const p = new Set(loaded.filter(s => s.areaPopulation !== null).map(s => s.date.slice(0, 4))).size; setMessage(`Loaded ${loaded.length} sales days${v ? ` and visitor counts for ${v} days` : ''}${p ? ` plus population for ${p} years` : ''}. CSV data stays in this browser.`); setRows([]); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Could not read this CSV.'); }
  }
  async function refreshLiveData() {
    setBusy(true); setLiveDataReady(false); setRows([]); setMessage(`Refreshing live weather and NSW holiday dates for ${place.name}…`);
    try {
      const q = new URLSearchParams({ latitude: String(place.lat), longitude: String(place.lon), daily: 'temperature_2m_max,precipitation_sum,weather_code', forecast_days: '16', timezone: 'Australia/Sydney' });
      const [weatherReply, holidayReplies] = await Promise.allSettled([
        fetch(`https://api.open-meteo.com/v1/forecast?${q}`).then(r => { if (!r.ok) throw Error('Weather service unavailable'); return r.json() as Promise<WeatherReply>; }),
        Promise.all([...new Set([new Date().getFullYear(), new Date(Date.now() + horizon * 86400000).getFullYear()])].map(y => fetch(`https://date.nager.at/api/v3/PublicHolidays/${y}/AU`).then(r => { if (!r.ok) throw Error('Holiday service unavailable'); return r.json() as Promise<Holiday[]>; }))),
      ]);
      const weatherMap = new Map<string, WeatherDay>();
      if (weatherReply.status === 'fulfilled') { const d = weatherReply.value.daily; d.time.forEach((date: string, i: number) => weatherMap.set(date, { date, max: Number(d.temperature_2m_max[i]), rain: Number(d.precipitation_sum?.[i] || 0) })); }
      const holidays: Holiday[] = holidayReplies.status === 'fulfilled' ? holidayReplies.value.flat().filter(x => x.global || x.counties?.includes('AU-NSW')) : [];
      setWeatherData(weatherMap); setHolidayData(holidays); setLiveDataReady(true);
      setMessage(`${weatherMap.size} days of live weather loaded${holidayReplies.status === 'fulfilled' ? '; NSW public holidays checked' : '; holiday service unavailable'}. Now create your forecast.`);
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not refresh live data.'); }
    finally { setBusy(false); }
  }
  async function forecast() {
    if (!liveDataReady) return;
    setBusy(true); setRows([]); setMessage('Calculating your forecast from the refreshed data…');
    try {
      const weatherMap = weatherData;
      const holidays = holidayData;
      const sameWeekday = (d: Date) => sales.filter(s => { if (s.visitors === null || s.visitors <= 0) return false; const old = new Date(`${s.date}T12:00:00`); return old.getDay() === d.getDay(); }).slice(-12);
      const salesWeekday = (d: Date) => sales.filter(s => new Date(`${s.date}T12:00:00`).getDay() === d.getDay()).slice(-12);
      const trafficValues = sales.filter(s => s.visitors !== null && s.visitors > 0);
      const unitsPerVisitor = trafficValues.length ? trafficValues.reduce((sum, v) => sum + v.units, 0) / trafficValues.reduce((sum, v) => sum + (v.visitors || 0), 0) : 0;
      const priorPopulation = populationByYear.at(-2);
      const populationFactor = !trafficValues.length && latestPopulation && priorPopulation && priorPopulation.population > 0
        ? clamp(latestPopulation.population / priorPopulation.population, 0.9, 1.1)
        : 1;
      const first = new Date(); first.setDate(first.getDate() + 1); first.setHours(12, 0, 0, 0);
      const days: ForecastDay[] = Array.from({ length: horizon }, (_, i) => {
        const d = new Date(first); d.setDate(d.getDate() + i); const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const w = weatherMap.get(key) || null; const visitorsSamples = sameWeekday(d); const visitors = visitorsSamples.length ? Math.round(visitorsSamples.reduce((s, v) => s + (v.visitors || 0), 0) / visitorsSamples.length) : null;
        const salesSamples = salesWeekday(d); const avg = salesSamples.length ? salesSamples.reduce((s, v) => s + v.units, 0) / salesSamples.length : (sales.length ? sales.reduce((s, v) => s + v.units, 0) / sales.length : usual);
        const tempFactor = w ? clamp(1 + (w.max - 22) * 0.025 - clamp(w.rain / 50, 0, 0.15), 0.6, 1.5) : 1;
        const base = visitors !== null && trafficValues.length && unitsPerVisitor > 0 ? unitsPerVisitor * visitors : avg;
        const holiday = holidays.find(x => x.date === key)?.name || null;
        return { date: key, sales: Math.max(0, Math.round(base * tempFactor * populationFactor * (holiday ? 1.15 : 1))), visitors, weather: w, holiday };
      });
      setRows(days);
      const weatherDays = days.filter(d => d.weather).length;
      const populationNote = populationFactor !== 1 ? ` Annual suburb population trend (${nf.format(priorPopulation!.population)} to ${nf.format(latestPopulation!.population)}) is included as a limited adjustment.` : '';
      setMessage(`${weatherDays} of ${horizon} forecast days use live weather. ${visitorDays ? `${visitorDays} daily visitor records were used.` : 'Sales history or typical sales/day is used.'}${populationNote}`);
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Forecast could not be calculated.'); }
    finally { setBusy(false); }
  }
  function downloadForecast() { const lines = [['date','expected_sales_drinks','estimated_store_visitors','weather_high_c','rain_mm','public_holiday'], ...rows.map(r => [r.date, r.sales, r.visitors ?? '', r.weather?.max ?? '', r.weather?.rain ?? '', r.holiday || ''])]; const csv = lines.map(r => r.map(v => `"${String(v).replaceAll('"','""')}"`).join(',')).join('\r\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'coles-cold-drinks-forecast.csv'; a.click(); URL.revokeObjectURL(a.href); }
  function downloadForecastPdf() {
    const popup = window.open('', '_blank');
    if (!popup) { setMessage('Allow pop-ups for this site to save the forecast as a PDF.'); return; }
    const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
    const body = rows.map(r => `<tr><td>${escape(prettyDate(r.date))}</td><td>${nf.format(r.sales)} drinks</td><td>${r.visitors === null ? 'No estimate' : nf.format(r.visitors)}</td><td>${r.weather ? `${Math.round(r.weather.max)}°C · ${Math.round(r.weather.rain)} mm rain` : 'Unavailable'}</td><td>${escape(r.holiday || '—')}</td></tr>`).join('');
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Coles cold drinks forecast</title><style>body{font:12px Arial,sans-serif;color:#17382a;padding:28px}h1{font-size:24px;margin:0 0 6px}.meta{color:#52675a;margin:0 0 18px}.order{font-size:20px;font-weight:bold;color:#176b3a;margin:15px 0}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:8px;border-bottom:1px solid #d9e3dc}th{background:#f0f5ec;font-size:10px;text-transform:uppercase}@media print{body{padding:0}}</style></head><body><h1>Cold drinks forecast</h1><p class="meta">${escape(place.name)} · ${escape(product)} · ${horizon} days</p><p class="order">Recommended order: ${nf.format(order)} drinks</p><p>Expected sales: ${nf.format(estimatedSales)} drinks</p><table><thead><tr><th>Date</th><th>Expected sales</th><th>Estimated visitors</th><th>Weather</th><th>Holiday</th></tr></thead><tbody>${body}</tbody></table><script>window.onload=()=>window.print()<\/script></body></html>`);
    popup.document.close();
  }
  return <><header className="bar"><a className="logo" href="/">Coles <span>Stock Planner</span></a><span className="tag">COLD DRINKS · SYDNEY</span></header><main className="shell"><section className="intro"><p className="kicker">WEATHER-AWARE REPLENISHMENT</p><h1>Plan cold drinks with less guesswork.</h1><p>Choose a Sydney suburb and drink, then refresh the local weather before creating a forecast.</p></section>
    <section className="card"><div className="card-title"><span>1</span><div><h2>Choose your store and drinks</h2><p>Coles only · Search Sydney suburbs</p></div></div><div className="grid four"><label>Suburb<input list="sydney-suburbs" value={placeQuery} onChange={e => setPlaceQuery(e.target.value)} placeholder="Type a Sydney suburb"/><datalist id="sydney-suburbs">{placeSuggestions.map((a, i) => <option key={`${a.name}-${i}`} value={a.name}/>)}</datalist></label><label>Drink type<select value={drinkType} onChange={e => { setDrinkType(e.target.value); setProduct(drinkTypes[e.target.value][0]); }}>{Object.keys(drinkTypes).map(x => <option key={x}>{x}</option>)}</select></label><label>Product<select value={product} onChange={e => setProduct(e.target.value)}>{items.map(x => <option key={x}>{x}</option>)}</select></label><label>Forecast period<select value={horizon} onChange={e => setHorizon(Number(e.target.value))}><option value={7}>7 days</option><option value={14}>14 days</option><option value={30}>30 days</option></select></label></div><p className="privacy">Type a Sydney suburb and choose a matching suggestion to load its local weather coordinates.</p><button className="secondary refresh-button" onClick={() => void refreshLiveData()} disabled={busy || placeQuery !== place.name}>{busy ? 'Refreshing live data…' : 'Refresh weather and NSW holidays'}</button><p className="status" role="status">{liveDataReady ? message : 'Refresh live data here first. The forecast is only calculated when you press “Create forecast”.'}</p></section>
    <section className="card"><div className="card-title"><span>2</span><div><h2>Add sales and people counts</h2><p>Upload up to four years of daily sales history. Counts are optional.</p></div></div><div className="upload-row"><div><strong>Daily sales CSV</strong><p>Required: date, units_sold. Optional: store_visitors and annual_area_population.</p><input type="file" accept=".csv,text/csv" onChange={e => void upload(e.target.files?.[0])}/></div><a className="secondary download-link" href="/coles-cold-drinks-sales-template.csv" download>Download CSV template</a></div><p className="privacy">Use one store and one selected drink/product per CSV. `store_visitors` is that store’s daily visitor total. `annual_area_population` is the selected suburb’s estimated population for that year; repeat that year’s figure on its daily rows. Leave it blank if unknown. Never include customer names or IDs.</p><div className="stats"><div><strong>{sales.length ? nf.format(sales.length) : '—'}</strong><span>sales days loaded</span></div><div><strong>{visitorDays ? nf.format(visitorDays) : '—'}</strong><span>days with store visitors</span></div><div><strong>{latestVisitors ? nf.format(latestVisitors.visitors || 0) : '—'}</strong><span>latest store visitors</span></div><div><strong>{latestPopulation ? nf.format(latestPopulation.population) : '—'}</strong><span>suburb population · {latestPopulation?.year || 'not provided'}</span></div></div></section>
    <section className="card"><div className="card-title"><span>3</span><div><h2>Enter today's stock</h2><p>The order amount subtracts stock already available and incoming.</p></div></div><div className="grid four"><label>Typical sales/day<input type="number" min="0" value={usual} onChange={e => setUsual(Number(e.target.value))}/></label><label>Drinks on hand<input type="number" min="0" value={stock} onChange={e => setStock(Number(e.target.value))}/></label><label>Incoming drinks<input type="number" min="0" value={incoming} onChange={e => setIncoming(Number(e.target.value))}/></label><label>Extra safety stock<input type="number" min="0" value={safety} onChange={e => setSafety(Number(e.target.value))}/></label></div><button className="primary" onClick={() => void forecast()} disabled={busy || !liveDataReady || placeQuery !== place.name}>{busy ? 'Creating forecast…' : 'Create forecast'}</button><p className="status" role="status">{placeQuery !== place.name ? 'Choose a matching suburb suggestion before creating the forecast.' : !liveDataReady ? 'Refresh weather and NSW holidays in step 1 first.' : message}</p></section>
    {rows.length > 0 && <section className="card result"><div className="result-head"><div><p className="kicker">RECOMMENDED ORDER · {place.name}</p><h2>{nf.format(order)} drinks</h2><p>Expected sales: {nf.format(estimatedSales)} · {drinkType} · next {horizon} days</p></div><div className="result-actions"><button className="primary" onClick={downloadForecastPdf}>Download forecast PDF</button><button className="secondary" onClick={downloadForecast}>Download forecast CSV</button></div></div><div className="table-wrap"><table><thead><tr><th>Date</th><th>Expected sales</th><th>Estimated visitors</th><th>Weather</th><th>Holiday</th></tr></thead><tbody>{rows.map(r => <tr key={r.date}><td>{prettyDate(r.date)}</td><td>{nf.format(r.sales)} drinks</td><td>{r.visitors === null ? 'History unavailable' : nf.format(r.visitors)}</td><td>{r.weather ? `${Math.round(r.weather.max)}°C high · ${Math.round(r.weather.rain)} mm rain` : 'Live forecast unavailable'}</td><td>{r.holiday || '—'}</td></tr>)}</tbody></table></div><p className="footnote">Visitor counts are estimated from recent matching weekdays in your CSV. They are not a live public foot-traffic feed. Area population is used only as a limited yearly adjustment when daily visitor history is unavailable. Forecasts are planning estimates, not purchase orders. Live weather is generally available for about 16 days; later dates use sales and calendar patterns.</p></section>}
    <aside className="note"><strong>Data sources and limits</strong><p>Live weather: Open-Meteo. NSW public holidays: Nager.Date. Coles does not provide public store-level sales or visitor counts; upload data you are authorised to use. Without sales history, the tool uses the typical-sales value plus simple weather and calendar adjustments. Forecasting works without login or account setup.</p></aside>
    <footer>Independent Coles-focused planning prototype · no Coles affiliation</footer></main></>;
}
