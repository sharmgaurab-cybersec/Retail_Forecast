'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

type Place = { name: string; lat: number; lon: number };
type GeocodedPlace = { name: string; latitude: number; longitude: number; admin1?: string; admin2?: string; country_code?: string };
type SaleDay = { date: string; units: number; visitors: number | null; areaPopulation: number | null; promotion: boolean; price: number | null; stockout: boolean; leadDays: number | null };
type WeatherDay = { date: string; max: number; rain: number };
type ForecastDay = { date: string; sales: number; baseline: number; weatherEffect: number; seasonalEffect: number; populationEffect: number; promotionEffect: number; priceEffect: number; visitors: number | null; weather: WeatherDay | null; holiday: string | null };
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
  const valid = (year: number, month: number, day: number) => {
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  };
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [year, month, day] = s.split('-').map(Number);
    return valid(year, month, day) ? s : null;
  }
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!m) return null;
  const first = Number(m[1]); const second = Number(m[2]); const year = Number(m[3]);
  // Read ambiguous slash dates as Australian DD/MM. If only one ordering
  // makes a valid calendar date (for example 11/15/2025), use that ordering.
  const day = second > 12 ? second : first;
  const month = second > 12 ? first : first > 12 ? second : second;
  return valid(year, month, day) ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null;
}
function parseFlag(value: string): boolean {
  return ['true', 'yes', 'y', '1', 'promo', 'promotion'].includes(value.trim().toLowerCase());
}
function parseSalesCsv(text: string): SaleDay[] {
  const rows = readCsv(text); if (!rows.length) throw new Error('The CSV is empty.');
  const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '');
  const headerAt = rows.findIndex(r => r.some(x => ['date', 'saledate', 'salesdate'].includes(norm(x))) && r.some(x => ['unitssold', 'units', 'quantity', 'qty'].includes(norm(x))));
  if (headerAt < 0) throw new Error('Use date and units_sold columns.');
  const h = rows[headerAt].map(norm), dateCol = h.findIndex(x => ['date', 'saledate', 'salesdate'].includes(x)), unitsCol = h.findIndex(x => ['unitssold', 'units', 'quantity', 'qty'].includes(x));
  const visitorCol = h.findIndex(x => ['storevisitors', 'dailyvisitors', 'footfall', 'storetransactions', 'transactioncount', 'transactions'].includes(x));
  const populationCol = h.findIndex(x => ['annualareapopulation', 'areapopulation', 'suburbpopulation', 'annualpopulation', 'population'].includes(x));
  const promotionCol = h.findIndex(x => ['promotion', 'promo', 'onpromotion', 'promotional'].includes(x));
  const priceCol = h.findIndex(x => ['price', 'unitprice', 'sellingprice', 'priceaud'].includes(x));
  const stockoutCol = h.findIndex(x => ['stockout', 'outofstock', 'wasoutofstock'].includes(x));
  const leadCol = h.findIndex(x => ['deliveryleaddays', 'leaddays', 'supplierleaddays'].includes(x));
  const totals = new Map<string, { units: number; visitorSum: number; visitorRows: number; populationSum: number; populationRows: number; promotion: boolean; priceSum: number; priceRows: number; stockout: boolean; leadDaysSum: number; leadDaysRows: number }>();
  for (const r of rows.slice(headerAt + 1)) {
    const d = parseDate(r[dateCol] || ''), rawUnits = (r[unitsCol] || '').replaceAll(',', '').trim(), units = Number(rawUnits);
    if (!d || !rawUnits || !Number.isFinite(units) || units < 0) continue;
    const t = totals.get(d) || { units: 0, visitorSum: 0, visitorRows: 0, populationSum: 0, populationRows: 0, promotion: false, priceSum: 0, priceRows: 0, stockout: false, leadDaysSum: 0, leadDaysRows: 0 };
    t.units += units;
    if (visitorCol >= 0 && (r[visitorCol] || '').trim() !== '') { const v = Number((r[visitorCol] || '').replaceAll(',', '')); if (Number.isFinite(v) && v >= 0) { t.visitorSum += v; t.visitorRows++; } }
    if (populationCol >= 0) { const p = Number((r[populationCol] || '').replaceAll(',', '')); if (Number.isFinite(p) && p > 0) { t.populationSum += p; t.populationRows++; } }
    if (promotionCol >= 0) t.promotion ||= parseFlag(r[promotionCol] || '');
    if (priceCol >= 0) { const p = Number((r[priceCol] || '').replaceAll('$', '').replaceAll(',', '').trim()); if (Number.isFinite(p) && p > 0) { t.priceSum += p; t.priceRows++; } }
    if (stockoutCol >= 0) t.stockout ||= parseFlag(r[stockoutCol] || '');
    if (leadCol >= 0 && (r[leadCol] || '').trim() !== '') { const n = Number((r[leadCol] || '').trim()); if (Number.isInteger(n) && n >= 0) { t.leadDaysSum += n; t.leadDaysRows++; } }
    totals.set(d, t);
  }
  const result = [...totals].map(([date, t]) => ({ date, units: t.units, visitors: t.visitorRows ? t.visitorSum / t.visitorRows : null, areaPopulation: t.populationRows ? t.populationSum / t.populationRows : null, promotion: t.promotion, price: t.priceRows ? t.priceSum / t.priceRows : null, stockout: t.stockout, leadDays: t.leadDaysRows ? Math.round(t.leadDaysSum / t.leadDaysRows) : null })).sort((a, b) => a.date.localeCompare(b.date));
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
  const csvInput = useRef<HTMLInputElement>(null);
  const [promotionPlanned, setPromotionPlanned] = useState(false);
  const [plannedPrice, setPlannedPrice] = useState('');
  const [weatherData, setWeatherData] = useState<Map<string, WeatherDay>>(new Map());
  const [holidayData, setHolidayData] = useState<Holiday[]>([]);
  const [liveDataReady, setLiveDataReady] = useState(false);
  const [stock, setStock] = useState(0); const [incoming, setIncoming] = useState(0); const [safety, setSafety] = useState(0); const [usual, setUsual] = useState(75);
  const [rows, setRows] = useState<ForecastDay[]>([]); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('Upload sales if available, then create a forecast.');
  const visitorDays = sales.filter(s => s.visitors !== null && s.visitors > 0).length;
  const promotionDays = sales.filter(s => s.promotion).length;
  const stockoutDays = sales.filter(s => s.stockout).length;
  const priceDays = sales.filter(s => s.price !== null).length;
  const leadTimeDays = [...sales].reverse().find(s => s.leadDays !== null)?.leadDays ?? null;
  const estimatedSales = rows.reduce((a, r) => a + r.sales, 0);
  const order = Math.max(0, Math.ceil(estimatedSales + safety - stock - incoming));
  const leadDemand = leadTimeDays === null ? 0 : rows.slice(0, Math.min(leadTimeDays, rows.length)).reduce((sum, row) => sum + row.sales, 0);
  const leadTimeShortfall = leadTimeDays !== null && leadDemand > stock + incoming;
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
  const latestPopulation = populationByYear[populationByYear.length - 1] || null;
  const items = useMemo(() => drinkTypes[drinkType], [drinkType]);
  useEffect(() => {
    const query = placeQuery.trim();
    const existing = areas.find(a => a.name.toLowerCase() === query.toLowerCase());
    if (existing || query.length < 3) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=100&language=en&format=json&countryCode=AU`, { signal: controller.signal })
        .then(r => { if (!r.ok) throw Error('Suburb search unavailable'); return r.json() as Promise<{ results?: GeocodedPlace[] }>; })
        .then(data => {
          const results = (data.results || []).filter(x => x.country_code === 'AU' && x.admin1 === 'New South Wales' && x.latitude >= -34.3 && x.latitude <= -33.2 && x.longitude >= 150.3 && x.longitude <= 151.6);
          const options = results.map(x => ({ name: x.admin2 ? `${x.name}, ${x.admin2}` : x.name, lat: x.latitude, lon: x.longitude }));
          setPlaceSuggestions(options);
          const exact = options.find(x => x.name.toLowerCase() === query.toLowerCase() || x.name.split(',')[0].toLowerCase() === query.toLowerCase());
          if (exact) { setPlace(exact); setPlaceQuery(exact.name); setLiveDataReady(false); setRows([]); }
        }).catch(() => { if (!controller.signal.aborted) setPlaceSuggestions([]); });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [placeQuery]);
  async function upload(file?: File) {
    if (!file) return;
    try { const loaded = parseSalesCsv(await file.text()); setSales(loaded); const v = loaded.filter(s => s.visitors !== null).length; const p = new Set(loaded.filter(s => s.areaPopulation !== null).map(s => s.date.slice(0, 4))).size; const promo = loaded.filter(s => s.promotion).length; const outages = loaded.filter(s => s.stockout).length; setMessage(`Loaded ${loaded.length} sales days${v ? ` and visitor counts for ${v} days` : ''}${p ? ` plus population for ${p} years` : ''}${promo ? `, ${promo} promotion days` : ''}${outages ? `, and ${outages} stockout days (excluded from normal demand)` : ''}. CSV data stays in this browser.`); setRows([]); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Could not read this CSV.'); }
  }
  function clearSales() {
    setSales([]); setRows([]); setPromotionPlanned(false); setPlannedPrice('');
    if (csvInput.current) csvInput.current.value = '';
    setMessage('Uploaded sales data cleared. Set a typical sales/day value or upload a different CSV.');
  }
  async function refreshLiveData() {
    setBusy(true); setLiveDataReady(false); setRows([]); setMessage(`Refreshing live weather and NSW holiday dates for ${place.name}…`);
    try {
      const q = new URLSearchParams({ latitude: String(place.lat), longitude: String(place.lon), daily: 'temperature_2m_max,precipitation_sum,weather_code', forecast_days: '16', timezone: 'Australia/Sydney' });
      const [weatherReply, holidayReplies] = await Promise.allSettled([
        fetch(`https://api.open-meteo.com/v1/forecast?${q}`).then(r => { if (!r.ok) throw Error('Weather service unavailable'); return r.json() as Promise<WeatherReply>; }),
        Promise.all([...new Set([new Date().getFullYear(), new Date(Date.now() + horizon * 86400000).getFullYear()])].map(y => fetch(`https://date.nager.at/api/v3/PublicHolidays/${y}/AU`).then(r => { if (!r.ok) throw Error('Holiday service unavailable'); return r.json() as Promise<Holiday[]>; }))),
      ]);
      if (weatherReply.status === 'rejected') throw Error('Live weather could not be reached. Check your connection and try Refresh again.');
      const weatherMap = new Map<string, WeatherDay>();
      const d = weatherReply.value.daily; d.time.forEach((date: string, i: number) => weatherMap.set(date, { date, max: Number(d.temperature_2m_max[i]), rain: Number(d.precipitation_sum?.[i] || 0) }));
      if (!weatherMap.size) throw Error('The weather service returned no forecast days. Try refreshing again.');
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
      const availableSales = sales.filter(s => !s.stockout);
      const regularSales = availableSales.filter(s => !s.promotion);
      const demandHistory = regularSales.length ? regularSales : availableSales;
      const sameWeekday = (d: Date) => demandHistory.filter(s => { if (s.visitors === null || s.visitors <= 0) return false; const old = new Date(`${s.date}T12:00:00`); return old.getDay() === d.getDay(); }).slice(-12);
      const salesWeekday = (d: Date) => demandHistory.filter(s => new Date(`${s.date}T12:00:00`).getDay() === d.getDay()).slice(-12);
      const trafficValues = demandHistory.filter(s => s.visitors !== null && s.visitors > 0);
      const unitsPerVisitor = trafficValues.length ? trafficValues.reduce((sum, v) => sum + v.units, 0) / trafficValues.reduce((sum, v) => sum + (v.visitors || 0), 0) : 0;
      const promoHistory = availableSales.filter(s => s.promotion);
      const rateFor = (s: SaleDay) => s.visitors && s.visitors > 0 ? s.units / s.visitors : s.units;
      const averageRate = (items: SaleDay[]) => items.length
        ? items.every(s => s.visitors !== null && s.visitors > 0)
          ? items.reduce((sum, s) => sum + s.units, 0) / items.reduce((sum, s) => sum + (s.visitors || 0), 0)
          : items.reduce((sum, s) => sum + s.units, 0) / items.length
        : 0;
      const promoLift = promoHistory.length >= 2 && regularSales.length >= 4 && averageRate(regularSales) > 0
        ? clamp(averageRate(promoHistory) / averageRate(regularSales), 0.8, 2)
        : 1;
      const pricedRows = regularSales.filter(s => s.price !== null && s.price > 0 && rateFor(s) > 0);
      const priceValues = [...new Set(pricedRows.map(s => s.price!))];
      const referencePrice = pricedRows.length ? pricedRows.reduce((sum, s) => sum + s.price!, 0) / pricedRows.length : null;
      let priceElasticity: number | null = null;
      if (pricedRows.length >= 5 && priceValues.length >= 3 && Math.max(...priceValues) / Math.min(...priceValues) >= 1.05) {
        const xs = pricedRows.map(s => Math.log(s.price!)); const ys = pricedRows.map(s => Math.log(rateFor(s)));
        const xMean = xs.reduce((a, b) => a + b, 0) / xs.length; const yMean = ys.reduce((a, b) => a + b, 0) / ys.length;
        const denominator = xs.reduce((sum, x) => sum + (x - xMean) ** 2, 0);
        if (denominator > 0) priceElasticity = clamp(xs.reduce((sum, x, i) => sum + (x - xMean) * (ys[i] - yMean), 0) / denominator, -2, 0.5);
      }
      const requestedPrice = Number(plannedPrice);
      const priceFactor = Number.isFinite(requestedPrice) && requestedPrice > 0 && referencePrice && priceElasticity !== null
        ? clamp((requestedPrice / referencePrice) ** priceElasticity, 0.7, 1.5)
        : 1;
      const promotionFactor = promotionPlanned ? promoLift : 1;
      const priorPopulation = populationByYear[populationByYear.length - 2];
      const populationFactor = !trafficValues.length && latestPopulation && priorPopulation && priorPopulation.population > 0
        ? clamp(latestPopulation.population / priorPopulation.population, 0.9, 1.1)
        : 1;
      const first = new Date(); first.setDate(first.getDate() + 1); first.setHours(12, 0, 0, 0);
      const days: ForecastDay[] = Array.from({ length: horizon }, (_, i) => {
        const d = new Date(first); d.setDate(d.getDate() + i); const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const w = weatherMap.get(key) || null; const visitorsSamples = sameWeekday(d); const visitors = visitorsSamples.length ? Math.round(visitorsSamples.reduce((s, v) => s + (v.visitors || 0), 0) / visitorsSamples.length) : null;
        const salesSamples = salesWeekday(d);
        const weekdayAverage = salesSamples.length ? salesSamples.reduce((s, v) => s + v.units, 0) / salesSamples.length : (demandHistory.length ? demandHistory.reduce((s, v) => s + v.units, 0) / demandHistory.length : usual);
        const month = d.getMonth();
        const monthSamples = demandHistory.filter(s => new Date(`${s.date}T12:00:00`).getMonth() === month);
        const allAverage = demandHistory.length ? demandHistory.reduce((sum, day) => sum + day.units, 0) / demandHistory.length : usual;
        const monthAverage = monthSamples.length ? monthSamples.reduce((sum, day) => sum + day.units, 0) / monthSamples.length : allAverage;
        const seasonalFactor = demandHistory.length && allAverage > 0 && monthSamples.length >= 3 ? clamp(monthAverage / allAverage, 0.75, 1.3) : 1;
        const weatherSensitivity: Record<string, number> = { 'Soft drinks': 0.035, 'Bottled water': 0.045, 'Energy drinks': 0.025, 'Sports drinks': 0.04, Juice: 0.02, 'Iced tea & coffee': 0.03 };
        const weatherFactor = w ? clamp(1 + (w.max - 22) * weatherSensitivity[drinkType] - clamp(w.rain / 40, 0, 0.18), 0.55, 1.55) : 1;
        const weekdayTrafficRows = salesSamples.filter(s => s.visitors !== null && s.visitors > 0);
        const weekdayUnitsPerVisitor = weekdayTrafficRows.length
          ? weekdayTrafficRows.reduce((sum, s) => sum + s.units, 0) / weekdayTrafficRows.reduce((sum, s) => sum + (s.visitors || 0), 0)
          : unitsPerVisitor;
        const base = (visitors !== null && weekdayUnitsPerVisitor > 0 ? weekdayUnitsPerVisitor * visitors : weekdayAverage) * seasonalFactor * priceFactor * promotionFactor;
        const holiday = holidays.find(x => x.date === key)?.name || null;
        const holidayFactor = holiday ? 1.15 : 1;
        return { date: key, sales: Math.max(0, Math.round(base * weatherFactor * populationFactor * holidayFactor)), baseline: Math.round(base * populationFactor), weatherEffect: Math.round((weatherFactor - 1) * 100), seasonalEffect: Math.round((seasonalFactor - 1) * 100), populationEffect: Math.round((populationFactor - 1) * 100), promotionEffect: Math.round((promotionFactor - 1) * 100), priceEffect: Math.round((priceFactor - 1) * 100), visitors, weather: w, holiday };
      });
      setRows(days);
      const weatherDays = days.filter(d => d.weather).length;
      const populationNote = populationFactor !== 1 ? ` Annual suburb population trend (${nf.format(priorPopulation!.population)} to ${nf.format(latestPopulation!.population)}) is included as a limited adjustment.` : '';
      const salesBasis = sales.length ? `Based on ${nf.format(demandHistory.length)} non-stockout, non-promotion sales days matched by weekday.` : `No sales CSV uploaded: using your typical sales/day setting (${nf.format(usual)} drinks) as the starting point.`;
      const promotionNote = promotionPlanned ? (promoLift !== 1 ? ` Historical promotions suggest about ${Math.round((promoLift - 1) * 100)}% uplift.` : ' No reliable historical promotion uplift is available, so no promo increase was assumed.') : '';
      const priceNote = plannedPrice && priceElasticity === null ? ' Not enough varied historical prices to estimate a price effect.' : '';
      setMessage(`${weatherDays} of ${horizon} forecast days use live weather. ${salesBasis} ${visitorDays ? `${visitorDays} visitor records were loaded.` : ''}${promotionNote}${priceNote}${populationNote}`);
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Forecast could not be calculated.'); }
    finally { setBusy(false); }
  }
  function downloadForecast() { const lines = [['date','baseline_drinks','forecast_drinks','weather_adjustment_percent','seasonal_adjustment_percent','population_adjustment_percent','promotion_adjustment_percent','price_adjustment_percent','estimated_store_visitors','weather_high_c','rain_mm','public_holiday'], ...rows.map(r => [r.date, r.baseline, r.sales, r.weatherEffect, r.seasonalEffect, r.populationEffect, r.promotionEffect, r.priceEffect, r.visitors ?? '', r.weather?.max ?? '', r.weather?.rain ?? '', r.holiday || ''])]; const csv = lines.map(r => r.map(v => `"${String(v).replaceAll('"','""')}"`).join(',')).join('\r\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'coles-cold-drinks-forecast.csv'; a.click(); URL.revokeObjectURL(a.href); }
  function downloadForecastPdf() {
    const popup = window.open('', '_blank');
    if (!popup) { setMessage('Allow pop-ups for this site to save the forecast as a PDF.'); return; }
    const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
    const body = rows.map(r => `<tr><td>${escape(prettyDate(r.date))}</td><td>${nf.format(r.baseline)}</td><td>${nf.format(r.sales)} drinks</td><td>${r.weather ? `${r.weatherEffect > 0 ? '+' : ''}${r.weatherEffect}%` : 'No live data'}</td><td>${r.seasonalEffect > 0 ? '+' : ''}${r.seasonalEffect}%</td><td>${r.populationEffect > 0 ? '+' : ''}${r.populationEffect}%</td><td>${r.promotionEffect > 0 ? '+' : ''}${r.promotionEffect}%</td><td>${r.priceEffect > 0 ? '+' : ''}${r.priceEffect}%</td><td>${r.visitors === null ? 'No estimate' : nf.format(r.visitors)}</td><td>${r.weather ? `${Math.round(r.weather.max)}°C · ${Math.round(r.weather.rain)} mm rain` : 'Unavailable'}</td><td>${escape(r.holiday ? `${r.holiday} (+15%)` : '—')}</td></tr>`).join('');
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Coles cold drinks forecast</title><style>body{font:12px Arial,sans-serif;color:#17382a;padding:28px}h1{font-size:24px;margin:0 0 6px}.meta{color:#52675a;margin:0 0 18px}.order{font-size:20px;font-weight:bold;color:#176b3a;margin:15px 0}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:8px;border-bottom:1px solid #d9e3dc}th{background:#f0f5ec;font-size:10px;text-transform:uppercase}@media print{body{padding:0}}</style></head><body><h1>Cold drinks forecast</h1><p class="meta">${escape(place.name)} · ${escape(product)} · ${horizon} days</p><p class="order">Recommended order: ${nf.format(order)} drinks</p><p>Expected sales: ${nf.format(estimatedSales)} drinks</p><table><thead><tr><th>Date</th><th>Baseline</th><th>Expected sales</th><th>Weather change</th><th>Seasonal change</th><th>Population change</th><th>Promotion change</th><th>Price change</th><th>Estimated visitors</th><th>Weather</th><th>Holiday / uplift</th></tr></thead><tbody>${body}</tbody></table><script>window.onload=()=>window.print()<\/script></body></html>`);
    popup.document.close();
  }
  return <><header className="bar"><Link className="logo" href="/">Coles <span>Stock Planner</span></Link><span className="tag">COLD DRINKS · SYDNEY</span></header><main className="shell"><section className="intro"><p className="kicker">WEATHER-AWARE REPLENISHMENT</p><h1>Plan cold drinks with less guesswork.</h1><p>Choose a Sydney suburb and drink, then refresh the local weather before creating a forecast.</p></section>
    <section className="card"><div className="card-title"><span>1</span><div><h2>Choose your store and drinks</h2><p>Coles only · Search Sydney suburbs</p></div></div><div className="grid four"><label>Suburb<input list="sydney-suburbs" value={placeQuery} onChange={e => { const value = e.target.value; setPlaceQuery(value); setPlaceSuggestions(areas); setLiveDataReady(false); setRows([]); const match = areas.find(a => a.name.toLowerCase() === value.trim().toLowerCase()); if (match) setPlace(match); }} placeholder="Type a Sydney suburb"/><datalist id="sydney-suburbs">{placeSuggestions.map((a, i) => <option key={`${a.name}-${i}`} value={a.name}/>)}</datalist></label><label>Drink type<select value={drinkType} onChange={e => { setDrinkType(e.target.value); setProduct(drinkTypes[e.target.value][0]); }}>{Object.keys(drinkTypes).map(x => <option key={x}>{x}</option>)}</select></label><label>Product<select value={product} onChange={e => setProduct(e.target.value)}>{items.map(x => <option key={x}>{x}</option>)}</select></label><label>Forecast period<select value={horizon} onChange={e => { setHorizon(Number(e.target.value)); setLiveDataReady(false); setRows([]); }}><option value={7}>7 days</option><option value={14}>14 days</option><option value={30}>30 days</option></select></label></div><p className="privacy">Type a Sydney suburb and choose a matching suggestion to load its local weather coordinates.</p><button className="secondary refresh-button" onClick={() => void refreshLiveData()} disabled={busy || placeQuery !== place.name}>{busy ? 'Refreshing live data…' : 'Refresh weather and NSW holidays'}</button><p className="status" role="status">{message}</p></section>
    <section className="card"><div className="card-title"><span>2</span><div><h2>Add sales and people counts</h2><p>Upload up to four years of daily sales history. Counts are optional.</p></div></div><div className="upload-row"><div><strong>Daily sales CSV</strong><p>Required: date, units_sold. Optional: visitors, population, promotion, price, stockout, lead days.</p><input ref={csvInput} type="file" accept=".csv,text/csv" onChange={e => void upload(e.target.files?.[0])}/></div><div className="upload-actions"><a className="secondary download-link" href="/coles-cold-drinks-sales-template.csv" download>Download CSV template</a>{sales.length > 0 && <button className="secondary" type="button" onClick={clearSales}>Clear uploaded CSV</button>}</div></div><p className="privacy">Use one store and one drink/product per CSV. `promotion` and `stockout` accept yes/no. `price` is the selling price in AUD per unit. `delivery_lead_days` is the usual supplier lead time; repeat it on rows. Stockout days are excluded from normal demand. Promotion days are excluded from the normal baseline; the optional promotion switch uses their observed uplift if enough rows exist. Annual population is the suburb estimate for that year. Leave unknown values blank; never add customer names or IDs.</p><div className="stats"><div><strong>{sales.length ? nf.format(sales.length) : '—'}</strong><span>sales days loaded</span></div><div><strong>{visitorDays ? nf.format(visitorDays) : '—'}</strong><span>days with store visitors</span></div><div><strong>{latestPopulation ? nf.format(latestPopulation.population) : '—'}</strong><span>suburb population · {latestPopulation?.year || 'not provided'}</span></div><div><strong>{promotionDays || '—'}</strong><span>promotion days</span></div><div><strong>{stockoutDays || '—'}</strong><span>stockout days excluded</span></div><div><strong>{priceDays || '—'}</strong><span>days with price data</span></div><div><strong>{leadTimeDays === null ? '—' : `${leadTimeDays} days`}</strong><span>supplier lead time</span></div></div></section>
    <section className="card"><div className="card-title"><span>3</span><div><h2>Enter today&apos;s stock</h2><p>The order amount subtracts stock already available and incoming.</p></div></div><div className="grid four"><label>Typical sales/day (if no CSV)<input type="number" min="0" value={usual} onChange={e => setUsual(Number(e.target.value))}/></label><label>Drinks on hand<input type="number" min="0" value={stock} onChange={e => setStock(Number(e.target.value))}/></label><label>Incoming drinks<input type="number" min="0" value={incoming} onChange={e => setIncoming(Number(e.target.value))}/></label><label>Extra safety stock<input type="number" min="0" value={safety} onChange={e => setSafety(Number(e.target.value))}/></label><label>Planned selling price (AUD)<input type="number" min="0" step="0.01" value={plannedPrice} onChange={e => setPlannedPrice(e.target.value)} placeholder="Optional"/></label><label className="check-label"><input type="checkbox" checked={promotionPlanned} onChange={e => setPromotionPlanned(e.target.checked)}/> Promotion planned in this period</label></div><p className="privacy">Price changes are applied only when the CSV has enough varied prices to estimate a response. Promotions use uplift from your historical promotion rows; otherwise no uplift is guessed.</p><button className="primary" onClick={() => void forecast()} disabled={busy || !liveDataReady || placeQuery !== place.name}>{busy ? 'Creating forecast…' : 'Create forecast'}</button><p className="status" role="status">{placeQuery !== place.name ? 'Choose a matching suburb suggestion before creating the forecast.' : !liveDataReady ? 'Refresh weather and NSW holidays in step 1 first.' : message}</p></section>
    {rows.length > 0 && <section className="card result"><div className="result-head"><div><p className="kicker">RECOMMENDED ORDER · {place.name}</p><h2>{nf.format(order)} drinks</h2><p>Expected sales: {nf.format(estimatedSales)} · {drinkType} · next {horizon} days{leadTimeDays !== null ? ` · ${leadTimeDays}-day supplier lead time` : ''}</p><p>{leadTimeDays !== null ? `Demand before delivery: ${nf.format(leadDemand)} drinks. ${leadTimeShortfall ? 'Current plus incoming stock may run short before delivery.' : 'Current plus incoming stock covers expected demand before delivery.'}` : 'Add delivery_lead_days to your CSV to check stock coverage before delivery.'}</p></div><div className="result-actions"><button className="primary" onClick={downloadForecastPdf}>Download forecast PDF</button><button className="secondary" onClick={downloadForecast}>Download forecast CSV</button></div></div><div className="forecast-explanation"><strong>How these numbers are calculated</strong><span>When visitor counts are available, the model uses recent matching-weekday units per visitor × expected visitors for that weekday. Otherwise, it uses up to 12 recent sales records from matching weekdays; without a CSV, it uses your typical sales/day. Stockout days and past promotion days are excluded from normal demand. Seasonal history, live weather, planned promotions, and supported price changes adjust the baseline. Public holidays add 15%. Population affects the baseline only when at least two years are supplied and daily visitors are unavailable.</span></div><div className="table-wrap"><table><thead><tr><th>Date</th><th>Baseline</th><th>Forecast sales</th><th>Weather change</th><th>Seasonal change</th><th>Population change</th><th>Promotion change</th><th>Price change</th><th>Estimated visitors</th><th>Local weather</th><th>Public holiday</th></tr></thead><tbody>{rows.map(r => <tr key={r.date}><td>{prettyDate(r.date)}</td><td>{nf.format(r.baseline)} drinks</td><td><strong>{nf.format(r.sales)} drinks</strong></td><td>{r.weather ? `${r.weatherEffect > 0 ? '+' : ''}${r.weatherEffect}%` : 'No live data'}</td><td>{r.seasonalEffect > 0 ? '+' : ''}{r.seasonalEffect}%</td><td>{r.populationEffect > 0 ? '+' : ''}{r.populationEffect}%</td><td>{r.promotionEffect > 0 ? '+' : ''}{r.promotionEffect}%</td><td>{r.priceEffect > 0 ? '+' : ''}{r.priceEffect}%</td><td>{r.visitors === null ? 'No history' : nf.format(r.visitors)}</td><td>{r.weather ? `${Math.round(r.weather.max)}°C · ${Math.round(r.weather.rain)} mm rain` : 'Unavailable'}</td><td>{r.holiday ? `${r.holiday} (+15%)` : '—'}</td></tr>)}</tbody></table></div><p className="footnote">Visitor counts are estimated from recent matching weekdays in your CSV. They are not a live public foot-traffic feed. Area population is used only as a limited yearly adjustment when daily visitor history is unavailable. Forecasts are planning estimates, not purchase orders. Live weather is generally available for about 16 days; later dates use sales and calendar patterns.</p></section>}
    <aside className="note"><strong>Data sources and limits</strong><p>Live weather: Open-Meteo. NSW public holidays: Nager.Date. Coles does not provide public store-level sales or visitor counts; upload data you are authorised to use. Without sales history, the tool uses the typical-sales value plus simple weather and calendar adjustments. Forecasting works without login or account setup.</p></aside>
    <footer>Independent Coles-focused planning prototype · no Coles affiliation</footer></main></>;
}
