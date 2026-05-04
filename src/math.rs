use nalgebra::{Matrix3, Matrix4, Quaternion, Rotation3, UnitQuaternion, Vector3};

pub type Vec3 = Vector3<f64>;
pub type Mat3 = Matrix3<f64>;
pub type Mat4 = Matrix4<f64>;
pub type Attitude = UnitQuaternion<f64>;

pub fn rotation_from_euler(euler_angles: Vec3) -> Rotation3<f64> {
    Rotation3::from_euler_angles(euler_angles.x, euler_angles.y, euler_angles.z)
}

pub fn quaternion_from_euler(euler_angles: Vec3) -> Attitude {
    UnitQuaternion::from_euler_angles(euler_angles.x, euler_angles.y, euler_angles.z)
}

pub fn euler_from_quaternion(attitude: &Attitude) -> Vec3 {
    let (roll, pitch, yaw) = attitude.euler_angles();
    Vec3::new(roll, pitch, yaw)
}

pub fn integrate_attitude_explicit(
    attitude_body_to_world: &Attitude,
    angular_velocity_body_rps: Vec3,
    dt_s: f64,
) -> Attitude {
    let q = attitude_body_to_world.quaternion();
    let omega = Quaternion::from_parts(0.0, angular_velocity_body_rps);
    let q_dot = (q * omega) * 0.5;
    let next = Quaternion::new(
        q.w + q_dot.w * dt_s,
        q.i + q_dot.i * dt_s,
        q.j + q_dot.j * dt_s,
        q.k + q_dot.k * dt_s,
    );
    UnitQuaternion::new_normalize(next)
}

pub fn wrap_angle(angle: f64) -> f64 {
    let two_pi = 2.0 * std::f64::consts::PI;
    (angle + std::f64::consts::PI).rem_euclid(two_pi) - std::f64::consts::PI
}
