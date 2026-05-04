use std::error::Error;
use std::fs;
use std::io::Write;
use std::path::Path;

use quad_sim::{QuadController, Quadrotor, SimulationResult, simulate};

fn write_history_csv(path: &Path, result: &SimulationResult) -> Result<(), Box<dyn Error>> {
    let mut file = fs::File::create(path)?;
    writeln!(
        file,
        "t,x,y,z,vx,vy,vz,speed,roll,pitch,yaw,roll_target,pitch_target,yaw_target,altitude_target,p,q,r,ax,ay,az,m1,m2,m3,m4,thrust_total_n,power_total_w,current_total_a,power_m1_w,power_m2_w,power_m3_w,power_m4_w,current_m1_a,current_m2_a,current_m3_a,current_m4_a"
    )?;

    for sample in &result.samples {
        writeln!(
            file,
            concat!(
                "{:.6},{:.6},{:.6},{:.6},{:.6},{:.6},{:.6},{:.6},",
                "{:.6},{:.6},{:.6},{:.6},{:.6},{:.6},{:.6},",
                "{:.6},{:.6},{:.6},{:.6},{:.6},{:.6},",
                "{:.6},{:.6},{:.6},{:.6},{:.6},{:.6},{:.6},",
                "{:.6},{:.6},{:.6},{:.6},{:.6},{:.6},{:.6},{:.6}"
            ),
            sample.t,
            sample.x,
            sample.y,
            sample.z,
            sample.vx,
            sample.vy,
            sample.vz,
            sample.speed,
            sample.roll,
            sample.pitch,
            sample.yaw,
            sample.roll_target,
            sample.pitch_target,
            sample.yaw_target,
            sample.altitude_target,
            sample.p,
            sample.q,
            sample.r,
            sample.ax,
            sample.ay,
            sample.az,
            sample.m1,
            sample.m2,
            sample.m3,
            sample.m4,
            sample.thrust_total_n,
            sample.power_total_w,
            sample.current_total_a,
            sample.power_m1_w,
            sample.power_m2_w,
            sample.power_m3_w,
            sample.power_m4_w,
            sample.current_m1_a,
            sample.current_m2_a,
            sample.current_m3_a,
            sample.current_m4_a
        )?;
    }

    Ok(())
}

fn main() -> Result<(), Box<dyn Error>> {
    let vehicle = Quadrotor::default();
    let controller = QuadController::default();
    let dt_s = 0.01;
    let duration_s = 45.0;
    let result = simulate(&vehicle, &controller, dt_s, duration_s);

    let output_dir = Path::new("output");
    fs::create_dir_all(output_dir)?;
    let csv_path = output_dir.join("quad_history.csv");
    write_history_csv(&csv_path, &result)?;

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
        println!("CSV history: {}", csv_path.display());
    }

    Ok(())
}
