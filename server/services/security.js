function securityHeaders(req, res, next) {
  const connect = ["'self'"];
  const api = process.env.PUBLIC_API_ORIGIN;
  if (api) {
    const url = new URL(api);
    if (!['https:', 'http:'].includes(url.protocol) || url.origin !== api) throw new Error('PUBLIC_API_ORIGIN must be an exact HTTP(S) origin');
    connect.push(url.origin);
  }
  res.set({
    'Content-Security-Policy': `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src ${connect.join(' ')}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`,
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'X-DNS-Prefetch-Control': 'off',
    'Referrer-Policy': 'no-referrer',
  });
  next();
}
let active = 0;
function passwordCapacity(req, res, next) {
  if (active >= 4) return res.status(429).set('Retry-After', '2').json({ error: 'Account service is busy. Please try again shortly.' });
  active++;
  let released = false;
  const release = () => { if (!released) { active--; released = true; } };
  res.once('finish', release); res.once('close', release);
  next();
}
module.exports = { securityHeaders, passwordCapacity };
