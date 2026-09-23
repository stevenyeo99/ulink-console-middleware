// Express 4 does not forward rejected promises to error middleware.
module.exports = (fn) => (req, res, next) => fn(req, res, next).catch(next);
