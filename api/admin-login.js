const { createSessionCookie, verifyAdminPassword } = require('./_adminAuth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');

  try {
    const body = await new Promise((resolve, reject) => {
      let d = '';
      req.on('data', c => d += c.toString());
      req.on('end', () => resolve(JSON.parse(d || '{}')));
      req.on('error', reject);
    });

    const password = String(body.password || '');
    if (!password || !verifyAdminPassword(password)) {
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: false, error: 'Invalid password' }));
      return;
    }

    res.setHeader('Set-Cookie', createSessionCookie(req));
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true }));
  } catch (err) {
    console.error('admin-login error', err);
    res.statusCode = 500;
    res.end('Internal Server Error');
  }
};