// QuantitativeEngine.worker.ts
export interface OHLCV {
  time: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  value: number; // Volume
}

export interface TrendlineObject {
  id?: string;
  startX: number; // index in daily array or timestamp ms
  startY: number;
  endX: number;
  endY: number;
  slope: number;
  type: 'support' | 'resistance';
  inliers: number;
  method: 'RANSAC' | 'HOUGH' | 'USER';
}

// 1. ATR Calculation (Wilder's Smoothing)
function calculateATR(data: OHLCV[], period = 14): number[] {
  const atr = new Array(data.length).fill(0);
  if (data.length <= period) return atr;
  
  const tr = new Array(data.length).fill(0);
  for (let i = 1; i < data.length; i++) {
    const hl = data[i].high - data[i].low;
    const hc = Math.abs(data[i].high - data[i - 1].close);
    const lc = Math.abs(data[i].low - data[i - 1].close);
    tr[i] = Math.max(hl, hc, lc);
  }
  
  let sum = 0;
  for (let i = 1; i <= period; i++) sum += tr[i];
  atr[period] = sum / period;
  
  for (let i = period + 1; i < data.length; i++) {
    atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period;
  }
  return atr;
}

// 2. Multi-Timeframe Analysis (MTFA) Aggregation
function aggregateWeekly(data: OHLCV[]): { weekly: OHLCV[], mapToDaily: number[] } {
  const weekly: OHLCV[] = [];
  const mapToDaily: number[] = []; // maps weekly index -> last daily index in that week
  
  if (data.length === 0) return { weekly, mapToDaily };
  
  let currentWeekNum = -1;
  let wOpen = data[0].open;
  let wHigh = data[0].high;
  let wLow = data[0].low;
  let wVol = 0;
  
  // Basic ISO week approximation
  const getWeek = (dateStr: string) => {
    const d = new Date(dateStr);
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1)/7);
  };

  for (let i = 0; i < data.length; i++) {
    const d = data[i];
    const weekNum = getWeek(d.time);
    
    if (weekNum !== currentWeekNum) {
      if (currentWeekNum !== -1) {
        weekly.push({
          time: data[i-1].time,
          open: wOpen,
          high: wHigh,
          low: wLow,
          close: data[i-1].close,
          value: wVol
        });
        mapToDaily.push(i - 1);
      }
      currentWeekNum = weekNum;
      wOpen = d.open;
      wHigh = d.high;
      wLow = d.low;
      wVol = d.value;
    } else {
      wHigh = Math.max(wHigh, d.high);
      wLow = Math.min(wLow, d.low);
      wVol += d.value;
    }
  }
  
  weekly.push({
    time: data[data.length-1].time,
    open: wOpen,
    high: wHigh,
    low: wLow,
    close: data[data.length-1].close,
    value: wVol
  });
  mapToDaily.push(data.length - 1);
  
  return { weekly, mapToDaily };
}

// 3. PIP Extraction
function extractPIPs(data: OHLCV[], type: 'high' | 'low', maxPips: number): number[] {
  if (data.length < 3) return [0, data.length - 1];
  const pips = [0, data.length - 1];
  
  const getY = (i: number) => type === 'high' ? data[i].high : data[i].low;
  
  while (pips.length < maxPips && pips.length < data.length) {
    let maxDist = -1;
    let bestIndex = -1;
    let insertPos = -1;
    
    for (let i = 0; i < pips.length - 1; i++) {
      const p1 = pips[i];
      const p2 = pips[i + 1];
      const y1 = getY(p1);
      const y2 = getY(p2);
      
      for (let j = p1 + 1; j < p2; j++) {
        const yj = getY(j);
        const yLine = y1 + ((y2 - y1) / (p2 - p1)) * (j - p1);
        const dist = Math.abs(yj - yLine);
        
        if (dist > maxDist) {
          maxDist = dist;
          bestIndex = j;
          insertPos = i + 1;
        }
      }
    }
    
    if (bestIndex !== -1) {
      pips.splice(insertPos, 0, bestIndex);
    } else {
      break;
    }
  }
  return pips.sort((a, b) => a - b);
}

// 4. RANSAC Line Fitting
function runRANSAC(
  data: OHLCV[], 
  pipIndices: number[], 
  type: 'support' | 'resistance',
  iterations = 1000, 
  errorMarginPct = 0.005
): TrendlineObject | null {
  if (pipIndices.length < 3) return null;
  
  const getY = (i: number) => type === 'resistance' ? data[i].high : data[i].low;
  const pips = pipIndices.map(i => ({ x: i, y: getY(i) }));
  
  let bestInlierPoints: {x: number, y: number}[] = [];
  let maxInliers = 0;
  let bestLine: TrendlineObject | null = null;
  
  for (let i = 0; i < iterations; i++) {
    const idx1 = Math.floor(Math.random() * pips.length);
    let idx2 = Math.floor(Math.random() * pips.length);
    
    // Pick two points that are decently separated to avoid extreme unstable slopes
    if (idx1 === idx2 || Math.abs(pips[idx1].x - pips[idx2].x) < 10) continue;
    
    const p1 = pips[idx1];
    const p2 = pips[idx2];
    
    const slope = (p2.y - p1.y) / (p2.x - p1.x);
    const intercept = p1.y - slope * p1.x;
    
    let inliers = 0;
    const currentInliers = [];
    for (const p of pips) {
      const expectedY = slope * p.x + intercept;
      const margin = expectedY * errorMarginPct;
      if (Math.abs(p.y - expectedY) <= margin) {
        inliers++;
        currentInliers.push(p);
      }
    }
    
    if (inliers > maxInliers && inliers >= 3) {
      maxInliers = inliers;
      bestInlierPoints = currentInliers;
      
      currentInliers.sort((a,b) => a.x - b.x);
      const first = currentInliers[0];
      const last = currentInliers[currentInliers.length - 1];
      
      const finalSlope = (last.y - first.y) / (last.x - first.x);
      const finalIntercept = first.y - finalSlope * first.x;
      
      bestLine = {
        startX: first.x,
        startY: finalSlope * first.x + finalIntercept,
        endX: last.x,
        endY: finalSlope * last.x + finalIntercept,
        slope: finalSlope,
        type,
        inliers: maxInliers,
        method: 'RANSAC' as const
      };
    }
  }
  
  return bestLine;
}

// 5. Global Line Detection: Hough Transform
function runHoughTransform(
  data: OHLCV[], 
  pipIndices: number[], 
  type: 'support' | 'resistance'
): TrendlineObject | null {
  if (pipIndices.length < 3) return null;
  
  const getY = (i: number) => type === 'resistance' ? data[i].high : data[i].low;
  
  const minX = pipIndices[0];
  const maxX = pipIndices[pipIndices.length - 1];
  const rangeX = maxX - minX;
  if (rangeX === 0) return null;
  
  let minY = Infinity, maxY = -Infinity;
  pipIndices.forEach(i => {
    const y = getY(i);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  });
  const rangeY = maxY - minY;
  if (rangeY === 0) return null;

  const numThetas = 180;
  const thetas = Array.from({ length: numThetas }, (_, i) => (i * Math.PI) / numThetas);
  const maxRho = Math.sqrt(1 * 1 + 1 * 1);
  const rhoBins = 200;
  const accumulator = Array.from({ length: numThetas }, () => new Float32Array(rhoBins).fill(0));
  
  pipIndices.forEach(idx => {
    const nx = (idx - minX) / rangeX;
    const ny = (getY(idx) - minY) / rangeY;
    
    for (let t = 0; t < numThetas; t++) {
      const theta = thetas[t];
      const rho = nx * Math.cos(theta) + ny * Math.sin(theta);
      const rIdx = Math.floor(((rho + maxRho) / (2 * maxRho)) * (rhoBins - 1));
      if (rIdx >= 0 && rIdx < rhoBins) {
        accumulator[t][rIdx]++;
      }
    }
  });
  
  let maxVotes = 0;
  let bestT = 0;
  let bestR = 0;
  
  for (let t = 0; t < numThetas; t++) {
    for (let r = 0; r < rhoBins; r++) {
      if (accumulator[t][r] > maxVotes) {
        maxVotes = accumulator[t][r];
        bestT = t;
        bestR = r;
      }
    }
  }
  
  if (maxVotes >= 3) {
    const bestTheta = thetas[bestT];
    const bestRho = (bestR / (rhoBins - 1)) * (2 * maxRho) - maxRho;
    
    if (Math.abs(Math.sin(bestTheta)) > 0.01) {
      const calcY = (idx: number) => {
        const nx = (idx - minX) / rangeX;
        const ny = (bestRho - nx * Math.cos(bestTheta)) / Math.sin(bestTheta);
        return ny * rangeY + minY;
      };
      
      const currentInliers = [];
      for (const idx of pipIndices) {
         const expectedY = calcY(idx);
         if (Math.abs(getY(idx) - expectedY) <= expectedY * 0.01) {
            currentInliers.push({x: idx, y: getY(idx)});
         }
      }
      
      if (currentInliers.length >= 3) {
          currentInliers.sort((a,b) => a.x - b.x);
          const first = currentInliers[0];
          const last = currentInliers[currentInliers.length - 1];
          const finalSlope = (last.y - first.y) / (last.x - first.x);
          const finalIntercept = first.y - finalSlope * first.x;
          
          return {
            startX: first.x,
            startY: finalSlope * first.x + finalIntercept,
            endX: last.x,
            endY: finalSlope * last.x + finalIntercept,
            slope: finalSlope,
            type,
            inliers: currentInliers.length,
            method: 'HOUGH'
          };
      }
    }
  }
  return null;
}

// Worker message listener
self.addEventListener('message', (e: MessageEvent) => {
  const { action, data, maxPips = 20 } = e.data as { action: string, data: OHLCV[], maxPips?: number };
  
  if (action === 'PROCESS_TRENDS') {
    // 1. Calculate ATR & Volume MA & SMA
    const atr = calculateATR(data, 14);
    const volMA = new Array(data.length).fill(0);
    const sma20 = new Array(data.length).fill(0);
    
    let sumVol = 0;
    let sumClose = 0;
    for (let i = 0; i < data.length; i++) {
      sumVol += data[i].value;
      sumClose += data[i].close;
      if (i >= 20) {
        sumVol -= data[i-20].value;
        sumClose -= data[i-20].close;
      }
      volMA[i] = i >= 19 ? sumVol / 20 : sumVol / (i + 1);
      sma20[i] = i >= 19 ? sumClose / 20 : sumClose / (i + 1);
    }
    
    // 2. MTFA: Get weekly structural data
    const { weekly, mapToDaily } = aggregateWeekly(data);
    
    // 3. PIP Extraction on primary trend (Weekly)
    const weeklyHighPips = extractPIPs(weekly, 'high', 30);
    const weeklyLowPips = extractPIPs(weekly, 'low', 30);
    
    const dailyHighPips = weeklyHighPips.map(wi => mapToDaily[wi]);
    const dailyLowPips = weeklyLowPips.map(wi => mapToDaily[wi]);
    
    const dailySecHighPips = extractPIPs(data, 'high', 50);
    const dailySecLowPips = extractPIPs(data, 'low', 50);
    
    const rawLines: TrendlineObject[] = [];
    
    // 4. RANSAC and Hough on Primary & Secondary
    const rResPrimary = runRANSAC(data, dailyHighPips, 'resistance');
    if (rResPrimary) rawLines.push(rResPrimary);
    const rSupPrimary = runRANSAC(data, dailyLowPips, 'support');
    if (rSupPrimary) rawLines.push(rSupPrimary);
    const hResPrimary = runHoughTransform(data, dailyHighPips, 'resistance');
    if (hResPrimary) rawLines.push(hResPrimary);
    const hSupPrimary = runHoughTransform(data, dailyLowPips, 'support');
    if (hSupPrimary) rawLines.push(hSupPrimary);
    
    const rResSec = runRANSAC(data, dailySecHighPips, 'resistance');
    if (rResSec) rawLines.push(rResSec);
    const rSupSec = runRANSAC(data, dailySecLowPips, 'support');
    if (rSupSec) rawLines.push(rSupSec);
    
    // 5. Line Clustering/Pruning
    const lines: TrendlineObject[] = [];
    rawLines.forEach(line => {
      const isSimilar = lines.find(l => {
        const slopeDiff = Math.abs(l.slope - line.slope);
        const yInt1 = l.startY - l.slope * l.startX;
        const yInt2 = line.startY - line.slope * line.startX;
        // Evaluate y-diff at current index (end of chart)
        const yEnd1 = l.slope * data.length + yInt1;
        const yEnd2 = line.slope * data.length + yInt2;
        const endDiff = Math.abs(yEnd1 - yEnd2) / yEnd1;
        
        return slopeDiff < 0.01 && endDiff < 0.05; // 5% diff at end
      });
      
      if (!isSimilar) {
        lines.push(line);
      } else if (line.inliers > isSimilar.inliers) {
        Object.assign(isSimilar, line);
      }
    });

    // 6. Pattern Detection
    const patterns: any[] = [];
    
    for (let i = 1; i < data.length; i++) {
      const d = data[i];
      const prev = data[i-1];
      const body = Math.abs(d.close - d.open);
      const totalRange = d.high - d.low;
      const currentAtr = atr[i] || 0;
      
      // Volatility Gate
      if (totalRange <= 1.0 * currentAtr) continue;
      
      // Volume Confirmation
      if (d.value <= 1.0 * volMA[i]) continue;
      
      let pattern = '';
      let color = '';
      let shape = '';
      let position = '';
      
      const isDowntrend = sma20[i] < sma20[Math.max(0, i - 5)];
      const isUptrend = sma20[i] > sma20[Math.max(0, i - 5)];
      
      // Bullish Engulfing
      if (isDowntrend && prev.close < prev.open && d.close > d.open && d.open <= prev.close && d.close >= prev.open) {
        pattern = 'Bull Engulf'; color = '#10b981'; shape = 'arrowUp'; position = 'belowBar';
      }
      // Bearish Engulfing
      else if (isUptrend && prev.close > prev.open && d.close < d.open && d.open >= prev.close && d.close <= prev.open) {
        pattern = 'Bear Engulf'; color = '#ef4444'; shape = 'arrowDown'; position = 'aboveBar';
      }
      // Hammer
      else if (isDowntrend && totalRange > 0 && body / totalRange < 0.3 && (d.close - d.low) / totalRange > 0.6) {
        pattern = 'Hammer'; color = '#eab308'; shape = 'arrowUp'; position = 'belowBar';
      }
      // Shooting Star
      else if (isUptrend && totalRange > 0 && body / totalRange < 0.3 && (d.high - d.close) / totalRange > 0.6) {
        pattern = 'Shoot Star'; color = '#eab308'; shape = 'arrowDown'; position = 'aboveBar';
      }
      
      if (!pattern) continue;
      
      // Structural Intersection
      let intersects = false;
      for (const line of lines) {
         const expectedY = line.slope * i + (line.startY - line.slope * line.startX);
         const margin = expectedY * 0.01; 
         if (Math.abs(d.close - expectedY) <= margin || Math.abs(d.high - expectedY) <= margin || Math.abs(d.low - expectedY) <= margin) {
             intersects = true;
             break;
         }
      }
      
      if (intersects) {
          patterns.push({ time: d.time, position, color, shape, text: pattern });
      }
    }
    
    // Return payload
    self.postMessage({
      status: 'SUCCESS',
      lines,
      atr,
      patterns
    });
  }
});
