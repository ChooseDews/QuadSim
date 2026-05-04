use std::error::Error;
use std::path::Path;

use quad_sim::{QuadController, Quadrotor, ReportAssets, simulate};

fn main() -> Result<(), Box<dyn Error>> {
    let vehicle = Quadrotor::default();
    let controller = QuadController::default();
    let dt_s = 0.01;
    let duration_s = 45.0;
    let result = simulate(&vehicle, &controller, dt_s, duration_s);

    let output_dir = Path::new("output");
    let assets = ReportAssets::write(output_dir, &result)?;

    if let Some(final_sample) = result.samples.last() {
        let cruise_window = &result.samples[result.samples.len().saturating_sub(500)..];
        let cruise_speed =
            cruise_window.iter().map(|sample| sample.speed).sum::<f64>() / cruise_window.len() as f64;
        let cruise_power = cruise_window
            .iter()
            .map(|sample| sample.power_total_w)
            .sum::<f64>()
            / cruise_window.len() as f64;

        println!("Simulation complete.");
        println!("Hover throttle estimate: {:.3}", vehicle.hover_throttle());
        println!(
            "Final position [m]: x={:.3}, y={:.3}, z={:.3}",
            final_sample.x, final_sample.y, final_sample.z
        );
        println!(
            "Final attitude [deg]: roll={:.3}, pitch={:.3}, yaw={:.3}",
            final_sample.roll.to_degrees(),
            final_sample.pitch.to_degrees(),
            final_sample.yaw.to_degrees()
        );
        println!(
            "Cruise estimate: speed={:.3} m/s, total power={:.1} W, current={:.2} A",
            cruise_speed,
            cruise_power,
            final_sample.current_total_a
        );
        println!("CSV history: {}", assets.csv_path.display());
        println!("HTML report: {}", assets.html_path.display());
        println!("Report JS: {}", assets.js_path.display());
        println!("Report data JS: {}", assets.data_js_path.display());
    }

    Ok(())
}
