const { AsyncLocalStorage } = require('node:async_hooks');
const { setTimeout } = require('node:timers/promises');
const context = new AsyncLocalStorage();
const signal = () => context.getStore()?.signal;
const userEmail = () => context.getStore()?.userEmail;
function check() { signal()?.throwIfAborted(); }
function run(abortSignal, callback, metadata = {}) { return context.run({ ...metadata, signal: abortSignal }, callback); }
async function sleep(ms) {
  check();
  await setTimeout(ms, undefined, { signal: signal() });
}
module.exports = { signal, check, run, sleep, userEmail };
