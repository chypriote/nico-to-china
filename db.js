const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'flights.db');
const SQL_PATH = path.join(__dirname, 'flights.sql');

function loadSql(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const parts = content.split(/^-- name: /m);
    const schema = parts[0].replace(/^-- SCHEMA\s*/m, '').trim();
    const queries = {};

    for (let i = 1; i < parts.length; i++) {
        const newline = parts[i].indexOf('\n');
        const name = parts[i].slice(0, newline).trim();
        const sql = parts[i].slice(newline + 1).trim();
        queries[name] = sql;
    }

    return { schema, queries };
}

const { schema, queries } = loadSql(SQL_PATH);

let db;

function migrate(db) {
    const columns = db.prepare('PRAGMA table_info(flight_searches)').all();
    if (columns.length > 0 && !columns.some((column) => column.name === 'searched_on')) {
        db.exec(`
            ALTER TABLE flight_searches ADD COLUMN searched_on TEXT;
            UPDATE flight_searches SET searched_on = date(created_at) WHERE searched_on IS NULL;
        `);
    }
    if (columns.length > 0 && !columns.some((column) => column.name === 'price')) {
        db.exec('ALTER TABLE flight_searches ADD COLUMN price REAL;');
    }
    if (columns.length > 0 && !columns.some((column) => column.name === 'destination_airport')) {
        db.exec('ALTER TABLE flight_searches ADD COLUMN destination_airport TEXT;');
    }
}

function getDb() {
    if (!db) {
        db = new Database(DB_PATH);
        db.exec(schema);
        migrate(db);
    }
    return db;
}

function getFlightSearch(airport, stops, outboundDate, returnDate) {
    const row = getDb()
        .prepare(queries.getFlightSearch)
        .get(airport, stops, outboundDate, returnDate);
    return row ? JSON.parse(row.response) : null;
}

function getFreshFlightSearch(airport, stops, outboundDate, returnDate, maxAgeDays = 3) {
    const row = getDb()
        .prepare(queries.getFreshFlightSearch)
        .get(airport, stops, outboundDate, returnDate, `-${maxAgeDays} days`);
    return row ? JSON.parse(row.response) : null;
}

function insertFlightSearch(airport, stops, outboundDate, returnDate, response, searchedOn) {
    let price = null;
    let destinationAirport = null;

    if (response && response.other_flights && response.other_flights[0]) {
        price = response.other_flights[0].price;
        if (response.other_flights[0].flights && response.other_flights[0].flights[0] && response.other_flights[0].flights[0].arrival_airport) {
            destinationAirport = response.other_flights[0].flights[0].arrival_airport.id;
        }
    }

    getDb()
        .prepare(queries.insertFlightSearch)
        .run(
            airport,
            stops,
            outboundDate,
            returnDate,
            price,
            JSON.stringify(response),
            searchedOn ?? new Date().toISOString().slice(0, 10)
        );
}

module.exports = {
    getDb,
    getFlightSearch,
    getFreshFlightSearch,
    insertFlightSearch,
};
