import * as THREE from "three";

const canvas = document.getElementById("game");
const statusLabel = document.getElementById("status");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x7bb4f4);
scene.fog = new THREE.Fog(0x7bb4f4, 20, 90);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);

const ambient = new THREE.HemisphereLight(0xddeeff, 0x445533, 0.8);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xffffff, 1.15);
sun.position.set(25, 30, -18);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -45;
sun.shadow.camera.right = 45;
sun.shadow.camera.top = 45;
sun.shadow.camera.bottom = -45;
scene.add(sun);

const player = new THREE.Object3D();
player.position.set(0, 12, 0);
scene.add(player);

const move = { forward: false, backward: false, left: false, right: false };
const velocity = new THREE.Vector3();
let canJump = false;
let isLocked = false;
let yaw = 0;
let pitch = -0.28;

const blockGeo = new THREE.BoxGeometry(1, 1, 1);
const materials = {
  grass: new THREE.MeshLambertMaterial({ color: 0x4aa645 }),
  dirt: new THREE.MeshLambertMaterial({ color: 0x8f5f33 }),
  stone: new THREE.MeshLambertMaterial({ color: 0x8a8f98 }),
  wood: new THREE.MeshLambertMaterial({ color: 0x966535 })
};

const mineSeconds = {
  grass: 0.45,
  dirt: 0.35,
  wood: 0.9,
  stone: 1.6
};

const world = new Map();
const blocks = [];

const inventory = { grass: 0, dirt: 0, wood: 0, stone: 0 };
const hotbar = ["grass", "dirt", "wood", "stone"];
let selectedSlot = 0;

let miningActive = false;
let miningBlock = null;
let miningElapsed = 0;

const raycaster = new THREE.Raycaster();
const clickDir = new THREE.Vector2(0, 0);
const cameraTarget = new THREE.Vector3();
const cameraOffset = new THREE.Vector3();

function key(x, y, z) {
  return `${x},${y},${z}`;
}

function addBlock(x, y, z, type = "grass") {
  if (world.has(key(x, y, z))) return;
  const block = new THREE.Mesh(blockGeo, materials[type] ?? materials.grass);
  block.position.set(x, y, z);
  block.castShadow = true;
  block.receiveShadow = true;
  block.userData.type = type;
  scene.add(block);
  world.set(key(x, y, z), block);
  blocks.push(block);
}

function removeBlock(mesh) {
  const { x, y, z } = mesh.position;
  world.delete(key(x, y, z));
  const idx = blocks.indexOf(mesh);
  if (idx >= 0) blocks.splice(idx, 1);
  scene.remove(mesh);
}

function heightAt(x, z) {
  const n1 = Math.sin(x * 0.23) * 1.5;
  const n2 = Math.cos(z * 0.21) * 1.3;
  const n3 = Math.sin((x + z) * 0.08) * 2;
  return Math.floor(5 + n1 + n2 + n3);
}

function generateWorld(size = 24) {
  for (let x = -size; x <= size; x += 1) {
    for (let z = -size; z <= size; z += 1) {
      const h = heightAt(x, z);
      for (let y = 0; y <= h; y += 1) {
        const depth = h - y;
        let type = "stone";
        if (depth === 0) type = "grass";
        else if (depth > 1 && depth < 4 && Math.random() < 0.22) type = "dirt";
        addBlock(x, y, z, type);
      }

      if (Math.random() < 0.015 && h > 4) {
        const treeHeight = 3 + Math.floor(Math.random() * 2);
        for (let y = 1; y <= treeHeight; y += 1) addBlock(x, h + y, z, "wood");
        for (let lx = -2; lx <= 2; lx += 1) {
          for (let lz = -2; lz <= 2; lz += 1) {
            for (let ly = treeHeight - 1; ly <= treeHeight + 1; ly += 1) {
              if (Math.abs(lx) + Math.abs(lz) < 4) addBlock(x + lx, h + ly, z + lz, "grass");
            }
          }
        }
      }
    }
  }
}

function intersectBlock() {
  raycaster.setFromCamera(clickDir, camera);
  return raycaster.intersectObjects(blocks, false)[0] ?? null;
}

function inventoryText() {
  return hotbar
    .map((type, i) => (i === selectedSlot ? `[${i + 1}:${type} x${inventory[type]}]` : `${i + 1}:${type} x${inventory[type]}`))
    .join("  ");
}

function updateStatus(extra = "") {
  const selected = hotbar[selectedSlot];
  statusLabel.textContent = `3rd person | Blocks: ${blocks.length} | Selected: ${selected} | Inventory: ${inventoryText()}${extra ? ` | ${extra}` : ""}`;
}

function addInventory(type, amount = 1) {
  if (!(type in inventory)) inventory[type] = 0;
  inventory[type] += amount;
  updateStatus();
}

function placeSelectedBlock(hit) {
  const selected = hotbar[selectedSlot];
  if ((inventory[selected] ?? 0) <= 0 || !hit?.face) {
    updateStatus("No blocks to place");
    return;
  }

  const normal = hit.face.normal.clone();
  const p = hit.object.position.clone().add(normal);
  const x = Math.round(p.x);
  const y = Math.round(p.y);
  const z = Math.round(p.z);

  if (world.has(key(x, y, z))) return;
  if (Math.abs(x - player.position.x) < 1 && Math.abs(y - player.position.y) < 2 && Math.abs(z - player.position.z) < 1) return;

  addBlock(x, y, z, selected);
  inventory[selected] -= 1;
  updateStatus();
}

function finishMining(mesh) {
  if (!mesh || mesh.position.y <= 0) return;
  const type = mesh.userData.type ?? "dirt";
  removeBlock(mesh);
  addInventory(type, 1);
}

function mineTick(dt) {
  if (!miningActive || !isLocked) {
    miningElapsed = 0;
    miningBlock = null;
    return;
  }

  const hit = intersectBlock();
  if (!hit || !hit.object) {
    miningElapsed = 0;
    miningBlock = null;
    updateStatus("Mining: no target");
    return;
  }

  if (miningBlock !== hit.object) {
    miningBlock = hit.object;
    miningElapsed = 0;
  }

  const type = miningBlock.userData.type ?? "dirt";
  const needed = mineSeconds[type] ?? 0.5;
  miningElapsed += dt;
  const pct = Math.min(100, Math.floor((miningElapsed / needed) * 100));
  updateStatus(`Mining ${type}: ${pct}%`);

  if (miningElapsed >= needed) {
    finishMining(miningBlock);
    miningElapsed = 0;
    miningBlock = null;
  }
}

function updateCamera() {
  const distance = 5.6;
  const height = 2.8;
  cameraOffset.set(
    Math.sin(yaw) * Math.cos(pitch) * distance,
    Math.sin(pitch) * distance + height,
    Math.cos(yaw) * Math.cos(pitch) * distance
  );
  cameraTarget.set(player.position.x, player.position.y + 1.2, player.position.z);
  const desired = new THREE.Vector3().copy(cameraTarget).add(cameraOffset);
  camera.position.lerp(desired, 0.2);
  camera.lookAt(cameraTarget);
}

function requestLock() {
  if (document.pointerLockElement !== document.body) {
    document.body.requestPointerLock();
  }
}

document.body.addEventListener("click", () => requestLock());

document.addEventListener("pointerlockchange", () => {
  isLocked = document.pointerLockElement === document.body;
  updateStatus(isLocked ? "Playing" : "Click to lock cursor");
});

document.addEventListener("mousemove", (event) => {
  if (!isLocked) return;
  yaw -= event.movementX * 0.0024;
  pitch -= event.movementY * 0.0022;
  pitch = Math.max(-0.95, Math.min(0.35, pitch));
});

generateWorld();
updateCamera();
updateStatus("Terrain generated");

document.addEventListener("mousedown", (event) => {
  if (!isLocked) return;
  if (event.button === 0) {
    miningActive = true;
    return;
  }

  if (event.button === 2) {
    const hit = intersectBlock();
    if (hit) placeSelectedBlock(hit);
  }
});

document.addEventListener("mouseup", (event) => {
  if (event.button === 0) {
    miningActive = false;
    miningElapsed = 0;
    miningBlock = null;
    updateStatus();
  }
});

document.addEventListener("contextmenu", (e) => e.preventDefault());

document.addEventListener("keydown", (event) => {
  switch (event.code) {
    case "KeyW":
      move.backward = true;
      break;
    case "KeyS":
      move.forward = true;
      break;
    case "KeyA":
      move.left = true;
      break;
    case "KeyD":
      move.right = true;
      break;
    case "Space":
      if (canJump) {
        velocity.y = 7.5;
        canJump = false;
      }
      break;
    case "Digit1":
    case "Digit2":
    case "Digit3":
    case "Digit4":
      selectedSlot = Number(event.code.replace("Digit", "")) - 1;
      updateStatus();
      break;
  }
});

document.addEventListener("keyup", (event) => {
  switch (event.code) {
    case "KeyW":
      move.backward = false;
      break;
    case "KeyS":
      move.forward = false;
      break;
    case "KeyA":
      move.left = false;
      break;
    case "KeyD":
      move.right = false;
      break;
  }
});

const footRay = new THREE.Raycaster();
const down = new THREE.Vector3(0, -1, 0);
const clock = new THREE.Clock();

function updateMovement(dt) {
  const speed = 10;
  velocity.x -= velocity.x * 10 * dt;
  velocity.z -= velocity.z * 10 * dt;
  velocity.y -= 20 * dt;

  const direction = new THREE.Vector3();
  if (move.forward) direction.z -= 1;
  if (move.backward) direction.z += 1;
  if (move.left) direction.x -= 1;
  if (move.right) direction.x += 1;
  direction.normalize();

  if (move.forward || move.backward) velocity.z += direction.z * speed * dt * 10;
  if (move.left || move.right) velocity.x += direction.x * speed * dt * 10;

  const sinYaw = Math.sin(yaw);
  const cosYaw = Math.cos(yaw);
  const dx = velocity.x * dt;
  const dz = velocity.z * dt;

  player.position.x += dx * cosYaw - dz * sinYaw;
  player.position.z += dz * cosYaw + dx * sinYaw;
  player.position.y += velocity.y * dt;

  footRay.set(new THREE.Vector3(player.position.x, player.position.y + 0.2, player.position.z), down);
  footRay.far = 2.4;
  const hits = footRay.intersectObjects(blocks, false);

  if (hits.length > 0) {
    const targetY = hits[0].object.position.y + 1.9;
    if (player.position.y < targetY + 0.05) {
      player.position.y = targetY;
      velocity.y = Math.max(velocity.y, 0);
      canJump = true;
    }
  }

  if (player.position.y < -10) {
    player.position.set(0, 14, 0);
    velocity.set(0, 0, 0);
  }
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (isLocked) {
    updateMovement(dt);
    mineTick(dt);
  }
  updateCamera();
  renderer.render(scene, camera);
}
animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
