-- SCHEMA
CREATE TABLE IF NOT EXISTS flight_searches (
    airport TEXT NOT NULL,
    stops TEXT NOT NULL,
    price REAL,
    outbound_date TEXT NOT NULL,
    return_date TEXT NOT NULL,
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
INSERT OR REPLACE INTO flight_searches (airport, stops, price, outbound_date, return_date, response, searched_on, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'));

-- name: getRecentSearches
SELECT airport, stops, price, outbound_date, return_date, response, searched_on,
       MAX(created_at) AS created_at
FROM flight_searches
GROUP BY airport, outbound_date
ORDER BY price;
