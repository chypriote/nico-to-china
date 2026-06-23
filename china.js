const { getJson } = require("serpapi");
const { format, getDay, addDays } = require("date-fns");
const {getFreshFlightSearch, insertFlightSearch} = require("./db");

process.loadEnvFile();

const formatDate = date => format(date, 'yyyy-MM-dd')

const requestObject = {
  engine: "google_flights",
  api_key: process.env.API_KEY,
  currency: "EUR",
  departure_id: "CDG, ORY",
  type: "1",
  sort_by: "2",
  max_duration: 1260,
  deep_search: true
}
const CACHE_MAX_AGE_DAYS = 3
const MAX_SEARCH_DAYS = 305

/**
 * Airports - code - direct flights day:
 * Chengdu - TFU - Lundi
 * Guangzhou - CAN - Lundi Jeudi
 * Nanjing - NKG - Mercredi
 * Xiamen - XMN - Jeudi
 * Xian - XIY - Jeudi
 * Chongqing - CKG - Samedi
 * Shanghai Pudong - PVG - all
 * Beijing Capital - PEK - all
 * Beijing Daxing - PKX - none
 * Hangzhou - HGH - none
 * Nanchang - KHN - none
 * Kunming - KMG - none
 * Wuhan - WUH - none
 * Urumqi - URC - none
 * Changsha - CSX - none
 * Guilin - KWL - none
 * Lhasa - LXA - none
 *
 * Trips:
 * Southwest - Mars-Mai/Sept-Nov - Chengdu, Chongqing, Guilin, Kunming
 * SG&co - Avril-Mai/Oct-Nov - Shanghai, Nanjing, Hangzhou
 * Center - Mars-Mai/Sept-Nov - Changsha, Wuhan, Nanchang
 * Xinjiang - Mai-Oct - Urumqi
 * Xizang - Avril-Juin/Sept-Oct - Lhasa
 * East coast - Mars-Avril/Nov-Dec - Guangzhou, Xiamen
 *
 * Dates to avoid:
 * First week of May
 * First week of October
 * Month of July
 */
const dateRanges = [
  // ["2026-11-06", "2026-11-21", ["CSX", "WUH", "KHN", "CAN", "XMN"]],
  ["2027-02-06", "2027-02-20", ["CSX", "WUH", "KHN"]],
  ["2027-02-13", "2027-02-27", ["CSX", "WUH", "KHN"]],
  ["2027-02-20", "2027-03-05", ["CSX", "WUH", "KHN"]],
  ["2027-03-12", "2027-03-26", ["CSX", "WUH", "KHN", "XIY", "TFU", "KMG", "CKG", "KWL", "CAN", "XMN"]],
  ["2027-03-19", "2027-04-03", ["CSX", "WUH", "KHN", "XIY", "TFU", "KMG", "CKG", "KWL", "CAN", "XMN"]],
  ["2027-03-26", "2027-04-10", ["CSX", "WUH", "KHN", "XIY", "TFU", "KMG", "CKG", "KWL", "CAN", "XMN"]],
  ["2027-04-02", "2027-04-17", ["CSX", "WUH", "KHN", "XIY", "TFU", "KMG", "CKG", "KWL", "PVG", "HGH", "NKG", "CAN", "XMN"]],
  ["2027-04-09", "2027-04-24", ["CSX", "WUH", "KHN", "XIY", "TFU", "KMG", "CKG", "KWL", "PVG", "HGH", "NKG", "CAN", "XMN", "PEK", "PKX"]],
  ["2027-04-16", "2027-05-01", ["CSX", "WUH", "KHN", "XIY", "TFU", "KMG", "CKG", "KWL", "PVG", "HGH", "NKG", "CAN", "XMN", "PEK", "PKX"]],
  //Skipping first may week
  ["2027-05-07", "2027-05-21", ["XIY", "TFU", "KMG", "CKG", "KWL", "PVG", "HGH", "NKG", "PEK", "PKX"]],
  ["2027-05-07", "2027-05-28", ["LXA"]], //3 weeks
  ["2027-05-14", "2027-05-28", ["XIY", "TFU", "KMG", "CKG", "KWL", "PVG", "HGH", "NKG", "PEK", "PKX"]],
  ["2027-05-14", "2027-06-05", ["LXA"]], //3 weeks
  ["2027-05-21", "2027-06-05", ["XIY", "TFU", "KMG", "CKG", "KWL", "PVG", "HGH", "NKG"]],
  ["2027-05-21", "2027-06-12", ["LXA"]], //3 weeks
  ["2027-05-28", "2027-06-12", ["PVG", "HGH", "NKG"]],
  ["2027-06-04", "2027-06-19", ["PVG", "HGH", "NKG"]],
  ["2027-06-04", "2027-06-26", ["LXA"]], //3 weeks
  ["2027-06-11", "2027-06-26", ["PVG", "HGH", "NKG"]],
  ["2027-06-11", "2027-07-03", ["LXA"]], //3 weeks
  ["2027-06-18", "2027-07-03", []],
  ["2027-06-25", "2027-07-10", []],
  ["2027-07-02", "2027-07-17", []],
  ["2027-07-02", "2027-07-24", ["URC"]], //3 weeks
  ["2027-07-09", "2027-07-24", []],
  ["2027-07-09", "2027-07-31", ["URC"]], //3 weeks
  ["2027-07-16", "2027-07-31", []],
  ["2027-07-16", "2027-08-07", ["URC"]], //3 weeks
  ["2027-07-23", "2027-08-07", []],
  ["2027-07-30", "2027-08-14", []],
  ["2027-08-06", "2027-08-21", []],
  ["2027-08-06", "2027-08-28", []],
  ["2027-08-13", "2027-08-28", []],
  ["2027-08-13", "2027-09-04", ["URC"]], //3 weeks
  ["2027-08-20", "2027-09-04", []],
  ["2027-08-20", "2027-09-11", ["URC"]], //3 weeks
  ["2027-08-27", "2027-09-11", ["PEK", "PKX"]],
  ["2027-08-27", "2027-09-18", ["URC", "LXA"]], //3 weeks
  ["2027-09-03", "2027-09-18", ["CSX", "WUH", "KHN","XIY", "TFU", "KMG", "CKG", "KWL", "PEK", "PKX"]],
  ["2027-09-03", "2027-09-25", ["URC", "LXA"]], //3 weeks
  ["2027-09-10", "2027-09-25", ["CSX", "WUH", "KHN","XIY", "TFU", "KMG", "CKG", "KWL", "PEK", "PKX"]],
  ["2027-09-10", "2027-10-01", ["URC", "LXA"]], //3 weeks
  ["2027-10-29", "2027-11-13", ["CSX", "WUH", "KHN","XIY", "TFU", "KMG", "CKG", "KWL", "PVG", "HGH", "NKG", "PEK", "PKX"]],
]

const DIRECT_AIRPORTS = new Set(["XIY", "TFU", "CAN", "NKG", "XMN", "XIY", "CKG", "PVG", "PEK"])

async function getFlights(airport, start, end, stops) {
  const stopsValue = stops === "2" ? "stop" : "nostop"
  const outboundDate = formatDate(start)
  const returnDate = formatDate(end)
  const searchedOn = formatDate(new Date())

  const cached = getFreshFlightSearch(airport, stopsValue, outboundDate, returnDate, CACHE_MAX_AGE_DAYS)
  if (cached) {
    return cached
  }

  const json = await getJson({
    arrival_id: airport,
    outbound_date: outboundDate,
    return_date: returnDate,
    ...requestObject,
    stops: stops,
  })

  if (!json.hasOwnProperty("other_flights")) {
    return json
  }

  await insertFlightSearch(airport, stopsValue, json.other_flights[0].price, outboundDate, returnDate, json, searchedOn)
  return json
}

function isAirportAvailable(airport, date) {
  const day = getDay(date) // 0 is Sunday, 1 is Monday, ..., 6 is Saturday
  switch (airport) {
    case "TFU":
      return day === 1 // Monday
    case "NKG":
      return day === 3 // Wednesday
    case "CAN":
      return day === 1 || day === 4 // Monday, Thursday
    case "XMN":
    case "XIY":
      return day === 4 // Thursday
    case "CKG":
      return day === 6 // Saturday
    case "PVG":
    case "PEK":
      return true // all days
    default:
      return false
  }
}

async function findWeeklyDirectFlights(date) {
  const current = new Date(date)
  const day = getDay(current)
  const mondayOffset = day === 0 ? -6 : 1 - day
  const weekStart = addDays(current, mondayOffset)
  const weekEnd = addDays(weekStart, 6)

  const maxSearchDate = addDays(new Date(), MAX_SEARCH_DAYS)
  for (let d = new Date(weekStart); d <= weekEnd; d = addDays(d, 1)) {
    for (const airport of DIRECT_AIRPORTS) {
      if (d > maxSearchDate) break
      if (airport === "PVG" || airport === "PEK") continue
      if (!isAirportAvailable(airport, d)) continue

      const json = await getFlights(airport, d, addDays(d, 14), "1")
      if (!json.hasOwnProperty("other_flights")) {
        console.log(`${airport} ${formatDate(d)} no result`)
        continue
      }

      console.log(`${airport} (direct) ${formatDate(d)}: ${json["other_flights"][0]["price"]}€`)
    }
  }
}

async function run() {
  let searches = 0
  const maxSearchDate = addDays(new Date(), MAX_SEARCH_DAYS)
  for (const [startDate, endDate, airports] of dateRanges) {
    for (const airport of airports) {
      const start = new Date(startDate)
      const end = new Date(endDate)

      if (start > maxSearchDate) {
        break
      }

      const stopsOptions = airport === "URC" || airport === "LXA" ? ["3"] : ["2"]
      if (DIRECT_AIRPORTS.has(airport) && isAirportAvailable(airport, start)) {
        stopsOptions.push("1")
      }

      for (const stopsParam of stopsOptions) {
        searches++
        const json = await getFlights(airport, start, end, stopsParam)
        if (!json.hasOwnProperty("other_flights")) {
          console.log(`${airport} ${startDate} no result`)
          continue
        }

        const stopLabel = stopsParam === "2" ? " (1 stop)" : " (nostop)"
        console.log(`${airport}${stopLabel} ${formatDate(start)} to ${formatDate(end)}: ${json["other_flights"][0]["price"]}€`)
      }
    }
    await findWeeklyDirectFlights(startDate)
  }
  console.log(`searched ${searches} flights`)
}

const result = async () => {
  await run()
}
result()
