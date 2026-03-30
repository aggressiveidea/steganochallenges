const Database = require('better-sqlite3');
const db = new Database('./stegano.db');

console.log('--- Database Tables ---');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
tables.forEach(table => {
    console.log(`\nTable: ${table.name}`);
    const rows = db.prepare(`SELECT * FROM ${table.name} LIMIT 20`).all();
    if (rows.length > 0) {
        console.table(rows);
    } else {
        console.log(' (Empty)');
    }
});

db.close();
