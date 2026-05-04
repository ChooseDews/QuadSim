import "./styles.css";

import initWasm, {
  BrowserSimulator,
  simulate_dashboard_with_config,
} from "../pkg/quad_sim.js";
import { DashboardApp } from "./app.js";

async function bootstrap() {
  await initWasm();
  const app = new DashboardApp({
    simulate: simulate_dashboard_with_config,
    SimulatorClass: BrowserSimulator,
  });
  await app.mount();
}

bootstrap().catch((error) => {
  console.error(error);
  const statusPill = document.getElementById("statusPill");
  statusPill.textContent = "Error";
  statusPill.dataset.state = "error";
  document.body.insertAdjacentHTML(
    "beforeend",
    `<pre class="fatal-error">${String(error)}</pre>`,
  );
});
