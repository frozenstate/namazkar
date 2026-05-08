const { isAdminAuthenticated } = require('./_adminAuth');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  if (isAdminAuthenticated(req)) {
    res.statusCode = 200;
    res.end(JSON.stringify({ authenticated: true }));
    return;
  }
  res.statusCode = 401;
  res.end(JSON.stringify({ authenticated: false }));
};