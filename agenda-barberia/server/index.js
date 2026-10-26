// Punto de entrada: node server/index.js
import { openDb } from './db.js';
import { createApp } from './app.js';
import { startJobs } from './jobs.js';

const port = Number(process.env.PORT || 3000);
const db = openDb(process.env.DB_FILE || 'data/app.db');
const app = createApp(db, { trustProxy: process.env.TRUST_PROXY === '1' });
startJobs(db);
app.listen(port, () => console.log(`Listo en http://localhost:${port}`));

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { app.close(); db.close(); process.exit(0); });
}
