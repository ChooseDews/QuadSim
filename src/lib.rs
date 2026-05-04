pub mod controller;
pub mod math;
pub mod motor;
pub mod quadrotor;
pub mod simulation;
pub mod wasm_api;

pub use controller::{AttitudeSetpoint, QuadController};
pub use math::{Attitude, Mat3, Mat4, Vec3};
pub use motor::{Motor, SpinDirection};
pub use quadrotor::Quadrotor;
pub use simulation::{
    Sample, SimulationOptions, SimulationResult, State, simulate, simulate_with_options,
};
pub use wasm_api::{
    BrowserDashboardData, BrowserSimulationConfig, BrowserSimulationSummary, simulate_dashboard,
    simulate_dashboard_with_config,
};
