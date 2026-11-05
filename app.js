let selectedLocation = { name: "Miranda", state: "NSW", subdivision: "AU-NSW", latitude: -34.036, longitude: 151.1, timezone: "Australia/Sydney" };
const storeRetailer = "Coles";
const productCatalog = {
  fresh: { label: "Fresh foods", groups: {
    fruit: ["All fruit", "Apples", "Bananas", "Oranges", "Berries"],
    vegetables: ["All vegetables", "Potatoes", "Tomatoes", "Carrots", "Leafy greens"],
    herbs: ["All salad & herbs", "Salad leaves", "Fresh herbs"],
    meat: ["All fresh meat", "Beef mince", "Steak", "Chicken breast", "Chicken thighs", "Pork chops"],
    seafood: ["All seafood", "Salmon", "Prawns", "White fish"],
    dairy: ["All dairy & eggs", "Full cream milk", "Cheddar", "Greek yoghurt", "Eggs", "Butter"],
    bakery: ["All bakery", "White bread", "Wholemeal bread", "Sourdough", "Croissants", "Muffins"],
    deli: ["All deli", "Deli meats", "Deli cheese", "Fresh salads", "Sandwiches"]
  } }
};
const productExamples = {
  fruit: { name: "Fruit", unit: "items", icon: "☀", weather: "produce", aliases: ["fruit", "produce", "apple", "banana", "orange"] },
  vegetables: { name: "Vegetables", unit: "items", icon: "☀", weather: "produce", aliases: ["vegetable", "produce", "potato", "tomato", "carrot"] },
  herbs: { name: "Salad & herbs", unit: "items", icon: "☀", weather: "produce", aliases: ["salad", "herb", "produce"] },
  meat: { name: "Fresh meat", unit: "items", icon: "▤", weather: "neutral", aliases: ["beef", "chicken", "pork", "meat"] },
  seafood: { name: "Seafood", unit: "items", icon: "☂", weather: "neutral", aliases: ["seafood", "fish", "prawn"] },
  dairy: { name: "Dairy & eggs", unit: "items", icon: "☁", weather: "neutral", aliases: ["milk", "cheese", "yoghurt", "egg", "dairy"] },
  bakery: { name: "Bakery", unit: "items", icon: "☁", weather: "neutral", aliases: ["bread", "bakery", "cake", "pastry"] },
  deli: { name: "Deli", unit: "items", icon: "▤", weather: "neutral", aliases: ["deli", "ham", "salad", "sandwich"] }
};
const fallbackDailySales = { fruit: 55, vegetables: 55, herbs: 15, meat: 35, seafood: 18, dairy: 50, bakery: 50, deli: 24 };
const $ = (selector) => document.querySelector(selector);

function populateSubcategoryOptions() {
  const category = productCatalog.fresh;
  const select = $("#subcategory-select");
  select.innerHTML = Object.entries(category.groups).map(([key, products]) => `<option value="${escapeHTML(key)}">${escapeHTML(productExamples[key]?.name || key)}</option>`).join("");
  populateProductOptions();
}

function populateProductOptions() {
  const category = productCatalog.fresh;
  const groupKey = $("#subcategory-select").value;
  const group = productExamples[groupKey] || productExamples.fruit;
  const products = category.groups[groupKey] || [];
  const choices = products.filter((name) => !name.startsWith("All "));
  $("#product-select").innerHTML = `<option value="all">All ${escapeHTML(group.name.toLowerCase())}</option>${choices.map((name) => `<option value="${escapeHTML(name)}">${escapeHTML(name)}</option>`).join("")}`;
  $("#normal-sales").value = fallbackDailySales[groupKey] ?? 25;
  updateProductSearchLink();
}

function getSelectedProduct() {
  const categoryKey = "fresh";
  const groupKey = $("#subcategory-select").value || "fruit";
  const category = productCatalog.fresh;
  const group = productExamples[groupKey] || productExamples.fruit;
  const selectedItem = $("#product-select")?.value || "all";
  const itemName = selectedItem === "all" ? `All ${group.name.toLowerCase()}` : selectedItem;
  return { ...group, categoryKey, categoryName: category.label, groupKey, itemName, displayName: selectedItem === "all" ? group.name : selectedItem };
}

function updateProductSearchLink() {
  const info = getSelectedProduct();
  const query = info.itemName.replace(/^All /, "");
  const link = $("#product-search-link");
  if (link) link.href = `https://www.coles.com.au/search/products?q=${encodeURIComponent(query)}`;
}
let liveWeather = [];
let publicHolidays = [];
let weatherState = "idle";
let holidayState = "idle";
let hasForecast = false;
let refreshedAt = null;
let forecastRows = [];
let toastTimer;
let refreshSequence = 0;
let locationMatches = [];
let activeLocationIndex = -1;
let locationSearchSequence = 0;
let locationSearchTimer;
const automaticWeatherInterval = 30 * 60 * 1000;
let lastWeatherUpdatedAt = null;
let lastAutomaticWeatherAttemptAt = null;
let weatherUpdateSequence = 0;
let manualRefreshPending = false;
let salesHistory = [];
let fittedSalesModel = null;
let matchedTrainingDays = 0;
let historicalWeather = [];
let salesFileLabel = "";

function formatNumber(value) { return Math.round(value).toLocaleString("en-AU"); }
function escapeHTML(value) { return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]); }
function isoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function dateFromISO(value) { const [year, month, day] = value.split("-").map(Number); return new Date(year, month - 1, day, 12); }
function dateLabel(date, options = { weekday: "short", day: "numeric", month: "short" }) { return new Intl.DateTimeFormat("en-AU", options).format(date); }
function addDays(date, count) { const result = new Date(date); result.setDate(result.getDate() + count); return result; }
function todayAtArea(area) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: area.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return new Date(Number(values.year), Number(values.month) - 1, Number(values.day), 12);
}

async function getJSON(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    return await response.json();
  } finally { clearTimeout(timeout); }
}

function closeLocationOptions() {
  $("#location-options").hidden = true;
  $("#location-search").setAttribute("aria-expanded", "false");
  $("#location-search").removeAttribute("aria-activedescendant");
  activeLocationIndex = -1;
}

function showLocationOptions(matches) {
  const list = $("#location-options");
  locationMatches = matches;
  activeLocationIndex = -1;
  if (!matches.length) {
    list.innerHTML = '<li class="location-empty" role="option" aria-selected="false">No Sydney-area matches. Try another suburb name.</li>';
  } else {
    list.innerHTML = matches.map((place, index) => {
      const detail = [place.admin2 && place.admin2 !== place.name ? place.admin2 : "", place.postcode].filter(Boolean).join(" · ") || "NSW, Australia";
      return `<li id="location-option-${index}" class="location-option" role="option" aria-selected="false" data-index="${index}"><strong>${escapeHTML(place.name)}</strong><small>${escapeHTML(detail || "NSW, Australia")}</small></li>`;
    }).join("");
  }
  list.hidden = false;
  $("#location-search").setAttribute("aria-expanded", "true");
}

async function findSydneyLocations(query) {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.search = new URLSearchParams({ name: `${query}, New South Wales`, count: "100", language: "en", format: "json", countryCode: "AU" }).toString();
  const data = await getJSON(url.toString());
  const matches = (data.results || []).filter((place) => {
    const country = String(place.country_code || "").toUpperCase();
    const feature = String(place.feature_code || "").toUpperCase();
    const lat = Number(place.latitude), lon = Number(place.longitude);
    const isPopulatedPlace = !feature || feature.startsWith("PPL");
    return country === "AU" && isPopulatedPlace && lat >= -34.5 && lat <= -33.05 && lon >= 150.15 && lon <= 151.75;
  });
  const unique = new Map();
  for (const place of matches) {
    const key = `${place.name}|${Number(place.latitude).toFixed(3)}|${Number(place.longitude).toFixed(3)}`;
    if (!unique.has(key)) unique.set(key, {
      name: String(place.name), state: "NSW", subdivision: "AU-NSW",
      latitude: Number(place.latitude), longitude: Number(place.longitude),
      timezone: place.timezone || "Australia/Sydney", admin2: place.admin2 || "", postcode: place.postcodes?.[0] || "",
    });
  }
  return [...unique.values()].slice(0, 8);
}

function setActiveLocation(index) {
  const options = [...$("#location-options").querySelectorAll("[role='option'][data-index]")];
  if (!options.length) return;
  activeLocationIndex = (index + options.length) % options.length;
  options.forEach((option, optionIndex) => option.setAttribute("aria-selected", String(optionIndex === activeLocationIndex)));
  const active = options[activeLocationIndex];
  $("#location-search").setAttribute("aria-activedescendant", active.id);
  active.scrollIntoView({ block: "nearest" });
}

function chooseLocation(index) {
  const match = locationMatches[index];
  if (!match) return;
  selectedLocation = match;
  weatherUpdateSequence += 1;
  lastAutomaticWeatherAttemptAt = null;
  liveWeather = [];
  weatherState = "idle";
  clearSalesHistory("Your suburb changed. Upload the matching sales file for the new location.");
  $("#location-search").value = match.name;
  $("#location-message").textContent = `Weather will use ${match.name}, NSW. Create a forecast to update the estimate.`;
  closeLocationOptions();
  markForecastNeedsRefresh();
  refreshWeatherAutomatically();
}

async function searchSydneyLocations(query) {
  const search = query.trim();
  const status = $("#location-message");
  const sequence = ++locationSearchSequence;
  selectedLocation = null;
  markForecastNeedsRefresh();
  if (search.length < 2) {
    closeLocationOptions();
    status.textContent = "Type at least 2 letters, then choose a suburb.";
    return;
  }
  status.textContent = "Searching Sydney suburbs…";
  try {
    const matches = await findSydneyLocations(search);
    if (sequence !== locationSearchSequence) return;
    showLocationOptions(matches);
    status.textContent = matches.length ? `${matches.length} Sydney-area ${matches.length === 1 ? "match" : "matches"}. Choose one from the list.` : "No matching Sydney-area suburbs found.";
  } catch {
    if (sequence !== locationSearchSequence) return;
    closeLocationOptions();
    status.textContent = "Suburb search could not load. Check your connection and try again.";
  }
}

async function getWeather(area) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    latitude: area.latitude,
    longitude: area.longitude,
    daily: "temperature_2m_max,precipitation_probability_max,precipitation_sum,weather_code",
    forecast_days: "16",
    timezone: area.timezone,
  }).toString();
  const data = await getJSON(url.toString());
  const daily = data.daily;
  if (!daily?.time || !daily?.temperature_2m_max || !daily?.weather_code) throw new Error("Weather response was incomplete");
  return daily.time.map((date, index) => ({
    date,
    maximum: Number(daily.temperature_2m_max[index]),
    rainChance: Number(daily.precipitation_probability_max?.[index] ?? 0),
    precipitation: Number(daily.precipitation_sum?.[index] ?? 0),
    code: Number(daily.weather_code[index]),
  }));
}

async function getHistoricalWeather(area, startDate, endDate) {
  const url = new URL("https://archive-api.open-meteo.com/v1/archive");
  url.search = new URLSearchParams({
    latitude: area.latitude,
    longitude: area.longitude,
    start_date: startDate,
    end_date: endDate,
    daily: "temperature_2m_max,precipitation_sum",
    timezone: area.timezone,
  }).toString();
  const data = await getJSON(url.toString());
  const daily = data.daily;
  if (!daily?.time || !daily?.temperature_2m_max || !daily?.precipitation_sum) throw new Error("Historical weather was incomplete");
  return daily.time.map((date, index) => ({ date, maximum: Number(daily.temperature_2m_max[index]), precipitation: Number(daily.precipitation_sum[index]) }))
    .filter((day) => Number.isFinite(day.maximum) && Number.isFinite(day.precipitation));
}

function localUpdateTime(date, timezone) {
  return new Intl.DateTimeFormat("en-AU", { hour: "numeric", minute: "2-digit", timeZone: timezone }).format(date);
}

async function refreshWeatherAutomatically() {
  if (!selectedLocation || document.visibilityState === "hidden" || weatherState === "loading" || manualRefreshPending) return;
  const now = Date.now();
  if (lastAutomaticWeatherAttemptAt && now - lastAutomaticWeatherAttemptAt < automaticWeatherInterval) return;
  lastAutomaticWeatherAttemptAt = now;
  const place = { ...selectedLocation };
  const locationKey = `${place.latitude},${place.longitude}`;
  const sequence = ++weatherUpdateSequence;
  weatherState = "loading";
  $("#location-message").textContent = `Checking live weather for ${place.name}…`;
  try {
    const weather = await getWeather(place);
    if (sequence !== weatherUpdateSequence || !selectedLocation || locationKey !== `${selectedLocation.latitude},${selectedLocation.longitude}`) return;
    liveWeather = weather;
    weatherState = "loaded";
    lastWeatherUpdatedAt = new Date();
    const time = localUpdateTime(lastWeatherUpdatedAt, place.timezone);
    $("#location-message").textContent = `Live ${place.name} weather updated at ${time}. It refreshes every 30 minutes while this page is open.`;
    if (hasForecast) {
      forecastRows = createRows();
      updateScreen();
    } else {
      showForecastPrompt(`Live ${place.name} weather updated at ${time}. Press Create forecast when you’re ready to calculate your estimate.`);
    }
  } catch {
    if (sequence !== weatherUpdateSequence || !selectedLocation || locationKey !== `${selectedLocation.latitude},${selectedLocation.longitude}`) return;
    if (!liveWeather.length) weatherState = "error";
    $("#location-message").textContent = `Live weather could not update for ${place.name}. Check your connection or press Create forecast to try again.`;
  }
}

async function getPublicHolidays(area, start, days) {
  const end = addDays(start, days - 1);
  const years = [...new Set([start.getFullYear(), end.getFullYear()])];
  const calendars = await Promise.all(years.map((year) => getJSON(`https://nagerholidays.com/api/v4/Holidays/AU/${year}`)));
  const holidays = calendars.flat().filter((holiday) => {
    if (!holiday.holidayTypes?.includes("Public")) return false;
    return holiday.nationalHoliday === true || holiday.subdivisionCodes?.includes(area.subdivision) === true;
  });
  const firstDate = isoDate(start);
  const lastDate = isoDate(end);
  return holidays.filter((holiday) => holiday.date >= firstDate && holiday.date <= lastDate)
    .map((holiday) => ({ date: holiday.date, name: String(holiday.name || "Public holiday") }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function parseCSV(text) {
  const rows = [];
  const firstLine = String(text).replace(/^\uFEFF/, "").split(/\r?\n/).find((line) => line.trim()) || "";
  const commas = (firstLine.match(/,/g) || []).length;
  const semicolons = (firstLine.match(/;/g) || []).length;
  const tabs = (firstLine.match(/\t/g) || []).length;
  const delimiter = tabs > commas && tabs > semicolons ? "\t" : semicolons > commas ? ";" : ",";
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted && char === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) { row.push(field); field = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field); field = "";
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
    } else field += char;
  }
  row.push(field);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}

function normaliseHeader(value) { return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
function findColumn(headers, names) { return headers.findIndex((header) => names.includes(normaliseHeader(header))); }
function parseISODate(value) {
  const text = String(value || "").trim().replace(/^\uFEFF/, "");
  let year, month, day;
  if (/^\d{4}-\d{1,2}-\d{1,2}(?:T.*)?$/.test(text)) {
    [year, month, day] = text.slice(0, 10).split("-").map(Number);
  } else {
    const match = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})$/);
    if (!match) return null;
    day = Number(match[1]); month = Number(match[2]); year = Number(match[3]);
    if (year < 100) year += year < 50 ? 2000 : 1900;
  }
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return Number.isNaN(date.getTime()) || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day
    ? null : date.toISOString().slice(0, 10);
}

function retailerMatches(value, selectedRetailer) {
  const text = normaliseHeader(value);
  const selected = normaliseHeader(selectedRetailer);
  if (!text) return true;
  if (text === selected) return true;
  if (selected === "coles") return text.includes("coles");
  return false;
}

function suburbMatches(value, selectedSuburb) {
  const text = normaliseHeader(value);
  const selected = normaliseHeader(selectedSuburb);
  return !text || text === selected || text.startsWith(selected) || text.includes(selected);
}

function productGroupMatches(value, selectedProduct) {
  const text = normaliseHeader(value);
  if (!text) return true;
  const groupSelection = selectedProduct.itemName === `All ${selectedProduct.name.toLowerCase()}`;
  if (!groupSelection) {
    const item = normaliseHeader(selectedProduct.displayName);
    return text === item || (text.length >= 5 && (text.includes(item) || item.includes(text)));
  }
  const candidates = [selectedProduct.categoryName, selectedProduct.name, selectedProduct.displayName, selectedProduct.itemName, ...(selectedProduct.aliases || [])]
    .map(normaliseHeader).filter((candidate) => candidate.length > 2);
  return candidates.some((candidate) => text === candidate || text.includes(candidate) || candidate.includes(text));
}

async function loadSalesFile(file) {
  if (!file || file.size > 10 * 1024 * 1024) throw new Error("Choose a CSV smaller than 10 MB.");
  if (!selectedLocation) throw new Error("Choose a Sydney suburb before uploading sales.");
  const parsed = parseCSV(await file.text());
  if (!parsed.length) throw new Error("This CSV is empty. Download the template and add your daily sales.");
  const dateHeaders = ["date", "saledate", "salesdate", "transactiondate", "businessdate", "tradingdate", "day"];
  const unitsHeaders = ["unitssold", "units", "quantitysold", "soldquantity", "quantity", "qty", "qtysold", "salesquantity", "salesunits", "unitsales", "totalunits"];
  const headerIndex = parsed.findIndex((candidate, index) => index < 5 && findColumn(candidate, dateHeaders) >= 0 && findColumn(candidate, unitsHeaders) >= 0);
  if (headerIndex < 0) throw new Error("I couldn't find a date column and a sales quantity column. Use headings like date and units_sold, or download the CSV template.");
  const headers = parsed[headerIndex];
  const dateColumn = findColumn(headers, dateHeaders);
  const unitsColumn = findColumn(headers, unitsHeaders);
  const retailerColumn = findColumn(headers, ["retailer", "chain"]);
  const suburbColumn = findColumn(headers, ["suburb", "area", "location"]);
  const productColumn = findColumn(headers, ["productgroup", "category", "department", "product"]);
  const dataRows = parsed.slice(headerIndex + 1);
  if (!dataRows.length) {
    salesHistory = []; fittedSalesModel = null; historicalWeather = []; matchedTrainingDays = 0; salesFileLabel = "";
    $("#sales-status").textContent = "Template recognized, but it has no sales rows yet. Add your daily figures and upload it again. You can still create a rough estimate now.";
    markForecastNeedsRefresh();
    return;
  }
  const expectedProduct = getSelectedProduct();
  const selectedSuburb = selectedLocation?.name.toLowerCase();
  const totals = new Map();
  let skipped = 0;
  for (const values of dataRows) {
    const date = parseISODate(values[dateColumn]);
    const units = Number(String(values[unitsColumn] || "").replaceAll(",", "").trim());
    if (!date || !Number.isFinite(units) || units < 0) { skipped += 1; continue; }
    if (retailerColumn >= 0 && !retailerMatches(values[retailerColumn], storeRetailer)) continue;
    if (suburbColumn >= 0 && !suburbMatches(values[suburbColumn], selectedSuburb)) continue;
    if (productColumn >= 0 && !productGroupMatches(values[productColumn], expectedProduct)) continue;
    totals.set(date, (totals.get(date) || 0) + units);
  }
  let rows = [...totals.entries()].map(([date, units]) => ({ date, units })).sort((a, b) => a.date.localeCompare(b.date));
  if (!rows.length) throw new Error("No sales rows matched this selection. Check the dates and units, or remove the optional retailer, suburb and product columns if the CSV is already filtered to one store and product.");
  const latest = rows[rows.length - 1].date;
  const latestDate = new Date(`${latest}T12:00:00Z`);
  const cutoff = new Date(latestDate); cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 4);
  rows = rows.filter((row) => new Date(`${row.date}T12:00:00Z`) >= cutoff);
  salesHistory = rows;
  fittedSalesModel = null;
  historicalWeather = [];
  matchedTrainingDays = 0;
  salesFileLabel = file.name;
  $("#sales-status").textContent = `CSV accepted: ${formatNumber(rows.length)} daily records (${rows[0].date} to ${latest}). ${skipped ? `${skipped} invalid rows were skipped. ` : ""}${rows.length >= 900 ? "This may train the historical weather model if enough dates match." : "This shorter history will be used as your sales baseline; add 3–4 years for the best model."} Press Create forecast.`;
  markForecastNeedsRefresh();
}

function clearSalesHistory(message = "No sales CSV loaded. A rough estimate can use the typical-sales starting point instead.", clearInput = true) {
  salesHistory = [];
  fittedSalesModel = null;
  historicalWeather = [];
  matchedTrainingDays = 0;
  salesFileLabel = "";
  if (clearInput) $("#sales-file").value = "";
  $("#sales-status").textContent = message;
}

function onForecastScopeChange() {
  if (salesHistory.length) clearSalesHistory("Your store area or product changed. Upload the matching sales file again.");
  markForecastNeedsRefresh();
}

function featuresFor(date, maximum, precipitation) {
  const d = new Date(`${date}T12:00:00Z`);
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  const dayOfYear = (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - start) / 86400000;
  const phase = 2 * Math.PI * dayOfYear / 365.2425;
  const weekday = d.getUTCDay();
  return [1, Math.sin(phase), Math.cos(phase), ...Array.from({ length: 6 }, (_, i) => weekday === i + 1 ? 1 : 0), (maximum - 22) / 10, Math.sqrt(Math.max(0, precipitation)) / 3];
}

function fitLinearModel(samples) {
  const dimensions = samples[0].x.length;
  const matrix = Array.from({ length: dimensions }, () => Array(dimensions + 1).fill(0));
  for (const sample of samples) {
    const weight = Math.exp(-Math.max(0, sample.ageDays) / (365.25 * 3));
    for (let r = 0; r < dimensions; r += 1) {
      for (let c = 0; c < dimensions; c += 1) matrix[r][c] += weight * sample.x[r] * sample.x[c];
      matrix[r][dimensions] += weight * sample.x[r] * sample.y;
    }
  }
  for (let i = 1; i < dimensions; i += 1) matrix[i][i] += 8;
  for (let pivot = 0; pivot < dimensions; pivot += 1) {
    let best = pivot;
    for (let row = pivot + 1; row < dimensions; row += 1) if (Math.abs(matrix[row][pivot]) > Math.abs(matrix[best][pivot])) best = row;
    [matrix[pivot], matrix[best]] = [matrix[best], matrix[pivot]];
    const divisor = matrix[pivot][pivot];
    if (Math.abs(divisor) < 1e-10) throw new Error("Sales history could not be modelled. Check that the uploaded sales vary across dates.");
    for (let col = pivot; col <= dimensions; col += 1) matrix[pivot][col] /= divisor;
    for (let row = 0; row < dimensions; row += 1) {
      if (row === pivot) continue;
      const factor = matrix[row][pivot];
      for (let col = pivot; col <= dimensions; col += 1) matrix[row][col] -= factor * matrix[pivot][col];
    }
  }
  return matrix.map((row) => row[dimensions]);
}

function trainSalesModel(sales, weather) {
  const weatherByDate = new Map(weather.map((day) => [day.date, day]));
  const newest = Date.parse(`${sales[sales.length - 1].date}T12:00:00Z`);
  const samples = sales.flatMap((sale) => {
    const conditions = weatherByDate.get(sale.date);
    if (!conditions) return [];
    return [{ x: featuresFor(sale.date, conditions.maximum, conditions.precipitation), y: sale.units, ageDays: (newest - Date.parse(`${sale.date}T12:00:00Z`)) / 86400000 }];
  });
  if (samples.length < 900) throw new Error(`Only ${formatNumber(samples.length)} sales dates matched historical weather. At least 900 are needed.`);
  const trainingSamples = samples.filter((sample) => sample.ageDays >= 90);
  const validationSamples = samples.filter((sample) => sample.ageDays < 90);
  if (trainingSamples.length < 800 || validationSamples.length < 30) throw new Error("The uploaded history needs enough daily rows in both the training period and the latest 90-day accuracy check.");
  const validationCoefficients = fitLinearModel(trainingSamples);
  const validationMeanAbsoluteError = validationSamples.reduce((sum, sample) => sum + Math.abs(sample.y - Math.max(0, validationCoefficients.reduce((value, coefficient, i) => value + coefficient * sample.x[i], 0))), 0) / validationSamples.length;
  const coefficients = fitLinearModel(samples);
  return { coefficients, samples, validationMeanAbsoluteError, validationDays: validationSamples.length };
}

function typicalWeatherForDate(date) {
  if (!historicalWeather.length) return { date, maximum: 22, precipitation: 0, rainChance: 0, code: -1, source: "assumption" };
  const target = new Date(`${date}T12:00:00Z`);
  const targetDay = (Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate()) - Date.UTC(target.getUTCFullYear(), 0, 0)) / 86400000;
  const nearby = historicalWeather.filter((day) => {
    const past = new Date(`${day.date}T12:00:00Z`);
    const pastDay = (Date.UTC(past.getUTCFullYear(), past.getUTCMonth(), past.getUTCDate()) - Date.UTC(past.getUTCFullYear(), 0, 0)) / 86400000;
    const raw = Math.abs(targetDay - pastDay);
    return Math.min(raw, 366 - raw) <= 10;
  });
  const group = nearby.length ? nearby : historicalWeather;
  return { date, maximum: group.reduce((sum, day) => sum + day.maximum, 0) / group.length, precipitation: group.reduce((sum, day) => sum + day.precipitation, 0) / group.length, rainChance: 0, code: -1, source: "seasonal" };
}

function predictSales(date, weather) {
  if (!fittedSalesModel) throw new Error("Upload and refresh your sales history first.");
  const x = featuresFor(date, weather.maximum, weather.precipitation);
  return Math.max(0, fittedSalesModel.coefficients.reduce((value, coefficient, index) => value + coefficient * x[index], 0));
}

function weatherDescription(weather) {
  if (!weather) return "Live weather is not available for this date.";
  if (weather.source === "assumption") return "Typical weather assumption · high about 22°C · no rain data available";
  if (weather.source === "seasonal") return `Seasonal average · high about ${Math.round(weather.maximum)}°C · about ${weather.precipitation.toFixed(1)} mm rain`;
  const code = weather.code;
  let condition = "Partly cloudy";
  if (code === 0) condition = "Sunny";
  else if (code === 1) condition = "Mostly sunny";
  else if (code === 2) condition = "Partly cloudy";
  else if (code === 3) condition = "Cloudy";
  else if (code === 45 || code === 48) condition = "Foggy";
  else if (code >= 51 && code <= 57) condition = "Drizzle";
  else if (code >= 61 && code <= 67) condition = "Rain";
  else if (code >= 71 && code <= 77) condition = "Snow";
  else if (code >= 80 && code <= 82) condition = "Showers";
  else if (code >= 95) condition = "Thunderstorms";
  return condition + " · high " + Math.round(weather.maximum) + "°C · " + Math.round(weather.rainChance) + "% chance of rain";
}

function createRows() {
  const horizon = Number($("#horizon-select").value);
  const firstDay = addDays(todayAtArea(selectedLocation), 1);
  const weatherByDate = new Map(liveWeather.map((item) => [item.date, item]));
  return Array.from({ length: horizon }, (_, index) => {
    const date = addDays(firstDay, index);
    const dateKey = isoDate(date);
    const weather = weatherByDate.get(dateKey) || typicalWeatherForDate(dateKey);
    const holiday = publicHolidays.find((item) => item.date === isoDate(date)) || null;
    const rawSales = fittedSalesModel ? predictSales(dateKey, weather) : estimateTypicalSales(date, weather, holiday);
    return { index, date, expectedSales: Math.max(0, Math.round(rawSales)), weather, holiday };
  });
}

function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }

function estimateTypicalSales(date, weather, holiday) {
  const product = getSelectedProduct();
  const productKey = product.groupKey;
  const recentSales = salesHistory.slice(-90);
  const base = recentSales.length
    ? recentSales.reduce((total, sale) => total + sale.units, 0) / recentSales.length
    : Number($("#normal-sales").value);
  const weekday = date.getDay();
  const dayFactor = weekday === 6 ? 1.15 : weekday === 0 ? 1.1 : weekday === 5 ? 1.06 : 1;
  const maxTemp = Number.isFinite(weather?.maximum) ? weather.maximum : 22;
  const rainfall = Number.isFinite(weather?.precipitation) ? weather.precipitation : 0;
  let weatherFactor = 1;
  if (product.weather === "cold") weatherFactor = clamp(1 + (maxTemp - 22) * 0.025 - clamp(rainfall / 50, 0, 0.15), 0.6, 1.5);
  else if (product.weather === "hot") weatherFactor = clamp(1 - (maxTemp - 18) * 0.015, 0.65, 1.25);
  else if (product.weather === "produce") weatherFactor = clamp(1 + (maxTemp - 20) * 0.01 - clamp(rainfall / 100, 0, 0.1), 0.75, 1.3);
  const holidayFactor = holiday ? 1.15 : 1;
  return Math.max(0, base * dayFactor * weatherFactor * holidayFactor);
}

function statusText(area) {
  const weatherWhen = lastWeatherUpdatedAt ? localUpdateTime(lastWeatherUpdatedAt, area.timezone) : "recently";
  const holidaysWhen = refreshedAt ? localUpdateTime(refreshedAt, area.timezone) : "";
  if (weatherState === "loaded" && holidayState === "loaded") return `${area.name} weather updated ${weatherWhen}; NSW public holidays checked ${holidaysWhen}.`;
  if (weatherState === "loaded") return `${area.name} weather updated ${weatherWhen}; NSW holidays could not be checked.`;
  if (holidayState === "loaded") return `NSW holidays checked; live ${area.name} weather could not load, so seasonal weather is used where needed.`;
  if (weatherState === "error" || holidayState === "error") return `Some live information could not load. This estimate uses seasonal weather or available dates where possible.`;
  if (weatherState === "loading" || holidayState === "loading") return `Getting the ${area.name} weather forecast and NSW holiday dates…`;
  return "Choose your options, then press Create forecast.";
}

function updateScreen() {
  $("#forecast-prompt").hidden = true;
  $(".results").hidden = false;
  $("#daily-details").hidden = false;
  const product = getSelectedProduct();
  const hasSalesCsv = salesHistory.length > 0;
  const usingUploadedSales = Boolean(hasSalesCsv && fittedSalesModel);
  document.querySelectorAll(".stock-unit").forEach((label) => { label.textContent = "Fresh items"; });
  const horizon = Number($("#horizon-select").value);
  const retailer = storeRetailer;
  forecastRows = createRows();
  const estimateTotal = forecastRows.reduce((sum, row) => sum + row.expectedSales, 0);
  const stockOnHand = Number($("#stock-on-hand").value);
  const incomingStock = Number($("#stock-incoming").value);
  const safetyStock = Number($("#stock-safety").value);
  const orderQuantity = Math.max(0, Math.ceil(estimateTotal + safetyStock - stockOnHand - incomingStock));
  const holidaysThisPeriod = forecastRows.filter((row) => row.holiday);

  $("#horizon-label").textContent = `${horizon}-day`;
  $("#period-copy").textContent = `next ${horizon} days`;
  $("#store-copy").textContent = selectedLocation.name;
  $("#retailer-copy").textContent = retailer;
  $("#demand-value").textContent = formatNumber(orderQuantity);
  $("#demand-unit").textContent = product.unit;
  $("#answer-label").textContent = usingUploadedSales ? "RECOMMENDED TO ORDER · CSV MODEL" : hasSalesCsv ? "ESTIMATE · USING YOUR CSV" : "ROUGH ESTIMATE · NO SALES CSV";
  $("#difference-value").textContent = `${formatNumber(estimateTotal)} ${product.unit}`;
  $("#difference-percent").textContent = `${formatNumber(stockOnHand)} on hand + ${formatNumber(incomingStock)} incoming; ${formatNumber(safetyStock)} safety stock`;
  $("#updated-copy").textContent = lastWeatherUpdatedAt ? `Weather updated ${localUpdateTime(lastWeatherUpdatedAt, selectedLocation.timezone)}` : "Weather checked";
  $("#live-status").textContent = statusText(selectedLocation);

  let holidayText;
  if (holidayState === "error") holidayText = `Couldn't check NSW public holidays for this period.`;
  else if (holidayState !== "loaded") holidayText = "Checking real NSW public-holiday dates…";
  else if (!holidaysThisPeriod.length) holidayText = `No ${selectedLocation.state} public holiday falls in this ${horizon}-day period.`;
  else holidayText = holidaysThisPeriod.map((row) => `${escapeHTML(row.holiday.name)} (${dateLabel(dateFromISO(row.holiday.date), { day: "numeric", month: "short" })})`).join("; ");

  const liveDays = forecastRows.filter((row) => !row.weather.source).length;
  const seasonalDays = forecastRows.filter((row) => row.weather.source === "seasonal").length;
  const assumedDays = forecastRows.filter((row) => row.weather.source === "assumption").length;
  const weatherTail = [seasonalDays ? `${seasonalDays} later days use historical seasonal averages` : "", assumedDays ? `${assumedDays} days use a typical weather assumption because weather data was unavailable` : ""].filter(Boolean).join("; ");
  const weatherText = usingUploadedSales
    ? `Weather effects were learned from ${formatNumber(matchedTrainingDays)} past sales days matched with historical weather. ${liveDays} days use the live forecast${weatherTail ? `; ${weatherTail}` : ""}.`
    : `The estimate adjusts for weekday, temperature and rain${hasSalesCsv ? " using an average from your uploaded sales" : " using the typical-sales starting point"}. ${liveDays} days use live weather${weatherTail ? `; ${weatherTail}` : ""}.`;
  const historyText = usingUploadedSales
    ? `${formatNumber(salesHistory.length)} daily sales records from ${salesHistory[0].date} to ${salesHistory[salesHistory.length - 1].date}. In the latest ${formatNumber(fittedSalesModel.validationDays)}-day test period, average error was about ${formatNumber(fittedSalesModel.validationMeanAbsoluteError)} ${product.unit} per day.`
    : hasSalesCsv
      ? `Your CSV has ${formatNumber(salesHistory.length)} daily records from ${salesHistory[0].date} to ${salesHistory[salesHistory.length - 1].date}. The average of its latest ${formatNumber(Math.min(90, salesHistory.length))} rows is about ${formatNumber(salesHistory.slice(-90).reduce((total, sale) => total + sale.units, 0) / Math.min(90, salesHistory.length))} ${product.unit} per day; add 3–4 years for the full weather model.`
      : `No sales CSV was uploaded. This rough estimate starts from ${formatNumber(Number($("#normal-sales").value))} ${product.unit} on a normal day. This is a general assumption, not actual Coles store sales.`;
  const salesHeading = usingUploadedSales ? "Your sales history used" : hasSalesCsv ? "Your CSV sales average used" : "Rough estimate: typical sales";
  const weatherHeading = usingUploadedSales ? "Weather effect learned from history" : "Weather and calendar adjustment";
  const holidayCopy = holidayText + (holidayState === "loaded"
    ? " A listed public holiday adds an approximate 15% uplift to that day."
    : " Holiday dates could not be checked, so no holiday uplift was applied.");
  const holidayIcon = "▦";
  $("#signal-list").innerHTML = [
    `<li><span class="signal-icon sales" aria-hidden="true">↗</span><p><strong>${salesHeading}</strong><br />${historyText}</p></li>`,
    `<li><span class="signal-icon weather" aria-hidden="true">${product.icon}</span><p><strong>${weatherHeading}</strong><br />${weatherText}</p></li>`,
    `<li><span class="signal-icon calendar" aria-hidden="true">${holidayIcon}</span><p><strong>NSW public holidays</strong><br />${holidayCopy}</p></li>`,
  ].join("");
  $("#weather-coverage").textContent = `${usingUploadedSales ? "CSV weather model forecast" : hasSalesCsv ? "Estimate based on your uploaded CSV average" : "Rough estimate from typical sales assumptions"}. Recommended order: ${formatNumber(orderQuantity)} ${product.unit} = expected sales ${formatNumber(estimateTotal)} + safety stock ${formatNumber(safetyStock)} − on hand ${formatNumber(stockOnHand)} − incoming ${formatNumber(incomingStock)}.`;
  renderDailyList(forecastRows, product);
  renderTable(forecastRows, product);
}

function renderDailyList(data, product) {
  $("#daily-forecast-list").innerHTML = data.map((row) => {
    const date = dateLabel(row.date, { weekday: "long", day: "numeric", month: "short" });
    const weather = weatherDescription(row.weather);
    const source = row.weather.source === "seasonal" ? "Past seasonal weather average" : row.weather.source === "assumption" ? "Typical weather assumption" : "Live local weather forecast";
    const holiday = row.holiday ? "Public holiday: " + escapeHTML(row.holiday.name) : source;
    return '<article class="daily-row"><div class="daily-date"><strong>' + date + '</strong><small>' + holiday + '</small></div><p class="daily-weather">' + escapeHTML(weather) + '</p><div class="daily-demand"><strong>Expected sales: about ' + formatNumber(row.expectedSales) + " " + product.unit + '</strong><small>Order quantity is calculated for the full selected period.</small></div></article>';
  }).join("");
}

function renderTable(data, product) {
  $("#forecast-table").innerHTML = data.slice(0, 7).map((row) => {
    const note = row.holiday ? escapeHTML(row.holiday.name) : "None";
    return `<tr><td class="table-day">${dateLabel(row.date)}</td><td>${weatherDescription(row.weather)}</td><td class="table-estimate">About ${formatNumber(row.expectedSales)} ${product.unit}</td><td>${note}</td></tr>`;
  }).join("");
  $(".table-actions p").textContent = `The first ${Math.min(data.length, 7)} days. Calendar dates are checked for ${selectedLocation.state}.`;
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function exportCSV() {
  const product = getSelectedProduct();
  const headers = ["Date", "Retailer", "Suburb", "Category", "Subcategory", "Product", "Weather used", "Expected sales", "Public holiday"];
  const contents = forecastRows.map((row) => [isoDate(row.date), storeRetailer, selectedLocation.name, product.categoryName, product.name, product.displayName, weatherDescription(row.weather), row.expectedSales, row.holiday?.name || ""]);
  const csv = [headers, ...contents].map((line) => line.map((item) => `"${String(item).replaceAll('"', '""')}"`).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `coles-stock-forecast-${product.groupKey}-${$("#horizon-select").value}-days.csv`;
  document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(link.href);
  showToast("Your daily sales forecast has been downloaded.");
}

function showForecastPrompt(message) {
  $("#forecast-prompt").hidden = false;
  $("#forecast-prompt").textContent = message;
  $(".results").hidden = true;
  $("#daily-details").hidden = true;
}

function markForecastNeedsRefresh() {
  refreshSequence += 1;
  const restartWeather = manualRefreshPending && Boolean(selectedLocation);
  hasForecast = false;
  if (!selectedLocation) {
    weatherUpdateSequence += 1;
    weatherState = "idle";
    holidayState = "idle";
    liveWeather = [];
    publicHolidays = [];
  } else if (manualRefreshPending) {
    weatherUpdateSequence += 1;
    weatherState = liveWeather.length ? "loaded" : "idle";
    manualRefreshPending = false;
  }
  forecastRows = [];
  const button = $("#update-forecast");
  button.removeAttribute("aria-busy");
  button.disabled = false;
  showForecastPrompt(!selectedLocation ? "Choose a Sydney suburb from the search results." : "Your choices or stock changed. Press Create forecast to update the recommendation.");
  if (restartWeather) {
    lastAutomaticWeatherAttemptAt = null;
    refreshWeatherAutomatically();
  }
}

async function refreshLiveData() {
  if (!selectedLocation) {
    $("#location-message").textContent = "Choose a Sydney suburb from the search results before creating a forecast.";
    showForecastPrompt("Choose a Sydney suburb from the search results, then press Create forecast.");
    $("#location-search").focus();
    return;
  }
  const stockValues = ["#stock-on-hand", "#stock-incoming", "#stock-safety"].map((selector) => Number($(selector).value));
  if (stockValues.some((value) => !Number.isFinite(value) || value < 0 || !Number.isInteger(value))) {
    showForecastPrompt("Enter whole numbers of zero or more for stock on hand, incoming stock and safety stock.");
    $("#stock-on-hand").focus();
    return;
  }
  const normalSales = Number($("#normal-sales").value);
  if (!salesHistory.length && (!Number.isFinite(normalSales) || normalSales < 0 || !Number.isInteger(normalSales))) {
    showForecastPrompt("Enter a whole number of zero or more for typical sales per day, or upload a sales CSV.");
    $("#normal-sales").focus();
    return;
  }
  const sequence = ++refreshSequence;
  weatherUpdateSequence += 1;
  lastAutomaticWeatherAttemptAt = Date.now();
  manualRefreshPending = true;
  const button = $("#update-forecast");
  button.setAttribute("aria-busy", "true");
  weatherState = "loading"; holidayState = "loading";
  hasForecast = false;
  liveWeather = []; publicHolidays = []; forecastRows = [];
  showForecastPrompt(salesHistory.length
    ? `Getting the ${selectedLocation.name} weather forecast and matching historical weather to your sales… This can take a short while.`
    : `Getting the ${selectedLocation.name} weather, NSW holidays and seasonal weather history for your rough estimate…`);
  const horizon = Number($("#horizon-select").value);
  const fallbackEnd = addDays(todayAtArea(selectedLocation), -2);
  const fallbackStart = new Date(fallbackEnd);
  fallbackStart.setFullYear(fallbackStart.getFullYear() - 4);
  const salesStart = salesHistory.length ? salesHistory[0].date : isoDate(fallbackStart);
  const salesEnd = salesHistory.length ? salesHistory[salesHistory.length - 1].date : isoDate(fallbackEnd);
  try {
    const results = await Promise.allSettled([
      getWeather(selectedLocation), getPublicHolidays(selectedLocation, addDays(todayAtArea(selectedLocation), 1), horizon),
      getHistoricalWeather(selectedLocation, salesStart, salesEnd),
    ]);
    if (sequence !== refreshSequence) return;
    const weatherResult = results[0], holidayResult = results[1], historicalResult = results[2];
    liveWeather = weatherResult.status === "fulfilled" ? weatherResult.value : [];
    weatherState = weatherResult.status === "fulfilled" ? "loaded" : "error";
    if (weatherResult.status === "fulfilled") lastWeatherUpdatedAt = new Date();
    historicalWeather = historicalResult.status === "fulfilled" ? historicalResult.value : [];
    if (salesHistory.length) {
      fittedSalesModel = null; matchedTrainingDays = 0;
      if (salesHistory.length >= 900 && historicalWeather.length) {
        try {
          fittedSalesModel = trainSalesModel(salesHistory, historicalWeather);
          matchedTrainingDays = fittedSalesModel.samples.length;
        } catch (modelError) {
          console.info("Using uploaded sales average because the full model could not be fitted:", modelError.message);
        }
      }
    } else {
      fittedSalesModel = null;
      matchedTrainingDays = 0;
    }
    if (holidayResult.status === "fulfilled") { publicHolidays = holidayResult.value; holidayState = "loaded"; }
    else { publicHolidays = []; holidayState = "error"; }
    refreshedAt = new Date();
    forecastRows = createRows();
    hasForecast = true;
    $("#sales-status").textContent = salesHistory.length
      ? fittedSalesModel
      ? `CSV model trained from ${formatNumber(matchedTrainingDays)} sales days matched with historical weather. File: ${salesFileLabel}.`
        : `CSV accepted and used. There was not enough matched history for the full model, so its recent sales average is used. File: ${salesFileLabel}.`
      : `No CSV loaded. Rough estimate uses ${formatNumber(normalSales)} ${getSelectedProduct().unit} on a normal day, with weather, weekday and public-holiday adjustments.`;
    updateScreen();
    $("#location-message").textContent = weatherResult.status === "fulfilled"
      ? `Live ${selectedLocation.name} weather updated at ${localUpdateTime(lastWeatherUpdatedAt, selectedLocation.timezone)}. It refreshes every 30 minutes while this page is open.`
      : `Live weather could not load. The estimate uses seasonal local weather averages where available.`;
    if (holidayState === "loaded") showToast(salesHistory.length ? `${selectedLocation.name} forecast updated.` : `Rough ${selectedLocation.name} estimate ready.`);
    else showToast("Forecast ready. NSW holiday dates could not be checked.");
  } catch (error) {
    if (sequence !== refreshSequence) return;
    forecastRows = [];
    weatherState = "error"; hasForecast = false; refreshedAt = null;
    showForecastPrompt(error instanceof Error ? error.message : "The sales and weather forecast could not be calculated. Check the sales file and try again.");
    showToast("The order forecast could not be calculated.");
  } finally {
    if (sequence === refreshSequence) {
      manualRefreshPending = false;
      button.removeAttribute("aria-busy");
      button.disabled = false;
    }
  }
}

populateSubcategoryOptions();
$("#update-forecast").addEventListener("click", refreshLiveData);
$("#download-csv").addEventListener("click", exportCSV);
$("#subcategory-select").addEventListener("change", () => { populateProductOptions(); onForecastScopeChange(); });
$("#product-select").addEventListener("change", () => { updateProductSearchLink(); onForecastScopeChange(); });
$("#horizon-select").addEventListener("change", markForecastNeedsRefresh);
$("#sales-file").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  clearSalesHistory("Reading sales file…", false);
  try { await loadSalesFile(file); }
  catch (error) {
    clearSalesHistory(error instanceof Error ? error.message : "The sales file could not be read.");
    markForecastNeedsRefresh();
  }
});
["#stock-on-hand", "#stock-incoming", "#stock-safety"].forEach((selector) => $(selector).addEventListener("change", markForecastNeedsRefresh));
$("#location-search").addEventListener("input", () => {
  const query = $("#location-search").value;
  locationSearchSequence += 1;
  weatherUpdateSequence += 1;
  lastAutomaticWeatherAttemptAt = null;
  clearSalesHistory("Your suburb changed. Upload a matching sales file after choosing the new suburb.");
  selectedLocation = null;
  markForecastNeedsRefresh();
  clearTimeout(locationSearchTimer);
  locationSearchTimer = setTimeout(() => searchSydneyLocations(query), 320);
});
$("#location-search").addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown" && !$("#location-options").hidden) { event.preventDefault(); setActiveLocation(activeLocationIndex + 1); }
  else if (event.key === "ArrowUp" && !$("#location-options").hidden) { event.preventDefault(); setActiveLocation(activeLocationIndex - 1); }
  else if (event.key === "Enter" && activeLocationIndex >= 0) { event.preventDefault(); chooseLocation(activeLocationIndex); }
  else if (event.key === "Escape") closeLocationOptions();
});
$("#location-options").addEventListener("pointerdown", (event) => event.preventDefault());
$("#location-options").addEventListener("click", (event) => {
  const option = event.target.closest("[data-index]");
  if (option) chooseLocation(Number(option.dataset.index));
});
$("#location-search").addEventListener("blur", () => setTimeout(closeLocationOptions, 120));
showForecastPrompt("Choose your retailer, Sydney suburb, product and days. Upload 3–4 years of daily sales and enter current stock before calculating an order amount.");
refreshWeatherAutomatically();
setInterval(() => {
  if (!lastAutomaticWeatherAttemptAt || Date.now() - lastAutomaticWeatherAttemptAt >= automaticWeatherInterval) refreshWeatherAutomatically();
}, 60 * 1000);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && (!lastAutomaticWeatherAttemptAt || Date.now() - lastAutomaticWeatherAttemptAt >= automaticWeatherInterval)) refreshWeatherAutomatically();
});
