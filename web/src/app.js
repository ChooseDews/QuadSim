import { PlotBoard } from "./plots.js";
import { QuadScene } from "./scene.js";

export class DashboardApp {
  constructor({ simulate, SimulatorClass }) {
    this.simulate = simulate;
    this.SimulatorClass = SimulatorClass;
    this.data = null;
    this.activeIndex = 0;
    this.playbackHandle = null;
    this.liveHandle = null;
    this.liveSimulator = null;
    this.scene = new QuadScene(document.getElementById("sceneCanvas"));
    this.plots = new PlotBoard({
      onSelectionChange: (index) => this.handlePlotSelection(index),
    });
  }

  async mount() {
    this.cacheElements();
    this.bindEvents();
    await this.runSimulation(this.readConfigFromForm());
  }

  cacheElements() {
    this.configForm = document.getElementById("configForm");
    this.metricsGrid = document.getElementById("metricsGrid");
    this.detailGrid = document.getElementById("detailGrid");
    this.timelineSlider = document.getElementById("timelineSlider");
    this.playPauseButton = document.getElementById("playPauseButton");
    this.stepBackButton = document.getElementById("stepBackButton");
    this.stepForwardButton = document.getElementById("stepForwardButton");
    this.viewTrackButton = document.getElementById("viewTrackButton");
    this.viewFollowButton = document.getElementById("viewFollowButton");
    this.fitChartsButton = document.getElementById("fitChartsButton");
    this.centerChartsButton = document.getElementById("centerChartsButton");
    this.liveRunButton = document.getElementById("liveRunButton");
    this.thrustToWeightInput = document.getElementById("thrustToWeightInput");
    this.linearDragInput = document.getElementById("linearDragInput");
    this.angularDragInput = document.getElementById("angularDragInput");
    this.noiseInput = document.getElementById("noiseInput");
    this.thrustToWeightValue = document.getElementById("thrustToWeightValue");
    this.linearDragValue = document.getElementById("linearDragValue");
    this.angularDragValue = document.getElementById("angularDragValue");
    this.noiseValue = document.getElementById("noiseValue");
    this.statusPill = document.getElementById("statusPill");
    this.sampleTimestamp = document.getElementById("sampleTimestamp");
    this.samplePose = document.getElementById("samplePose");
    this.sampleSpeed = document.getElementById("sampleSpeed");
    this.samplePower = document.getElementById("samplePower");
  }

  bindEvents() {
    this.bindSliderReadout(this.thrustToWeightInput, this.thrustToWeightValue, 2);
    this.bindSliderReadout(this.linearDragInput, this.linearDragValue, 2);
    this.bindSliderReadout(this.angularDragInput, this.angularDragValue, 2);
    this.bindSliderReadout(this.noiseInput, this.noiseValue, 3);

    this.configForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      this.stopLiveRun();
      this.stopPlayback();
      await this.runSimulation(this.readConfigFromForm());
    });

    this.liveRunButton.addEventListener("click", async () => {
      this.stopPlayback();
      await this.runLiveSimulation(this.readConfigFromForm());
    });

    this.timelineSlider.addEventListener("input", () => {
      this.stopPlayback();
      this.setActiveIndex(Number(this.timelineSlider.value));
    });

    this.playPauseButton.addEventListener("click", () => {
      if (!this.data) {
        return;
      }
      if (this.playbackHandle) {
        this.stopPlayback();
      } else {
        this.startPlayback();
      }
    });

    this.stepBackButton.addEventListener("click", () => {
      if (!this.data) {
        return;
      }
      this.stopPlayback();
      this.setActiveIndex(Math.max(0, this.activeIndex - 1));
    });

    this.stepForwardButton.addEventListener("click", () => {
      if (!this.data) {
        return;
      }
      this.stopPlayback();
      this.setActiveIndex(Math.min(this.data.samples.length - 1, this.activeIndex + 1));
    });

    this.viewTrackButton.addEventListener("click", () => {
      this.scene.setViewMode("track");
      this.setViewButtonState("track");
    });

    this.viewFollowButton.addEventListener("click", () => {
      this.scene.setViewMode("follow");
      this.setViewButtonState("follow");
    });

    this.fitChartsButton.addEventListener("click", () => {
      this.plots.fitContent();
    });

    this.centerChartsButton.addEventListener("click", () => {
      this.plots.centerOnSelection(this.activeIndex);
    });
  }

  readConfigFromForm() {
    const formData = new FormData(this.configForm);
    return {
      duration_s: Number(formData.get("duration_s")),
      dt_s: Number(formData.get("dt_s")),
      altitude_m: Number(formData.get("altitude_m")),
      thrust_to_weight_ratio: Number(formData.get("thrust_to_weight_ratio")),
      pitch_deg: Number(formData.get("pitch_deg")),
      roll_step_deg: Number(formData.get("roll_step_deg")),
      roll_step_time_s: Number(formData.get("roll_step_time_s")),
      yaw_deg: Number(formData.get("yaw_deg")),
      maneuver_mode: String(formData.get("maneuver_mode")),
      maneuver_start_s: Number(formData.get("maneuver_start_s")),
      steps_per_tick: Number(formData.get("steps_per_tick")),
      linear_drag_scale: Number(formData.get("linear_drag_scale")),
      angular_drag_scale: Number(formData.get("angular_drag_scale")),
      throttle_noise_std: Number(formData.get("throttle_noise_std")),
    };
  }

  async runSimulation(config) {
    this.stopLiveRun();
    this.setStatus("Simulating", "busy");
    const data = await this.simulate(config);
    this.applyDataset(data);
    this.setStatus("Ready", "ready");
  }

  async runLiveSimulation(config) {
    this.stopLiveRun();
    this.setStatus("Live", "busy");
    this.liveSimulator = new this.SimulatorClass(config);

    this.liveHandle = window.setInterval(async () => {
      const data = await this.liveSimulator.step_chunk(config.steps_per_tick);
      this.applyDataset(data);
      if (data.completed) {
        this.stopLiveRun();
        this.setStatus("Ready", "ready");
      }
    }, 50);
  }

  applyDataset(data) {
    const preserveTrackCamera = this.data !== null && this.scene.viewMode === "track";
    this.data = data;
    this.renderSummary(data);
    this.scene.setDataset(data, { preserveTrackCamera });
    this.plots.setDataset(data);
    this.timelineSlider.max = String(Math.max(data.samples.length - 1, 0));
    this.timelineSlider.value = String(Math.max(data.samples.length - 1, 0));
    this.setActiveIndex(Math.max(data.samples.length - 1, 0));
    this.setViewButtonState(this.scene.viewMode);
  }

  renderSummary(data) {
    const { summary, config, vehicle } = data;
    this.metricsGrid.innerHTML = [
      card("Cruise Speed", `${summary.cruise_speed_mps.toFixed(2)} m/s`),
      card("Cruise Power", `${summary.cruise_power_w.toFixed(0)} W`),
      card("Cruise Current", `${summary.cruise_current_a.toFixed(1)} A`),
      card("Peak Altitude", `${summary.peak_altitude_m.toFixed(2)} m`),
      card("Max Speed", `${summary.max_speed_mps.toFixed(2)} m/s`),
      card("T/W Ratio", `${vehicle.thrust_to_weight_ratio.toFixed(2)} : 1`),
      card("Hover Throttle", `${vehicle.hover_throttle.toFixed(3)}`),
      card("Alt Cmd", `${config.altitude_m.toFixed(0)} m`),
      card("Pitch Cmd", `${config.pitch_deg.toFixed(1)} deg`),
      card("Roll Step", `${config.roll_step_deg.toFixed(1)} deg @ ${config.roll_step_time_s.toFixed(1)} s`),
      card("Maneuver", config.maneuver_mode === "front_flip" ? `Front flip @ ${config.maneuver_start_s.toFixed(1)} s` : "None"),
      card("Progress", `${data.steps_completed}/${data.total_steps} steps`),
    ].join("");
  }

  setActiveIndex(index) {
    if (!this.data || this.data.samples.length === 0) {
      return;
    }

    this.activeIndex = index;
    this.timelineSlider.value = String(index);

    const sample = this.data.samples[index];
    this.sampleTimestamp.textContent = `t = ${sample.t.toFixed(2)} s`;
    this.samplePose.textContent =
      `x ${sample.x.toFixed(2)} | y ${sample.y.toFixed(2)} | z ${sample.z.toFixed(2)}`;
    this.sampleSpeed.textContent = `speed ${sample.speed.toFixed(2)} m/s`;
    this.samplePower.textContent = `power ${sample.power_total_w.toFixed(1)} W`;

    this.detailGrid.innerHTML = [
      detail("Attitude", `${deg(sample.roll).toFixed(2)} / ${deg(sample.pitch).toFixed(2)} / ${deg(sample.yaw).toFixed(2)} deg`),
      detail("Angular Rate", `${sample.p.toFixed(2)} / ${sample.q.toFixed(2)} / ${sample.r.toFixed(2)} rad/s`),
      detail("Velocity", `${sample.vx.toFixed(2)} / ${sample.vy.toFixed(2)} / ${sample.vz.toFixed(2)} m/s`),
      detail("Acceleration", `${sample.ax.toFixed(2)} / ${sample.ay.toFixed(2)} / ${sample.az.toFixed(2)} m/s²`),
      detail("Motor Throttles", `${sample.m1.toFixed(2)} ${sample.m2.toFixed(2)} ${sample.m3.toFixed(2)} ${sample.m4.toFixed(2)}`),
      detail("Electrical Load", `${sample.current_total_a.toFixed(1)} A @ ${sample.power_total_w.toFixed(0)} W`),
    ].join("");

    this.scene.setSample(sample);
    this.plots.setSelection(index);
  }

  startPlayback() {
    this.playPauseButton.textContent = "Pause";
    this.playbackHandle = window.setInterval(() => {
      if (!this.data) {
        this.stopPlayback();
        return;
      }
      if (this.activeIndex >= this.data.samples.length - 1) {
        this.stopPlayback();
        return;
      }
      this.setActiveIndex(this.activeIndex + 1);
    }, 33);
  }

  stopPlayback() {
    if (this.playbackHandle) {
      window.clearInterval(this.playbackHandle);
      this.playbackHandle = null;
    }
    this.playPauseButton.textContent = "Play";
  }

  stopLiveRun() {
    if (this.liveHandle) {
      window.clearInterval(this.liveHandle);
      this.liveHandle = null;
    }
    this.liveSimulator = null;
  }

  handlePlotSelection(index) {
    if (index === this.activeIndex || !this.data) {
      return;
    }
    this.stopPlayback();
    this.setActiveIndex(index);
  }

  setViewButtonState(mode) {
    this.viewTrackButton.classList.toggle("active", mode === "track");
    this.viewFollowButton.classList.toggle("active", mode === "follow");
  }

  bindSliderReadout(input, output, digits) {
    const render = () => {
      output.textContent = Number(input.value).toFixed(digits);
    };
    input.addEventListener("input", render);
    render();
  }

  setStatus(label, state) {
    this.statusPill.textContent = label;
    this.statusPill.dataset.state = state;
  }
}

function card(label, value) {
  return `
    <article class="metric-card">
      <span class="metric-label">${label}</span>
      <strong class="metric-value">${value}</strong>
    </article>
  `;
}

function detail(label, value) {
  return `
    <article class="detail-card">
      <span class="metric-label">${label}</span>
      <strong class="detail-value">${value}</strong>
    </article>
  `;
}

function deg(rad) {
  return (rad * 180) / Math.PI;
}
