import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";

export class QuadScene {
  constructor(container) {
    this.container = container;
    this.dataset = null;
    this.motorMeshes = [];
    this.currentSample = null;
    this.rotorPhase = 0;
    this.viewMode = "track";
    this.lastFollowTarget = null;
    this.trajectoryMaterial = null;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x07111c, 70, 900);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1600);
    this.camera.position.set(18, 12, 18);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxDistance = 900;
    this.controls.target.set(0, 3, 0);

    this.simWorld = new THREE.Group();
    this.simWorld.rotation.x = -Math.PI / 2;
    this.scene.add(this.simWorld);

    this.root = new THREE.Group();
    this.simWorld.add(this.root);

    this.vehicleGroup = new THREE.Group();
    this.vehicleGroup.scale.setScalar(2.4);
    this.simWorld.add(this.vehicleGroup);

    this.setupEnvironment();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.resize();

    this.clock = new THREE.Clock();
    this.animate = this.animate.bind(this);
    this.animate();
  }

  setupEnvironment() {
    this.scene.background = new THREE.Color(0x101720);

    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(1200, 48, 32),
      new THREE.MeshBasicMaterial({
        map: createSkyTexture(),
        side: THREE.BackSide,
        depthWrite: false,
      }),
    );
    this.scene.add(sky);

    const ambient = new THREE.HemisphereLight(0x74879d, 0x090c10, 0.95);
    this.scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xa6bad1, 1.25);
    keyLight.position.set(14, -8, 18);
    keyLight.castShadow = true;
    this.scene.add(keyLight);

    const rim = new THREE.DirectionalLight(0x5d7288, 0.35);
    rim.position.set(-10, 18, 12);
    this.scene.add(rim);

    const grid = new THREE.GridHelper(900, 90, 0x1b2430, 0x111820);
    this.scene.add(grid);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(1400, 1400),
      new THREE.MeshStandardMaterial({
        color: 0x10151b,
        metalness: 0.0,
        roughness: 0.98,
      }),
    );
    floor.receiveShadow = true;
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
  }

  setDataset(data, { preserveTrackCamera = false } = {}) {
    this.dataset = data;
    this.clearDatasetGeometry();
    this.buildTrajectory(data.samples);
    this.buildVehicle(data.vehicle);
    this.setSample(data.samples.at(-1));
    if (this.viewMode === "follow") {
      this.updateFollowCamera(true);
    } else if (!preserveTrackCamera) {
      this.frameTrackView();
    }
  }

  setSample(sample) {
    this.currentSample = sample;
    if (!sample) {
      return;
    }

    this.vehicleGroup.position.set(sample.x, sample.y, sample.z);
    this.vehicleGroup.quaternion.set(sample.qx, sample.qy, sample.qz, sample.qw);

    const throttles = [sample.m1, sample.m2, sample.m3, sample.m4];
    this.motorMeshes.forEach((mesh, index) => {
      const intensity = throttles[index];
      mesh.material.emissiveIntensity = 0.1 + intensity * 0.5;
      mesh.material.color.setHSL(0.58 - intensity * 0.08, 0.35, 0.56);
    });

    if (this.viewMode === "follow") {
      this.updateFollowCamera();
    }
  }

  buildTrajectory(samples) {
    const points = samples.map((sample) => new THREE.Vector3(sample.x, sample.y, sample.z));
    const flatPositions = [];
    const flatColors = [];
    const maxSpeed = Math.max(...samples.map((sample) => sample.speed), 0.1);
    for (const point of points) {
      flatPositions.push(point.x, point.y, point.z);
    }
    for (const sample of samples) {
      const color = new THREE.Color().setHSL(
        THREE.MathUtils.lerp(0.58, 0.02, THREE.MathUtils.clamp(sample.speed / maxSpeed, 0, 1)),
        0.8,
        THREE.MathUtils.lerp(0.54, 0.6, THREE.MathUtils.clamp(sample.speed / maxSpeed, 0, 1)),
      );
      flatColors.push(color.r, color.g, color.b);
    }

    const trajectoryGeometry = new LineGeometry();
    trajectoryGeometry.setPositions(flatPositions);
    trajectoryGeometry.setColors(flatColors);
    this.trajectoryMaterial = new LineMaterial({
      linewidth: 4.5,
      transparent: true,
      opacity: 0.98,
      vertexColors: true,
      worldUnits: false,
      resolution: new THREE.Vector2(
        Math.max(1, this.container.clientWidth),
        Math.max(1, this.container.clientHeight),
      ),
    });
    const trajectory = new Line2(
      trajectoryGeometry,
      this.trajectoryMaterial,
    );
    trajectory.computeLineDistances();
    this.root.add(trajectory);

    const startMarker = marker(0x58f0a7);
    startMarker.position.copy(points[0]);
    this.root.add(startMarker);

    const finishMarker = marker(0xff8a5b);
    finishMarker.position.copy(points.at(-1));
    this.root.add(finishMarker);
  }

  buildVehicle(vehicle) {
    const frameMaterial = new THREE.MeshStandardMaterial({
      color: 0xc3ced9,
      metalness: 0.24,
      roughness: 0.62,
    });
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.22, 0.045),
      frameMaterial,
    );
    body.castShadow = true;
    this.vehicleGroup.add(body);

    const topPlate = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.12, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x1f2a35, metalness: 0.12, roughness: 0.78 }),
    );
    topPlate.position.z = 0.04;
    topPlate.castShadow = true;
    this.vehicleGroup.add(topPlate);

    const postMaterial = new THREE.MeshStandardMaterial({
      color: 0x5f7389,
      metalness: 0.18,
      roughness: 0.7,
    });

    for (const motor of vehicle.motors) {
      const position = new THREE.Vector3(...motor.position_body_m);
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, 0.18, 10),
        postMaterial,
      );
      post.position.set(position.x, position.y, 0.09);
      post.castShadow = true;
      this.vehicleGroup.add(post);

      const foot = new THREE.Mesh(
        new THREE.BoxGeometry(0.028, 0.028, 0.028),
        new THREE.MeshStandardMaterial({
          color: 0x2d3844,
          metalness: 0.08,
          roughness: 0.82,
        }),
      );
      foot.position.copy(position);
      foot.castShadow = true;
      this.vehicleGroup.add(foot);

      const hub = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.05, 0.018),
        new THREE.MeshStandardMaterial({
          color: motor.spin === "CCW" ? 0x8db2d3 : 0xa1a9b2,
          emissive: 0x7aa2c6,
          emissiveIntensity: 0.2,
          metalness: 0.08,
          roughness: 0.76,
        }),
      );
      hub.position.set(position.x, position.y, 0.18);
      hub.castShadow = true;
      this.vehicleGroup.add(hub);
      this.motorMeshes.push(hub);
    }
  }

  clearDatasetGeometry() {
    this.root.clear();
    this.vehicleGroup.clear();
    this.motorMeshes = [];
  }

  setViewMode(mode) {
    this.viewMode = mode;
    if (mode === "track") {
      this.lastFollowTarget = null;
      this.frameTrackView();
    } else {
      this.lastFollowTarget = null;
      this.updateFollowCamera(true);
    }
  }

  frameTrackView() {
    if (!this.dataset || this.dataset.samples.length === 0) {
      return;
    }
    const points = this.dataset.samples.map((sample) =>
      this.simToScenePosition(sample.x, sample.y, sample.z),
    );
    const center = centroidOfPoints(points);
    const radius = maxDistanceFromPoint(points, center, 8);
    const halfFovY = THREE.MathUtils.degToRad(this.camera.fov * 0.5);
    const halfFovX = Math.atan(Math.tan(halfFovY) * this.camera.aspect);

    const horizontalView = horizontalTrackViewDirection(points, center);
    const toCamera = horizontalView.clone().multiplyScalar(0.84).add(new THREE.Vector3(0, 0.54, 0)).normalize();
    const cameraRight = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), toCamera).normalize();
    const cameraUp = new THREE.Vector3().crossVectors(toCamera, cameraRight).normalize();

    let distance = radius * 1.05;
    for (const point of points) {
      const offset = point.clone().sub(center);
      const depth = offset.dot(toCamera);
      const projectedX = Math.abs(offset.dot(cameraRight));
      const projectedY = Math.abs(offset.dot(cameraUp));
      distance = Math.max(
        distance,
        depth + projectedX / Math.tan(halfFovX),
        depth + projectedY / Math.tan(halfFovY),
      );
    }
    distance *= 1.08;

    this.controls.target.copy(center);
    this.camera.position.copy(center.clone().addScaledVector(toCamera, distance));
    this.camera.lookAt(center);
    this.controls.minDistance = 2.5;
    this.controls.maxDistance = Math.max(distance * 6.0, 900);
    this.controls.update();
  }

  updateFollowCamera(force = false) {
    if (!this.currentSample) {
      return;
    }

    const currentTarget = this.simToScenePosition(
      this.currentSample.x,
      this.currentSample.y,
      this.currentSample.z,
    );

    if (force || !this.lastFollowTarget) {
      const followOffset = this.computeFollowOffset();
      this.controls.target.copy(currentTarget);
      this.camera.position.copy(currentTarget.clone().add(followOffset));
      this.lastFollowTarget = currentTarget.clone();
      this.controls.minDistance = 1.8;
      this.controls.maxDistance = 900;
      this.camera.lookAt(this.controls.target);
      this.controls.update();
      return;
    }

    const delta = currentTarget.clone().sub(this.lastFollowTarget);
    this.controls.target.add(delta);
    this.camera.position.add(delta);
    this.lastFollowTarget.copy(currentTarget);
  }

  simToScenePosition(x, y, z) {
    return new THREE.Vector3(x, z, -y);
  }

  computeFollowOffset() {
    const worldQuaternion = new THREE.Quaternion();
    this.vehicleGroup.getWorldQuaternion(worldQuaternion);

    const side = new THREE.Vector3(0, 0, 1).applyQuaternion(worldQuaternion).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const fore = new THREE.Vector3(1, 0, 0).applyQuaternion(worldQuaternion).normalize();

    return side.multiplyScalar(9.5).add(up.multiplyScalar(3.2)).add(fore.multiplyScalar(0.6));
  }

  resize() {
    const width = Math.max(320, this.container.clientWidth);
    const height = Math.max(360, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    if (this.trajectoryMaterial) {
      this.trajectoryMaterial.resolution.set(width, height);
    }
  }

  animate() {
    requestAnimationFrame(this.animate);
    const delta = this.clock.getDelta();
    this.controls.update();

    if (this.currentSample) {
      this.rotorPhase += delta * 20;
      this.motorMeshes.forEach((mesh, index) => {
        mesh.rotation.z = this.rotorPhase * (0.7 + this.currentMotorThrottle(index) * 18);
      });
      if (this.viewMode === "follow") {
        this.updateFollowCamera();
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  currentMotorThrottle(index) {
    if (!this.currentSample) {
      return 0;
    }
    return [
      this.currentSample.m1,
      this.currentSample.m2,
      this.currentSample.m3,
      this.currentSample.m4,
    ][index];
  }
}

function centroidOfPoints(points) {
  const center = new THREE.Vector3();
  for (const point of points) {
    center.add(point);
  }
  return center.multiplyScalar(1 / Math.max(points.length, 1));
}

function maxDistanceFromPoint(points, center, minimum) {
  let maxDistance = minimum;
  for (const point of points) {
    maxDistance = Math.max(maxDistance, point.distanceTo(center));
  }
  return maxDistance;
}

function horizontalTrackViewDirection(points, center) {
  let xx = 0;
  let xz = 0;
  let zz = 0;

  for (const point of points) {
    const dx = point.x - center.x;
    const dz = point.z - center.z;
    xx += dx * dx;
    xz += dx * dz;
    zz += dz * dz;
  }

  const trace = xx + zz;
  const det = xx * zz - xz * xz;
  const principalEigenvalue = trace * 0.5 + Math.sqrt(Math.max(trace * trace * 0.25 - det, 0));

  let axisX = xz;
  let axisZ = principalEigenvalue - xx;
  if (Math.abs(axisX) + Math.abs(axisZ) < 1.0e-6) {
    axisX = 1;
    axisZ = 0;
  }

  const principalAxis = new THREE.Vector3(axisX, 0, axisZ).normalize();
  const viewHorizontal = new THREE.Vector3(-principalAxis.z, 0, principalAxis.x).normalize();

  if (Number.isFinite(viewHorizontal.lengthSq()) && viewHorizontal.lengthSq() > 0) {
    return viewHorizontal;
  }

  return new THREE.Vector3(1, 0, 1).normalize();
}

function marker(color) {
  return new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 14, 14),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.2,
      metalness: 0.04,
      roughness: 0.88,
    }),
  );
}

function createSkyTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 512;
  const context = canvas.getContext("2d");

  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0.0, "#243445");
  gradient.addColorStop(0.32, "#1b2835");
  gradient.addColorStop(0.62, "#141c25");
  gradient.addColorStop(1.0, "#10151b");

  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
