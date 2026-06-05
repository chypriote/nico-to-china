const { getJson } = require("serpapi");
const { getFlightSearch, insertFlightSearch } = require("./db");

const requestObject = {
    engine: "google_flights",
    api_key: "3ea3501d604d46761905f006fe739d568f56183c07d6a63d0d59c886adfd54db",
    currency: "EUR",
    departure_id: "CDG, ORY",
    type: "1",
    sort_by: "2",
    stops: "2",
    outbound_times: "19,23",
    return_times: "17,23",
    deep_search: true
}
const airports = [
    "BUD", //budapest
    "VIE", //vienne
    "ZAG", //zagreb
    "LJU", //ljubjana
    "PRG", //prague
    "BEG", //belgrade
    "SKP", //skopje
    "SOF", //sofia
    "LUX", //luxembourg
    "AMS", //amsterdam
    "ARN", //stockholm
    "GOT", //goteborg
    "HEL", //helsinki
    "TLL", //tallinn
    "RIX", //riga
    "VNO", //vilnius
    "ATH", //athens
    "HER", //heraklion
    "DUB", //dublin
    "EDI", //edimburgh
    "GLA", //glasgow
    "KEF", //reykjavik
    "RVN", //rovaniemi
    "PMO", //palermo
]

const dates = [
    // ["2026-01-30", "2026-02-01"],
    // ["2026-02-06", "2026-02-08"],
    ["2026-02-13", "2026-02-15"],
    ["2026-02-20", "2026-02-22"],
    ["2026-02-27", "2026-02-29"],
]

async function getFlight(airport) {
    const stops = requestObject["stops"] == "2" ? "stop" : "nostop"
    const outboundDate = dates[0][0]
    const returnDate = dates[0][1]

    const cached = getFlightSearch(airport, stops, outboundDate, returnDate)
    if (cached) {
        return cached
    }

    const json = await getJson({
        arrival_id: airport,
        outbound_date: outboundDate,
        return_date: returnDate,
        ...requestObject
    })

    insertFlightSearch(airport, stops, outboundDate, returnDate, json)
    return json
}

async function run() {
    for (const airport of airports) {
        const json = await getFlight(airport)
        if (!json.hasOwnProperty("other_flights")) {
            console.log(airport+" no result")
            continue;
        }
        const dep = json["other_flights"][0]["flights"][0]["departure_airport"]["id"]
        console.log(`${dep} - ${airport}: ${json["other_flights"][0]["price"]}€`)
    }
  }

  const result = async () => {
    await run()
  }
  result()
