-- SCHEMA
CREATE TABLE IF NOT EXISTS flight_searches (
    airport TEXT NOT NULL,
    stops TEXT NOT NULL,
    outbound_date TEXT NOT NULL,
    return_date TEXT NOT NULL,
    price REAL,
    response TEXT NOT NULL,
    searched_on TEXT NOT NULL DEFAULT (date('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (airport, stops, outbound_date, return_date)
);

-- name: getFlightSearch
SELECT response
FROM flight_searches
WHERE airport = ?
  AND stops = ?
  AND outbound_date = ?
  AND return_date = ?;

-- name: getFreshFlightSearch
SELECT response
FROM flight_searches
WHERE airport = ?
  AND stops = ?
  AND outbound_date = ?
  AND return_date = ?
  AND datetime(created_at) > datetime('now', ?);

-- name: insertFlightSearch
INSERT OR REPLACE INTO flight_searches (airport, stops, outbound_date, return_date, price, response, searched_on, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'));
