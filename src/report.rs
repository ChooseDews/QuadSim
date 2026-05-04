use std::error::Error;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use crate::simulation::SimulationResult;

const REPORT_HTML_TEMPLATE: &str = include_str!("../report/quad_report_template.html");
const REPORT_JS_TEMPLATE: &str = include_str!("../report/quad_report.js");

#[derive(Clone, Debug)]
pub struct ReportAssets {
    pub csv_path: PathBuf,
    pub html_path: PathBuf,
    pub js_path: PathBuf,
    pub data_js_path: PathBuf,
}

impl ReportAssets {
    pub fn write(output_dir: &Path, result: &SimulationResult) -> Result<Self, Box<dyn Error>> {
        fs::create_dir_all(output_dir)?;

        let csv_path = output_dir.join("quad_history.csv");
        let html_path = output_dir.join("quad_report.html");
        let js_path = output_dir.join("quad_report.js");
        let data_js_path = output_dir.join("quad_data.js");

        write_csv(&csv_path, result)?;
        fs::write(&html_path, REPORT_HTML_TEMPLATE)?;
        fs::write(&js_path, REPORT_JS_TEMPLATE)?;
        write_data_js(&data_js_path, result)?;

        Ok(Self {
            csv_path,
            html_path,
            js_path,
            data_js_path,
        })
    }
}

fn write_csv(path: &Path, result: &SimulationResult) -> Result<(), Box<dyn Error>> {
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

fn write_data_js(path: &Path, result: &SimulationResult) -> Result<(), Box<dyn Error>> {
    let json = serde_json::to_string(&result.samples)?;
    fs::write(path, format!("window.QUAD_REPORT_DATA = {json};\n"))?;
    Ok(())
}
