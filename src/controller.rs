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
    pub yaw_rate_rad_s: f64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ManeuverMode {
    None,
    FrontFlip,
    Helix,
}

#[derive(Clone, Copy, Debug)]
pub struct FrontFlipManeuver {
    pub start_time_s: f64,
    pub duration_s: f64,
    pub thrust_factor: f64,
    pub max_pitch_torque_nm: f64,
}

#[derive(Clone, Copy, Debug)]
pub struct HelixManeuver {
    pub start_time_s: f64,
    pub duration_s: f64,
    pub radius_m: f64,
    pub angular_velocity_rps: f64,
    pub forward_velocity_mps: f64,
}

#[derive(Clone, Copy, Debug)]
pub struct PositionSetpoint {
    pub start_time_s: f64,
    pub position_m: Vec3,
    pub yaw_rad: f64,
}

#[derive(Clone, Copy, Debug)]
pub struct LandManeuver {
    pub start_time_s: f64,
}

#[derive(Clone, Copy, Debug)]
pub enum MissionAction {
    Setpoint(AttitudeSetpoint),
    Position(PositionSetpoint),
    FrontFlip(FrontFlipManeuver),
    Helix(HelixManeuver),
    Land(LandManeuver),
}

impl MissionAction {
    pub fn start_time_s(&self) -> f64 {
        match self {
            MissionAction::Setpoint(s) => s.start_time_s,
            MissionAction::Position(p) => p.start_time_s,
            MissionAction::FrontFlip(f) => f.start_time_s,
            MissionAction::Helix(h) => h.start_time_s,
            MissionAction::Land(l) => l.start_time_s,
        }
    }
}

#[derive(Clone, Debug)]
pub struct QuadController {
    pub timeline: Vec<MissionAction>,
    pub altitude_kp: f64,
    pub altitude_kd: f64,
    pub attitude_kp: Vec3,
    pub attitude_kd: Vec3,
    pub pitch_rate_kp: f64,
}

impl Default for QuadController {
    fn default() -> Self {
        Self {
            timeline: vec![
                MissionAction::Setpoint(AttitudeSetpoint {
                    start_time_s: 0.0,
                    altitude_m: 30.0,
                    roll_rad: 0.0,
                    pitch_rad: 3.0_f64.to_radians(),
                    yaw_rad: 0.0,
                    yaw_rate_rad_s: 0.0,
                }),
                MissionAction::FrontFlip(FrontFlipManeuver {
                    start_time_s: 12.0,
                    duration_s: 1.45,
                    thrust_factor: 1.24,
                    max_pitch_torque_nm: 1.85,
                }),
                MissionAction::FrontFlip(FrontFlipManeuver {
                    start_time_s: 18.0,
                    duration_s: 1.45,
                    thrust_factor: 1.24,
                    max_pitch_torque_nm: 1.85,
                }),
                MissionAction::Setpoint(AttitudeSetpoint {
                    start_time_s: 20.0,
                    altitude_m: 10.0,
                    roll_rad: (-10.0_f64).to_radians(),
                    pitch_rad: 10.0_f64.to_radians(),
                    yaw_rad: 0.0,
                    yaw_rate_rad_s: 0.0,
                }),
            ],
            altitude_kp: 2.8,
            altitude_kd: 2.0,
            attitude_kp: Vec3::new(4.8, 5.8, 2.5),
            attitude_kd: Vec3::new(1.25, 1.4, 0.85),
            pitch_rate_kp: 1.15,
        }
    }
}

impl QuadController {
    pub fn active_action(&self, time_s: f64) -> MissionAction {
        let mut active = self.timeline[0];
        for action in &self.timeline {
            if time_s >= action.start_time_s() {
                active = *action;
            } else {
                break;
            }
        }
        active
    }

    pub fn fallback_setpoint(&self, time_s: f64) -> AttitudeSetpoint {
        let mut last_setpoint = AttitudeSetpoint {
            start_time_s: 0.0,
            altitude_m: 30.0,
            roll_rad: 0.0,
            pitch_rad: 0.0,
            yaw_rad: 0.0,
            yaw_rate_rad_s: 0.0,
        };
        for action in &self.timeline {
            if time_s >= action.start_time_s() {
                if let MissionAction::Setpoint(sp) = action {
                    last_setpoint = *sp;
                }
            } else {
                break;
            }
        }
        last_setpoint
    }

    pub fn motor_commands(&self, vehicle: &Quadrotor, state: &State, time_s: f64) -> [f64; 4] {
        let action = self.active_action(time_s);

        match action {
            MissionAction::Setpoint(setpoint) => {
                return self.track_setpoint(vehicle, state, setpoint);
            }
            MissionAction::Position(position) => {
                return self.track_position(vehicle, state, position);
            }
            MissionAction::FrontFlip(flip) => {
                if time_s <= flip.start_time_s + flip.duration_s {
                    let fallback = self.fallback_setpoint(time_s);
                    return self.front_flip_commands(vehicle, state, fallback, flip, time_s);
                }
            }
            MissionAction::Helix(helix) => {
                if time_s <= helix.start_time_s + helix.duration_s {
                    let fallback = self.fallback_setpoint(time_s);
                    return self.helix_commands(vehicle, state, fallback, helix, time_s);
                }
            }
            MissionAction::Land(land) => {
                return self.land_commands(vehicle, state, land, time_s);
            }
        }

        // Default Setpoint Tracking (e.g. if a maneuver expired)
        let setpoint = self.fallback_setpoint(time_s);
        self.track_setpoint(vehicle, state, setpoint)
    }

    fn track_setpoint(&self, vehicle: &Quadrotor, state: &State, setpoint: AttitudeSetpoint) -> [f64; 4] {
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

        let p_des = -setpoint.yaw_rate_rad_s * euler_angles_rad.y.sin();
        let q_des = setpoint.yaw_rate_rad_s * euler_angles_rad.x.sin() * euler_angles_rad.y.cos();
        let r_des = setpoint.yaw_rate_rad_s * euler_angles_rad.x.cos() * euler_angles_rad.y.cos();
        let rate_error = Vec3::new(p_des, q_des, r_des) - state.angular_velocity_body_rps;

        let body_torque_nm = self.attitude_kp.component_mul(&attitude_error)
            + self.attitude_kd.component_mul(&rate_error);

        vehicle.commands_from_wrench(collective_thrust_n, body_torque_nm)
    }

    fn track_position(&self, vehicle: &Quadrotor, state: &State, position: PositionSetpoint) -> [f64; 4] {
        let position_error = position.position_m - state.position_world_m;
        let velocity_error = -state.velocity_world_mps;

        let kp_xy = 0.8;
        let kd_xy = 1.2;
        let max_tilt_rad = 0.35;

        let commanded_accel_xy = Vec3::new(
            (kp_xy * position_error.x + kd_xy * velocity_error.x).clamp(-3.0, 3.0),
            (kp_xy * position_error.y + kd_xy * velocity_error.y).clamp(-3.0, 3.0),
            0.0,
        );

        let altitude_error = position.position_m.z - state.position_world_m.z;
        let vertical_velocity_error = -state.velocity_world_mps.z;
        let commanded_vertical_accel = self.altitude_kp * altitude_error + self.altitude_kd * vertical_velocity_error;

        let rotation = state.rotation_body_to_world();
        let body_z_world = rotation * Vec3::new(0.0, 0.0, 1.0);
        let lift_projection = body_z_world.z.max(0.35);

        let collective_thrust_n =
            (vehicle.mass_kg * (vehicle.gravity_mps2 + commanded_vertical_accel)) / lift_projection;

        let g = vehicle.gravity_mps2;
        let pitch_target = (commanded_accel_xy.x / g).atan().clamp(-max_tilt_rad, max_tilt_rad);
        let roll_target = (-commanded_accel_xy.y / g).atan().clamp(-max_tilt_rad, max_tilt_rad);

        let euler_angles_rad = state.euler_angles_rad();
        let attitude_error = Vec3::new(
            roll_target - euler_angles_rad.x,
            pitch_target - euler_angles_rad.y,
            wrap_angle(position.yaw_rad - euler_angles_rad.z),
        );

        let rate_error = -state.angular_velocity_body_rps;
        let body_torque_nm = self.attitude_kp.component_mul(&attitude_error)
            + self.attitude_kd.component_mul(&rate_error);

        vehicle.commands_from_wrench(collective_thrust_n, body_torque_nm)
    }

    fn land_commands(
        &self,
        vehicle: &Quadrotor,
        state: &State,
        land: LandManeuver,
        time_s: f64,
    ) -> [f64; 4] {
        let altitude = state.position_world_m.z;
        
        if altitude < 0.05 && time_s > land.start_time_s + 1.0 {
            return [0.0, 0.0, 0.0, 0.0];
        }

        let land_setpoint = AttitudeSetpoint {
            start_time_s: land.start_time_s,
            altitude_m: 0.0,
            roll_rad: 0.0,
            pitch_rad: 0.0,
            yaw_rad: 0.0,
            yaw_rate_rad_s: 0.0,
        };

        self.track_setpoint(vehicle, state, land_setpoint)
    }

    fn helix_commands(
        &self,
        vehicle: &Quadrotor,
        state: &State,
        base_setpoint: AttitudeSetpoint,
        helix: HelixManeuver,
        time_s: f64,
    ) -> [f64; 4] {
        let t = time_s - helix.start_time_s;
        let omega = helix.angular_velocity_rps;
        let radius = helix.radius_m;

        let ax = -radius * omega * omega * (omega * t).sin();
        let ay = -radius * omega * omega * (omega * t).cos();

        let vx = helix.forward_velocity_mps + radius * omega * (omega * t).cos();
        let vy = -radius * omega * (omega * t).sin();
        let yaw_target = vy.atan2(vx);

        let cos_y = yaw_target.cos();
        let sin_y = yaw_target.sin();
        let ax_body = ax * cos_y + ay * sin_y;
        let ay_body = -ax * sin_y + ay * cos_y;

        let g = 9.81;
        let drag_offset = 0.10;
        let pitch_target = (ax_body / g).atan() + drag_offset;
        let roll_target = (ay_body / (g * pitch_target.cos())).atan();

        let helix_setpoint = AttitudeSetpoint {
            start_time_s: helix.start_time_s,
            altitude_m: base_setpoint.altitude_m,
            roll_rad: roll_target,
            pitch_rad: pitch_target,
            yaw_rad: yaw_target,
            yaw_rate_rad_s: omega,
        };

        self.track_setpoint(vehicle, state, helix_setpoint)
    }

    fn front_flip_commands(
        &self,
        vehicle: &Quadrotor,
        state: &State,
        setpoint: AttitudeSetpoint,
        flip: FrontFlipManeuver,
        time_s: f64,
    ) -> [f64; 4] {
        let euler_angles_rad = state.euler_angles_rad();
        let altitude_error = setpoint.altitude_m - state.position_world_m.z;
        let vertical_velocity_error = -state.velocity_world_mps.z;
        
        let progress = ((time_s - flip.start_time_s) / flip.duration_s).clamp(0.0, 1.0);
        
        let desired_pitch_rate_rps =
            std::f64::consts::PI.powi(2) / flip.duration_s * (std::f64::consts::PI * progress).sin();
        let desired_pitch_accel_rps2 =
            std::f64::consts::PI.powi(3) / flip.duration_s.powi(2) * (std::f64::consts::PI * progress).cos();
        let thrust_shape = 1.0 + 0.14 * (std::f64::consts::PI * progress).sin().powi(2);

        let collective_thrust_n = vehicle.mass_kg
            * vehicle.gravity_mps2
            * flip.thrust_factor
            * thrust_shape
            + vehicle.mass_kg * (0.35 * altitude_error + 0.18 * vertical_velocity_error);

        let roll_torque_nm = self.attitude_kp.x * (setpoint.roll_rad - euler_angles_rad.x)
            + self.attitude_kd.x * (-state.angular_velocity_body_rps.x);
        let pitch_torque_nm = (vehicle.inertia_kg_m2[(1, 1)] * desired_pitch_accel_rps2
            + self.pitch_rate_kp * (desired_pitch_rate_rps - state.angular_velocity_body_rps.y))
            .clamp(-flip.max_pitch_torque_nm, flip.max_pitch_torque_nm);
        let yaw_torque_nm = self.attitude_kp.z * wrap_angle(setpoint.yaw_rad - euler_angles_rad.z)
            + self.attitude_kd.z * (-state.angular_velocity_body_rps.z);

        vehicle.commands_from_wrench(
            collective_thrust_n,
            Vec3::new(roll_torque_nm, pitch_torque_nm, yaw_torque_nm),
        )
    }
}
