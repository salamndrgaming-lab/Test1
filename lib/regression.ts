/**
 * Ordinary least squares with standard errors.
 *
 * Small and self-contained because the question it answers is the one the
 * whole model hangs on: when our projection and the closing line are both
 * offered as explanations of what actually happened, how much weight does the
 * data put on ours?
 *
 * Reporting a coefficient without its standard error would be the same
 * mistake as reporting an edge without the books' dispersion — a number that
 * looks like a finding and might be noise. So every coefficient comes back
 * with the error on it and a t-statistic, and the caller is expected to ignore
 * anything that doesn't clear a threshold.
 */

export interface Coefficient {
  name: string;
  value: number;
  standardError: number;
  /** value / standardError. Above about 2 is conventionally significant. */
  t: number;
}

export interface RegressionResult {
  /** Intercept first, then one per predictor in the order given. */
  coefficients: Coefficient[];
  /** Observations used. */
  n: number;
  /** Fraction of variance explained. */
  rSquared: number;
  /** Standard deviation of the residuals, in the units of y. */
  residualSd: number;
}

/** Solve a symmetric linear system by Gauss-Jordan with partial pivoting. */
function solve(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  // Work on copies; the inverse is needed afterwards for standard errors.
  const m = a.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    }
    if (Math.abs(m[pivot][col]) < 1e-10) return null; // singular
    [m[col], m[pivot]] = [m[pivot], m[col]];

    const d = m[col][col];
    for (let c = col; c <= n; c++) m[col][c] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r][col];
      if (f === 0) continue;
      for (let c = col; c <= n; c++) m[r][c] -= f * m[col][c];
    }
  }
  return m.map((row) => row[n]);
}

/** Invert a symmetric positive-definite matrix, or null if singular. */
function invert(a: number[][]): number[][] | null {
  const n = a.length;
  const out: number[][] = [];
  for (let i = 0; i < n; i++) {
    const e = new Array(n).fill(0);
    e[i] = 1;
    const col = solve(a, e);
    if (!col) return null;
    out.push(col);
  }
  // `out` is built column-wise; transpose into row-major.
  return out[0].map((_, i) => out.map((col) => col[i]));
}

/**
 * Regress `y` on `predictors`, with an intercept.
 *
 * `predictors` is one array per variable, each the same length as `y`.
 * Returns null when the system is singular or there are too few observations
 * to estimate the parameters — both of which happen on thin windows, and
 * neither of which should produce a confident-looking answer.
 */
export function regress(
  y: number[],
  predictors: { name: string; values: number[] }[],
): RegressionResult | null {
  const n = y.length;
  const k = predictors.length + 1; // + intercept
  // Need meaningfully more observations than parameters, or the fit is
  // describing the sample rather than the process.
  if (n < k + 10) return null;
  if (predictors.some((p) => p.values.length !== n)) return null;

  // Design matrix with a leading column of ones.
  const X: number[][] = [];
  for (let i = 0; i < n; i++) {
    X.push([1, ...predictors.map((p) => p.values[i])]);
  }

  // Normal equations: (X'X) beta = X'y
  const xtx: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
  const xty: number[] = new Array(k).fill(0);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < k; a++) {
      xty[a] += X[i][a] * y[i];
      for (let b = 0; b < k; b++) xtx[a][b] += X[i][a] * X[i][b];
    }
  }

  const beta = solve(
    xtx.map((r) => [...r]),
    [...xty],
  );
  if (!beta) return null;

  // Residuals and the variance estimate.
  let sse = 0;
  const meanY = y.reduce((s, v) => s + v, 0) / n;
  let sst = 0;
  for (let i = 0; i < n; i++) {
    let fit = 0;
    for (let a = 0; a < k; a++) fit += beta[a] * X[i][a];
    sse += (y[i] - fit) ** 2;
    sst += (y[i] - meanY) ** 2;
  }
  const dof = n - k;
  const sigma2 = dof > 0 ? sse / dof : 0;

  const inv = invert(xtx);
  const names = ["intercept", ...predictors.map((p) => p.name)];
  const coefficients: Coefficient[] = beta.map((value, i) => {
    const variance = inv ? Math.max(0, sigma2 * inv[i][i]) : 0;
    const se = Math.sqrt(variance);
    return {
      name: names[i],
      value: Number(value.toFixed(5)),
      standardError: Number(se.toFixed(5)),
      t: Number((se > 0 ? value / se : 0).toFixed(3)),
    };
  });

  return {
    coefficients,
    n,
    rSquared: Number((sst > 0 ? 1 - sse / sst : 0).toFixed(4)),
    residualSd: Number(Math.sqrt(sigma2).toFixed(4)),
  };
}
