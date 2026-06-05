const {getJson} = require("serpapi");
const {
  format,
  addWeeks,
  addMonths,
  addDays,
  getDay,
  nextMonday,
  nextWednesday,
  nextThursday,
  nextSaturday
} = require("date-fns");
const {getFreshFlightSearch, insertFlightSearch} = require("./db");

const formatDate = date => format(date, 'yyyy-MM-dd')

const requestObject = {
  engine: "google_flights",
  api_key: "3ea3501d604d46761905f006fe739d568f56183c07d6a63d0d59c886adfd54db",
  currency: "EUR",
  departure_id: "CDG, ORY",
  type: "1",
  sort_by: "2",
  deep_search: true
}

const airports = [
  "TFU", // Chengdu Lundi
  "CAN", // Guangzhou Lundi Jeudi
  "NKG", // Nanjing Mercredi
  "XMN", // Xiamen Jeudi
  "XIY", // Xian Jeudi
  "CKG", // Chongqing Samedi
  "PVG", // Shanghai Pudong all
  "PEK", // Beijing Capital all
  "PKX", // Beijing Daxing all
]

const ONE_STOP_AIRPORTS = new Set(["PEK", "PKX", "CAN", "PVG"])

function getStopsOptions(airport) {
  if (airport === "PKX") {
    return ["2"]
  }
  return ONE_STOP_AIRPORTS.has(airport) ? ["1", "2"] : ["1"]
}

const CACHE_MAX_AGE_DAYS = 3

async function getFlights(airport, start, end, stopsParam) {
  const stops = stopsParam === "2" ? "stop" : "nostop"
  const outboundDate = formatDate(start)
  const returnDate = formatDate(end)
  const searchedOn = formatDate(new Date())

  const cached = getFreshFlightSearch(airport, stops, outboundDate, returnDate, CACHE_MAX_AGE_DAYS)
  if (cached) {
    return cached
  }

  const json = await getJson({
    arrival_id: airport,
    outbound_date: outboundDate,
    return_date: returnDate,
    ...requestObject,
    stops: stopsParam,
  })

  if (!json.hasOwnProperty("other_flights")) {
    return json
  }

  insertFlightSearch(airport, stops, outboundDate, returnDate, json, searchedOn)
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
    case "PKX":
      return true // all days
    default:
      return false
  }
}

async function run() {
  const startRange = addMonths(new Date(), 6)
  const endRange = addWeeks(startRange, 1)

  let current = startRange
  while (current <= endRange) {
    for (const airport of airports) {
      if (!isAirportAvailable(airport, current)) {
        continue
      }
      const start = current
      const end = addWeeks(start, 2)

      for (const stopsParam of getStopsOptions(airport)) {
        const json = await getFlights(airport, start, end, stopsParam)
        if (!json.hasOwnProperty("other_flights")) {
          console.log(`${airport} no result`)
          continue
        }

        const stopLabel = stopsParam === "2" ? " (1 stop)" : ""
        console.log(`${airport}${stopLabel} ${formatDate(start)} to ${formatDate(end)}: ${json["other_flights"][0]["price"]}€`)
      }
    }
    current = addDays(current, 1)
  }
}

const result = async () => {
  await run()
}
result()
