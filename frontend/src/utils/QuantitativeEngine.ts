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
  pExtrapolated?: { time: string; value: number; index: number };
}

export interface GeometricPattern {
  name: string;
  lines: PatternLine[];
  status: 'FORMING' | 'REACHED';
  targetPrice?: number;
  showTargetInUI?: boolean;
  color?: string;
  breakoutConfirmed?: boolean;
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
    const currentHigh = data[i].high;
    const currentLow = data[i].low;

    let isHigh = true;
    let isLow = true;

    for (let j = i - n; j <= i + n; j++) {
      if (i === j) continue;
      const jHigh = data[j].high;
      const jLow = data[j].low;
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

export function detectGeometricPatterns(data: OHLCV[], swingHighs: Pivot[], swingLows: Pivot[], atr: number[] = []): GeometricPattern[] {
  const patterns: GeometricPattern[] = [];
  
  if (swingHighs.length < 3 || swingLows.length < 3) return patterns;

  const currentIndex = data.length - 1;
  const currentPrice = data[currentIndex].close;

  const rawPatterns: GeometricPattern[] = [];
  const MAX_PIVOT_SKIP = 2;

  // Generate minor pivots (n=5) exclusively for the touch pool
  const { swingHighs: minorHighs, swingLows: minorLows } = findSwingPivots(data, 5);

  for (let i = 0; i < swingHighs.length - 1; i++) {
    for (let j = i + 1; j <= i + 1 + MAX_PIVOT_SKIP && j < swingHighs.length; j++) {
      const h1 = swingHighs[i];
      const h2 = swingHighs[j];
      if (h2.index - h1.index < 20 || h2.index - h1.index > 150) continue;

      for (let m = 0; m < swingLows.length - 1; m++) {
        for (let n = m + 1; n <= m + 1 + MAX_PIVOT_SKIP && n < swingLows.length; n++) {
          const l1 = swingLows[m];
          const l2 = swingLows[n];
          if (l2.index - l1.index < 20 || l2.index - l1.index > 150) continue;

          const start = Math.min(h1.index, l1.index);
          const end = Math.max(h2.index, l2.index);
          if (end - start > 150 || end - start < 20) continue;

          const overlapStart = Math.max(h1.index, l1.index);
          const overlapEnd = Math.min(h2.index, l2.index);
          if (overlapEnd - overlapStart < 10) continue;

          // Preceding Trend Requirement (>10% move in 50 candles before the wedge)
          const lookbackIndex = Math.max(0, start - 50);
          const lookbackPrice = data[lookbackIndex].close;
          const startPrice = data[start].close;
          const trendMove = Math.abs((startPrice - lookbackPrice) / lookbackPrice);
          if (trendMove < 0.10) continue;

          // Use exact high/low for un-breakable bounds
          const h1y = data[h1.index].high;
          const h2y = data[h2.index].high;
          const l1y = data[l1.index].low;
          const l2y = data[l2.index].low;

          const rSlope = (h2y - h1y) / (h2.index - h1.index);
          const sSlope = (l2y - l1y) / (l2.index - l1.index);

          let isFallingWedge = false;
          let isRisingWedge = false;

          // 1.5x Strict Convergence Multiplier to prevent Ascending Channels from being flagged
          if (rSlope < 0 && sSlope < 0 && rSlope < sSlope * 1.5) {
             isFallingWedge = true;
          } else if (rSlope > 0 && sSlope > 0 && sSlope > rSlope * 1.5) {
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

            // Dynamic ATR validation instead of rigid 3% boundaries
            const currentATR = (atr && atr.length > k) ? atr[k] : 0;
            const rTolerance = currentATR > 0 ? currentATR : rLine * 0.03;
            const sTolerance = currentATR > 0 ? currentATR : sLine * 0.03;
            
            // Allow wicks to pierce slightly.
            if (data[k].close > rLine + (rTolerance * 0.2) || data[k].close < sLine - (sTolerance * 0.2) || 
                data[k].high > rLine + (rTolerance * 0.7) || data[k].low < sLine - (sTolerance * 0.7)) {
              
              violationCount++;
              
              if (data[k].close > rLine + rTolerance || data[k].close < sLine - sTolerance) {
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

          // The True 2-Additional-Touch Rule (using minor pivots)
          let additionalTouches = 0;
          let backHalfTouch = false;
          const midPoint = (start + end) / 2;

          for (const h of minorHighs) {
              if (h.index >= start && h.index <= end) {
                  const expectedR = h1y + rSlope * (h.index - h1.index);
                  if (Math.abs(h.price - expectedR) / expectedR < 0.015) {
                      if (h.index !== h1.index && h.index !== h2.index) {
                          additionalTouches++;
                          if (h.index > midPoint) backHalfTouch = true;
                      }
                  }
              }
          }
          
          for (const l of minorLows) {
              if (l.index >= start && l.index <= end) {
                  const expectedS = l1y + sSlope * (l.index - l1.index);
                  if (Math.abs(l.price - expectedS) / expectedS < 0.015) {
                      if (l.index !== l1.index && l.index !== l2.index) {
                          additionalTouches++;
                          if (l.index > midPoint) backHalfTouch = true;
                      }
                  }
              }
          }

          // Must have at least 2 distinct touches beyond the 4 anchor points
          if (additionalTouches < 2) continue;
          
          // Pattern-wide back-half requirement (at least one touch anywhere in the back half)
          if (!backHalfTouch) continue;

          const rEnd = h1y + rSlope * (breakoutIndex - h1.index);
          const sEnd = l1y + sSlope * (breakoutIndex - l1.index);
          
          const rTrueEnd = h1y + rSlope * (end - h1.index);
          const sTrueEnd = l1y + sSlope * (end - l1.index);

          // Target is the height at the start of the pattern added to the true breakout point
          const startR = h1y + rSlope * (start - h1.index);
          const startS = l1y + sSlope * (start - l1.index);
          const height = Math.abs(startR - startS);
          
          const breakoutPrice = data[breakoutIndex].close;
          const targetPrice = isFallingWedge ? breakoutPrice + height : breakoutPrice - height;

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
          
          // If breakout is exactly today, flag is false (lower confidence live projection)
          const breakoutConfirmed = breakoutIndex < currentIndex;

          rawPatterns.push({
            name: isFallingWedge ? 'Falling Wedge' : 'Rising Wedge',
            status,
            targetPrice,
            showTargetInUI: status === 'FORMING' || (currentIndex - breakoutIndex < 50) || (hitTarget && currentIndex - hitTargetIndex < 50),
            color: isFallingWedge ? '#10b981' : '#ef4444',
            breakoutConfirmed,
            lines: [
              {
                type: 'resistance',
                p1: { time: data[h1.index].time, value: h1y, index: h1.index },
                p2: { time: data[end].time, value: rTrueEnd, index: end },
                pExtrapolated: { time: data[breakoutIndex].time, value: rEnd, index: breakoutIndex }
              },
              {
                type: 'support',
                p1: { time: data[l1.index].time, value: l1y, index: l1.index },
                p2: { time: data[end].time, value: sTrueEnd, index: end },
                pExtrapolated: { time: data[breakoutIndex].time, value: sEnd, index: breakoutIndex }
              }
            ]
          });
        }
      }
    }
  }

  // Filter overlapping patterns
  rawPatterns.sort((a, b) => {
     // Sort by duration descending (longest first)
     const aDur = a.lines[0].p2.index - a.lines[0].p1.index;
     const bDur = b.lines[0].p2.index - b.lines[0].p1.index;
     return bDur - aDur;
  });

  for (const p of rawPatterns) {
     const pStart = Math.min(p.lines[0].p1.index, p.lines[1].p1.index);
     const pEnd = p.lines[0].p2.index;
     
     let overlap = false;
     for (const kept of patterns) {
        const keptStart = Math.min(kept.lines[0].p1.index, kept.lines[1].p1.index);
        const keptEnd = kept.lines[0].p2.index;
        
        const overlapStart = Math.max(pStart, keptStart);
        const overlapEnd = Math.min(pEnd, keptEnd);
        
        if (overlapEnd > overlapStart) {
           const overlapLength = overlapEnd - overlapStart;
           const pLength = pEnd - pStart;
           if (overlapLength / pLength > 0.5) {
              overlap = true;
              break;
           }
        }
     }
     
     if (!overlap) {
        patterns.push(p);
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
  // Multi-year algorithm: Look back 250 days for a higher high in price but lower high in RS RSI
  for (let i = 250; i < data.length; i++) {
    // Determine if i is a local peak in price
    const isPeak = data[i].high > data[i - 1].high && data[i].high > data[i - 2].high &&
                   data[i].high > data[i + 1]?.high && data[i].high > data[i + 2]?.high;
    
    if (isPeak) {
      // Find a previous peak within last 250 days (secular exhaustion)
      for (let j = i - 10; j >= i - 250; j--) {
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
