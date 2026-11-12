// Simple asset fallback for the optional standalone Worker configuration.
// Forecasting and live weather requests run in the browser; no auth or database is required.
export default {
  fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
};
