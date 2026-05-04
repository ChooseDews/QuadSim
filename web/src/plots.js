import {
  ColorType,
  CrosshairMode,
  LineSeries,
  LineStyle,
  createChart,
} from "lightweight-charts";

const COLORS = {
  green: "#58f0a7",
  cyan: "#54b7ff",
  amber: "#ffcf70",
  orange: "#ff8a5b",
  rose: "#ff6c87",
  violet: "#9c89ff",
  white: "#f5fbff",
  grid: "rgba(129, 161, 193, 0.14)",
  axis: "#8ea2b6",
  border: "#1a222c",
  panel: "#090d12",
  muted: "#7d8a98",
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
            values: samples.map((sample) => radToDeg(sample.roll)),
            stroke: COLORS.cyan,
            format: (value) => `${value.toFixed(2)} deg`,
          },
          {
            label: "pitch track",
            values: samples.map((sample) => radToDeg(sample.pitch_unwrapped)),
            stroke: COLORS.green,
            format: (value) => `${value.toFixed(2)} deg`,
          },
          {
            label: "yaw",
            values: samples.map((sample) => radToDeg(sample.yaw)),
            stroke: COLORS.violet,
            format: (value) => `${value.toFixed(2)} deg`,
          },
          {
            label: "roll target",
            values: samples.map((sample) => radToDeg(sample.roll_target)),
            stroke: COLORS.orange,
            lineStyle: LineStyle.Dashed,
            format: (value) => `${value.toFixed(2)} deg`,
          },
          {
            label: "pitch target",
            values: samples.map((sample) => radToDeg(sample.pitch_target)),
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
      {
        elementId: "powerChart",
        title: "Power",
        series: [
          {
            label: "total",
            values: samples.map((sample) => sample.power_total_w),
            stroke: COLORS.amber,
            format: (value) => `${value.toFixed(0)} W`,
          },
          {
            label: "m1",
            values: samples.map((sample) => sample.power_m1_w),
            stroke: COLORS.green,
            format: (value) => `${value.toFixed(0)} W`,
          },
          {
            label: "m2",
            values: samples.map((sample) => sample.power_m2_w),
            stroke: COLORS.cyan,
            format: (value) => `${value.toFixed(0)} W`,
          },
          {
            label: "m3",
            values: samples.map((sample) => sample.power_m3_w),
            stroke: COLORS.violet,
            format: (value) => `${value.toFixed(0)} W`,
          },
          {
            label: "m4",
            values: samples.map((sample) => sample.power_m4_w),
            stroke: COLORS.rose,
            format: (value) => `${value.toFixed(0)} W`,
          },
        ],
      },
      {
        elementId: "currentChart",
        title: "Current",
        series: [
          {
            label: "total",
            values: samples.map((sample) => sample.current_total_a),
            stroke: COLORS.green,
            format: (value) => `${value.toFixed(1)} A`,
          },
          {
            label: "m1",
            values: samples.map((sample) => sample.current_m1_a),
            stroke: COLORS.cyan,
            format: (value) => `${value.toFixed(1)} A`,
          },
          {
            label: "m2",
            values: samples.map((sample) => sample.current_m2_a),
            stroke: COLORS.amber,
            format: (value) => `${value.toFixed(1)} A`,
          },
          {
            label: "m3",
            values: samples.map((sample) => sample.current_m3_a),
            stroke: COLORS.violet,
            format: (value) => `${value.toFixed(1)} A`,
          },
          {
            label: "m4",
            values: samples.map((sample) => sample.current_m4_a),
            stroke: COLORS.rose,
            format: (value) => `${value.toFixed(1)} A`,
          },
        ],
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
    this.header.className = "plot-meta";

    const title = document.createElement("span");
    title.className = "plot-title";
    title.textContent = this.title;
    this.header.appendChild(title);

    this.legend = document.createElement("div");
    this.legend.className = "plot-legend";
    this.legendItems = this.seriesDefs.map((entry) => {
      const item = document.createElement("span");
      item.className = "plot-legend-item";
      item.innerHTML = `
        <span class="plot-legend-swatch" style="background:${entry.stroke}"></span>
        <span class="plot-legend-label">${entry.label}</span>
        <span class="plot-legend-value"></span>
      `;
      this.legend.appendChild(item);
      return {
        root: item,
        value: item.querySelector(".plot-legend-value"),
        format: entry.format ?? defaultFormatter,
      };
    });
    this.header.appendChild(this.legend);

    this.selectionBadge = document.createElement("span");
    this.selectionBadge.className = "plot-selection";
    this.header.appendChild(this.selectionBadge);

    this.plotCanvas = document.createElement("div");
    this.plotCanvas.className = "plot-canvas";

    this.element.appendChild(this.header);
    this.element.appendChild(this.plotCanvas);
  }

  createChart() {
    const tickFormatter = (time) => formatSeconds(this.timeToSeconds(time));
    const chart = createChart(this.plotCanvas, {
      width: Math.max(320, this.plotCanvas.clientWidth || 320),
      height: 170,
      layout: {
        background: { type: ColorType.Solid, color: COLORS.panel },
        textColor: COLORS.axis,
        fontFamily: "IBM Plex Sans, system-ui, sans-serif",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: COLORS.grid },
        horzLines: { color: COLORS.grid },
      },
      rightPriceScale: {
        borderColor: COLORS.border,
        scaleMargins: { top: 0.16, bottom: this.showTimeAxis ? 0.16 : 0.08 },
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
        minimumHeight: this.showTimeAxis ? 24 : 0,
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
    this.selectionBadge.textContent = formatSeconds(this.xValues[index] ?? 0);
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
