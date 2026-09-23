require('dotenv').config();

const missing = ['MONGO_URL', 'GRAPH_MATERIAL_URL', 'DOWNLOAD_ROOT'].filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing env: ${missing.join(', ')}`);
  process.exit(1);
}

const db = require('./lib/db');
const app = require('./app');

const port = process.env.PORT || 3000;

db.connect()
  .then(() => {
    const server = app.listen(port, () => console.log(`Listening on ${port}`));
    const shutdown = () => server.close(() => db.close().then(() => process.exit(0)));
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  })
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });
