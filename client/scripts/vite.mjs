// Bound Rolldown's native worker pool: the default pool can stall on some hosts.
// Keep the override configurable for CI or larger build machines.
process.env.RAYON_NUM_THREADS ||= '1';
// Node 24 can load our plain JavaScript config directly, avoiding a separate
// native config-bundling step before the actual application build.
if (!process.argv.some(argument => argument.startsWith('--configLoader'))) process.argv.push('--configLoader', 'native');
await import('../node_modules/vite/bin/vite.js');
