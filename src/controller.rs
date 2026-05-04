use crate::math::{Vec3, wrap_angle};
use crate::quadrotor::Quadrotor;
use crate::simulation::State;

#[derive(Clone, Copy, Debug)]
pub struct AttitudeSetpoint {
    pub start_time_s: f64,
    pub altitude_m: f64,
    pub roll_rad: f64,
    pub pitch_rad: f64,
    pub yaw_rad: f64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ManeuverMode {
    None,
    FrontFlip,
}

#[derive(Clone, Copy, Debug)]
pub struct FrontFlipManeuver {
    pub start_time_s: f64,
    pub duration_s: f64,
    pub thrust_factor: f64,
    pub max_pitch_torque_nm: f64,
}

#[derive(Clone, Debug)]
pub struct QuadController {
    pub schedule: Vec<AttitudeSetpoint>,
    pub maneuver_mode: ManeuverMode,
    pub front_flip: FrontFlipManeuver,
    pub altitude_kp: f64,
    pub altitude_kd: f64,
    pub attitude_kp: Vec3,
    pub attitude_kd: Vec3,
    pub pitch_rate_kp: f64,
}

impl Default for QuadController {
    fn default() -> Self {
        Self {
            schedule: vec![
                AttitudeSetpoint {
                    start_time_s: 0.0,
                    altitude_m: 30.0,
                    roll_rad: 0.0,
                    pitch_rad: 3.0_f64.to_radians(),
                    yaw_rad: 0.0,
                },
                AttitudeSetpoint {
                    start_time_s: 18.0,
                    altitude_m: 30.0,
                    roll_rad: 2.0_f64.to_radians(),
                    pitch_rad: 3.0_f64.to_radians(),
                    yaw_rad: 0.0,
                },
            ],
            maneuver_mode: ManeuverMode::None,
            front_flip: FrontFlipManeuver {
                start_time_s: 10.0,
                duration_s: 1.45,
                thrust_factor: 1.24,
                max_pitch_torque_nm: 1.85,
            },
            altitude_kp: 2.8,
            altitude_kd: 2.0,
            attitude_kp: Vec3::new(4.8, 5.8, 2.5),
            attitude_kd: Vec3::new(1.25, 1.4, 0.85),
            pitch_rate_kp: 1.15,
        }
    }
}

impl QuadController {
    pub fn setpoint_at(&self, time_s: f64) -> AttitudeSetpoint {
        let mut active = self.schedule[0];
        for setpoint in &self.schedule {
            if time_s >= setpoint.start_time_s {
                active = *setpoint;
            } else {
                break;
            }
        }
        active
    }

    pub fn motor_commands(&self, vehicle: &Quadrotor, state: &State, time_s: f64) -> [f64; 4] {
        let setpoint = self.setpoint_at(time_s);

        if self.maneuver_mode == ManeuverMode::FrontFlip && self.front_flip_active(time_s) {
            return self.front_flip_commands(vehicle, state, setpoint, time_s);
        }

        let altitude_error = setpoint.altitude_m - state.position_world_m.z;
        let vertical_velocity_error = -state.velocity_world_mps.z;
        let commanded_vertical_accel =
            self.altitude_kp * altitude_error + self.altitude_kd * vertical_velocity_error;

        let rotation = state.rotation_body_to_world();
        let body_z_world = rotation * Vec3::new(0.0, 0.0, 1.0);
        let lift_projection = body_z_world.z.max(0.35);

        let collective_thrust_n =
            (vehicle.mass_kg * (vehicle.gravity_mps2 + commanded_vertical_accel)) / lift_projection;

        let euler_angles_rad = state.euler_angles_rad();
        let attitude_error = Vec3::new(
            setpoint.roll_rad - euler_angles_rad.x,
            setpoint.pitch_rad - euler_angles_rad.y,
            wrap_angle(setpoint.yaw_rad - euler_angles_rad.z),
        );
        let body_torque_nm = self.attitude_kp.component_mul(&attitude_error)
            + self
                .attitude_kd
                .component_mul(&(-state.angular_velocity_body_rps));

        vehicle.commands_from_wrench(collective_thrust_n, body_torque_nm)
    }

    fn front_flip_active(&self, time_s: f64) -> bool {
        time_s >= self.front_flip.start_time_s
            && time_s <= self.front_flip.start_time_s + self.front_flip.duration_s
    }

    fn front_flip_commands(
        &self,
        vehicle: &Quadrotor,
        state: &State,
        setpoint: AttitudeSetpoint,
        time_s: f64,
    ) -> [f64; 4] {
        let euler_angles_rad = state.euler_angles_rad();
        let altitude_error = setpoint.altitude_m - state.position_world_m.z;
        let vertical_velocity_error = -state.velocity_world_mps.z;
        let progress = ((time_s - self.front_flip.start_time_s) / self.front_flip.duration_s)
            .clamp(0.0, 1.0);
        let desired_pitch_rate_rps =
            std::f64::consts::PI.powi(2) / self.front_flip.duration_s
                * (std::f64::consts::PI * progress).sin();
        let desired_pitch_accel_rps2 =
            std::f64::consts::PI.powi(3) / self.front_flip.duration_s.powi(2)
                * (std::f64::consts::PI * progress).cos();
        let thrust_shape = 1.0 + 0.14 * (std::f64::consts::PI * progress).sin().powi(2);

        let collective_thrust_n = vehicle.mass_kg
            * vehicle.gravity_mps2
            * self.front_flip.thrust_factor
            * thrust_shape
            + vehicle.mass_kg * (0.35 * altitude_error + 0.18 * vertical_velocity_error);

        let roll_torque_nm = 3.4 * (setpoint.roll_rad - euler_angles_rad.x)
            - 0.95 * state.angular_velocity_body_rps.x;
        let pitch_torque_nm = (vehicle.inertia_kg_m2[(1, 1)] * desired_pitch_accel_rps2
            + self.pitch_rate_kp
                * (desired_pitch_rate_rps - state.angular_velocity_body_rps.y))
            .clamp(
                -self.front_flip.max_pitch_torque_nm,
                self.front_flip.max_pitch_torque_nm,
            );
        let yaw_torque_nm = 2.0 * wrap_angle(setpoint.yaw_rad - euler_angles_rad.z)
            - 0.55 * state.angular_velocity_body_rps.z;

        vehicle.commands_from_wrench(
            collective_thrust_n,
            Vec3::new(roll_torque_nm, pitch_torque_nm, yaw_torque_nm),
        )
    }
}
