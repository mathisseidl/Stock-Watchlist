/**
 * The named techniques the forecast is assembled from.
 *
 * These are printed under every result so the reader can see exactly what
 * produced the numbers — a forecast that won't say how it was made is a
 * horoscope. Order runs from "how the inputs were measured" through
 * "how the future was simulated" to "how the risk was scored".
 */
export const FORECAST_METHODS: string[] = [
  "Logarithmic return distribution",
  "Geometric Brownian Motion (Black–Scholes price dynamics)",
  "Monte Carlo simulation",
  "Student-t innovations (fat-tailed shocks, ν = 4)",
  "Stationary block bootstrap (Politis–Romano)",
  "EWMA volatility (RiskMetrics, λ = 0.94)",
  "Annualised drift with James–Stein shrinkage to the equity risk premium",
  "Jegadeesh–Titman 12−1 momentum factor",
  "200-day moving-average mean reversion",
  "Wilder RSI (14)",
  "MACD (12, 26, 9)",
  "Historical Value at Risk and Expected Shortfall (95%)",
  "Maximum drawdown analysis",
  "Percentile outcome bands (P10 / P50 / P90)",
];

/** One line naming the engine, for places too small for the full list. */
export const FORECAST_METHOD_SUMMARY =
  "Monte Carlo over Geometric Brownian Motion with fat-tailed shocks and a block bootstrap, on EWMA volatility and shrunk drift.";
