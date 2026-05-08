const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';

module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.statusCode = 200;
  res.end(JSON.stringify({ publicKey: PUBLIC_KEY }));
};
