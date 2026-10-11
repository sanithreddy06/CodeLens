const KEY_NAMES = { GEMINI: 'GEMINI_API_KEY', GROQ: 'GROQ_API_KEY', OPENAI: 'OPENAI_API_KEY', OPENROUTER: 'OPENROUTER_API_KEY' };
function aiAvailability() {
  const mode = process.env.AI_MODE || 'auto';
  const provider = (process.env.LLM_PROVIDER || 'GEMINI').toUpperCase();
  if (!['auto', 'disabled'].includes(mode)) throw new Error('AI_MODE must be auto or disabled');
  if (!KEY_NAMES[provider]) throw new Error('Unsupported LLM_PROVIDER');
  if (mode === 'disabled') return { enabled: false, provider, reason: 'disabled' };
  if (process.env.FAKE_LLM === 'true' && process.env.NODE_ENV !== 'production') return { enabled: true, provider, demo: true };
  const key = (process.env[KEY_NAMES[provider]] || '').trim();
  const configured = Boolean(key) && !/^(your[-_ ]|replace[-_ ]|placeholder)/i.test(key);
  return { enabled: configured, provider, reason: configured ? null : 'not_configured' };
}
function requireAi() {
  if (!aiAvailability().enabled) {
    const error = new Error('AI is not configured yet. Source browsing and dependency graphs are available.');
    error.status = 503;
    error.code = 'AI_NOT_CONFIGURED';
    throw error;
  }
}
module.exports = { aiAvailability, requireAi };
