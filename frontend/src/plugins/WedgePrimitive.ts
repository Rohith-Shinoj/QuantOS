import type {
    ISeriesPrimitive,
    ISeriesPrimitivePaneRenderer,
    ISeriesPrimitivePaneView,
    SeriesAttachedParameter,
    Time,
    Logical,
} from 'lightweight-charts';
import type { GeometricPattern } from '../utils/QuantitativeEngine';

class WedgePaneRenderer implements ISeriesPrimitivePaneRenderer {
    private _patterns: GeometricPattern[];
    private _series: any;
    private _timeScale: any;

    constructor(patterns: GeometricPattern[], series: any, timeScale: any) {
        this._patterns = patterns;
        this._series = series;
        this._timeScale = timeScale;
    }

    draw(target: any) {
        target.useBitmapCoordinateSpace((scope: any) => {
            const ctx = scope.context;
            
            this._patterns.forEach(pattern => {
                const resistance = pattern.lines.find(l => l.type === 'resistance');
                const support = pattern.lines.find(l => l.type === 'support');
                
                if (!resistance || !support) return;

                const rP1X = this._timeScale.timeToCoordinate(resistance.p1.time);
                const rP2X = this._timeScale.timeToCoordinate(resistance.p2.time);
                const sP1X = this._timeScale.timeToCoordinate(support.p1.time);
                const sP2X = this._timeScale.timeToCoordinate(support.p2.time);

                const rP1Y = this._series.priceToCoordinate(resistance.p1.value);
                const rP2Y = this._series.priceToCoordinate(resistance.p2.value);
                const sP1Y = this._series.priceToCoordinate(support.p1.value);
                const sP2Y = this._series.priceToCoordinate(support.p2.value);

                if (rP1X === null || rP2X === null || sP1X === null || sP2X === null ||
                    rP1Y === null || rP2Y === null || sP1Y === null || sP2Y === null) {
                    return;
                }

                const pr = scope.horizontalPixelRatio;
                const vr = scope.verticalPixelRatio;

                // Shaded Polygon
                ctx.beginPath();
                ctx.moveTo(rP1X * pr, rP1Y * vr);
                ctx.lineTo(rP2X * pr, rP2Y * vr);
                ctx.lineTo(sP2X * pr, sP2Y * vr);
                ctx.lineTo(sP1X * pr, sP1Y * vr);
                ctx.closePath();

                const colorHex = pattern.color || '#ef4444'; // fallback to red
                // Simple hex to rgb converter
                const r = parseInt(colorHex.slice(1, 3), 16);
                const g = parseInt(colorHex.slice(3, 5), 16);
                const b = parseInt(colorHex.slice(5, 7), 16);
                
                ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.15)`; // Subtle tint
                ctx.fill();

                // Draw lines explicitly matching TradingView
                ctx.beginPath();
                ctx.lineWidth = 2;
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
                
                // Resistance
                ctx.moveTo(rP1X * pr, rP1Y * vr);
                ctx.lineTo(rP2X * pr, rP2Y * vr);
                ctx.stroke();

                // Support
                ctx.beginPath();
                ctx.moveTo(sP1X * pr, sP1Y * vr);
                ctx.lineTo(sP2X * pr, sP2Y * vr);
                ctx.stroke();

                // Draw extrapolated lines if they exist and extend beyond p2
                if (resistance.pExtrapolated && resistance.pExtrapolated.index > resistance.p2.index) {
                    const rExtrapX = this._timeScale.timeToCoordinate(resistance.pExtrapolated.time);
                    const rExtrapY = this._series.priceToCoordinate(resistance.pExtrapolated.value);
                    if (rExtrapX !== null && rExtrapY !== null) {
                        ctx.beginPath();
                        ctx.lineWidth = 1;
                        ctx.setLineDash([5, 5]);
                        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
                        ctx.moveTo(rP2X * pr, rP2Y * vr);
                        ctx.lineTo(rExtrapX * pr, rExtrapY * vr);
                        ctx.stroke();
                        ctx.setLineDash([]);
                    }
                }

                if (support.pExtrapolated && support.pExtrapolated.index > support.p2.index) {
                    const sExtrapX = this._timeScale.timeToCoordinate(support.pExtrapolated.time);
                    const sExtrapY = this._series.priceToCoordinate(support.pExtrapolated.value);
                    if (sExtrapX !== null && sExtrapY !== null) {
                        ctx.beginPath();
                        ctx.lineWidth = 1;
                        ctx.setLineDash([5, 5]);
                        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
                        ctx.moveTo(sP2X * pr, sP2Y * vr);
                        ctx.lineTo(sExtrapX * pr, sExtrapY * vr);
                        ctx.stroke();
                        ctx.setLineDash([]);
                    }
                }

                // Label
                const labelX = (rP1X + rP2X) / 2 * pr;
                const labelY = Math.max(rP1Y, sP1Y) * vr + 20; // Slightly below

                ctx.font = 'bold 12px sans-serif';
                const textWidth = ctx.measureText(pattern.name).width;
                const pad = 6;
                
                ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.8)`;
                ctx.fillRect(labelX - pad, labelY - 14 - pad, textWidth + pad * 2, 14 + pad * 2);
                
                ctx.fillStyle = '#ffffff';
                ctx.fillText(pattern.name, labelX, labelY);
            });
        });
    }

    zOrder() {
        return 'bottom'; 
    }
}

class WedgePaneView implements ISeriesPrimitivePaneView {
    private _renderer: WedgePaneRenderer;
    private _patterns: GeometricPattern[];
    private _series: any;
    private _timeScale: any;

    constructor(patterns: GeometricPattern[], series: any, timeScale: any) {
        this._patterns = patterns;
        this._series = series;
        this._timeScale = timeScale;
        this._renderer = new WedgePaneRenderer(this._patterns, this._series, this._timeScale);
    }

    update(patterns?: GeometricPattern[]) {
        if (patterns) {
            this._patterns = patterns;
        }
        this._renderer = new WedgePaneRenderer(this._patterns, this._series, this._timeScale);
    }

    renderer() {
        return this._renderer;
    }
}

export class WedgePrimitive implements ISeriesPrimitive<Time> {
    private _paneViews: WedgePaneView[] = [];
    private _patterns: GeometricPattern[] = [];
    private _chart: any = null;
    private _series: any = null;
    private _requestUpdate: (() => void) | null = null;

    constructor(patterns: GeometricPattern[]) {
        this._patterns = patterns;
    }

    attached({ chart, series, requestUpdate }: SeriesAttachedParameter<Time>) {
        this._chart = chart;
        this._series = series;
        this._requestUpdate = requestUpdate;
        
        const timeScale = chart.timeScale();
        this._paneViews = [new WedgePaneView(this._patterns, series, timeScale)];
        requestUpdate();
    }

    detached() {
        this._chart = null;
        this._series = null;
        this._paneViews = [];
    }

    paneViews() {
        return this._paneViews;
    }

    updateAllViews() {
        this._paneViews.forEach(pw => pw.update(this._patterns));
    }
    
    setPatterns(patterns: GeometricPattern[]) {
        this._patterns = patterns;
        this.updateAllViews();
        if (this._requestUpdate) {
            this._requestUpdate();
        }
    }
}
