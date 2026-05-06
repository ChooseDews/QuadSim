import {
  ColorType,
  CrosshairMode,
  LineSeries,
  LineStyle,
  createChart,
} from "lightweight-charts";

const COLORS = {
  green: "#10b981",
  cyan: "#38bdf8",
  amber: "#fbbf24",
  orange: "#fb923c",
  rose: "#f43f5e",
  violet: "#8b5cf6",
  white: "#f8fafc",
  grid: "rgba(148, 163, 184, 0.1)",
  axis: "#94a3b8",
  border: "#1e293b",
  panel: "#0f172a",
  muted: "#64748b",
};

export class PlotBoard {
  constructor({ onSelectionChange = null } = {}) {
    this.plots = [];
    this.dataset = null;
    this.syncingRange = false;
    this.syncingSelection = false;
    this.onSelectionChange = onSelectionChange;
  }

  setDataset(data) {
    this.dataset = data;
    this.destroy();

    const samples = data.samples;
    const plotDefs = [
      {
        elementId: "positionChart",
        title: "Position",
        series: [
          {
            label: "x",
            values: samples.map((sample) => sample.x),
            stroke: COLORS.cyan,
            format: (value) => `${value.toFixed(2)} m`,
          },
          {
            label: "y",
            values: samples.map((sample) => sample.y),
            stroke: COLORS.violet,
            format: (value) => `${value.toFixed(2)} m`,
          },
          {
            label: "z",
            values: samples.map((sample) => sample.z),
            stroke: COLORS.green,
            format: (value) => `${value.toFixed(2)} m`,
          },
          {
            label: "z target",
            values: samples.map((sample) => sample.altitude_target),
            stroke: COLORS.rose,
            lineStyle: LineStyle.Dashed,
            format: (value) => `${value.toFixed(2)} m`,
          },
        ],
      },
      {
        elementId: "attitudeChart",
        title: "Attitude",
        series: [
          {
            label: "roll",
            values: unwrapAngles(samples.map((sample) => radToDeg(sample.roll))),
            stroke: COLORS.cyan,
            format: (value) => `${value.toFixed(2)} deg`,
          },
          {
            label: "pitch",
            values: unwrapAngles(samples.map((sample) => radToDeg(sample.pitch))),
            stroke: COLORS.green,
            format: (value) => `${value.toFixed(2)} deg`,
          },
          {
            label: "yaw",
            values: unwrapAngles(samples.map((sample) => radToDeg(sample.yaw))),
            stroke: COLORS.violet,
            format: (value) => `${value.toFixed(2)} deg`,
          },
          {
            label: "roll target",
            values: unwrapAngles(samples.map((sample) => radToDeg(sample.roll_target))),
            stroke: COLORS.orange,
            lineStyle: LineStyle.Dashed,
            format: (value) => `${value.toFixed(2)} deg`,
          },
          {
            label: "pitch target",
            values: unwrapAngles(samples.map((sample) => radToDeg(sample.pitch_target))),
            stroke: COLORS.rose,
            lineStyle: LineStyle.Dashed,
            format: (value) => `${value.toFixed(2)} deg`,
          },
        ],
      },
      {
        elementId: "velocityChart",
        title: "Velocity",
        series: [
          {
            label: "vx",
            values: samples.map((sample) => sample.vx),
            stroke: COLORS.cyan,
            format: (value) => `${value.toFixed(2)} m/s`,
          },
          {
            label: "vy",
            values: samples.map((sample) => sample.vy),
            stroke: COLORS.violet,
            format: (value) => `${value.toFixed(2)} m/s`,
          },
          {
            label: "vz",
            values: samples.map((sample) => sample.vz),
            stroke: COLORS.green,
            format: (value) => `${value.toFixed(2)} m/s`,
          },
          {
            label: "speed",
            values: samples.map((sample) => sample.speed),
            stroke: COLORS.amber,
            format: (value) => `${value.toFixed(2)} m/s`,
          },
        ],
      },
      {
        elementId: "angularRateChart",
        title: "Angular Velocity",
        series: [
          {
            label: "p",
            values: samples.map((sample) => sample.p),
            stroke: COLORS.cyan,
            format: (value) => `${value.toFixed(2)} rad/s`,
          },
          {
            label: "q",
            values: samples.map((sample) => sample.q),
            stroke: COLORS.green,
            format: (value) => `${value.toFixed(2)} rad/s`,
          },
          {
            label: "r",
            values: samples.map((sample) => sample.r),
            stroke: COLORS.violet,
            format: (value) => `${value.toFixed(2)} rad/s`,
          },
        ],
      },
      {
        elementId: "accelerationChart",
        title: "Acceleration",
        series: [
          {
            label: "ax",
            values: samples.map((sample) => sample.ax),
            stroke: COLORS.cyan,
            format: (value) => `${value.toFixed(2)} m/s²`,
          },
          {
            label: "ay",
            values: samples.map((sample) => sample.ay),
            stroke: COLORS.violet,
            format: (value) => `${value.toFixed(2)} m/s²`,
          },
          {
            label: "az",
            values: samples.map((sample) => sample.az),
            stroke: COLORS.green,
            format: (value) => `${value.toFixed(2)} m/s²`,
          },
        ],
      },
      {
        elementId: "motorChart",
        title: "Motor Throttles",
        series: [
          {
            label: "m1",
            values: samples.map((sample) => sample.m1),
            stroke: COLORS.green,
            format: (value) => value.toFixed(3),
          },
          {
            label: "m2",
            values: samples.map((sample) => sample.m2),
            stroke: COLORS.cyan,
            format: (value) => value.toFixed(3),
          },
          {
            label: "m3",
            values: samples.map((sample) => sample.m3),
            stroke: COLORS.amber,
            format: (value) => value.toFixed(3),
          },
          {
            label: "m4",
            values: samples.map((sample) => sample.m4),
            stroke: COLORS.rose,
            format: (value) => value.toFixed(3),
          },
        ],
        fixedRange: { min: 0, max: 1 },
      },
    ];

    this.plots = plotDefs.map((definition, index) => new TelemetryPlot({
      element: document.getElementById(definition.elementId),
      title: definition.title,
      xValues: samples.map((sample) => sample.t),
      series: definition.series,
      fixedRange: definition.fixedRange ?? null,
      showTimeAxis: index === plotDefs.length - 1,
      onVisibleLogicalRangeChange: (range, source) => this.syncVisibleRange(source, range),
      onSelectionChange: (selectionIndex, source) => this.syncSelection(source, selectionIndex),
    }));

    const range = this.plots[0]?.fitContent();
    if (range) {
      this.syncVisibleRange(this.plots[0], range);
    }
    this.setSelection(samples.length - 1);
  }

  setSelection(index) {
    this.syncingSelection = true;
    for (const plot of this.plots) {
      plot.setSelection(index);
    }
    this.syncingSelection = false;
  }

  fitContent() {
    const range = this.plots[0]?.fitContent();
    if (range) {
      this.syncVisibleRange(this.plots[0], range);
    }
  }

  centerOnSelection(index) {
    if (!this.plots.length) {
      return;
    }

    const basePlot = this.plots[0];
    const currentRange = basePlot.getVisibleLogicalRange() ?? basePlot.fullLogicalRange();
    const span = Math.max((currentRange.to - currentRange.from) * 0.5, 20);
    const targetRange = {
      from: Math.max(-0.5, index - span * 0.5),
      to: Math.min(basePlot.fullLogicalRange().to, index + span * 0.5),
    };
    this.syncVisibleRange(basePlot, targetRange);
  }

  destroy() {
    for (const plot of this.plots) {
      plot.destroy();
    }
    this.plots = [];
  }

  syncVisibleRange(sourcePlot, range) {
    if (!range || this.syncingRange) {
      return;
    }

    this.syncingRange = true;
    for (const plot of this.plots) {
      if (plot !== sourcePlot) {
        plot.setVisibleLogicalRange(range);
      }
    }
    this.syncingRange = false;
  }

  syncSelection(sourcePlot, selectionIndex) {
    if (this.syncingSelection || selectionIndex == null) {
      return;
    }

    this.syncingSelection = true;
    for (const plot of this.plots) {
      if (plot !== sourcePlot) {
        plot.setSelection(selectionIndex);
      }
    }
    this.syncingSelection = false;
    this.onSelectionChange?.(selectionIndex);
  }
}

class TelemetryPlot {
  constructor({
    element,
    title,
    xValues,
    series,
    fixedRange,
    showTimeAxis,
    onVisibleLogicalRangeChange,
    onSelectionChange,
  }) {
    this.element = element;
    this.title = title;
    this.xValues = xValues;
    this.seriesDefs = series;
    this.fixedRange = fixedRange;
    this.showTimeAxis = showTimeAxis;
    this.onVisibleLogicalRangeChange = onVisibleLogicalRangeChange;
    this.onSelectionChange = onSelectionChange;
    this.selectionIndex = xValues.length - 1;
    this.chart = null;
    this.seriesApis = [];

    this.buildShell();
    this.createChart();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.element);
  }

  buildShell() {
    this.element.innerHTML = "";
    this.element.classList.add("lw-chart-host");

    this.header = document.createElement("div");
    this.header.className = "plot-header-compact";

    const title = document.createElement("span");
    title.className = "plot-title-compact";
    title.textContent = this.title;
    this.header.appendChild(title);

    this.legend = document.createElement("div");
    this.legend.className = "plot-legend-compact";
    this.legendItems = this.seriesDefs.map((entry) => {
      const item = document.createElement("span");
      item.className = "plot-legend-item-compact";
      item.innerHTML = `
        <span class="legend-label" style="color:${entry.stroke}">${entry.label}</span>
        <span class="legend-value"></span>
      `;
      this.legend.appendChild(item);
      return {
        root: item,
        value: item.querySelector(".legend-value"),
        format: entry.format ?? defaultFormatter,
      };
    });
    this.header.appendChild(this.legend);

    this.plotCanvas = document.createElement("div");
    this.plotCanvas.className = "plot-canvas-compact";

    this.element.appendChild(this.header);
    this.element.appendChild(this.plotCanvas);
  }

  createChart() {
    const tickFormatter = (time) => formatSeconds(this.timeToSeconds(time));
    const chart = createChart(this.plotCanvas, {
      width: Math.max(320, this.plotCanvas.clientWidth || 320),
      height: this.showTimeAxis ? 160 : 130,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: COLORS.axis,
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: 10,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: COLORS.grid },
        horzLines: { color: COLORS.grid },
      },
      rightPriceScale: {
        borderColor: COLORS.border,
        scaleMargins: { top: 0.1, bottom: this.showTimeAxis ? 0.2 : 0.05 },
        minimumWidth: 65,
      },
      leftPriceScale: {
        visible: false,
      },
      timeScale: {
        borderColor: COLORS.border,
        visible: this.showTimeAxis,
        timeVisible: false,
        secondsVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
        rightOffset: 0,
        barSpacing: 6,
        minimumHeight: this.showTimeAxis ? 20 : 0,
        tickMarkFormatter: tickFormatter,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "rgba(245, 251, 255, 0.24)",
          width: 1,
          style: LineStyle.Dotted,
          labelBackgroundColor: "#233140",
        },
        horzLine: {
          color: "rgba(245, 251, 255, 0.10)",
          width: 1,
          style: LineStyle.Dotted,
          labelBackgroundColor: "#233140",
        },
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: false,
        mouseWheel: true,
        pinch: true,
      },
      localization: {
        locale: "en-US",
      },
    });

    this.chart = chart;
    this.seriesApis = this.seriesDefs.map((entry) => {
      const seriesApi = chart.addSeries(LineSeries, {
        color: entry.stroke,
        lineWidth: 2,
        lineStyle: entry.lineStyle ?? LineStyle.Solid,
        crosshairMarkerVisible: false,
        lastValueVisible: false,
        priceLineVisible: false,
        autoscaleInfoProvider: this.fixedRange
          ? () => ({
              priceRange: {
                minValue: this.fixedRange.min,
                maxValue: this.fixedRange.max,
              },
            })
          : undefined,
      });
      seriesApi.setData(entry.values.map((value, index) => ({
        time: index,
        value,
      })));
      return seriesApi;
    });

    chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      this.onVisibleLogicalRangeChange?.(range, this);
    });
    chart.subscribeCrosshairMove((param) => {
      const pointIndex = this.selectionIndexFromCrosshair(param);
      if (pointIndex == null) {
        return;
      }
      this.setSelection(pointIndex, { suppressNotify: true });
      this.onSelectionChange?.(pointIndex, this);
    });
    this.plotCanvas.addEventListener("dblclick", () => {
      this.fitContent();
      this.onVisibleLogicalRangeChange?.(this.getVisibleLogicalRange(), this);
    });

    this.legendItems.forEach((item, index) => {
      item.root.style.cursor = "pointer";
      item.root.addEventListener("click", () => {
        const api = this.seriesApis[index];
        const def = this.seriesDefs[index];
        def.visible = def.visible === false ? true : false;
        api.applyOptions({ visible: def.visible });
        item.root.style.opacity = def.visible ? "1.0" : "0.4";
      });
    });

    this.updateLegend(this.selectionIndex);
  }

  fitContent() {
    const range = this.fullLogicalRange();
    this.chart.timeScale().setVisibleLogicalRange(range);
    return range;
  }

  setVisibleLogicalRange(range) {
    this.chart.timeScale().setVisibleLogicalRange(range);
  }

  getVisibleLogicalRange() {
    return this.chart.timeScale().getVisibleLogicalRange();
  }

  fullLogicalRange() {
    const lastIndex = Math.max(this.xValues.length - 1, 0);
    return {
      from: -0.5,
      to: lastIndex + 0.5,
    };
  }

  setSelection(index, { suppressNotify = false } = {}) {
    if (index == null || index < 0 || index >= this.xValues.length) {
      return;
    }

    this.selectionIndex = index;
    const time = index;
    const anchorValue = this.seriesDefs[0].values[index];
    if (anchorValue != null) {
      this.chart.setCrosshairPosition(anchorValue, time, this.seriesApis[0]);
    } else {
      this.chart.clearCrosshairPosition();
    }
    this.updateLegend(index);
    if (!suppressNotify) {
      this.onSelectionChange?.(index, this);
    }
  }

  updateLegend(index) {
    this.legendItems.forEach((item, seriesIndex) => {
      const value = this.seriesDefs[seriesIndex].values[index];
      item.value.textContent = value == null ? " -" : item.format(value);
    });
  }

  resize() {
    if (!this.chart) {
      return;
    }
    this.chart.applyOptions({
      width: Math.max(320, this.plotCanvas.clientWidth || 320),
    });
  }

  destroy() {
    this.resizeObserver?.disconnect();
    this.chart?.remove();
  }

  selectionIndexFromCrosshair(param) {
    const logical = param?.logical;
    if (logical == null) {
      return null;
    }
    const index = Math.round(logical);
    return Number.isFinite(index)
      ? Math.max(0, Math.min(this.xValues.length - 1, index))
      : null;
  }

  timeToSeconds(time) {
    if (typeof time === "number") {
      return this.xValues[Math.max(0, Math.min(this.xValues.length - 1, Math.round(time)))] ?? 0;
    }
    return 0;
  }
}

function formatSeconds(seconds) {
  if (seconds >= 100) {
    return `${seconds.toFixed(0)}s`;
  }
  if (seconds >= 10) {
    return `${seconds.toFixed(1)}s`;
  }
  return `${seconds.toFixed(2)}s`;
}

function defaultFormatter(value) {
  return Number(value).toFixed(2);
}

function radToDeg(value) {
  return (value * 180) / Math.PI;
}

function unwrapAngles(angles) {
  if (angles.length === 0) return angles;

  const unwrapped = [angles[0]];
  for (let i = 1; i < angles.length; i++) {
    let diff = angles[i] - angles[i - 1];

    // Detect jumps larger than 180 degrees
    while (diff > 180) {
      diff -= 360;
    }
    while (diff < -180) {
      diff += 360;
    }

    unwrapped[i] = unwrapped[i - 1] + diff;
  }

  return unwrapped;
}
