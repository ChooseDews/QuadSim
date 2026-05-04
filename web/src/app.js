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
    this.tabButtons = document.querySelectorAll(".tab-button");
    this.tabContents = document.querySelectorAll(".tab-content");
    this.resizer = document.getElementById("resizer");
    this.dashboardShell = document.getElementById("dashboardShell");
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
    this.playIcon = document.getElementById("playIcon");
    this.pauseIcon = document.getElementById("pauseIcon");
    this.sceneSettingsButton = document.getElementById("sceneSettingsButton");
    this.sceneSettingsPanel = document.getElementById("sceneSettingsPanel");
    this.vehicleScaleInput = document.getElementById("vehicleScaleInput");
    this.pathWidthInput = document.getElementById("pathWidthInput");
    this.timelineContainer = document.getElementById("timelineContainer");
    this.addTimelineEventBtn = document.getElementById("addTimelineEventBtn");
    this.syncHoverCheckbox = document.getElementById("syncHoverCheckbox");

    this.timeline = [
      { id: 1, type: "setpoint", time_s: 0.0, altitude_m: 30.0, roll_deg: 0.0, pitch_deg: 3.0, yaw_deg: 0.0 },
      { id: 2, type: "front_flip", time_s: 12.0 },
      { id: 3, type: "front_flip", time_s: 18.0 },
      { id: 4, type: "setpoint", time_s: 20.0, altitude_m: 10.0, roll_deg: -10.0, pitch_deg: 10.0, yaw_deg: 0.0 }
    ];
    this.nextTimelineId = 5;
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

    this.tabButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const tabId = button.dataset.tab;
        this.setActiveTab(tabId);
      });
    });

    this.sceneSettingsButton.addEventListener("click", (e) => {
      e.stopPropagation();
      const isVisible = this.sceneSettingsPanel.style.display === "flex";
      this.sceneSettingsPanel.style.display = isVisible ? "none" : "flex";
    });

    document.addEventListener("click", () => {
      this.sceneSettingsPanel.style.display = "none";
    });

    this.sceneSettingsPanel.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    this.vehicleScaleInput.addEventListener("input", () => {
      this.scene.setVehicleScale(Number(this.vehicleScaleInput.value));
    });

    this.pathWidthInput.addEventListener("input", () => {
      this.scene.setPathWidth(Number(this.pathWidthInput.value));
    });

    this.addTimelineEventBtn.addEventListener("click", () => {
      this.timeline.push({
        id: this.nextTimelineId++,
        type: "setpoint",
        time_s: 0.0,
        altitude_m: 30.0,
        roll_deg: 0.0,
        pitch_deg: 0.0,
        yaw_deg: 0.0
      });
      this.renderTimeline();
    });

    this.bindResizer();
    this.renderTimeline();
  }

  renderTimeline() {
    this.timelineContainer.innerHTML = "";
    this.timeline.sort((a, b) => a.time_s - b.time_s).forEach((item) => {
      const el = document.createElement("div");
      el.className = "timeline-item";
      
      let paramsHtml = "";
      if (item.type === "setpoint") {
        paramsHtml = `
          <label title="Target altitude in meters"><span>Alt [m]</span><input type="number" data-id="${item.id}" data-field="altitude_m" value="${item.altitude_m}" step="1" title="Target altitude in meters" /></label>
          <label title="Target roll angle in degrees"><span>Roll [deg]</span><input type="number" data-id="${item.id}" data-field="roll_deg" value="${item.roll_deg}" step="0.5" title="Target roll angle in degrees" /></label>
          <label title="Target pitch angle in degrees"><span>Pitch [deg]</span><input type="number" data-id="${item.id}" data-field="pitch_deg" value="${item.pitch_deg}" step="0.5" title="Target pitch angle in degrees" /></label>
          <label title="Target yaw angle in degrees"><span>Yaw [deg]</span><input type="number" data-id="${item.id}" data-field="yaw_deg" value="${item.yaw_deg}" step="1" title="Target yaw angle in degrees" /></label>
        `;
      } else if (item.type === "front_flip") {
        paramsHtml = ``; 
      } else if (item.type === "helix") {
        paramsHtml = `
          <label title="Duration of the helix maneuver in seconds"><span>Duration [s]</span><input type="number" data-id="${item.id}" data-field="duration_s" value="${item.duration_s}" step="1" title="Duration of the helix maneuver in seconds" /></label>
          <label title="Radius of the helix in meters"><span>Radius [m]</span><input type="number" data-id="${item.id}" data-field="radius_m" value="${item.radius_m}" step="0.5" title="Radius of the helix in meters" /></label>
          <label title="Forward horizontal velocity in meters per second"><span>Fwd Vel [m/s]</span><input type="number" data-id="${item.id}" data-field="forward_velocity_mps" value="${item.forward_velocity_mps}" step="0.5" title="Forward horizontal velocity in meters per second" /></label>
          <label title="Angular turn rate in radians per second"><span>Ang Vel [rad/s]</span><input type="number" data-id="${item.id}" data-field="angular_velocity_rps" value="${item.angular_velocity_rps}" step="0.1" title="Angular turn rate in radians per second" /></label>
        `;
      }

      el.innerHTML = `
        <div class="timeline-item-header">
          <div class="timeline-item-title">
            <select class="timeline-type-select" data-id="${item.id}" title="Type of mission action">
              <option value="setpoint" ${item.type === "setpoint" ? "selected" : ""}>Setpoint</option>
              <option value="front_flip" ${item.type === "front_flip" ? "selected" : ""}>Front Flip</option>
              <option value="helix" ${item.type === "helix" ? "selected" : ""}>Helix</option>
            </select>
          </div>
          <button type="button" class="timeline-remove-btn" data-id="${item.id}" title="Remove keyframe">✕</button>
        </div>
        <div class="timeline-grid">
          <label title="Time in seconds when this action starts"><span>Time [s]</span><input type="number" data-id="${item.id}" data-field="time_s" value="${item.time_s}" step="0.5" title="Time in seconds when this action starts" /></label>
          ${paramsHtml}
        </div>
      `;

      this.timelineContainer.appendChild(el);
    });

    // Bind inputs
    this.timelineContainer.querySelectorAll("input").forEach(input => {
      input.addEventListener("change", (e) => {
        const id = Number(e.target.dataset.id);
        const field = e.target.dataset.field;
        const val = Number(e.target.value);
        const item = this.timeline.find(t => t.id === id);
        if (item) {
          item[field] = val;
          if (field === "time_s") this.renderTimeline();
        }
      });
    });

    this.timelineContainer.querySelectorAll("select.timeline-type-select").forEach(select => {
      select.addEventListener("change", (e) => {
        const id = Number(e.target.dataset.id);
        const type = e.target.value;
        const item = this.timeline.find(t => t.id === id);
        if (item) {
          item.type = type;
          if (type === "setpoint") {
            item.altitude_m = item.altitude_m || 30.0;
            item.roll_deg = item.roll_deg || 0.0;
            item.pitch_deg = item.pitch_deg || 0.0;
            item.yaw_deg = item.yaw_deg || 0.0;
          } else if (type === "helix") {
            item.duration_s = item.duration_s || 15.0;
            item.radius_m = item.radius_m || 3.0;
            item.forward_velocity_mps = item.forward_velocity_mps || 5.0;
            item.angular_velocity_rps = item.angular_velocity_rps || 0.6;
          }
          this.renderTimeline();
        }
      });
    });

    this.timelineContainer.querySelectorAll(".timeline-remove-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const id = Number(e.target.dataset.id);
        this.timeline = this.timeline.filter(t => t.id !== id);
        this.renderTimeline();
      });
    });
  }

  bindResizer() {
    let isResizing = false;

    this.resizer.addEventListener("mousedown", (e) => {
      isResizing = true;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    });

    document.addEventListener("mousemove", (e) => {
      if (!isResizing) return;

      const containerWidth = this.dashboardShell.clientWidth;
      const percentage = (e.clientX / containerWidth) * 100;
      const clamped = Math.min(Math.max(percentage, 20), 80);

      this.dashboardShell.style.gridTemplateColumns = `${clamped}% 6px 1fr`;
      this.scene.resize();
    });

    document.addEventListener("mouseup", () => {
      if (isResizing) {
        isResizing = false;
        document.body.style.cursor = "default";
        document.body.style.userSelect = "auto";
        this.scene.resize();
      }
    });
  }

  setActiveTab(tabId) {
    this.tabButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tabId);
    });
    this.tabContents.forEach((content) => {
      content.classList.toggle("active", content.id === `tab-${tabId}`);
    });
  }

  readConfigFromForm() {
    const formData = new FormData(this.configForm);
    return {
      duration_s: Number(formData.get("duration_s")),
      dt_s: Number(formData.get("dt_s")),
      steps_per_tick: 30,
      thrust_to_weight_ratio: Number(formData.get("thrust_to_weight_ratio")),
      linear_drag_scale: Number(formData.get("linear_drag_scale")),
      angular_drag_scale: Number(formData.get("angular_drag_scale")),
      throttle_noise_std: Number(formData.get("throttle_noise_std")),
      timeline: this.timeline.map(item => {
        let t = { type: item.type, time_s: item.time_s };
        if (item.type === "setpoint") {
          t.altitude_m = item.altitude_m;
          t.roll_deg = item.roll_deg;
          t.pitch_deg = item.pitch_deg;
          t.yaw_deg = item.yaw_deg;
        } else if (item.type === "helix") {
          t.duration_s = item.duration_s;
          t.radius_m = item.radius_m;
          t.forward_velocity_mps = item.forward_velocity_mps;
          t.angular_velocity_rps = item.angular_velocity_rps;
        }
        return t;
      })
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
    
    let maneuversCount = config.timeline.filter(t => t.type !== "setpoint").length;
    let setpointsCount = config.timeline.filter(t => t.type === "setpoint").length;

    this.metricsGrid.innerHTML = [
      card("Cruise Speed", `${summary.cruise_speed_mps.toFixed(2)} m/s`),
      card("Cruise Power", `${summary.cruise_power_w.toFixed(0)} W`),
      card("Cruise Current", `${summary.cruise_current_a.toFixed(1)} A`),
      card("Peak Altitude", `${summary.peak_altitude_m.toFixed(2)} m`),
      card("Max Speed", `${summary.max_speed_mps.toFixed(2)} m/s`),
      card("T/W Ratio", `${vehicle.thrust_to_weight_ratio.toFixed(2)} : 1`),
      card("Hover Throttle", `${vehicle.hover_throttle.toFixed(3)}`),
      card("Setpoints", `${setpointsCount}`),
      card("Maneuvers", `${maneuversCount}`),
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
    this.playIcon.style.display = "none";
    this.pauseIcon.style.display = "block";
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
    this.playIcon.style.display = "block";
    this.pauseIcon.style.display = "none";
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
    if (this.syncHoverCheckbox && !this.syncHoverCheckbox.checked) {
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
