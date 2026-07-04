// QuantitativeEngine.ts
import type { Time } from 'lightweight-charts';

export interface OHLCV {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  value: number; // Volume
}

export interface Pivot {
  time: string;
  price: number;
  index: number;
}

export interface PatternLine {
  type: 'support' | 'resistance';
  p1: { time: string; value: number; index: number };
  p2: { time: string; value: number; index: number };
}

export interface GeometricPattern {
  name: string;
  lines: PatternLine[];
  status: 'FORMING' | 'REACHED';
  targetPrice?: number;
  showTargetInUI?: boolean;
  color?: string;
}

export interface TrendlineObject {
  id?: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  slope: number;
  type: 'support' | 'resistance' | 'divergence';
  inliers: number;
  method: 'RANSAC' | 'HOUGH' | 'USER' | 'RS_DIVERGENCE';
}

export function calculateATR(data: OHLCV[], period = 14): number[] {
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

export function calculateOBV(data: OHLCV[]): number[] {
  const obv = new Array(data.length).fill(0);
  if (data.length === 0) return obv;
  
  obv[0] = data[0].value;
  for (let i = 1; i < data.length; i++) {
    if (data[i].close > data[i - 1].close) {
      obv[i] = obv[i - 1] + data[i].value;
    } else if (data[i].close < data[i - 1].close) {
      obv[i] = obv[i - 1] - data[i].value;
    } else {
      obv[i] = obv[i - 1];
    }
  }
  return obv;
}

export function findSwingPivots(data: OHLCV[], n: number = 10) {
  const swingHighs: Pivot[] = [];
  const swingLows: Pivot[] = [];

  for (let i = n; i < data.length - n; i++) {
    const currentHigh = Math.max(data[i].open, data[i].close);
    const currentLow = Math.min(data[i].open, data[i].close);

    let isHigh = true;
    let isLow = true;

    for (let j = i - n; j <= i + n; j++) {
      if (i === j) continue;
      const jHigh = Math.max(data[j].open, data[j].close);
      const jLow = Math.min(data[j].open, data[j].close);
      if (jHigh >= currentHigh) isHigh = false;
      if (jLow <= currentLow) isLow = false;
    }

    if (isHigh) {
      swingHighs.push({ time: data[i].time, price: currentHigh, index: i });
    }
    if (isLow) {
      swingLows.push({ time: data[i].time, price: currentLow, index: i });
    }
  }

  return { swingHighs, swingLows };
}

export function detectGeometricPatterns(data: OHLCV[], swingHighs: Pivot[], swingLows: Pivot[]): GeometricPattern[] {
  const patterns: GeometricPattern[] = [];
  
  if (swingHighs.length < 3 || swingLows.length < 3) return patterns;

  const currentIndex = data.length - 1;
  const currentPrice = data[currentIndex].close;

  let lastWedgeEndIndex = -1;

  for (let i = 0; i < swingHighs.length - 1; i++) {
    const h1 = swingHighs[i];
    if (h1.index < lastWedgeEndIndex) continue;

    for (let j = i + 1; j < swingHighs.length; j++) {
      const h2 = swingHighs[j];
      if (h2.index - h1.index < 20 || h2.index - h1.index > 150) continue;

      let patternFound = false;
      for (let m = 0; m < swingLows.length - 1; m++) {
        const l1 = swingLows[m];
        if (l1.index < lastWedgeEndIndex) continue;

        for (let n = m + 1; n < swingLows.length; n++) {
          const l2 = swingLows[n];
          if (l2.index - l1.index < 20 || l2.index - l1.index > 150) continue;

          const start = Math.min(h1.index, l1.index);
          const end = Math.max(h2.index, l2.index);
          if (end - start > 150 || end - start < 20) continue;

          const overlapStart = Math.max(h1.index, l1.index);
          const overlapEnd = Math.min(h2.index, l2.index);
          if (overlapEnd - overlapStart < 10) continue;

          if (start < lastWedgeEndIndex) continue;

          // Use exact high/low for un-breakable bounds
          const h1y = data[h1.index].high;
          const h2y = data[h2.index].high;
          const l1y = data[l1.index].low;
          const l2y = data[l2.index].low;

          const rSlope = (h2y - h1y) / (h2.index - h1.index);
          const sSlope = (l2y - l1y) / (l2.index - l1.index);

          let isFallingWedge = false;
          let isRisingWedge = false;

          if (rSlope < 0 && sSlope < 0 && rSlope < sSlope) {
             isFallingWedge = true;
          } else if (rSlope > 0 && sSlope > 0 && sSlope > rSlope) {
             isRisingWedge = true;
          }

          if (!isFallingWedge && !isRisingWedge) continue;

          // Robust Convex Containment Check with Outlier Tolerance
          let isValid = true;
          let violationCount = 0;
          const totalCandles = end - start + 1;
          const maxAllowedViolations = Math.max(2, Math.floor(totalCandles * 0.05)); // 5% tolerance

          for (let k = start; k <= end; k++) {
            const rLine = h1y + rSlope * (k - h1.index);
            const sLine = l1y + sSlope * (k - l1.index);

            // Allow wicks to pierce slightly. We check the 'close' price for strict containment, 
            // and the 'high/low' for massive wicks.
            if (data[k].close > rLine * 1.005 || data[k].close < sLine * 0.995 || 
                data[k].high > rLine * 1.02 || data[k].low < sLine * 0.98) {
              
              violationCount++;
              
              // If a candle violently breaks the pattern (e.g. > 3%), it's invalidated
              if (data[k].close > rLine * 1.03 || data[k].close < sLine * 0.97) {
                 isValid = false;
                 break;
              }
            }

            if (violationCount > maxAllowedViolations) {
              isValid = false;
              break;
            }
          }

          if (!isValid) continue;

          let breakoutIndex = currentIndex;
          for (let k = end + 1; k <= currentIndex; k++) {
            const rLine = h1y + rSlope * (k - h1.index);
            const sLine = l1y + sSlope * (k - l1.index);
            if (data[k].close > rLine || data[k].close < sLine) {
              breakoutIndex = k;
              break;
            }
          }

          const rEnd = h1y + rSlope * (breakoutIndex - h1.index);
          const sEnd = l1y + sSlope * (breakoutIndex - l1.index);

          // Target is the height at the start of the pattern added to breakout
          const startR = h1y + rSlope * (start - h1.index);
          const startS = l1y + sSlope * (start - l1.index);
          const height = Math.abs(startR - startS);
          const targetPrice = isFallingWedge ? h2y + height : l2y - height;

          let hitTarget = false;
          let hitTargetIndex = -1;
          for (let k = breakoutIndex; k <= currentIndex; k++) {
            if (isFallingWedge && data[k].high >= targetPrice) {
               hitTarget = true;
               hitTargetIndex = k;
               break;
            }
            if (isRisingWedge && data[k].low <= targetPrice) {
               hitTarget = true;
               hitTargetIndex = k;
               break;
            }
          }

          const status = hitTarget ? 'REACHED' : 'FORMING';

          patterns.push({
            name: isFallingWedge ? 'Falling Wedge' : 'Rising Wedge',
            status,
            targetPrice,
            showTargetInUI: status === 'FORMING' || (currentIndex - breakoutIndex < 50) || (hitTarget && currentIndex - hitTargetIndex < 50),
            color: isFallingWedge ? '#10b981' : '#ef4444',
            lines: [
              {
                type: 'resistance',
                p1: { time: data[h1.index].time, value: h1y, index: h1.index },
                p2: { time: data[breakoutIndex].time, value: rEnd, index: breakoutIndex }
              },
              {
                type: 'support',
                p1: { time: data[l1.index].time, value: l1y, index: l1.index },
                p2: { time: data[breakoutIndex].time, value: sEnd, index: breakoutIndex }
              }
            ]
          });

          lastWedgeEndIndex = breakoutIndex;
          patternFound = true;
          break; // break n loop
        }
        if (patternFound) break; // break m loop
      }
      if (patternFound) break; // break j loop
    }
  }

  return patterns;
}

function calculateRSI(values: number[], period = 14): number[] {
  const rsi = new Array(values.length).fill(0);
  if (values.length <= period) return rsi;

  let sumGain = 0;
  let sumLoss = 0;

  for (let i = 1; i <= period; i++) {
    const change = values[i] - values[i - 1];
    if (change > 0) sumGain += change;
    else sumLoss -= change;
  }

  let avgGain = sumGain / period;
  let avgLoss = sumLoss / period;

  for (let i = period + 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + (change > 0 ? change : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (change < 0 ? -change : 0)) / period;
    
    if (avgLoss === 0) rsi[i] = 100;
    else {
      const rs = avgGain / avgLoss;
      rsi[i] = 100 - (100 / (1 + rs));
    }
  }
  return rsi;
}

export function calculateRSDivergence(data: OHLCV[], benchmarkData: OHLCV[] | null): TrendlineObject[] {
  const lines: TrendlineObject[] = [];
  if (!benchmarkData || benchmarkData.length === 0 || data.length < 50) return lines;

  // Align dates
  const benchmarkMap = new Map<string, number>();
  benchmarkData.forEach(b => benchmarkMap.set(b.time, b.close));

  const rsLine = new Array(data.length).fill(0);
  for (let i = 0; i < data.length; i++) {
    const benchClose = benchmarkMap.get(data[i].time);
    if (benchClose) {
      rsLine[i] = data[i].close / benchClose;
    } else {
      rsLine[i] = i > 0 ? rsLine[i - 1] : 1;
    }
  }

  const rsRSI = calculateRSI(rsLine, 14);
  
  // Find structural divergences
  // Simple algorithm: Look back 60 days for a higher high in price but lower high in RS RSI
  for (let i = 60; i < data.length; i++) {
    // Determine if i is a local peak in price
    const isPeak = data[i].high > data[i - 1].high && data[i].high > data[i - 2].high &&
                   data[i].high > data[i + 1]?.high && data[i].high > data[i + 2]?.high;
    
    if (isPeak) {
      // Find a previous peak within last 60 days
      for (let j = i - 10; j >= i - 60; j--) {
        if (j < 2) continue; // safety check
        const isPrevPeak = data[j].high > data[j - 1].high && data[j].high > data[j - 2].high &&
                           data[j].high > (data[j + 1]?.high ?? 0) && data[j].high > (data[j + 2]?.high ?? 0);
        
        if (isPrevPeak) {
          if (data[i].high > data[j].high && rsRSI[i] < rsRSI[j]) {
            // Price made higher high, but RS RSI made lower high -> Exhaustion Divergence
            const slope = (data[i].high - data[j].high) / (i - j);
            lines.push({
              startX: j,
              startY: data[j].high,
              endX: i,
              endY: data[i].high,
              slope: slope,
              type: 'divergence',
              inliers: 2,
              method: 'RS_DIVERGENCE'
            });
            break; // Only capture one divergence per peak
          }
        }
      }
    }
  }

  return lines;
}
