use crate::math::Vec3;
use serde::Serialize;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub enum SpinDirection {
    Cw,
    Ccw,
}

impl SpinDirection {
    pub fn sign(self) -> f64 {
        match self {
            Self::Cw => -1.0,
            Self::Ccw => 1.0,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Cw => "CW",
            Self::Ccw => "CCW",
        }
    }
}

#[derive(Clone, Debug)]
pub struct Motor {
    pub name: &'static str,
    pub position_body_m: Vec3,
    pub spin: SpinDirection,
    pub thrust_coeff: f64,
    pub yaw_moment_coeff: f64,
    pub max_electrical_power_w: f64,
}

#[derive(Clone, Debug, Serialize)]
pub struct MotorEffect {
    pub thrust_n: f64,
    pub body_force: [f64; 3],
    pub body_torque: [f64; 3],
    pub electrical_power_w: f64,
    pub current_a: f64,
}

impl Motor {
    pub fn normalized_load(&self, throttle: f64) -> f64 {
        throttle.clamp(0.0, 1.0).powi(2)
    }

    pub fn thrust_n(&self, throttle: f64) -> f64 {
        self.thrust_coeff * self.normalized_load(throttle)
    }

    pub fn thrust_force_body(&self, throttle: f64) -> Vec3 {
        Vec3::new(0.0, 0.0, self.thrust_n(throttle))
    }

    pub fn reaction_torque_body(&self, throttle: f64) -> Vec3 {
        Vec3::new(
            0.0,
            0.0,
            self.spin.sign() * self.yaw_moment_coeff * self.normalized_load(throttle),
        )
    }

    pub fn electrical_power_w(&self, throttle: f64) -> f64 {
        self.max_electrical_power_w * throttle.clamp(0.0, 1.0).powi(3)
    }

    pub fn effect_on_body(&self, throttle: f64, battery_voltage_v: f64) -> MotorEffect {
        let force_body = self.thrust_force_body(throttle);
        let torque_body =
            self.position_body_m.cross(&force_body) + self.reaction_torque_body(throttle);
        let electrical_power_w = self.electrical_power_w(throttle);
        let current_a = electrical_power_w / battery_voltage_v.max(1.0);

        MotorEffect {
            thrust_n: force_body.z,
            body_force: [force_body.x, force_body.y, force_body.z],
            body_torque: [torque_body.x, torque_body.y, torque_body.z],
            electrical_power_w,
            current_a,
        }
    }
}
