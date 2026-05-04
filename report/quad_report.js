const samples = window.QUAD_REPORT_DATA ?? [];

if (!Array.isArray(samples) || samples.length === 0) {
  throw new Error("No quadrotor simulation data found in window.QUAD_REPORT_DATA.");
}

const t = samples.map((s) => s.t);
const x = samples.map((s) => s.x);
const y = samples.map((s) => s.y);
const z = samples.map((s) => s.z);
const vx = samples.map((s) => s.vx);
const vy = samples.map((s) => s.vy);
const vz = samples.map((s) => s.vz);
const speed = samples.map((s) => s.speed);
const roll = samples.map((s) => deg(s.roll));
const pitch = samples.map((s) => deg(s.pitch));
const yaw = samples.map((s) => deg(s.yaw));
const rollTarget = samples.map((s) => deg(s.roll_target));
const pitchTarget = samples.map((s) => deg(s.pitch_target));
const altitudeTarget = samples.map((s) => s.altitude_target);
const powerTotal = samples.map((s) => s.power_total_w);
const currentTotal = samples.map((s) => s.current_total_a);
const motors = [
  samples.map((s) => s.m1),
  samples.map((s) => s.m2),
  samples.map((s) => s.m3),
  samples.map((s) => s.m4),
];
const powers = [
  samples.map((s) => s.power_m1_w),
  samples.map((s) => s.power_m2_w),
  samples.map((s) => s.power_m3_w),
  samples.map((s) => s.power_m4_w),
];

const finalSample = samples.at(-1);
const cruiseWindow = samples.slice(-500);
const meanCruiseSpeed = mean(cruiseWindow.map((s) => s.speed));
const meanCruisePower = mean(cruiseWindow.map((s) => s.power_total_w));
let activeIndex = samples.length - 1;
let playbackHandle = null;

renderSummary([
  ["Final altitude", `${finalSample.z.toFixed(2)} m`],
  ["Final attitude", `${deg(finalSample.roll).toFixed(2)} / ${deg(finalSample.pitch).toFixed(2)} / ${deg(finalSample.yaw).toFixed(2)} deg`],
  ["Cruise speed", `${meanCruiseSpeed.toFixed(2)} m/s`],
  ["Cruise power", `${meanCruisePower.toFixed(0)} W`],
]);

Plotly.newPlot(
  "trajectory",
  [
    {
      type: "scatter3d",
      mode: "lines",
      x,
      y,
      z,
      line: {
        width: 8,
        color: speed,
        colorscale: "Viridis",
        colorbar: { title: "speed [m/s]" },
      },
      name: "trajectory",
    },
    {
      type: "scatter3d",
      mode: "markers+text",
      x: [x[0], x.at(-1)],
      y: [y[0], y.at(-1)],
      z: [z[0], z.at(-1)],
      text: ["start", "finish"],
      textposition: "top center",
      marker: {
        size: 5,
        color: ["#176347", "#b55432"],
      },
      name: "markers",
    },
    {
      type: "scatter3d",
      mode: "markers",
      x: [x[activeIndex]],
      y: [y[activeIndex]],
      z: [z[activeIndex]],
      marker: {
        size: 7,
        color: "#0b1220",
      },
      name: "selected",
    },
  ],
  {
    title: "3D Trajectory",
    margin: { l: 0, r: 0, t: 40, b: 0 },
    scene: {
      xaxis: { title: "x [m]" },
      yaxis: { title: "y [m]" },
      zaxis: { title: "z [m]" },
      aspectmode: "data",
    },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
  },
  { responsive: true },
);

Plotly.newPlot(
  "altitude",
  [
    trace(t, z, "z [m]", "#176347"),
    targetTrace(t, altitudeTarget, "target"),
    pointTrace([t[activeIndex]], [z[activeIndex]], "selected", "#0b1220"),
  ],
  layout("Altitude", "time [s]", "z [m]"),
  { responsive: true },
);

Plotly.newPlot(
  "attitude",
  [
    trace(t, roll, "roll [deg]"),
    trace(t, pitch, "pitch [deg]", "#176347"),
    trace(t, yaw, "yaw [deg]"),
    targetTrace(t, rollTarget, "roll target"),
    targetTrace(t, pitchTarget, "pitch target"),
    pointTrace([t[activeIndex]], [roll[activeIndex]], "roll selected", "#0b1220"),
    pointTrace([t[activeIndex]], [pitch[activeIndex]], "pitch selected", "#b55432"),
  ],
  layout("Euler Angles", "time [s]", "angle [deg]"),
  { responsive: true },
);

Plotly.newPlot(
  "velocity",
  [
    trace(t, vx, "vx [m/s]"),
    trace(t, vy, "vy [m/s]"),
    trace(t, vz, "vz [m/s]", "#176347"),
    trace(t, speed, "speed [m/s]", "#b55432"),
    pointTrace([t[activeIndex]], [speed[activeIndex]], "speed selected", "#0b1220"),
  ],
  layout("Velocity History", "time [s]", "velocity [m/s]"),
  { responsive: true },
);

Plotly.newPlot(
  "motors",
  [
    trace(t, motors[0], "motor 1 (CCW)"),
    trace(t, motors[1], "motor 2 (CW)"),
    trace(t, motors[2], "motor 3 (CCW)"),
    trace(t, motors[3], "motor 4 (CW)"),
    pointTrace([t[activeIndex]], [motors[0][activeIndex]], "selected", "#0b1220"),
  ],
  { ...layout("Motor Throttles", "time [s]", "throttle"), yaxis: { title: "throttle", range: [0, 1] } },
  { responsive: true },
);

Plotly.newPlot(
  "power",
  [
    trace(t, powers[0], "motor 1 power [W]"),
    trace(t, powers[1], "motor 2 power [W]"),
    trace(t, powers[2], "motor 3 power [W]"),
    trace(t, powers[3], "motor 4 power [W]"),
    trace(t, powerTotal, "total power [W]", "#b55432"),
    pointTrace([t[activeIndex]], [powerTotal[activeIndex]], "selected", "#0b1220"),
  ],
  layout("Estimated Power Usage", "time [s]", "power [W]"),
  { responsive: true },
);

Plotly.newPlot(
  "current",
  [
    trace(t, currentTotal, "total current [A]", "#176347"),
    pointTrace([t[activeIndex]], [currentTotal[activeIndex]], "selected", "#0b1220"),
  ],
  layout("Estimated Current Draw", "time [s]", "current [A]"),
  { responsive: true },
);

setupControls();
updateSelection(activeIndex);

function deg(rad) {
  return (rad * 180.0) / Math.PI;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function trace(xValues, yValues, name, color) {
  return {
    x: xValues,
    y: yValues,
    type: "scatter",
    mode: "lines",
    name,
    line: color ? { color, width: 3 } : { width: 2.5 },
  };
}

function pointTrace(xValues, yValues, name, color) {
  return {
    x: xValues,
    y: yValues,
    type: "scatter",
    mode: "markers",
    name,
    marker: { color, size: 8 },
    showlegend: false,
  };
}

function targetTrace(xValues, yValues, name) {
  return {
    x: xValues,
    y: yValues,
    type: "scatter",
    mode: "lines",
    name,
    line: { color: "#b55432", dash: "dash", width: 2 },
  };
}

function layout(title, xTitle, yTitle) {
  return {
    title,
    xaxis: { title: xTitle },
    yaxis: { title: yTitle },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
  };
}

function renderSummary(entries) {
  const root = document.getElementById("summary");
  root.innerHTML = entries
    .map(
      ([label, value]) => `
        <article class="card">
          <span class="label">${label}</span>
          <span class="value">${value}</span>
        </article>
      `,
    )
    .join("");
}

function setupControls() {
  const scrubber = document.getElementById("scrubber");
  const playPause = document.getElementById("playPause");
  const stepBack = document.getElementById("stepBack");
  const stepForward = document.getElementById("stepForward");

  scrubber.max = String(samples.length - 1);
  scrubber.value = String(activeIndex);

  scrubber.addEventListener("input", () => {
    stopPlayback();
    updateSelection(Number(scrubber.value));
  });

  playPause.addEventListener("click", () => {
    if (playbackHandle) {
      stopPlayback();
      return;
    }
    playPause.textContent = "Pause";
    playbackHandle = window.setInterval(() => {
      if (activeIndex >= samples.length - 1) {
        stopPlayback();
        return;
      }
      updateSelection(activeIndex + 1);
      scrubber.value = String(activeIndex);
    }, 40);
  });

  stepBack.addEventListener("click", () => {
    stopPlayback();
    updateSelection(Math.max(0, activeIndex - 1));
    scrubber.value = String(activeIndex);
  });

  stepForward.addEventListener("click", () => {
    stopPlayback();
    updateSelection(Math.min(samples.length - 1, activeIndex + 1));
    scrubber.value = String(activeIndex);
  });
}

function stopPlayback() {
  const playPause = document.getElementById("playPause");
  if (playbackHandle) {
    window.clearInterval(playbackHandle);
    playbackHandle = null;
  }
  playPause.textContent = "Play";
}

function updateSelection(index) {
  activeIndex = index;
  const sample = samples[activeIndex];
  document.getElementById("scrubLabel").textContent =
    `t = ${sample.t.toFixed(2)} s | x = ${sample.x.toFixed(2)} m | y = ${sample.y.toFixed(2)} m | z = ${sample.z.toFixed(2)} m`;

  Plotly.restyle("trajectory", {
    x: [[sample.x]],
    y: [[sample.y]],
    z: [[sample.z]],
  }, [2]);
  Plotly.restyle("altitude", { x: [[sample.t]], y: [[sample.z]] }, [2]);
  Plotly.restyle("attitude", { x: [[sample.t]], y: [[deg(sample.roll)]] }, [5]);
  Plotly.restyle("attitude", { x: [[sample.t]], y: [[deg(sample.pitch)]] }, [6]);
  Plotly.restyle("velocity", { x: [[sample.t]], y: [[sample.speed]] }, [4]);
  Plotly.restyle("motors", { x: [[sample.t]], y: [[sample.m1]] }, [4]);
  Plotly.restyle("power", { x: [[sample.t]], y: [[sample.power_total_w]] }, [5]);
  Plotly.restyle("current", { x: [[sample.t]], y: [[sample.current_total_a]] }, [1]);
}
