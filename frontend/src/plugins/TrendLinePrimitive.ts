import type {
    ISeriesPrimitive,
    ISeriesPrimitivePaneRenderer,
    ISeriesPrimitivePaneView,
    SeriesAttachedParameter,
    Time,
    Coordinate,
    Logical,
} from 'lightweight-charts';
import type { TrendlineObject } from '../workers/QuantitativeEngine.worker';

class TrendLinePaneRenderer implements ISeriesPrimitivePaneRenderer {
    private _lines: TrendlineObject[];
    private _series: any;
    private _timeScale: any;
    private _selectedLineId: string | null;

    constructor(lines: TrendlineObject[], series: any, timeScale: any, selectedLineId: string | null) {
        this._lines = lines;
        this._series = series;
        this._timeScale = timeScale;
        this._selectedLineId = selectedLineId;
    }

    draw(target: any) {
        target.useBitmapCoordinateSpace((scope: any) => {
            const ctx = scope.context;
            
            const visibleRange = this._timeScale.getVisibleLogicalRange();
            if (!visibleRange) return;

            const visibleLogicalStart = visibleRange.from;
            const visibleLogicalEnd = visibleRange.to;

            this._lines.forEach(line => {
                let drawLogicalStart = Math.min(line.startX, line.endX);
                // Algorithmic lines project to the right edge. User lines stop at endX.
                let drawLogicalEnd = line.method === 'USER' ? Math.max(line.startX, line.endX) : Math.max(line.endX, visibleLogicalEnd);
                
                // If the line is completely out of bounds to the left or right, skip
                if (drawLogicalEnd < visibleLogicalStart || drawLogicalStart > visibleLogicalEnd) return;
                
                // Clip to visible logical range to avoid null coordinates from lightweight-charts
                const clipStart = Math.max(drawLogicalStart, visibleLogicalStart);
                const clipEnd = Math.min(drawLogicalEnd, visibleLogicalEnd);
                
                if (clipStart >= clipEnd) return;
                
                const intercept = line.startY - line.slope * line.startX;
                const priceStart = line.slope * clipStart + intercept;
                const priceEnd = line.slope * clipEnd + intercept;
                
                const startCoordX = this._timeScale.logicalToCoordinate(clipStart as unknown as Logical);
                const endCoordX = this._timeScale.logicalToCoordinate(clipEnd as unknown as Logical);
                const startCoordY = this._series.priceToCoordinate(priceStart);
                const endCoordY = this._series.priceToCoordinate(priceEnd);
                
                if (startCoordX === null || endCoordX === null || startCoordY === null || endCoordY === null) return;
                
                const physicalStartX = startCoordX * scope.horizontalPixelRatio;
                const physicalStartY = startCoordY * scope.verticalPixelRatio;
                const physicalEndX = endCoordX * scope.horizontalPixelRatio;
                const physicalEndY = endCoordY * scope.verticalPixelRatio;

                const isSelected = this._selectedLineId && line.id === this._selectedLineId;

                ctx.beginPath();
                if (line.method === 'USER') {
                    ctx.setLineDash([]);
                    ctx.lineWidth = isSelected ? 4 : 2;
                    ctx.strokeStyle = line.type === 'support' ? 'rgba(59, 130, 246, 0.9)' : 'rgba(168, 85, 247, 0.9)'; // Blue/Purple for user
                } else if (line.method === 'HOUGH') {
                    ctx.setLineDash([5, 5]);
                    ctx.lineWidth = isSelected ? 3 : 2;
                    ctx.strokeStyle = line.type === 'support' ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)';
                } else {
                    ctx.setLineDash([2, 4]);
                    ctx.lineWidth = isSelected ? 2 : 1;
                    ctx.strokeStyle = line.type === 'support' ? 'rgba(16, 185, 129, 0.7)' : 'rgba(239, 68, 68, 0.7)';
                }
                
                ctx.moveTo(physicalStartX, physicalStartY);
                ctx.lineTo(physicalEndX, physicalEndY);
                ctx.stroke();

                // Draw grab handles if selected
                if (isSelected) {
                    const radius = 6;
                    ctx.fillStyle = '#111827'; // Dark background inside bubble

                    // Start handle
                    ctx.beginPath();
                    ctx.arc(physicalStartX, physicalStartY, radius, 0, 2 * Math.PI);
                    ctx.fill();
                    ctx.stroke();

                    // End handle
                    ctx.beginPath();
                    ctx.arc(physicalEndX, physicalEndY, radius, 0, 2 * Math.PI);
                    ctx.fill();
                    ctx.stroke();
                }
            });
        });
    }

    zOrder() {
        return 'normal'; 
    }
}

class TrendLinePaneView implements ISeriesPrimitivePaneView {
    private _renderer: TrendLinePaneRenderer;
    private _lines: TrendlineObject[];
    private _series: any;
    private _timeScale: any;
    private _selectedLineId: string | null;

    constructor(lines: TrendlineObject[], series: any, timeScale: any, selectedLineId: string | null) {
        this._lines = lines;
        this._series = series;
        this._timeScale = timeScale;
        this._selectedLineId = selectedLineId;
        this._renderer = new TrendLinePaneRenderer(this._lines, this._series, this._timeScale, this._selectedLineId);
    }

    update(lines?: TrendlineObject[], selectedLineId?: string | null) {
        if (lines) {
            this._lines = lines;
        }
        if (selectedLineId !== undefined) {
            this._selectedLineId = selectedLineId;
        }
        this._renderer = new TrendLinePaneRenderer(this._lines, this._series, this._timeScale, this._selectedLineId);
    }

    renderer() {
        return this._renderer;
    }
}

export class TrendLinePrimitive implements ISeriesPrimitive<Time> {
    private _paneViews: TrendLinePaneView[] = [];
    private _lines: TrendlineObject[] = [];
    private _chart: any = null;
    private _series: any = null;
    private _requestUpdate: (() => void) | null = null;
    private _selectedLineId: string | null = null;

    constructor(lines: TrendlineObject[]) {
        this._lines = lines;
    }

    attached({ chart, series, requestUpdate }: SeriesAttachedParameter<Time>) {
        this._chart = chart;
        this._series = series;
        this._requestUpdate = requestUpdate;
        
        const timeScale = chart.timeScale();
        
        this._paneViews = [new TrendLinePaneView(this._lines, series, timeScale, this._selectedLineId)];
        
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
        this._paneViews.forEach(pw => pw.update(this._lines, this._selectedLineId));
    }
    
    setLines(lines: TrendlineObject[]) {
        this._lines = lines;
        this.updateAllViews();
        if (this._requestUpdate) {
            this._requestUpdate();
        }
    }
    
    setSelectedLineId(id: string | null) {
        this._selectedLineId = id;
        this.updateAllViews();
        if (this._requestUpdate) {
            this._requestUpdate();
        }
    }
}
