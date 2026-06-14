// Static build: fetch the most recent search per airport/outbound-date combo,
// sorted cheapest-first, and inject the rendered cards into index.html so the
// page works without the live /api/searches endpoint (server.js).
//
// Run with: node build  (or: yarn build)

const fs = require('fs');
const path = require('path');
const { getRecentSearches } = require('./db');

const HTML_PATH = path.join(__dirname, 'index.html');
const CALENDAR_HTML_PATH = path.join(__dirname, 'calendar.html');

// Airport code → city name. Falls back to the raw code for anything unmapped.
const CITY_NAMES = {
  TFU: '成都 Chengdu',
  CAN: '广州 Guangzhou',
  NKG: '南京 Nanjing',
  XMN: '厦门 Xiamen',
  XIY: '西安 Xian',
  CKG: '重庆 Chongqing',
  PVG: '上海 Shanghai',
  PEK: '北京 Beijing',
  PKX: '北京 Beijing DX',
  HGH: '杭州 Hangzhou',
  KHN: '南昌 Nanchang',
  KMG: '昆明 Kunming',
  WUH: '武汉 Wuhan',
  URC: '乌鲁木齐 Urumqi',
  CSX: '长沙 Changsha',
  KWL: '贵林 Guilin',
  LXA: '城关 Lhasa',
};

const cityName = (code) => CITY_NAMES[code] || code;

// --- formatting (kept in sync with index.js so static === live render) ---

const formatCurrency = (value) => new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
}).format(value);

const formatShortDate = (value) => new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
}).format(new Date(value));

const formatLongDate = (value) => new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
}).format(new Date(value));

const esc = (value) => String(value).replace(/[&<>"]/g, (ch) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]
));

// Most recent row per airport/outbound_date/return_date combo, cheapest first
// (null prices sort last), tie-broken by the most recently searched.
function dedupeAndSort(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const key = [row.airport, row.outbound_date, row.return_date].join('|');
    const existing = map.get(key);
    if (!existing || new Date(row.searched_on) > new Date(existing.searched_on)) {
      map.set(key, row);
    }
  });
  return Array.from(map.values()).sort((a, b) => {
    if ((a.price ?? Infinity) !== (b.price ?? Infinity)) return (a.price ?? Infinity) - (b.price ?? Infinity);
    return new Date(b.searched_on) - new Date(a.searched_on);
  });
}

// Cheap → expensive maps to a green → red hue ramp (light-theme values).
function getPriceColor(price, minPrice, maxPrice) {
  if (!Number.isFinite(price)) return 'var(--color-text)';
  const range = Math.max(maxPrice - minPrice, 1);
  const ratio = Math.min(Math.max((price - minPrice) / range, 0), 1);
  const hue = 135 - ratio * 135;
  const chroma = 0.135;
  const lightness = 0.52 - ratio * 0.05;
  return `oklch(${lightness} ${chroma} ${hue})`;
}

function renderCard(item, minPrice, maxPrice, isAirportLowest) {
  const price = Number.isFinite(item.price) ? formatCurrency(item.price) : '—';
  const city = cityName(item.airport);
  const label = `${esc(city)} from ${formatLongDate(item.outbound_date)} to ${formatLongDate(item.return_date)} costs ${price}`;
  const cardClass = isAirportLowest ? 'search-card airport-lowest' : 'search-card';
  const stops = item.stops === 'nostop' ? `<span class="stops-inline" title="Direct">✈️</span>` : '';
  return `        <article class="${cardClass}" aria-label="${label}">
          <div class="search-line">
            <span class="airport" title="${item.airport}">${esc(city)}</span>
            <span class="dates-inline">${formatShortDate(item.outbound_date)} → ${formatShortDate(item.return_date)}</span>
            ${stops}
          </div>
          <div class="price-inline" style="--price-color: ${getPriceColor(item.price, minPrice, maxPrice)}">${price}</div>
          <span class="searched-floating">${formatShortDate(item.searched_on)}</span>
        </article>`;
}

const EMPTY_STATE = `        <div class="empty-state">
          <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
            <path d="M3 12h6l3 7 4-14 3 7h2" stroke-linecap="round" stroke-linejoin="round"></path>
          </svg>
          <h3>No searches yet</h3>
          <p>Run a flight search, then \`node build\` to populate this list.</p>
        </div>`;

function buildListMarkup(rows) {
  if (!rows.length) return EMPTY_STATE;
  const prices = rows.map((item) => item.price).filter((price) => Number.isFinite(price));
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 0;

  // Cheapest finite-priced row per airport — rows are already sorted
  // cheapest-first, so the first one seen for an airport is its lowest.
  const lowestByAirport = new Map();
  rows.forEach((item) => {
    if (Number.isFinite(item.price) && !lowestByAirport.has(item.airport)) {
      lowestByAirport.set(item.airport, item);
    }
  });

  return rows
    .map((item) => renderCard(item, minPrice, maxPrice, lowestByAirport.get(item.airport) === item))
    .join('\n');
}

// --- calendar (server-rendered cells, mirrors the <article> template in calendar.html) ---

const monthLabel = (value) => new Intl.DateTimeFormat('en-GB', {
  month: 'short',
}).format(value instanceof Date ? value : new Date(value));

const stopsLabel = (stops) => (stops === 'nostop' ? 'Non-stop' : '1 stop');

const pad2 = (value) => String(value).padStart(2, '0');
const isoDate = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

// Calendar window — the constants the page used to render with client-side.
const CALENDAR_TODAY = new Date();
const CALENDAR_START = new Date('2026-11-02T12:00:00');
const CALENDAR_END = (() => {
  const end = new Date(CALENDAR_TODAY);
  end.setDate(end.getDate() + 325);
  return end;
})();

// Whole Mon–Sun weeks covering [start, end] so the grid stays aligned.
function buildCalendarDates(startDate, endDate) {
  const first = new Date(startDate);
  first.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  const last = new Date(endDate);
  last.setDate(last.getDate() + (6 - ((last.getDay() + 6) % 7)));

  const dates = [];
  for (let cursor = new Date(first); cursor <= last; cursor.setDate(cursor.getDate() + 1)) {
    dates.push(new Date(cursor));
  }
  return dates;
}

// In-window rows grouped by outbound date, cheapest-first within each day
// (null prices last, ties broken by airport code).
function groupByDay(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const outbound = new Date(`${row.outbound_date}T12:00:00`);
    if (outbound < CALENDAR_START || outbound > CALENDAR_END) return;
    if (!map.has(row.outbound_date)) map.set(row.outbound_date, []);
    map.get(row.outbound_date).push(row);
  });
  map.forEach((entries) => entries.sort((a, b) => {
    if ((a.price ?? Infinity) !== (b.price ?? Infinity)) return (a.price ?? Infinity) - (b.price ?? Infinity);
    return a.airport.localeCompare(b.airport);
  }));
  return map;
}

function renderCalendarCell(date, entries, minPrice, maxPrice) {
  const inRange = date >= CALENDAR_START && date <= CALENDAR_END;
  const isToday = isoDate(date) === isoDate(CALENDAR_TODAY);
  const classes = [
    'day-cell',
    !inRange ? 'is-empty' : '',
    entries.length ? 'has-results' : '',
    isToday ? 'is-today' : '',
  ].filter(Boolean).join(' ');

  const priceList = entries.length
    ? entries.map((item) => {
      const price = Number.isFinite(item.price) ? formatCurrency(item.price) : '—';
      return `
            <div class="price-pill">
              <span class="pill-route">${item.airport}${item.stops === 'nostop' ? '✈️' : ''}</span>
              <span class="pill-price" style="--price-color: ${getPriceColor(item.price, minPrice, maxPrice)}">${price}</span>
            </div>`;
    }).join('')
    : `<span class="empty-copy">${inRange ? 'No results' : ''}</span>`;

  return `        <article class="${classes}" aria-label="${formatLongDate(date)} with ${entries.length} results">
          <div class="day-top">
            <div class="day-number-wrapper">
              <div class="day-number">${pad2(date.getDate())}</div>
              <div class="day-month">${monthLabel(date)}</div>
            </div>
            <div class="day-count">${entries.length ? `${entries.length} fares` : ''}</div>
          </div>
          <div class="price-list">${priceList}</div>
        </article>`
}

function buildCalendarGrid(rows) {
  const dayMap = groupByDay(rows);
  const prices = [...dayMap.values()].flat()
    .map((item) => item.price)
    .filter((price) => Number.isFinite(price));
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 0;

  return buildCalendarDates(CALENDAR_START, CALENDAR_END)
    .map((date) => renderCalendarCell(date, dayMap.get(isoDate(date)) || [], minPrice, maxPrice))
    .join('\n');
}

function injectBetween(html, openTag, closeMarker, inner) {
  const open = html.indexOf(openTag);
  if (open === -1) throw new Error(`Could not find "${openTag}" in index.html`);
  const innerStart = open + openTag.length;
  const close = html.indexOf(closeMarker, innerStart);
  if (close === -1) throw new Error(`Could not find closing "${closeMarker}" after "${openTag}"`);
  return html.slice(0, innerStart) + inner + html.slice(close);
}

function main() {
  const recent = getRecentSearches();
  const rows = dedupeAndSort(recent);

  let html = fs.readFileSync(HTML_PATH, 'utf8');

  const cards = buildListMarkup(rows);
  const listInner = `\n        <!-- Generated by build.js — do not edit by hand; run \`node build\` to refresh. -->\n${cards}\n      `;
  html = injectBetween(
    html,
    '<div class="search-list" id="search-list">',
    '\n      </div>\n    </section>',
    listInner
  );

  const countLabel = `${rows.length} result${rows.length === 1 ? '' : 's'}`;
  html = injectBetween(
    html,
    '<span class="tag" id="results-count">',
    '</span>',
    countLabel
  );

  fs.writeFileSync(HTML_PATH, html);
  console.log(`Wrote ${rows.length} search${rows.length === 1 ? '' : 'es'} into index.html`);

  const calendarInner = `\n        <!-- Generated by build.js — do not edit by hand; run \`node build\` to refresh. -->\n${buildCalendarGrid(recent)}\n      `
  let calendarHtml = fs.readFileSync(CALENDAR_HTML_PATH, 'utf8');
  calendarHtml = injectBetween(
    calendarHtml,
    '<div id="calendar-grid" class="week-grid">',
    '\n      </div>\n    </section>',
    calendarInner
  );
  fs.writeFileSync(CALENDAR_HTML_PATH, calendarHtml);
  console.log(`Wrote ${recent.length} search${recent.length === 1 ? '' : 'es'} into calendar.html`);
}

main();
