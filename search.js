const {getJson} = require("serpapi");
const {format, isFuture} = require("date-fns");
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

const AIRPORTS = new Set(["TFU", "CAN", "NKG", "XMN", "XIY", "CKG", "PVG", "PEK", "PKX", "HGH", "KHN", "KMG", "WUH", "URC", "NKG", "CSX", "KWL", "LXA"])

async function getFlights(airport, start, end, stopsParam) {
  const stops = stopsParam === "2" ? "stop" : "nostop"
  const searchedOn = formatDate(new Date())
  const outboundDate = formatDate(start)
  const returnDate = formatDate(end)

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

  await insertFlightSearch(airport, "nostop", json.other_flights[0].price, outboundDate, returnDate, json, searchedOn)
  return json
}

async function run() {
  const [airport, outboundDate, returnDate] = process.argv.slice(2)

  if (!airport || !outboundDate || !returnDate) {
    console.error("Usage: node search <airport> <outboundDate> <returnDate> [stops]")
    console.error("  airport      Arrival airport code, e.g. PVG")
    console.error("  outboundDate Outbound date, yyyy-MM-dd")
    console.error("  returnDate   Return date, yyyy-MM-dd")
    console.error("  stops        SerpApi stops param: 1=nonstop, 2=1 stop (default), 3=2 stops")
    process.exit(1)
  }
  if (!AIRPORTS.has(airport)) {
    console.error(`Invalid airport code: ${airport}`)
    process.exit(1)
  }
  if (!isFuture(outboundDate) || !isFuture(returnDate) || outboundDate > returnDate) {
    console.error("invalid dates: outboundDate must be in the future, returnDate must be after outboundDate, and outboundDate must be before returnDate")
    process.exit(1)
  }

  const json = await getFlights(airport, outboundDate, returnDate, "1")

  if (!json.hasOwnProperty("other_flights")) {
    console.log(`${airport} ${outboundDate} to ${returnDate}: no result`)
    return
  }

  console.log(`${airport} (nostop) ${outboundDate} to ${returnDate}: ${json["other_flights"][0]["price"]}€`)
}

run()
