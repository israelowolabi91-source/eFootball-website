const Database = require('better-sqlite3');
const db = new Database('data/league.db', { readonly: true });
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', tables.map(t => t.name).join(', '));
try {
  const row = db.prepare('SELECT content_json FROM site_content WHERE key = ?').get('tournaments');
  if (row) {
    const ts = JSON.parse(row.content_json);
    console.log('Tournament count:', ts.length);
    ts.forEach(t => console.log(' -', t.id, '|', t.title, '|', t.status));
  } else {
    console.log('No tournaments in site_content');
  }
} catch (e) { console.log('Error:', e.message); }
db.close();

