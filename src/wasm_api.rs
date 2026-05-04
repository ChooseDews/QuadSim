use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

use crate::controller::{AttitudeSetpoint, ManeuverMode, QuadController};
use crate::quadrotor::Quadrotor;
use crate::simulation::{Sample, SimulationOptions, SimulationRuntime, simulate_with_options};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BrowserSimulationConfig {
    pub dt_s: f64,
    pub duration_s: f64,
    pub altitude_m: f64,
    pub thrust_to_weight_ratio: f64,
    pub pitch_deg: f64,
    pub roll_step_deg: f64,
    pub roll_step_time_s: f64,
    pub yaw_deg: f64,
    pub maneuver_mode: String,
    pub maneuver_start_s: f64,
    pub linear_drag_scale: f64,
    pub angular_drag_scale: f64,
    pub throttle_noise_std: f64,
}

#[derive(Clone, Debug, Serialize)]
pub struct BrowserMotorInfo {
    pub name: String,
    pub spin: String,
    pub position_body_m: [f64; 3],
}

#[derive(Clone, Debug, Serialize)]
pub struct BrowserVehicleInfo {
    pub mass_kg: f64,
    pub battery_voltage_v: f64,
    pub hover_throttle: f64,
    pub thrust_to_weight_ratio: f64,
    pub motors: Vec<BrowserMotorInfo>,
}

#[derive(Clone, Debug, Serialize)]
pub struct BrowserSimulationSummary {
    pub final_position_m: [f64; 3],
    pub final_attitude_deg: [f64; 3],
    pub cruise_speed_mps: f64,
    pub cruise_power_w: f64,
    pub cruise_current_a: f64,
    pub peak_altitude_m: f64,
    pub max_speed_mps: f64,
}

#[derive(Clone, Debug, Serialize)]
pub struct BrowserDashboardData {
    pub config: BrowserSimulationConfig,
    pub vehicle: BrowserVehicleInfo,
    pub summary: BrowserSimulationSummary,
    pub samples: Vec<Sample>,
    pub steps_completed: usize,
    pub total_steps: usize,
    pub completed: bool,
}

impl Default for BrowserSimulationConfig {
    fn default() -> Self {
        Self {
            dt_s: 0.01,
            duration_s: 45.0,
            altitude_m: 30.0,
            thrust_to_weight_ratio: 2.25,
            pitch_deg: 3.0,
            roll_step_deg: 2.0,
            roll_step_time_s: 18.0,
            yaw_deg: 0.0,
            maneuver_mode: "front_flip".to_owned(),
            maneuver_start_s: 10.0,
            linear_drag_scale: 1.0,
            angular_drag_scale: 1.0,
            throttle_noise_std: 0.0,
        }
    }
}

impl BrowserSimulationConfig {
    fn to_controller(&self) -> QuadController {
        let mut controller = QuadController {
            schedule: vec![
                AttitudeSetpoint {
                    start_time_s: 0.0,
                    altitude_m: self.altitude_m,
                    roll_rad: 0.0,
                    pitch_rad: self.pitch_deg.to_radians(),
                    yaw_rad: self.yaw_deg.to_radians(),
                },
                AttitudeSetpoint {
                    start_time_s: self.roll_step_time_s,
                    altitude_m: self.altitude_m,
                    roll_rad: self.roll_step_deg.to_radians(),
                    pitch_rad: self.pitch_deg.to_radians(),
                    yaw_rad: self.yaw_deg.to_radians(),
                },
            ],
            ..QuadController::default()
        };
        controller.maneuver_mode = self.parse_maneuver_mode();
        controller.front_flip.start_time_s = self.maneuver_start_s;
        controller
    }

    fn to_simulation_options(&self) -> SimulationOptions {
        SimulationOptions {
            linear_drag_scale: self.linear_drag_scale,
            angular_drag_scale: self.angular_drag_scale,
            throttle_noise_std: self.throttle_noise_std,
            noise_seed: 0x5eed_1234_5678_9abc,
        }
    }

    fn parse_maneuver_mode(&self) -> ManeuverMode {
        match self.maneuver_mode.as_str() {
            "front_flip" => ManeuverMode::FrontFlip,
            _ => ManeuverMode::None,
        }
    }
}

#[wasm_bindgen]
pub struct BrowserSimulator {
    config: BrowserSimulationConfig,
    vehicle: Quadrotor,
    runtime: SimulationRuntime,
}

#[wasm_bindgen]
pub fn simulate_dashboard() -> Result<JsValue, JsValue> {
    simulate_dashboard_with_config(JsValue::UNDEFINED)
}

#[wasm_bindgen]
pub fn simulate_dashboard_with_config(config: JsValue) -> Result<JsValue, JsValue> {
    let config = if config.is_undefined() || config.is_null() {
        BrowserSimulationConfig::default()
    } else {
        serde_wasm_bindgen::from_value(config)
            .map_err(|error| JsValue::from_str(&format!("invalid simulation config: {error}")))?
    };

    let mut vehicle = Quadrotor::default();
    vehicle.set_thrust_to_weight_ratio(config.thrust_to_weight_ratio);
    let controller = config.to_controller();
    let result = simulate_with_options(
        &vehicle,
        &controller,
        config.dt_s,
        config.duration_s,
        config.to_simulation_options(),
    );
    let dashboard = dashboard_from_samples(
        &config,
        &vehicle,
        result.samples,
        true,
        (config.duration_s / config.dt_s).round() as usize + 1,
    )?;

    serde_wasm_bindgen::to_value(&dashboard)
        .map_err(|error| JsValue::from_str(&format!("serialization failed: {error}")))
}

#[wasm_bindgen]
impl BrowserSimulator {
    #[wasm_bindgen(constructor)]
    pub fn new(config: JsValue) -> Result<BrowserSimulator, JsValue> {
        let config = if config.is_undefined() || config.is_null() {
            BrowserSimulationConfig::default()
        } else {
            serde_wasm_bindgen::from_value(config)
                .map_err(|error| JsValue::from_str(&format!("invalid simulation config: {error}")))?
        };

        let mut vehicle = Quadrotor::default();
        vehicle.set_thrust_to_weight_ratio(config.thrust_to_weight_ratio);
        let runtime = SimulationRuntime::new(
            vehicle.clone(),
            config.to_controller(),
            config.dt_s,
            config.duration_s,
            config.to_simulation_options(),
        );

        Ok(Self {
            config,
            vehicle,
            runtime,
        })
    }

    pub fn step_chunk(&mut self, steps: usize) -> Result<JsValue, JsValue> {
        let requested_steps = steps.max(1);
        self.runtime.step_chunk(requested_steps);
        self.snapshot()
    }

    pub fn snapshot(&self) -> Result<JsValue, JsValue> {
        let dashboard = dashboard_from_samples(
            &self.config,
            &self.vehicle,
            self.runtime.samples().to_vec(),
            self.runtime.is_complete(),
            self.runtime.total_steps(),
        )?;
        serde_wasm_bindgen::to_value(&dashboard)
            .map_err(|error| JsValue::from_str(&format!("serialization failed: {error}")))
    }

    pub fn is_complete(&self) -> bool {
        self.runtime.is_complete()
    }

    pub fn total_steps(&self) -> usize {
        self.runtime.total_steps()
    }
}

fn dashboard_from_samples(
    config: &BrowserSimulationConfig,
    vehicle: &Quadrotor,
    samples: Vec<Sample>,
    completed: bool,
    total_steps: usize,
) -> Result<BrowserDashboardData, JsValue> {
    let final_sample = samples
        .last()
        .ok_or_else(|| JsValue::from_str("simulation produced no samples"))?;
    let cruise_window = &samples[samples.len().saturating_sub(500)..];
    let cruise_speed_mps =
        cruise_window.iter().map(|sample| sample.speed).sum::<f64>() / cruise_window.len() as f64;
    let cruise_power_w = cruise_window
        .iter()
        .map(|sample| sample.power_total_w)
        .sum::<f64>()
        / cruise_window.len() as f64;
    let cruise_current_a = cruise_window
        .iter()
        .map(|sample| sample.current_total_a)
        .sum::<f64>()
        / cruise_window.len() as f64;
    let peak_altitude_m = samples
        .iter()
        .map(|sample| sample.z)
        .fold(f64::NEG_INFINITY, f64::max);
    let max_speed_mps = samples
        .iter()
        .map(|sample| sample.speed)
        .fold(f64::NEG_INFINITY, f64::max);

    Ok(BrowserDashboardData {
        config: config.clone(),
        vehicle: BrowserVehicleInfo {
            mass_kg: vehicle.mass_kg,
            battery_voltage_v: vehicle.battery_voltage_v,
            hover_throttle: vehicle.hover_throttle(),
            thrust_to_weight_ratio: vehicle.thrust_to_weight_ratio(),
            motors: vehicle
                .motors
                .iter()
                .map(|motor| BrowserMotorInfo {
                    name: motor.name.to_owned(),
                    spin: motor.spin.label().to_owned(),
                    position_body_m: [
                        motor.position_body_m.x,
                        motor.position_body_m.y,
                        motor.position_body_m.z,
                    ],
                })
                .collect(),
        },
        summary: BrowserSimulationSummary {
            final_position_m: [final_sample.x, final_sample.y, final_sample.z],
            final_attitude_deg: [
                final_sample.roll.to_degrees(),
                final_sample.pitch.to_degrees(),
                final_sample.yaw.to_degrees(),
            ],
            cruise_speed_mps,
            cruise_power_w,
            cruise_current_a,
            peak_altitude_m,
            max_speed_mps,
        },
        steps_completed: samples.len(),
        total_steps,
        completed,
        samples,
    })
}
