use serde::Serialize;

use crate::controller::QuadController;
use crate::math::{Attitude, Vec3, euler_from_quaternion, integrate_attitude_explicit};
use crate::quadrotor::Quadrotor;

#[derive(Clone, Debug)]
pub struct State {
    pub position_world_m: Vec3,
    pub velocity_world_mps: Vec3,
    pub attitude_body_to_world: Attitude,
    pub angular_velocity_body_rps: Vec3,
}

impl Default for State {
    fn default() -> Self {
        Self {
            position_world_m: Vec3::zeros(),
            velocity_world_mps: Vec3::zeros(),
            attitude_body_to_world: Attitude::identity(),
            angular_velocity_body_rps: Vec3::zeros(),
        }
    }
}

impl State {
    pub fn rotation_body_to_world(&self) -> nalgebra::Rotation3<f64> {
        self.attitude_body_to_world.to_rotation_matrix()
    }

    pub fn euler_angles_rad(&self) -> Vec3 {
        euler_from_quaternion(&self.attitude_body_to_world)
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct Sample {
    pub t: f64,
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub vx: f64,
    pub vy: f64,
    pub vz: f64,
    pub speed: f64,
    pub roll: f64,
    pub pitch: f64,
    pub pitch_unwrapped: f64,
    pub yaw: f64,
    pub yaw_unwrapped: f64,
    pub roll_target: f64,
    pub pitch_target: f64,
    pub yaw_target: f64,
    pub altitude_target: f64,
    pub p: f64,
    pub q: f64,
    pub r: f64,
    pub ax: f64,
    pub ay: f64,
    pub az: f64,
    pub m1: f64,
    pub m2: f64,
    pub m3: f64,
    pub m4: f64,
    pub thrust_total_n: f64,
    pub power_total_w: f64,
    pub current_total_a: f64,
    pub power_m1_w: f64,
    pub power_m2_w: f64,
    pub power_m3_w: f64,
    pub power_m4_w: f64,
    pub current_m1_a: f64,
    pub current_m2_a: f64,
    pub current_m3_a: f64,
    pub current_m4_a: f64,
    pub qw: f64,
    pub qx: f64,
    pub qy: f64,
    pub qz: f64,
    pub energy_wh: f64,
}

#[derive(Clone, Debug)]
pub struct SimulationResult {
    pub samples: Vec<Sample>,
}

#[derive(Clone, Copy, Debug)]
pub struct SimulationOptions {
    pub linear_drag_scale: f64,
    pub angular_drag_scale: f64,
    pub throttle_noise_std: f64,
    pub turbulence_intensity: f64,
    pub motor_time_constant_s: f64,
    pub noise_seed: u64,
}

#[derive(Clone, Debug)]
pub struct SimulationRuntime {
    vehicle: Quadrotor,
    controller: QuadController,
    dt_s: f64,
    options: SimulationOptions,
    total_steps: usize,
    current_step: usize,
    time_s: f64,
    pitch_unwrapped_rad: f64,
    yaw_unwrapped_rad: f64,
    state: State,
    samples: Vec<Sample>,
    rng: SimpleRng,
    turbulence_state: Vec3,
    actual_motor_throttles: [f64; 4],
    cumulative_energy_wh: f64,
    touchdown_speed_mps: Option<f64>,
    was_airborne: bool,
}

pub fn simulate(
    vehicle: &Quadrotor,
    controller: &QuadController,
    dt_s: f64,
    duration_s: f64,
) -> SimulationResult {
    simulate_with_options(
        vehicle,
        controller,
        dt_s,
        duration_s,
        SimulationOptions::default(),
    )
}

pub fn simulate_with_options(
    vehicle: &Quadrotor,
    controller: &QuadController,
    dt_s: f64,
    duration_s: f64,
    options: SimulationOptions,
) -> SimulationResult {
    let mut runtime = SimulationRuntime::new(
        vehicle.clone(),
        controller.clone(),
        dt_s,
        duration_s,
        options,
    );
    runtime.step_chunk(runtime.total_steps + 1);
    runtime.into_result()
}

impl Default for SimulationOptions {
    fn default() -> Self {
        Self {
            linear_drag_scale: 1.0,
            angular_drag_scale: 1.0,
            throttle_noise_std: 0.0,
            turbulence_intensity: 0.0,
            motor_time_constant_s: 0.0,
            noise_seed: 0x5eed_1234_5678_9abc,
        }
    }
}

impl SimulationRuntime {
    pub fn new(
        vehicle: Quadrotor,
        controller: QuadController,
        dt_s: f64,
        duration_s: f64,
        options: SimulationOptions,
    ) -> Self {
        let total_steps = (duration_s / dt_s).round() as usize;
        Self {
            vehicle,
            controller,
            dt_s,
            options,
            total_steps,
            current_step: 0,
            time_s: 0.0,
            pitch_unwrapped_rad: 0.0,
            yaw_unwrapped_rad: 0.0,
            state: State::default(),
            samples: Vec::with_capacity(total_steps + 1),
            rng: SimpleRng::new(options.noise_seed),
            turbulence_state: Vec3::zeros(),
            actual_motor_throttles: [0.0; 4],
            cumulative_energy_wh: 0.0,
            touchdown_speed_mps: None,
            was_airborne: false,
        }
    }

    pub fn step_chunk(&mut self, max_steps: usize) -> &[Sample] {
        let start = self.samples.len();
        for _ in 0..max_steps {
            if self.is_complete() {
                break;
            }
            self.step_once();
        }
        &self.samples[start..]
    }

    pub fn is_complete(&self) -> bool {
        self.current_step > self.total_steps
    }

    pub fn total_steps(&self) -> usize {
        self.total_steps + 1
    }

    pub fn samples(&self) -> &[Sample] {
        &self.samples
    }

    pub fn touchdown_speed_mps(&self) -> Option<f64> {
        self.touchdown_speed_mps
    }

    pub fn into_result(self) -> SimulationResult {
        SimulationResult { samples: self.samples }
    }

    fn step_once(&mut self) {
        let setpoint = self.controller.fallback_setpoint(self.time_s);
        let motor_commands = self
            .controller
            .motor_commands(&self.vehicle, &self.state, self.time_s);
        let motor_commands_with_noise = self.apply_motor_noise(motor_commands);
        let applied_motor_commands = self.apply_motor_delay(motor_commands_with_noise);
        let wrench = self.vehicle.wrench_from_commands(&applied_motor_commands);
        let euler_angles_rad = self.state.euler_angles_rad();
        let attitude = self.state.attitude_body_to_world.quaternion();
        let attitude_qw = attitude.w;
        let attitude_qx = attitude.i;
        let attitude_qy = attitude.j;
        let attitude_qz = attitude.k;

        let rotation = self.state.rotation_body_to_world();
        let velocity_body = rotation.inverse() * self.state.velocity_world_mps;
        let drag_body =
            -((self.vehicle.linear_drag_body * self.options.linear_drag_scale) * velocity_body);

        let turbulence_force_world = self.generate_turbulence_force();
        let total_force_world = rotation * (wrench.total_force_body_n + drag_body) + turbulence_force_world;
        let acceleration_world =
            total_force_world / self.vehicle.mass_kg + Vec3::new(0.0, 0.0, -self.vehicle.gravity_mps2);

        let angular_drag_body = -((self.vehicle.angular_drag_body * self.options.angular_drag_scale)
            * self.state.angular_velocity_body_rps);
        let gyroscopic = self
            .state
            .angular_velocity_body_rps
            .cross(&(self.vehicle.inertia_kg_m2 * self.state.angular_velocity_body_rps));
        let angular_accel_body = self.vehicle.inertia_inv
            * (wrench.total_torque_body_nm + angular_drag_body - gyroscopic);

        self.samples.push(Sample {
            t: self.time_s,
            x: self.state.position_world_m.x,
            y: self.state.position_world_m.y,
            z: self.state.position_world_m.z,
            vx: self.state.velocity_world_mps.x,
            vy: self.state.velocity_world_mps.y,
            vz: self.state.velocity_world_mps.z,
            speed: self.state.velocity_world_mps.norm(),
            roll: euler_angles_rad.x,
            pitch: euler_angles_rad.y,
            pitch_unwrapped: self.pitch_unwrapped_rad,
            yaw: euler_angles_rad.z,
            yaw_unwrapped: self.yaw_unwrapped_rad,
            roll_target: setpoint.roll_rad,
            pitch_target: setpoint.pitch_rad,
            yaw_target: setpoint.yaw_rad,
            altitude_target: setpoint.altitude_m,
            p: self.state.angular_velocity_body_rps.x,
            q: self.state.angular_velocity_body_rps.y,
            r: self.state.angular_velocity_body_rps.z,
            ax: acceleration_world.x,
            ay: acceleration_world.y,
            az: acceleration_world.z,
            m1: applied_motor_commands[0],
            m2: applied_motor_commands[1],
            m3: applied_motor_commands[2],
            m4: applied_motor_commands[3],
            thrust_total_n: wrench.total_force_body_n.z,
            power_total_w: wrench.total_power_w,
            current_total_a: wrench.total_current_a,
            power_m1_w: wrench.motor_effects[0].electrical_power_w,
            power_m2_w: wrench.motor_effects[1].electrical_power_w,
            power_m3_w: wrench.motor_effects[2].electrical_power_w,
            power_m4_w: wrench.motor_effects[3].electrical_power_w,
            current_m1_a: wrench.motor_effects[0].current_a,
            current_m2_a: wrench.motor_effects[1].current_a,
            current_m3_a: wrench.motor_effects[2].current_a,
            current_m4_a: wrench.motor_effects[3].current_a,
            qw: attitude_qw,
            qx: attitude_qx,
            qy: attitude_qy,
            qz: attitude_qz,
            energy_wh: self.cumulative_energy_wh,
        });

        if self.current_step == self.total_steps {
            self.current_step += 1;
            return;
        }

        self.cumulative_energy_wh += wrench.total_power_w * self.dt_s / 3600.0;

        let prev_z = self.state.position_world_m.z;

        self.state.velocity_world_mps += acceleration_world * self.dt_s;
        self.state.position_world_m += self.state.velocity_world_mps * self.dt_s;

        if self.state.position_world_m.z > 0.001 {
            self.was_airborne = true;
        }

        if self.state.position_world_m.z < 0.0 {
            if self.was_airborne && self.touchdown_speed_mps.is_none() && prev_z > 0.001 {
                self.touchdown_speed_mps = Some(self.state.velocity_world_mps.norm());
            }

            self.state.position_world_m.z = 0.0;

            if self.state.velocity_world_mps.z < 0.0 {
                self.state.velocity_world_mps.z = 0.0;
            }

            if self.state.position_world_m.z <= 0.001 {
                self.state.velocity_world_mps.x = 0.0;
                self.state.velocity_world_mps.y = 0.0;
            }
        }

        self.state.attitude_body_to_world = integrate_attitude_explicit(
            &self.state.attitude_body_to_world,
            self.state.angular_velocity_body_rps,
            self.dt_s,
        );
        self.pitch_unwrapped_rad += self.state.angular_velocity_body_rps.y * self.dt_s;
        self.yaw_unwrapped_rad += self.state.angular_velocity_body_rps.z * self.dt_s;
        self.state.angular_velocity_body_rps += angular_accel_body * self.dt_s;
        self.time_s += self.dt_s;
        self.current_step += 1;
    }

    fn apply_motor_noise(&mut self, motor_commands: [f64; 4]) -> [f64; 4] {
        if self.options.throttle_noise_std <= 0.0 {
            return motor_commands;
        }

        motor_commands.map(|command| {
            (command + self.rng.gaussian() * self.options.throttle_noise_std).clamp(0.0, 1.0)
        })
    }

    fn apply_motor_delay(&mut self, target_commands: [f64; 4]) -> [f64; 4] {
        if self.options.motor_time_constant_s <= 0.0 {
            self.actual_motor_throttles = target_commands;
            return target_commands;
        }

        let alpha = self.dt_s / (self.options.motor_time_constant_s + self.dt_s);
        for i in 0..4 {
            self.actual_motor_throttles[i] +=
                alpha * (target_commands[i] - self.actual_motor_throttles[i]);
        }

        self.actual_motor_throttles
    }

    fn generate_turbulence_force(&mut self) -> Vec3 {
        if self.options.turbulence_intensity <= 0.0 {
            return Vec3::zeros();
        }

        let correlation_time_s = 0.5;
        let alpha = self.dt_s / (correlation_time_s + self.dt_s);

        let new_noise = Vec3::new(
            self.rng.gaussian(),
            self.rng.gaussian(),
            self.rng.gaussian(),
        );

        self.turbulence_state = self.turbulence_state * (1.0 - alpha) + new_noise * alpha;

        self.turbulence_state * self.options.turbulence_intensity * self.vehicle.mass_kg
    }
}

#[derive(Clone, Debug)]
struct SimpleRng {
    state: u64,
    spare_gaussian: Option<f64>,
}

impl SimpleRng {
    fn new(seed: u64) -> Self {
        Self {
            state: seed.max(1),
            spare_gaussian: None,
        }
    }

    fn next_f64(&mut self) -> f64 {
        let mut x = self.state;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.state = x;
        (x as f64 / u64::MAX as f64).clamp(1.0e-12, 1.0 - 1.0e-12)
    }

    fn gaussian(&mut self) -> f64 {
        if let Some(spare) = self.spare_gaussian.take() {
            return spare;
        }

        let u1 = self.next_f64();
        let u2 = self.next_f64();
        let radius = (-2.0 * u1.ln()).sqrt();
        let theta = 2.0 * std::f64::consts::PI * u2;
        self.spare_gaussian = Some(radius * theta.sin());
        radius * theta.cos()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::quadrotor::Quadrotor;

    #[test]
    fn settles_toward_drag_limited_forward_velocity() {
        let vehicle = Quadrotor::default();
        let mut controller = QuadController::default();
        controller.timeline = vec![
            crate::controller::MissionAction::Setpoint(crate::controller::AttitudeSetpoint {
                start_time_s: 0.0,
                altitude_m: 30.0,
                roll_rad: 0.0,
                pitch_rad: 3.0_f64.to_radians(),
                yaw_rad: 0.0,
                yaw_rate_rad_s: 0.0,
            }),
            crate::controller::MissionAction::Setpoint(crate::controller::AttitudeSetpoint {
                start_time_s: 18.0,
                altitude_m: 30.0,
                roll_rad: 2.0_f64.to_radians(),
                pitch_rad: 3.0_f64.to_radians(),
                yaw_rad: 0.0,
                yaw_rate_rad_s: 0.0,
            }),
        ];
        let result = simulate(&vehicle, &controller, 0.01, 45.0);
        let last = result.samples.last().expect("sample");
        let previous = &result.samples[result.samples.len() - 200];

        assert!((last.z - 30.0).abs() < 0.25);
        assert!((last.pitch.to_degrees() - 3.0).abs() < 0.2);
        assert!((last.roll.to_degrees() - 2.0).abs() < 0.2);
        assert!((last.vx - previous.vx).abs() < 0.08);
        assert!((last.vy - previous.vy).abs() < 0.08);
    }

    #[test]
    fn front_flip_reaches_nearly_full_rotation() {
        let vehicle = Quadrotor::default();
        let mut controller = QuadController::default();
        controller.timeline = vec![
            crate::controller::MissionAction::Setpoint(crate::controller::AttitudeSetpoint {
                start_time_s: 0.0,
                altitude_m: 30.0,
                roll_rad: 0.0,
                pitch_rad: 0.0,
                yaw_rad: 0.0,
                yaw_rate_rad_s: 0.0,
            }),
            crate::controller::MissionAction::FrontFlip(crate::controller::FrontFlipManeuver {
                start_time_s: 10.0,
                duration_s: 1.45,
                thrust_factor: 1.24,
                max_pitch_torque_nm: 1.85,
            }),
        ];
        let result = simulate(&vehicle, &controller, 0.01, 16.0);
        let max_pitch_unwrapped = result
            .samples
            .iter()
            .map(|sample| sample.pitch_unwrapped)
            .fold(f64::NEG_INFINITY, f64::max);
        let final_sample = result.samples.last().unwrap();

        assert!(max_pitch_unwrapped > 5.2);
        assert!(max_pitch_unwrapped < 8.0);
        assert!((final_sample.pitch.to_degrees() - 0.0).abs() < 1.0); // should return to 0 pitch
        assert!(final_sample.q.abs() < 0.5);
    }

    #[test]
    fn helix_maneuver_follows_curved_path() {
        let vehicle = Quadrotor::default();
        let mut controller = QuadController::default();
        controller.timeline = vec![
            crate::controller::MissionAction::Setpoint(crate::controller::AttitudeSetpoint {
                start_time_s: 0.0,
                altitude_m: 30.0,
                roll_rad: 0.0,
                pitch_rad: 0.0,
                yaw_rad: 0.0,
                yaw_rate_rad_s: 0.0,
            }),
            crate::controller::MissionAction::Helix(crate::controller::HelixManeuver {
                start_time_s: 10.0,
                duration_s: 25.0,
                radius_m: 3.0,
                angular_velocity_rps: 0.6,
                forward_velocity_mps: 8.0,
            }),
        ];
        // Run for enough time to see circles
        let result = simulate(&vehicle, &controller, 0.01, 35.0);
        let final_sample = result.samples.last().unwrap();

        // Check horizontal displacement (should be moving forward in X)
        assert!(final_sample.x > 40.0);
        // Check altitude maintenance
        assert!((final_sample.z - 30.0).abs() < 1.0);
        
        // Verify it was actually turning (check Y range)
        let min_y = result.samples.iter().map(|s| s.y).fold(f64::INFINITY, f64::min);
        let max_y = result.samples.iter().map(|s| s.y).fold(f64::NEG_INFINITY, f64::max);
        assert!(max_y - min_y > 4.0);
    }
}
