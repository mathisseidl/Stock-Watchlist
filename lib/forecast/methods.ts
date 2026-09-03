/**
 * The named techniques the forecast is assembled from.
 *
 * These are printed under every result so the reader can see exactly what
 * produced the numbers — a forecast that won't say how it was made is a
 * horoscope. Order runs from "how the inputs were measured" through
 * "how the future was simulated" to "how the whole thing was checked".
 */
export const FORECAST_METHODS: string[] = [
  "Dividend-adjusted total-return series",
  "Logarithmic return distribution",
  "EWMA volatility (RiskMetrics, λ = 0.94)",
  "Mean-reverting variance term structure (60-day half-life)",
  "Market beta against the S&P 500 (Scholes–Williams, date-aligned)",
  "Annualised drift with James–Stein shrinkage to a CAPM prior",
  "Bayesian parameter uncertainty on drift and volatility",
  "Jegadeesh–Titman 12−1 momentum factor",
  "200-day moving-average mean reversion",
  "Wilder RSI (14)",
  "MACD (12, 26, 9)",
  "Geometric Brownian Motion (Black–Scholes price dynamics)",
  "Student-t innovations (fat-tailed shocks, ν = 5, capped at 8σ)",
  "Stationary block bootstrap (Politis–Romano)",
  "Monte Carlo simulation with antithetic variates",
  "Historical Value at Risk and Expected Shortfall (95%)",
  "Skewness and excess-kurtosis diagnostics",
  "Maximum drawdown analysis, realised and simulated",
  "Percentile outcome bands (P10 / P50 / P90)",
  "Walk-forward backtest of band coverage",
];

/** One line naming the engine, for places too small for the full list. */
export const FORECAST_METHOD_SUMMARY =
  "Monte Carlo over Geometric Brownian Motion and a block bootstrap, on a mean-reverting volatility term structure and a beta-anchored, shrunk drift — then backtested against the stock's own history.";
