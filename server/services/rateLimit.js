function rateLimit({ limit, windowMs, key = req => req.user?.email || req.ip, now = Date.now, maxKeys = 10000 }) {
  const buckets = new Map();
  return (req, res, next) => {
    const time = now();
    const id = key(req);
    let bucket = buckets.get(id);
    if (!bucket || bucket.reset <= time) {
      for (const [entry, value] of buckets) if (value.reset <= time) buckets.delete(entry);
      // Do not evict active limits: reject new keys while the limiter is full.
      if (!buckets.has(id) && buckets.size >= maxKeys) {
        res.set('Retry-After', String(Math.ceil(windowMs / 1000)));
        return res.status(429).json({ error: 'Service is busy. Please retry later.' });
      }
      bucket = { count: 0, reset: time + windowMs };
      buckets.set(id, bucket);
    }
    bucket.count++;
    if (bucket.count > limit) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((bucket.reset - time) / 1000))));
      return res.status(429).json({ error: 'Too many requests. Please retry later.' });
    }
    next();
  };
}
module.exports = { rateLimit };
