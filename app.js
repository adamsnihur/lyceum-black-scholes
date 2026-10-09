/**
 * Lyceum: Interaktywne Kompendium Wyceny Opcji Blacka-Scholesa
 * Moduł obliczeniowy, silnik Monte Carlo, solwer Newtona-Raphsona, Plotly charts i Quiz.
 */

// ==========================================
// 1. FUNDAMENTALNE FUNKCJE MATEMATYCZNE
// ==========================================

// Standardowa gęstość rozkładu normalnego n(x)
function normPdf(x) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

// Dystrybuanta standardowego rozkładu normalnego N(x)
// Aproksymacja wielomianowa Abramowitza i Steguna (dokładność 7.5e-8)
function normCdf(x) {
  if (x < -8.0) return 0.0;
  if (x > 8.0) return 1.0;

  const b1 = 0.319381530;
  const b2 = -0.356563782;
  const b3 = 1.781477937;
  const b4 = -1.821255978;
  const b5 = 1.330274429;
  const p = 0.2316419;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  const pdf = normPdf(absX);

  const poly = ((((b5 * t + b4) * t + b3) * t + b2) * t + b1) * t;
  const cdf = 1.0 - pdf * poly;

  return sign === -1 ? 1.0 - cdf : cdf;
}

// Transformacja Boxa-Mullera do generowania liczb z N(0, 1)
function randomNormal() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// Obliczenie parametrów d1 i d2
function calculateD1D2(S, K, T, r, sigma, q = 0) {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) {
    return { d1: 0, d2: 0 };
  }
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  return { d1, d2 };
}

// Analityczna wycena opcji Blacka-Scholesa-Mertona
function blackScholes(S, K, T, r, sigma, q = 0) {
  if (T <= 0.0001) {
    const callIntrinsic = Math.max(0, S - K);
    const putIntrinsic = Math.max(0, K - S);
    return {
      callPrice: callIntrinsic,
      putPrice: putIntrinsic,
      d1: 0,
      d2: 0,
      callDelta: S > K ? 1 : 0,
      putDelta: S < K ? -1 : 0,
      gamma: 0,
      vega: 0,
      callTheta: 0,
      putTheta: 0,
      callRho: 0,
      putRho: 0
    };
  }

  const { d1, d2 } = calculateD1D2(S, K, T, r, sigma, q);
  const exp_rT = Math.exp(-r * T);
  const exp_qT = Math.exp(-q * T);
  const sqrtT = Math.sqrt(T);
  const pdf_d1 = normPdf(d1);

  const callPrice = S * exp_qT * normCdf(d1) - K * exp_rT * normCdf(d2);
  const putPrice = K * exp_rT * normCdf(-d2) - S * exp_qT * normCdf(-d1);

  // Grecy
  const callDelta = exp_qT * normCdf(d1);
  const putDelta = exp_qT * (normCdf(d1) - 1.0);
  const gamma = (exp_qT * pdf_d1) / (S * sigma * sqrtT);
  const vega = S * exp_qT * sqrtT * pdf_d1 * 0.01; // za 1 p.p. zmiany sigma (1%)

  // Theta (dzienna = roczna / 365)
  const term1 = -(S * exp_qT * pdf_d1 * sigma) / (2 * sqrtT);
  const callThetaAnnual = term1 - r * K * exp_rT * normCdf(d2) + q * S * exp_qT * normCdf(d1);
  const putThetaAnnual = term1 + r * K * exp_rT * normCdf(-d2) - q * S * exp_qT * normCdf(-d1);

  const callTheta = callThetaAnnual / 365;
  const putTheta = putThetaAnnual / 365;

  // Rho (za 1 p.p. stopy r = 1%)
  const callRho = K * T * exp_rT * normCdf(d2) * 0.01;
  const putRho = -K * T * exp_rT * normCdf(-d2) * 0.01;

  return {
    callPrice: Math.max(0, callPrice),
    putPrice: Math.max(0, putPrice),
    d1,
    d2,
    callDelta,
    putDelta,
    gamma,
    vega,
    callTheta,
    putTheta,
    callRho,
    putRho
  };
}

// Solwer Zmienności Implikowanej Newtona-Raphsona
function impliedVolatilityNewton(targetPrice, S, K, T, r, isCall = true, maxIter = 50, tol = 1e-5) {
  let sigma = 0.3; // punkt startowy 30%
  const iterations = [];

  for (let i = 0; i < maxIter; i++) {
    const res = blackScholes(S, K, T, r, sigma);
    const price = isCall ? res.callPrice : res.putPrice;
    const diff = price - targetPrice;
    const vegaTotal = res.vega * 100; // raw vega (nie przeskalowane o 0.01)

    iterations.push({
      iter: i + 1,
      sigma: sigma,
      price: price,
      diff: diff,
      vega: vegaTotal
    });

    if (Math.abs(diff) < tol) {
      return { iv: sigma, converged: true, iterations };
    }

    if (vegaTotal < 1e-6) {
      break;
    }

    sigma = sigma - diff / vegaTotal;
    if (sigma <= 0.001) sigma = 0.001;
    if (sigma > 5.0) sigma = 5.0;
  }

  return { iv: sigma, converged: false, iterations };
}

// ==========================================
// 2. MODUŁ 1: MONTE CARLO CANVAS SIMULATOR
// ==========================================

const mcState = {
  S0: 100,
  mu: 0.08,
  sigma: 0.25,
  T: 1.0,
  K: 100,
  numPaths: 45,
  steps: 80,
  paths: [],
  animating: false,
  progress: 1.0
};

function generateMonteCarloPaths() {
  const dt = mcState.T / mcState.steps;
  const drift = (mcState.mu - 0.5 * mcState.sigma * mcState.sigma) * dt;
  const vol = mcState.sigma * Math.sqrt(dt);

  mcState.paths = [];
  for (let p = 0; p < mcState.numPaths; p++) {
    const path = [mcState.S0];
    let curr = mcState.S0;
    for (let s = 1; s <= mcState.steps; s++) {
      const z = randomNormal();
      curr = curr * Math.exp(drift + vol * z);
      path.push(curr);
    }
    mcState.paths.push(path);
  }
}

function renderMonteCarloPlot() {
  const plotDiv = document.getElementById("mcPlot");
  if (!plotDiv) return;
  if (typeof Plotly === "undefined") {
    setTimeout(renderMonteCarloPlot, 60);
    return;
  }

  const dt = mcState.T / mcState.steps;
  const timeArr = [];
  for (let s = 0; s <= mcState.steps; s++) {
    timeArr.push(s * dt);
  }

  // 1. Ścieżki Monte Carlo (wektorowe krzywe SVG)
  const traces = [];
  let itmCount = 0;
  let hasLegendITM = false;
  let hasLegendOTM = false;

  for (let p = 0; p < mcState.paths.length; p++) {
    const path = mcState.paths[p];
    const finalVal = path[path.length - 1];
    const isITM = finalVal >= mcState.K;
    if (isITM) itmCount++;

    const showInLegend = (isITM && !hasLegendITM) || (!isITM && !hasLegendOTM);
    if (isITM && !hasLegendITM) hasLegendITM = true;
    if (!isITM && !hasLegendOTM) hasLegendOTM = true;

    traces.push({
      x: timeArr,
      y: path,
      mode: "lines",
      name: isITM ? "Ścieżki ITM (W zysku)" : "Ścieżki OTM (Poza ceną)",
      showlegend: showInLegend,
      line: {
        color: isITM ? "rgba(5, 150, 105, 0.40)" : "rgba(225, 29, 72, 0.32)",
        width: 1.4
      },
      hoverinfo: "y+x",
      xaxis: "x",
      yaxis: "y"
    });
  }

  // 2. Teoretyczna ścieżka oczekiwana E[S_t] = S0 * exp(mu * t)
  const expectedPath = timeArr.map(t => mcState.S0 * Math.exp(mcState.mu * t));
  traces.push({
    x: timeArr,
    y: expectedPath,
    mode: "lines",
    name: "Średnia Teoretyczna E[S_t]",
    line: {
      color: "#0f172a",
      width: 2.2,
      dash: "dash"
    },
    xaxis: "x",
    yaxis: "y"
  });

  // 3. Rozkład Log-Normalny w czasie T (Prawa oś / Subplot 2)
  const mu_ln = Math.log(mcState.S0) + (mcState.mu - 0.5 * mcState.sigma * mcState.sigma) * mcState.T;
  const sigma_ln = mcState.sigma * Math.sqrt(mcState.T);

  // Zakres cenowy
  let allPrices = [mcState.S0, mcState.K];
  for (const p of mcState.paths) {
    allPrices.push(p[0], p[p.length - 1]);
  }
  const minPrice = Math.max(5, Math.min(...allPrices) * 0.7);
  const maxPrice = Math.max(...allPrices) * 1.25;

  const stepsDens = 120;
  const yOTM = [], xOTM = [];
  const yITM = [], xITM = [];

  for (let i = 0; i <= stepsDens; i++) {
    const s = minPrice + (i / stepsDens) * (maxPrice - minPrice);
    const z = (Math.log(s) - mu_ln) / sigma_ln;
    const density = (1.0 / (s * sigma_ln * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * z * z);

    if (s <= mcState.K) {
      yOTM.push(s);
      xOTM.push(density);
    } else {
      yITM.push(s);
      xITM.push(density);
    }
  }

  // Punkt graniczny Strike K dla ciągłości
  if (yOTM.length > 0 && yITM.length > 0) {
    const zK = (Math.log(mcState.K) - mu_ln) / sigma_ln;
    const densK = (1.0 / (mcState.K * sigma_ln * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * zK * zK);
    yOTM.push(mcState.K);
    xOTM.push(densK);
    yITM.unshift(mcState.K);
    xITM.unshift(densK);
  }

  // Trace OTM (rozkład)
  traces.push({
    x: xOTM,
    y: yOTM,
    mode: "lines",
    name: "Gęstość OTM (Strata)",
    fill: "tozerox",
    fillcolor: "rgba(225, 29, 72, 0.20)",
    line: { color: "#e11d48", width: 2 },
    xaxis: "x2",
    yaxis: "y2",
    hoverinfo: "y+x"
  });

  // Trace ITM (rozkład)
  traces.push({
    x: xITM,
    y: yITM,
    mode: "lines",
    name: "Gęstość ITM (Zysk Call)",
    fill: "tozerox",
    fillcolor: "rgba(5, 150, 105, 0.25)",
    line: { color: "#059669", width: 2 },
    xaxis: "x2",
    yaxis: "y2",
    hoverinfo: "y+x"
  });

  const layout = {
    title: false,
    margin: { t: 45, r: 25, b: 45, l: 60 },
    hovermode: "closest",
    legend: {
      orientation: "h",
      y: 1.16,
      x: 0,
      font: { family: "Plus Jakarta Sans", size: 10 }
    },
    xaxis: {
      domain: [0, 0.77],
      title: "Czas do wygaśnięcia t (Lata)",
      showgrid: true,
      gridcolor: "#f1f5f9",
      zeroline: false
    },
    xaxis2: {
      domain: [0.81, 1.0],
      title: "Rozkład p(S_T)",
      showgrid: true,
      gridcolor: "#f1f5f9",
      showticklabels: false,
      zeroline: false
    },
    yaxis: {
      title: "Cena aktywów bazowych S ($)",
      showgrid: true,
      gridcolor: "#f1f5f9",
      zeroline: false
    },
    yaxis2: {
      anchor: "x2",
      matches: "y",
      showticklabels: false,
      showgrid: true,
      gridcolor: "#f1f5f9",
      zeroline: false
    },
    shapes: [
      // Linia Strike K na lewym wykresie
      {
        type: "line",
        x0: 0,
        x1: mcState.T,
        y0: mcState.K,
        y1: mcState.K,
        xref: "x",
        yref: "y",
        line: { color: "#d97706", width: 2, dash: "dot" }
      },
      // Linia Strike K na prawym wykresie
      {
        type: "line",
        x0: 0,
        x1: 1,
        y0: mcState.K,
        y1: mcState.K,
        xref: "x2 domain",
        yref: "y2",
        line: { color: "#d97706", width: 2, dash: "dot" }
      }
    ],
    annotations: [
      {
        x: mcState.T * 0.03,
        y: mcState.K,
        xref: "x",
        yref: "y",
        text: "Strike K=" + mcState.K + " $",
        showarrow: false,
        yshift: 12,
        font: { color: "#d97706", size: 11, family: "JetBrains Mono", weight: "bold" },
        bgcolor: "rgba(255, 255, 255, 0.85)",
        bordercolor: "rgba(217, 119, 6, 0.3)",
        borderwidth: 1,
        borderpad: 3
      }
    ]
  };

  const config = { responsive: true, displayModeBar: false };
  Plotly.react(plotDiv, traces, layout, config);

  // Aktualizacja prawdopodobieństwa empirycznego vs analitycznego N(d2)
  const empProb = (itmCount / mcState.numPaths) * 100;
  const { d2 } = calculateD1D2(mcState.S0, mcState.K, mcState.T, mcState.mu, mcState.sigma);
  const anaProb = normCdf(d2) * 100;

  const elEmp = document.getElementById("mcValEmpirical");
  const elAna = document.getElementById("mcValAnalytical");
  if (elEmp) elEmp.innerText = empProb.toFixed(1) + "%";
  if (elAna) elAna.innerText = anaProb.toFixed(1) + "%";
}

function updateMonteCarlo() {
  mcState.S0 = parseFloat(document.getElementById("mcSliderS0").value);
  mcState.mu = parseFloat(document.getElementById("mcSliderMu").value);
  mcState.sigma = parseFloat(document.getElementById("mcSliderSigma").value);
  mcState.T = parseFloat(document.getElementById("mcSliderT").value);
  mcState.K = parseFloat(document.getElementById("mcSliderK").value);

  document.getElementById("mcValS0").innerText = mcState.S0 + " $";
  document.getElementById("mcValMu").innerText = (mcState.mu * 100).toFixed(0) + " %";
  document.getElementById("mcValSigma").innerText = (mcState.sigma * 100).toFixed(0) + " %";
  document.getElementById("mcValT").innerText = mcState.T.toFixed(2) + " lat";
  document.getElementById("mcValK").innerText = mcState.K + " $";

  generateMonteCarloPaths();

  let itmCount = 0;
  for (const p of mcState.paths) {
    if (p[p.length - 1] >= mcState.K) itmCount++;
  }
  const empProb = (itmCount / mcState.numPaths) * 100;
  const { d2 } = calculateD1D2(mcState.S0, mcState.K, mcState.T, mcState.mu, mcState.sigma);
  const anaProb = normCdf(d2) * 100;

  const elEmp = document.getElementById("mcValEmpirical");
  const elAna = document.getElementById("mcValAnalytical");
  if (elEmp) elEmp.innerText = empProb.toFixed(1) + "%";
  if (elAna) elAna.innerText = anaProb.toFixed(1) + "%";

  renderMonteCarloPlot();
}

// ==========================================
// 3. MODUŁ 3: PRICING LAB & CHARTS
// ==========================================

const labState = {
  S: 100,
  K: 100,
  T: 1.0,
  r: 0.05,
  sigma: 0.20,
  q: 0.00
};

function updatePricingLab() {
  labState.S = parseFloat(document.getElementById("labSliderS").value);
  labState.K = parseFloat(document.getElementById("labSliderK").value);
  labState.T = parseFloat(document.getElementById("labSliderT").value);
  labState.r = parseFloat(document.getElementById("labSliderR").value);
  labState.sigma = parseFloat(document.getElementById("labSliderSigma").value);

  document.getElementById("labValS").innerText = labState.S.toFixed(0) + " $";
  document.getElementById("labValK").innerText = labState.K.toFixed(0) + " $";
  document.getElementById("labValT").innerText = labState.T.toFixed(2) + " L (" + Math.round(labState.T * 365) + " dni)";
  document.getElementById("labValR").innerText = (labState.r * 100).toFixed(1) + " %";
  document.getElementById("labValSigma").innerText = (labState.sigma * 100).toFixed(0) + " %";

  const res = blackScholes(labState.S, labState.K, labState.T, labState.r, labState.sigma, labState.q);

  // Wartości wewnętrzne i czasowe
  const intrinsicCall = Math.max(0, labState.S - labState.K);
  const timeValCall = Math.max(0, res.callPrice - intrinsicCall);

  const intrinsicPut = Math.max(0, labState.K - labState.S);
  const timeValPut = Math.max(0, res.putPrice - intrinsicPut);

  // Put-Call Parity: C - P = S - K * exp(-r*T)
  const leftParity = res.callPrice - res.putPrice;
  const rightParity = labState.S - labState.K * Math.exp(-labState.r * labState.T);
  const parityDiscrepancy = Math.abs(leftParity - rightParity);

  // Aktualizacja DOM
  document.getElementById("kpiCallPrice").innerText = res.callPrice.toFixed(2) + " $";
  document.getElementById("kpiCallIntrinsic").innerText = intrinsicCall.toFixed(2) + " $";
  document.getElementById("kpiCallTimeVal").innerText = timeValCall.toFixed(2) + " $";

  document.getElementById("kpiPutPrice").innerText = res.putPrice.toFixed(2) + " $";
  document.getElementById("kpiPutIntrinsic").innerText = intrinsicPut.toFixed(2) + " $";
  document.getElementById("kpiPutTimeVal").innerText = timeValPut.toFixed(2) + " $";

  document.getElementById("kpiParityStatus").innerText = parityDiscrepancy < 0.001 ? "Zgodny (Brak arbitrażu)" : "Błąd parytetu";
  document.getElementById("kpiParityDiff").innerText = "Różnica: " + parityDiscrepancy.toFixed(6) + " $";

  const elSideDrift = document.getElementById("sidebarParityDrift"); if (elSideDrift) elSideDrift.innerText = parityDiscrepancy.toFixed(4) + " $";
  const elSideDelta = document.getElementById("sidebarDeltaRatio"); if (elSideDelta) elSideDelta.innerText = "Δ = " + res.callDelta.toFixed(3);
  const elMoneyness = document.getElementById("kpiMoneyness"); if (elMoneyness) elMoneyness.innerText = (labState.S / labState.K).toFixed(2);

  // Wykres Pricing Plotly
  renderPricingPlot(res);
  // Aktualizacja modułu Greków
  updateGreeksModule();
}

function renderPricingPlot(currentRes) {
  const plotDiv = document.getElementById("pricingPlot");
  if (!plotDiv) return;

  const minStock = Math.max(10, labState.K * 0.3);
  const maxStock = labState.K * 1.9;
  const steps = 100;
  const stockArr = [];
  const callBSArr = [];
  const callPayoffArr = [];
  const putBSArr = [];
  const putPayoffArr = [];

  for (let i = 0; i <= steps; i++) {
    const sVal = minStock + (i / steps) * (maxStock - minStock);
    stockArr.push(sVal);

    const b = blackScholes(sVal, labState.K, labState.T, labState.r, labState.sigma, labState.q);
    callBSArr.push(b.callPrice);
    callPayoffArr.push(Math.max(0, sVal - labState.K));
    putBSArr.push(b.putPrice);
    putPayoffArr.push(Math.max(0, labState.K - sVal));
  }

  const traceCallBS = {
    x: stockArr,
    y: callBSArr,
    mode: "lines",
    name: "Krzywa Call (BS t=0)",
    line: { color: "#2563eb", width: 3 }
  };

  const traceCallPayoff = {
    x: stockArr,
    y: callPayoffArr,
    mode: "lines",
    name: "Wypłata Call (t=T)",
    line: { color: "#93c5fd", width: 2, dash: "dot" }
  };

  const tracePutBS = {
    x: stockArr,
    y: putBSArr,
    mode: "lines",
    name: "Krzywa Put (BS t=0)",
    line: { color: "#e11d48", width: 3 }
  };

  const tracePutPayoff = {
    x: stockArr,
    y: putPayoffArr,
    mode: "lines",
    name: "Wypłata Put (t=T)",
    line: { color: "#fda4af", width: 2, dash: "dot" }
  };

  // Punkt bieżącej ceny S
  const traceCurrentCall = {
    x: [labState.S],
    y: [currentRes.callPrice],
    mode: "markers",
    name: "Bieżąca Call",
    marker: { color: "#1d4ed8", size: 10, symbol: "circle" }
  };

  const traceCurrentPut = {
    x: [labState.S],
    y: [currentRes.putPrice],
    mode: "markers",
    name: "Bieżąca Put",
    marker: { color: "#be123c", size: 10, symbol: "circle" }
  };

  const layout = {
    title: false,
    margin: { t: 25, r: 25, b: 45, l: 55 },
    xaxis: {
      title: "Cena aktywów bazowych S ($)",
      showgrid: true,
      gridcolor: "#f1f5f9",
      zeroline: false
    },
    yaxis: {
      title: "Cena opcji / Wypłata ($)",
      showgrid: true,
      gridcolor: "#f1f5f9",
      zeroline: false
    },
    hovermode: "x unified",
    legend: {
      orientation: "h",
      y: 1.15,
      x: 0
    },
    shapes: [
      {
        type: "line",
        x0: labState.K,
        x1: labState.K,
        y0: 0,
        y1: Math.max(...callBSArr) * 0.9,
        line: { color: "#d97706", width: 1.5, dash: "dash" }
      },
      {
        type: "line",
        x0: labState.S,
        x1: labState.S,
        y0: 0,
        y1: Math.max(currentRes.callPrice, currentRes.putPrice),
        line: { color: "#64748b", width: 1, dash: "dot" }
      }
    ],
    annotations: [
      {
        x: labState.K,
        y: Math.max(...callBSArr) * 0.85,
        text: "Strike K=" + labState.K,
        showarrow: false,
        font: { color: "#d97706", size: 11, family: "JetBrains Mono" }
      }
    ]
  };

  const config = { responsive: true, displayModeBar: false };
  Plotly.react(plotDiv, [traceCallBS, traceCallPayoff, tracePutBS, tracePutPayoff, traceCurrentCall, traceCurrentPut], layout, config);
}

// ==========================================
// 4. MODUŁ 4: GEOMETRIA GREKÓW
// ==========================================

let activeGreek = "delta";

function setGreekTab(greekName) {
  activeGreek = greekName;
  document.querySelectorAll(".greek-tab-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.greek === greekName);
  });
  updateGreeksModule();
}

function updateGreeksModule() {
  const plotDiv = document.getElementById("greeksPlot");
  if (!plotDiv) return;

  const currentRes = blackScholes(labState.S, labState.K, labState.T, labState.r, labState.sigma, labState.q);

  // Aktualizacja wskaźników numerycznych w kartach Greków (z null checks)
  const elDCall = document.getElementById("valGreekDeltaCall"); if (elDCall) elDCall.innerText = currentRes.callDelta.toFixed(3);
  const elDPut = document.getElementById("valGreekDeltaPut"); if (elDPut) elDPut.innerText = currentRes.putDelta.toFixed(3);
  const elGamma = document.getElementById("valGreekGamma"); if (elGamma) elGamma.innerText = currentRes.gamma.toFixed(4);
  const elVega = document.getElementById("valGreekVega"); if (elVega) elVega.innerText = (currentRes.vega).toFixed(3) + " $";
  const elTCall = document.getElementById("valGreekThetaCall"); if (elTCall) elTCall.innerText = currentRes.callTheta.toFixed(3) + " $/d";
  const elTPut = document.getElementById("valGreekThetaPut"); if (elTPut) elTPut.innerText = currentRes.putTheta.toFixed(3) + " $/d";
  const elRCall = document.getElementById("valGreekRhoCall"); if (elRCall) elRCall.innerText = currentRes.callRho.toFixed(3) + " $";
  const elRPut = document.getElementById("valGreekRhoPut"); if (elRPut) elRPut.innerText = currentRes.putRho.toFixed(3) + " $";

  // Obliczenie krzywych dla 3 różnych horyzontów czasowych (Gamma pin risk visualization!)
  const tenors = [
    { label: "Krótki (14 dni)", T: 14 / 365, color: "#e11d48" },
    { label: "Średni (60 dni)", T: 60 / 365, color: "#2563eb" },
    { label: "Bieżący T (" + Math.round(labState.T * 365) + " dni)", T: labState.T, color: "#059669" }
  ];

  const minStock = Math.max(10, labState.K * 0.4);
  const maxStock = labState.K * 1.8;
  const steps = 100;
  const stockArr = [];
  for (let i = 0; i <= steps; i++) {
    stockArr.push(minStock + (i / steps) * (maxStock - minStock));
  }

  const traces = [];

  for (const tenor of tenors) {
    const yVals = [];
    for (const s of stockArr) {
      const g = blackScholes(s, labState.K, tenor.T, labState.r, labState.sigma, labState.q);
      let val = 0;
      switch (activeGreek) {
        case "delta": val = g.callDelta; break;
        case "deltaPut": val = g.putDelta; break;
        case "gamma": val = g.gamma; break;
        case "vega": val = g.vega; break;
        case "theta": val = g.callTheta; break;
        case "rho": val = g.callRho; break;
      }
      yVals.push(val);
    }

    traces.push({
      x: stockArr,
      y: yVals,
      mode: "lines",
      name: tenor.label,
      line: { color: tenor.color, width: 2.5 }
    });
  }

  // Wskaźnik bieżącej ceny S
  let currVal = 0;
  switch (activeGreek) {
    case "delta": currVal = currentRes.callDelta; break;
    case "deltaPut": currVal = currentRes.putDelta; break;
    case "gamma": currVal = currentRes.gamma; break;
    case "vega": currVal = currentRes.vega; break;
    case "theta": currVal = currentRes.callTheta; break;
    case "rho": currVal = currentRes.callRho; break;
  }

  traces.push({
    x: [labState.S],
    y: [currVal],
    mode: "markers",
    name: "Bieżący punkt",
    marker: { color: "#0f172a", size: 10, symbol: "diamond" }
  });

  const greekTitles = {
    delta: "Delta (Δ Call) względem ceny akcji S",
    deltaPut: "Delta (Δ Put) względem ceny akcji S",
    gamma: "Gamma (Γ) - Przyspieszenie delty i szpilka Gamma Pin",
    vega: "Vega (ν) - Wrażliwość na 1 p.p. zmiany zmienności",
    theta: "Theta (Θ Call) - Dzienna erozja czasowa ($/dzień)",
    rho: "Rho (ρ Call) - Wrażliwość na 1 p.p. stopy procentowej"
  };

  const layout = {
    title: false,
    margin: { t: 25, r: 25, b: 45, l: 60 },
    xaxis: {
      title: "Cena instrumentu bazowego S ($)",
      showgrid: true,
      gridcolor: "#f1f5f9"
    },
    yaxis: {
      title: greekTitles[activeGreek] || activeGreek,
      showgrid: true,
      gridcolor: "#f1f5f9"
    },
    hovermode: "x unified",
    legend: {
      orientation: "h",
      y: 1.15,
      x: 0
    },
    shapes: [
      {
        type: "line",
        x0: labState.K,
        x1: labState.K,
        y0: 0,
        y1: Math.max(...traces[0].y) * 1.05,
        line: { color: "#d97706", width: 1.5, dash: "dash" }
      }
    ],
    annotations: [
      {
        x: labState.K,
        y: Math.max(...traces[0].y) * 0.95,
        text: "K=" + labState.K + " (ATM)",
        showarrow: false,
        font: { color: "#d97706", size: 11, family: "JetBrains Mono" }
      }
    ]
  };

  const config = { responsive: true, displayModeBar: false };
  Plotly.react(plotDiv, traces, layout, config);
}

// ==========================================
// 5. MODUŁ 5: ZMIENNOŚĆ IMPLIKOWANA & SMILE
// ==========================================

function solveImpliedVol() {
  const mktPrice = parseFloat(document.getElementById("ivInputPrice").value);
  const ivS = parseFloat(document.getElementById("ivInputS").value);
  const ivK = parseFloat(document.getElementById("ivInputK").value);
  const ivT = parseFloat(document.getElementById("ivInputT").value);
  const ivR = parseFloat(document.getElementById("ivInputR").value) / 100;
  const isCall = document.getElementById("ivSelectType").value === "call";

  const res = impliedVolatilityNewton(mktPrice, ivS, ivK, ivT, ivR, isCall);

  const resDiv = document.getElementById("ivResultText");
  const tableBody = document.getElementById("ivTableBody");

  if (res.converged) {
    resDiv.innerHTML = `<span class="text-emerald-600 font-bold">Zbieżność osiągnięta!</span> Obliczona Zmienność Implikowana: <strong class="text-emerald-700 text-lg font-mono">${(res.iv * 100).toFixed(2)}%</strong>`;
  } else {
    resDiv.innerHTML = `<span class="text-rose-600 font-bold">Brak pełnej zbieżności!</span> Ostatnie przybliżenie: <strong class="text-rose-700 font-mono">${(res.iv * 100).toFixed(2)}%</strong>`;
  }

  tableBody.innerHTML = "";
  for (const step of res.iterations) {
    const tr = document.createElement("tr");
    tr.className = "border-b border-slate-100 hover:bg-slate-50";
    tr.innerHTML = `
      <td class="py-1.5 px-3 font-mono text-slate-500">${step.iter}</td>
      <td class="py-1.5 px-3 font-mono font-semibold text-blue-600">${(step.sigma * 100).toFixed(3)}%</td>
      <td class="py-1.5 px-3 font-mono text-slate-700">${step.price.toFixed(3)} $</td>
      <td class="py-1.5 px-3 font-mono ${Math.abs(step.diff) < 0.01 ? 'text-emerald-600' : 'text-slate-500'}">${step.diff > 0 ? '+' : ''}${step.diff.toFixed(4)} $</td>
      <td class="py-1.5 px-3 font-mono text-slate-500">${step.vega.toFixed(3)}</td>
    `;
    tableBody.appendChild(tr);
  }

  renderVolatilitySmilePlot(ivK, res.iv);
}

function renderVolatilitySmilePlot(atmK, solvedIV) {
  const plotDiv = document.getElementById("volSmilePlot");
  if (!plotDiv) return;

  const strikes = [];
  const bsFlatIV = [];
  const mktSkewIV = [];

  const baseIV = solvedIV > 0 ? solvedIV * 100 : 20.0;

  for (let k = atmK * 0.7; k <= atmK * 1.3; k += atmK * 0.03) {
    strikes.push(k);
    bsFlatIV.push(baseIV);

    // Realistyczny Volatility Skew (rynkowa krzywa po 1987 r. - wyższa zmienność dla opcji OTM Put / niższych strików)
    const moneyness = Math.log(k / atmK);
    const skew = baseIV - 12.0 * moneyness + 8.0 * moneyness * moneyness;
    mktSkewIV.push(skew);
  }

  const traceFlat = {
    x: strikes,
    y: bsFlatIV,
    mode: "lines",
    name: "Założenie BS (Płaska zmienność)",
    line: { color: "#94a3b8", width: 2, dash: "dot" }
  };

  const traceSkew = {
    x: strikes,
    y: mktSkewIV,
    mode: "lines",
    name: "Rzeczywisty Uśmiech/Skew rynkowy",
    line: { color: "#7c3aed", width: 3 }
  };

  const layout = {
    title: false,
    margin: { t: 25, r: 25, b: 45, l: 55 },
    xaxis: { title: "Cena wykonania Strike K ($)", showgrid: true, gridcolor: "#f1f5f9" },
    yaxis: { title: "Zmienność Implikowana (%)", showgrid: true, gridcolor: "#f1f5f9" },
    legend: { orientation: "h", y: 1.15, x: 0 }
  };

  Plotly.react(plotDiv, [traceFlat, traceSkew], layout, { responsive: true, displayModeBar: false });
}

// ==========================================
// 6. MODUŁ 6: STRATEGIE OPCYJNE I P&L
// ==========================================

let activeStrategy = "straddle";

function setStrategy(stratName) {
  activeStrategy = stratName;
  document.querySelectorAll(".strat-tab-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.strat === stratName);
  });
  renderStrategyPL();
}

function renderStrategyPL() {
  const plotDiv = document.getElementById("strategyPlot");
  if (!plotDiv) return;

  const S = labState.S;
  const K = labState.K;
  const T = labState.T;
  const r = labState.r;
  const sigma = labState.sigma;

  const minStock = S * 0.4;
  const maxStock = S * 1.6;
  const steps = 120;
  const stockArr = [];
  const plExpiry = [];
  const plToday = [];

  // Koszt wejścia (premum paid / received w t=0)
  const bsATM = blackScholes(S, K, T, r, sigma);
  const bsOTMCall = blackScholes(S, K * 1.1, T, r, sigma);
  const bsOTMPut = blackScholes(S, K * 0.9, T, r, sigma);

  for (let i = 0; i <= steps; i++) {
    const s = minStock + (i / steps) * (maxStock - minStock);
    stockArr.push(s);

    let payExpiry = 0;
    let payToday = 0;

    const bS = blackScholes(s, K, T, r, sigma);
    const bS_OTM_C = blackScholes(s, K * 1.1, T, r, sigma);
    const bS_OTM_P = blackScholes(s, K * 0.9, T, r, sigma);

    switch (activeStrategy) {
      case "longCall":
        payExpiry = Math.max(0, s - K) - bsATM.callPrice;
        payToday = bS.callPrice - bsATM.callPrice;
        break;

      case "longPut":
        payExpiry = Math.max(0, K - s) - bsATM.putPrice;
        payToday = bS.putPrice - bsATM.putPrice;
        break;

      case "coveredCall":
        // Kupno akcji po cenie S + sprzedaż Call K
        payExpiry = (s - S) - (Math.max(0, s - K) - bsATM.callPrice);
        payToday = (s - S) - (bS.callPrice - bsATM.callPrice);
        break;

      case "protectivePut":
        // Akcja + Long Put
        payExpiry = (s - S) + (Math.max(0, K - s) - bsATM.putPrice);
        payToday = (s - S) + (bS.putPrice - bsATM.putPrice);
        break;

      case "straddle":
        // Stelaż: Long Call ATM + Long Put ATM
        const straddleCost = bsATM.callPrice + bsATM.putPrice;
        payExpiry = (Math.max(0, s - K) + Math.max(0, K - s)) - straddleCost;
        payToday = (bS.callPrice + bS.putPrice) - straddleCost;
        break;

      case "strangle":
        // Strumień: Long Call OTM (1.1K) + Long Put OTM (0.9K)
        const strangleCost = bsOTMCall.callPrice + bsOTMPut.putPrice;
        payExpiry = (Math.max(0, s - K * 1.1) + Math.max(0, K * 0.9 - s)) - strangleCost;
        payToday = (bS_OTM_C.callPrice + bS_OTM_P.putPrice) - strangleCost;
        break;

      case "bullCallSpread":
        // Long Call ATM - Short Call OTM (1.1K)
        const spreadCost = bsATM.callPrice - bsOTMCall.callPrice;
        payExpiry = (Math.max(0, s - K) - Math.max(0, s - K * 1.1)) - spreadCost;
        payToday = (bS.callPrice - bS_OTM_C.callPrice) - spreadCost;
        break;

      case "ironCondor":
        // Neutralna strategia sprzedaży spreadów
        const icCredit = (bsOTMPut.putPrice - blackScholes(S, K * 0.8, T, r, sigma).putPrice) +
                         (bsOTMCall.callPrice - blackScholes(S, K * 1.2, T, r, sigma).callPrice);
        const putWing = Math.max(0, K * 0.9 - s) - Math.max(0, K * 0.8 - s);
        const callWing = Math.max(0, s - K * 1.1) - Math.max(0, s - K * 1.2);
        payExpiry = icCredit - (putWing + callWing);
        const currPutWing = (bS_OTM_P.putPrice - blackScholes(s, K * 0.8, T, r, sigma).putPrice);
        const currCallWing = (bS_OTM_C.callPrice - blackScholes(s, K * 1.2, T, r, sigma).callPrice);
        payToday = icCredit - (currPutWing + currCallWing);
        break;
    }

    plExpiry.push(payExpiry);
    plToday.push(payToday);
  }

  const traceExpiry = {
    x: stockArr,
    y: plExpiry,
    mode: "lines",
    name: "P&L przy wygaśnięciu (t=T)",
    line: { color: "#0f172a", width: 2.5 }
  };

  const traceToday = {
    x: stockArr,
    y: plToday,
    mode: "lines",
    name: "P&L bieżący BS (t=0)",
    line: { color: "#2563eb", width: 2.5, dash: "dash" }
  };

  const layout = {
    title: false,
    margin: { t: 25, r: 25, b: 45, l: 55 },
    xaxis: { title: "Cena akcji S ($)", showgrid: true, gridcolor: "#f1f5f9" },
    yaxis: { title: "Zysk / Strata P&L ($)", showgrid: true, gridcolor: "#f1f5f9" },
    hovermode: "x unified",
    legend: { orientation: "h", y: 1.15, x: 0 },
    shapes: [
      {
        type: "line",
        x0: minStock,
        x1: maxStock,
        y0: 0,
        y1: 0,
        line: { color: "#94a3b8", width: 1.5 }
      },
      {
        type: "line",
        x0: S,
        x1: S,
        y0: Math.min(...plExpiry),
        y1: Math.max(...plExpiry),
        line: { color: "#64748b", width: 1, dash: "dot" }
      }
    ]
  };

  Plotly.react(plotDiv, [traceExpiry, traceToday], layout, { responsive: true, displayModeBar: false });
}

// ==========================================
// 7. MODUŁ 7: INTERAKTYWNY QUIZ PhD
// ==========================================

const quizData = [
  {
    question: "Co mierzy czynnik N(d₂) w klasycznej formule wyceny europejskiej opcji Call Blacka-Scholesa?",
    options: [
      "Współczynnik delta zabezpieczenia portfela akcjami (ilość akcji do kupienia).",
      "Prawdopodobieństwo wykonania opcji w świecie neutralnym względem ryzyka (Q).",
      "Rzeczywiste subiektywne prawdopodobieństwo zakończenia ceny powyżej Strike'a.",
      "Oczekiwaną stopę dywidendy zdyskontowaną do chwili obecnej."
    ],
    correct: 1,
    explanation: "W mierze neutralnej względem ryzyka Q, N(d₂) jest dokładnym prawdopodobieństwem zdarzenia S_T > K. Z kolei N(d₁) to współczynnik replikacji Delta (zdyskontowana oczekiwana wartość aktywów warunkowana wykonaniem podzielona przez bieżącą cenę S)."
  },
  {
    question: "Co dzieje się z Gammą (Γ) opcji At-The-Money (ATM), gdy czas do wygaśnięcia zbiega do zera (T → 0)?",
    options: [
      "Gamma maleje liniowo do zera, ponieważ opcja traci wartość czasową.",
      "Gamma stabilizuje się na stałym poziomie 0.5.",
      "Gamma dąży do nieskończoności (impuls Diraca przy S = K), powodując ekstremalny Gamma Pin Risk.",
      "Gamma staje się ujemna dla opcji Call i dodatnia dla opcji Put."
    ],
    correct: 2,
    explanation: "Dla opcji ATM (gdzie S ≈ K), mianownik Gammy zawiera człon pierwiastka z T. Gdy T → 0, mianownik dąży do 0, co sprawia, że Gamma eksploduje do nieskończoności. Delta przeskakuje skokowo z 0 na 1 przy najmniejszym ruchu ceny, co stwarza gigantyczne ryzyko dla animatorów rynku."
  },
  {
    question: "Dlaczego stopa oczekiwanego zwrotu z akcji (dryf μ) NIE występuje w równaniu różniczkowym Blacka-Scholesa ani we wzorze na wycenę?",
    options: [
      "Black i Scholes założyli dla uproszczenia, że rynek zawsze rośnie w tempie stopy wolnej od ryzyka.",
      "Dzięki ciągłemu dynamicznemu hedgingowi portfel Π = V - ΔS jest wolny od ryzyka, więc musi przynosić stopę r (brak arbitrażu).",
      "Dryf μ został skasowany przez podatek od zysków kapitałowych w modelu Mertona.",
      "Model Blacka-Scholesa ma zastosowanie wyłącznie do obligacji skarbowych."
    ],
    correct: 1,
    explanation: "To największy przełom Blacka, Scholesa i Mertona (Nagroda Nobla 1997). Przez dynamiczne dopasowywanie pozycji w akcjach (Δ = ∂V/∂S), ryzyko stochastyczne dW zostaje całkowicie wyeliminowane w czasie ciągłym. Portfel staje się lokalnie bezryzykowny i zgodnie z zasadą braku arbitrażu musi przynosić stopę r. Subiektywne prognozy inwestorów (μ) nie mają żadnego wpływu na wartość godziwą opcji."
  },
  {
    question: "Jaka jest relacja między Vegą europejskiej opcji Call a Vegą europejskiej opcji Put o identycznym striku K i terminie T?",
    options: [
      "Vega Call jest zawsze wyższa niż Vega Put o współczynnik dyskonta e^(-rT).",
      "Vega Call jest dodatnia, a Vega Put jest ujemna, ponieważ wzrost zmienności szkodzi spadkom.",
      "Vega opcji Call i Put jest dokładnie taka sama dla obu instrumentów.",
      "Vega Put wynosi zero, gdy stopy procentowe są wyższe niż 5%."
    ],
    correct: 2,
    explanation: "Zgodnie z parytetem Put-Call: C - P = S - K*e^(-rT). Ponieważ prawa strona równania (S - K*e^(-rT)) nie zależy od zmienności σ, pochodna po zmienności d/dσ(C - P) = 0, co dowodzi, że Vega(Call) = Vega(Put) = S*sqrt(T)*n(d₁)."
  },
  {
    question: "Czym charakteryzuje się zjawisko Volatility Skew / Smile obserwowane na rynkach akcji po krachu w październiku 1987 r.?",
    options: [
      "Zmienność implikowana jest stała dla wszystkich cen wykonania, dokładnie tak jak przewidywał model Blacka-Scholesa.",
      "Opcje OTM Put mają znacznie wyższą zmienność implikowaną niż opcje OTM Call ze względu na asymetrię awersji do nagłych krachów.",
      "Opcje OTM Call są systematycznie droższe, ponieważ rynki w długim terminie rosną.",
      "Zmienność implikowana staje się ujemna w przypadku głębokiego spadku indeksów."
    ],
    correct: 1,
    explanation: "Przed krachem 1987 roku krzywa IV była stosunkowo płaska. Po krachu inwestorzy zrozumieli, że rozkład stóp zwrotu ma grube lewe ogony (leptokurtoza). Wzrosło zapotrzebowanie na zabezpieczenia przed spadkami (crash phobia), co windowało ceny OTM Put i wywołało trwały lewostronny Skew zmienności."
  }
];

let quizScore = 0;
const answeredQuestions = new Set();

function initQuiz() {
  const container = document.getElementById("quizContainer");
  if (!container) return;

  container.innerHTML = "";
  quizScore = 0;
  answeredQuestions.clear();
  updateQuizScoreDisplay();

  quizData.forEach((q, qIdx) => {
    const card = document.createElement("div");
    card.className = "bg-white border border-slate-200 rounded-2xl p-6 shadow-sm";
    card.id = `quizCard_${qIdx}`;

    const qHeader = document.createElement("div");
    qHeader.className = "flex items-start gap-3 mb-4";
    qHeader.innerHTML = `
      <span class="w-7 h-7 rounded-full bg-blue-100 text-blue-700 font-bold text-sm flex items-center justify-center shrink-0">
        ${qIdx + 1}
      </span>
      <h4 class="text-base font-semibold text-slate-900 leading-snug">${q.question}</h4>
    `;
    card.appendChild(qHeader);

    const optsDiv = document.createElement("div");
    optsDiv.className = "space-y-2.5";

    q.options.forEach((optText, optIdx) => {
      const optBtn = document.createElement("div");
      optBtn.className = "quiz-opt";
      optBtn.id = `q_${qIdx}_opt_${optIdx}`;
      optBtn.innerHTML = `
        <span class="w-6 h-6 rounded-full border border-slate-300 text-slate-500 text-xs font-semibold flex items-center justify-center shrink-0">
          ${String.fromCharCode(65 + optIdx)}
        </span>
        <span class="text-sm text-slate-700">${optText}</span>
      `;
      optBtn.onclick = () => selectQuizAnswer(qIdx, optIdx);
      optsDiv.appendChild(optBtn);
    });

    card.appendChild(optsDiv);

    // Boks wyjaśnienia
    const expBox = document.createElement("div");
    expBox.id = `q_${qIdx}_exp`;
    expBox.className = "mt-4 p-4 rounded-xl text-xs leading-relaxed hidden";
    card.appendChild(expBox);

    container.appendChild(card);
  });
}

function selectQuizAnswer(qIdx, selectedOptIdx) {
  if (answeredQuestions.has(qIdx)) return;
  answeredQuestions.add(qIdx);

  const q = quizData[qIdx];
  const isCorrect = selectedOptIdx === q.correct;
  if (isCorrect) quizScore++;

  // Oznacz opcje
  q.options.forEach((_, optIdx) => {
    const el = document.getElementById(`q_${qIdx}_opt_${optIdx}`);
    if (!el) return;
    el.style.pointerEvents = "none";
    if (optIdx === q.correct) {
      el.classList.add("correct");
    } else if (optIdx === selectedOptIdx && !isCorrect) {
      el.classList.add("incorrect");
    }
  });

  // Pokaż wyjaśnienie
  const expBox = document.getElementById(`q_${qIdx}_exp`);
  if (expBox) {
    expBox.classList.remove("hidden");
    if (isCorrect) {
      expBox.className = "mt-4 p-4 rounded-xl text-xs leading-relaxed bg-emerald-50 border border-emerald-200 text-emerald-900";
      expBox.innerHTML = `<strong>Świetnie! Poprawna odpowiedź.</strong><br>${q.explanation}`;
    } else {
      expBox.className = "mt-4 p-4 rounded-xl text-xs leading-relaxed bg-rose-50 border border-rose-200 text-rose-900";
      expBox.innerHTML = `<strong>Błędna odpowiedź.</strong> Prawidłowa opcja to: <strong>${String.fromCharCode(65 + q.correct)}</strong>.<br>${q.explanation}`;
    }
  }

  updateQuizScoreDisplay();
}

function updateQuizScoreDisplay() {
  const scoreBadge = document.getElementById("quizScoreBadge");
  if (scoreBadge) {
    scoreBadge.innerText = `${quizScore} / ${quizData.length}`;
  }
}

// ==========================================
// 8. PYTHON KOD I FUNKCJE POMOCNICZE
// ==========================================

function copyPythonCode() {
  const codeEl = document.getElementById("pythonCodeSnippet");
  if (!codeEl) return;
  const text = codeEl.innerText;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById("btnCopyPython");
    if (btn) {
      const orig = btn.innerHTML;
      btn.innerHTML = `<span class="text-emerald-400">✓ Skopiowano!</span>`;
      setTimeout(() => { btn.innerHTML = orig; }, 2000);
    }
  });
}

// ==========================================
// 9. INICJALIZACJA CAŁEGO SYSTEMU
// ==========================================

window.addEventListener("DOMContentLoaded", () => {
  // KaTeX auto-render
  if (window.renderMathInElement) {
    renderMathInElement(document.body, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "\\[", right: "\\]", display: true },
        { left: "\\(", right: "\\)", display: false }
      ],
      ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code"],
      throwOnError: false
    });
  }

  let initialized = false;
  function startLyceum() {
    if (initialized) return;
    if (typeof Plotly === "undefined") {
      setTimeout(startLyceum, 40);
      return;
    }
    initialized = true;

    // 1. Monte Carlo Simulator Init
    updateMonteCarlo();

    // 2. Pricing Lab Init
    updatePricingLab();

    // 3. Volatility Smile Init
    solveImpliedVol();

    // 4. Strategy P&L Init
    renderStrategyPL();

    // 5. Quiz Init
    initQuiz();
  }

  startLyceum();

  // Resizing Plotly plots on window resize
  window.addEventListener("resize", () => {
    if (typeof Plotly !== "undefined") {
      Plotly.Plots.resize("pricingPlot");
      Plotly.Plots.resize("greeksPlot");
      Plotly.Plots.resize("volSmilePlot");
      Plotly.Plots.resize("strategyPlot");
      Plotly.Plots.resize("mcPlot");
    }
  });
});

// Immediate execution fallback if DOMContentLoaded already fired
if (document.readyState === "complete" || document.readyState === "interactive") {
  if (typeof updateMonteCarlo === "function") {
    setTimeout(() => {
      if (typeof Plotly !== "undefined") {
        updateMonteCarlo();
        updatePricingLab();
      }
    }, 100);
  }
}
