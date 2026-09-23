const { MongoClient } = require('mongodb');

const client = new MongoClient(process.env.MONGO_URL, {
  auth: { username: process.env.MONGO_USER, password: process.env.MONGO_PASS },
});

module.exports = {
  connect: () => client.connect(),
  close: () => client.close(),
  // Database name comes from the path in MONGO_URL.
  db: () => client.db(),
};
