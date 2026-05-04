use nalgebra::Vector4;

use crate::math::{Mat3, Mat4, Vec3};
use crate::motor::{Motor, MotorEffect, SpinDirection};

#[derive(Clone, Debug)]
pub struct Quadrotor {
    pub mass_kg: f64,
    pub gravity_mps2: f64,
    pub inertia_kg_m2: Mat3,
    pub inertia_inv: Mat3,
    pub linear_drag_body: Mat3,
    pub angular_drag_body: Mat3,
    pub battery_voltage_v: f64,
    pub motors: [Motor; 4],
}

#[derive(Clone, Debug)]
pub struct BodyWrench {
    pub total_force_body_n: Vec3,
    pub total_torque_body_nm: Vec3,
    pub total_power_w: f64,
    pub total_current_a: f64,
    pub motor_effects: [MotorEffect; 4],
}

impl Default for Quadrotor {
    fn default() -> Self {
        let arm = 0.23_f64 / std::f64::consts::SQRT_2;
        let thrust_coeff = 7.5;
        let yaw_moment_coeff = 0.14;
        let max_electrical_power_w = 180.0;
        let motors = [
            Motor {
                name: "motor_1",
                position_body_m: Vec3::new(arm, arm, 0.0),
                spin: SpinDirection::Ccw,
                thrust_coeff,
                yaw_moment_coeff,
                max_electrical_power_w,
            },
            Motor {
                name: "motor_2",
                position_body_m: Vec3::new(arm, -arm, 0.0),
                spin: SpinDirection::Cw,
                thrust_coeff,
                yaw_moment_coeff,
                max_electrical_power_w,
            },
            Motor {
                name: "motor_3",
                position_body_m: Vec3::new(-arm, -arm, 0.0),
                spin: SpinDirection::Ccw,
                thrust_coeff,
                yaw_moment_coeff,
                max_electrical_power_w,
            },
            Motor {
                name: "motor_4",
                position_body_m: Vec3::new(-arm, arm, 0.0),
                spin: SpinDirection::Cw,
                thrust_coeff,
                yaw_moment_coeff,
                max_electrical_power_w,
            },
        ];

        let inertia_kg_m2 = Mat3::new(0.021, 0.0, 0.0, 0.0, 0.021, 0.0, 0.0, 0.0, 0.039);

        Self {
            mass_kg: 1.35,
            gravity_mps2: 9.81,
            inertia_inv: inertia_kg_m2
                .try_inverse()
                .expect("inertia matrix must be invertible"),
            inertia_kg_m2,
            linear_drag_body: Mat3::new(0.55, 0.0, 0.0, 0.0, 0.55, 0.0, 0.0, 0.0, 0.45),
            angular_drag_body: Mat3::new(0.02, 0.0, 0.0, 0.0, 0.02, 0.0, 0.0, 0.0, 0.03),
            battery_voltage_v: 14.8,
            motors,
        }
    }
}

impl Quadrotor {
    pub fn thrust_to_weight_ratio(&self) -> f64 {
        self.max_total_thrust_n() / (self.mass_kg * self.gravity_mps2)
    }

    pub fn set_thrust_to_weight_ratio(&mut self, target_ratio: f64) {
        let current_ratio = self.thrust_to_weight_ratio().max(1.0e-6);
        let scale = target_ratio.max(0.25) / current_ratio;
        for motor in &mut self.motors {
            motor.thrust_coeff *= scale;
            motor.yaw_moment_coeff *= scale;
            motor.max_electrical_power_w *= scale;
        }
    }

    pub fn hover_throttle(&self) -> f64 {
        let thrust_per_motor = self.mass_kg * self.gravity_mps2 / self.motors.len() as f64;
        (thrust_per_motor / self.motors[0].thrust_coeff).sqrt()
    }

    pub fn max_total_thrust_n(&self) -> f64 {
        self.motors.iter().map(|motor| motor.thrust_n(1.0)).sum()
    }

    pub fn allocation_matrix(&self) -> Mat4 {
        Mat4::from_columns(&[
            self.motor_wrench_column(&self.motors[0]),
            self.motor_wrench_column(&self.motors[1]),
            self.motor_wrench_column(&self.motors[2]),
            self.motor_wrench_column(&self.motors[3]),
        ])
    }

    pub fn allocation_matrix_inv(&self) -> Mat4 {
        self.allocation_matrix()
            .try_inverse()
            .expect("allocation matrix must be invertible")
    }

    pub fn wrench_from_commands(&self, throttles: &[f64; 4]) -> BodyWrench {
        let motor_effects = [
            self.motors[0].effect_on_body(throttles[0], self.battery_voltage_v),
            self.motors[1].effect_on_body(throttles[1], self.battery_voltage_v),
            self.motors[2].effect_on_body(throttles[2], self.battery_voltage_v),
            self.motors[3].effect_on_body(throttles[3], self.battery_voltage_v),
        ];

        let mut total_force_body_n = Vec3::zeros();
        let mut total_torque_body_nm = Vec3::zeros();
        let mut total_power_w = 0.0;
        let mut total_current_a = 0.0;

        for effect in &motor_effects {
            total_force_body_n += Vec3::new(
                effect.body_force[0],
                effect.body_force[1],
                effect.body_force[2],
            );
            total_torque_body_nm += Vec3::new(
                effect.body_torque[0],
                effect.body_torque[1],
                effect.body_torque[2],
            );
            total_power_w += effect.electrical_power_w;
            total_current_a += effect.current_a;
        }

        BodyWrench {
            total_force_body_n,
            total_torque_body_nm,
            total_power_w,
            total_current_a,
            motor_effects,
        }
    }

    pub fn commands_from_wrench(
        &self,
        total_thrust_n: f64,
        body_torque_nm: Vec3,
    ) -> [f64; 4] {
        let desired_wrench = Vector4::new(
            total_thrust_n.clamp(0.0, self.max_total_thrust_n()),
            body_torque_nm.x,
            body_torque_nm.y,
            body_torque_nm.z,
        );
        let loads = self.allocation_matrix_inv() * desired_wrench;
        [
            loads[0].max(0.0).sqrt().clamp(0.0, 1.0),
            loads[1].max(0.0).sqrt().clamp(0.0, 1.0),
            loads[2].max(0.0).sqrt().clamp(0.0, 1.0),
            loads[3].max(0.0).sqrt().clamp(0.0, 1.0),
        ]
    }

    fn motor_wrench_column(&self, motor: &Motor) -> Vector4<f64> {
        let unit_effect = motor.effect_on_body(1.0, self.battery_voltage_v);
        let load = motor.normalized_load(1.0);
        Vector4::new(
            unit_effect.body_force[2] / load,
            unit_effect.body_torque[0] / load,
            unit_effect.body_torque[1] / load,
            unit_effect.body_torque[2] / load,
        )
    }
}
