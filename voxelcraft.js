import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

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
camera.position.set(0, 8, 12);

const controls = new PointerLockControls(camera, document.body);
scene.add(controls.getObject());

document.body.addEventListener("click", () => controls.lock());

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

const move = { forward: false, backward: false, left: false, right: false };
const velocity = new THREE.Vector3();
let canJump = false;

const blockGeo = new THREE.BoxGeometry(1, 1, 1);
const materials = {
  grass: new THREE.MeshLambertMaterial({ color: 0x4aa645 }),
  dirt: new THREE.MeshLambertMaterial({ color: 0x8f5f33 }),
  stone: new THREE.MeshLambertMaterial({ color: 0x8a8f98 }),
  wood: new THREE.MeshLambertMaterial({ color: 0x966535 }),
  leaves: new THREE.MeshLambertMaterial({ color: 0x2f7f32 })
};

const mineDurations = {
  dirt: 0.25,
  grass: 0.35,
  leaves: 0.2,
  wood: 0.7,
  stone: 1.2
};

const inventory = {
  dirt: 0,
  grass: 0,
  stone: 0,
  wood: 0,
  leaves: 0
};
const hotbar = ["dirt", "grass", "stone", "wood", "leaves"];
let selectedSlot = 0;

const world = new Map();
const blocks = [];

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

function terrainTypeForDepth(depth) {
  if (depth === 0) return "grass";
  if (depth === 1) return "stone"; // stone directly under green grass blocks
  if (depth < 4) return "dirt";
  return "stone";
}

function generateWorld(size = 24) {
  for (let x = -size; x <= size; x += 1) {
    for (let z = -size; z <= size; z += 1) {
      const h = heightAt(x, z);
      for (let y = 0; y <= h; y += 1) {
        const depth = h - y;
        addBlock(x, y, z, terrainTypeForDepth(depth));
      }

      if (Math.random() < 0.015 && h > 4) {
        const treeHeight = 3 + Math.floor(Math.random() * 2);
        for (let y = 1; y <= treeHeight; y += 1) addBlock(x, h + y, z, "wood");
        for (let lx = -2; lx <= 2; lx += 1) {
          for (let lz = -2; lz <= 2; lz += 1) {
            for (let ly = treeHeight - 1; ly <= treeHeight + 1; ly += 1) {
              if (Math.abs(lx) + Math.abs(lz) < 4) addBlock(x + lx, h + ly, z + lz, "leaves");
            }
          }
        }
      }
    }
  }
}

generateWorld();
controls.getObject().position.set(0, 12, 0);

const raycaster = new THREE.Raycaster();
const clickDir = new THREE.Vector2(0, 0);

function intersectBlock() {
  raycaster.setFromCamera(clickDir, camera);
  return raycaster.intersectObjects(blocks, false)[0];
}

function selectedType() {
  return hotbar[selectedSlot];
}

function inventoryString() {
  return hotbar.map((type, idx) => `${idx + 1}:${type} ${inventory[type]}`).join(" | ");
}

function updateStatus(extra = "") {
  const selected = selectedType();
  const selectedCount = inventory[selected];
  const mineInfo = isMining
    ? ` | Mining ${miningBlock?.userData.type ?? ""} ${(mineProgress * 100).toFixed(0)}%`
    : "";
  const suffix = extra ? ` | ${extra}` : controls.isLocked ? " | Playing" : " | Click to play";
  statusLabel.textContent = `Blocks: ${blocks.length}${suffix}${mineInfo} | Selected: ${selected} (${selectedCount}) | Inventory: ${inventoryString()}`;
}

let isMining = false;
let mineProgress = 0;
let miningBlock = null;

function startMining() {
  const hit = intersectBlock();
  if (!hit || hit.object.position.y <= 0) return;
  isMining = true;
  mineProgress = 0;
  miningBlock = hit.object;
}

function stopMining() {
  isMining = false;
  mineProgress = 0;
  miningBlock = null;
}

document.addEventListener("mousedown", (event) => {
  if (!controls.isLocked) return;

  if (event.button === 0) {
    startMining();
  }

  if (event.button === 2) {
    const hit = intersectBlock();
    if (!hit) return;
    const type = selectedType();
    if (inventory[type] <= 0) {
      updateStatus(`No ${type} to place`);
      return;
    }
    const normal = hit.face.normal.clone();
    const p = hit.object.position.clone().add(normal);
    addBlock(Math.round(p.x), Math.round(p.y), Math.round(p.z), type);
    inventory[type] -= 1;
  }

  updateStatus();
});

document.addEventListener("mouseup", (event) => {
  if (event.button === 0) stopMining();
});

document.addEventListener("contextmenu", (e) => e.preventDefault());

document.addEventListener("keydown", (event) => {
  switch (event.code) {
    case "KeyW":
      move.forward = true;
      break;
    case "KeyS":
      move.backward = true;
      break;
    case "KeyA":
      move.left = true;
      break;
    case "KeyD":
      move.right = true;
      break;
    case "Digit1":
    case "Digit2":
    case "Digit3":
    case "Digit4":
    case "Digit5":
      selectedSlot = Number(event.code.at(-1)) - 1;
      break;
    case "Space":
      if (canJump) {
        velocity.y = 7.5;
        canJump = false;
      }
      break;
  }
  updateStatus();
});

document.addEventListener("keyup", (event) => {
  switch (event.code) {
    case "KeyW":
      move.forward = false;
      break;
    case "KeyS":
      move.backward = false;
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

  controls.moveRight(velocity.x * dt);
  controls.moveForward(velocity.z * dt);

  const player = controls.getObject();
  player.position.y += velocity.y * dt;

  footRay.set(player.position, down);
  footRay.far = 2.2;
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

function updateMining(dt) {
  if (!isMining || !miningBlock) return;

  const freshHit = intersectBlock();
  if (!freshHit || freshHit.object !== miningBlock) {
    stopMining();
    return;
  }

  const type = miningBlock.userData.type;
  const duration = mineDurations[type] ?? 0.6;
  mineProgress += dt / duration;
  if (mineProgress < 1) return;

  inventory[type] = (inventory[type] ?? 0) + 1;
  removeBlock(miningBlock);
  stopMining();
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (controls.isLocked) {
    updateMovement(dt);
    updateMining(dt);
  }
  updateStatus();
  renderer.render(scene, camera);
}

updateStatus("Terrain generated");
animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
