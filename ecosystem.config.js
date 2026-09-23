module.exports = {
  apps: [{
    name: 'ulink-console-middleware',
    script: 'src/server.js',
    cwd: __dirname, // dotenv reads .env from here
    kill_timeout: 5000, // time for in-flight downloads and the Mongo client to close
  }],
};
