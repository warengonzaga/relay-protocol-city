import * as THREE from "three";
import { getChain } from "./activity.js";
import { drawChainMark } from "./chain-marks.js";
import { movementSpeed } from "./routes.js";

function badge(chain, size = 1.5) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  drawChainMark(canvas.getContext("2d"), chain.id, 64, 64, 55, chain.color);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, depthTest: true }),
  );
  sprite.scale.set(size, size, 1);
  sprite.userData.transient = true;
  return sprite;
}

function routeLabel(transfer) {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 112;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#232323";
  ctx.beginPath();
  ctx.roundRect(2, 2, 764, 108, 20);
  ctx.fill();
  const origin = getChain(transfer.originChainId),
    destination = getChain(transfer.destinationChainId);
  drawChainMark(ctx, origin.id, 52, 56, 29, origin.color);
  drawChainMark(ctx, destination.id, 392, 56, 29, destination.color);
  ctx.fillStyle = "#ededed";
  ctx.font = "bold 29px sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(origin.symbol, 99, 57);
  ctx.fillText("→", 280, 57);
  ctx.fillText(destination.symbol, 438, 57);
  ctx.fillStyle = "#a7aaff";
  ctx.font = "bold 25px sans-serif";
  ctx.textAlign = "right";
  const amount =
    transfer.amountUsd === null
      ? "—"
      : new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          notation: "compact",
          maximumFractionDigits: 2,
        }).format(transfer.amountUsd);
  ctx.fillText(amount, 730, 57);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
      transparent: true,
    }),
  );
  sprite.scale.set(16, 2.33, 1);
  sprite.renderOrder = 10;
  sprite.userData.transient = true;
  return sprite;
}

const CONFIG = {
  pedestrian: ["character-a", 1.8, "y"],
  car: ["sedan", 3.5, "z"],
  bus: ["bus", 5.3, "z"],
  truck: ["delivery", 4.5, "z"],
  train: ["train-electric-city-a", 4.3, "z"],
  airplane: ["airplane", 18, "z"],
};

export function createTraveler(models, transfer) {
  const root = models.create(...CONFIG[transfer.kind]);
  const carriages = [];
  if (transfer.kind === "train") {
    for (const distance of [4.8, 9.6]) {
      const carriage = models.create("train-electric-city-c", 4.3, "z");
      root.add(carriage);
      carriages.push({ root: carriage, distance });
    }
  }
  let mixer;
  if (transfer.kind === "pedestrian" && root.userData.model) {
    mixer = new THREE.AnimationMixer(root.userData.model);
    const desired = movementSpeed(transfer).animation;
    const clip =
      root.userData.clips?.find((c) => c.name === desired) ??
      root.userData.clips?.find((c) => c.name === "walk");
    if (clip) mixer.clipAction(clip).play();
  }
  if (["airplane", "train"].includes(transfer.kind)) {
    for (const [id, z] of [
      [transfer.originChainId, -3],
      [transfer.destinationChainId, 2],
    ]) {
      const mark = badge(
        getChain(id),
        transfer.kind === "airplane" ? 2.6 : 1.7,
      );
      mark.position.set(0, root.userData.height + 0.6, z);
      root.add(mark);
    }
  }
  const label = routeLabel(transfer);
  label.position.y = root.userData.height + 3;
  label.visible = ["airplane", "train"].includes(transfer.kind);
  root.add(label);
  root.userData.transfer = transfer;
  return { root, mixer, label, carriages };
}

function part(root, color, size, position) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(...size),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.35,
    }),
  );
  mesh.position.set(...position);
  mesh.userData.owned = true;
  root.add(mesh);
  return mesh;
}

export function createPolice(models, transfer, traveler) {
  const pedestrian = transfer.kind === "pedestrian";
  const root = models.create(pedestrian ? "sedan" : "truck", 4.4, "z");
  const lights = [
    part(root, "#548bff", [0.65, 0.22, 0.38], [-0.38, 1.75, 0]),
    part(root, "#ff505d", [0.65, 0.22, 0.38], [0.38, 1.75, 0]),
  ];
  if (!pedestrian) {
    part(root, "#cad0df", [0.2, 1.8, 0.2], [0, 1.3, -1.5]);
    const boom = part(root, "#cad0df", [0.2, 0.2, 2.3], [0, 2.15, -2.4]);
    boom.rotation.x = -0.35;
    part(root, "#bbc0cd", [0.06, 1.4, 0.06], [0, 1.5, -3.4]);
    const towed = models.create(...CONFIG[transfer.kind]);
    towed.position.set(0, 0.4, -5.2);
    towed.rotation.x = -0.12;
    root.add(towed);
  }
  root.userData.transfer = transfer;
  const label = routeLabel(transfer);
  label.position.y = 4;
  label.visible = true;
  root.add(label);
  return { root, label, lights, pedestrian, traveler };
}

export function disposeTraveler(item) {
  item.mixer?.stopAllAction();
  if (item.root.userData.model)
    item.mixer?.uncacheRoot(item.root.userData.model);
  item.root.traverse((node) => {
    if (node.userData.transient || node.userData.owned) {
      if (node.userData.owned) node.geometry?.dispose();
      node.material.map?.dispose();
      node.material.dispose();
    }
  });
}

export function refreshTravelerPace(item, previousTransfer) {
  if (["board", "police"].includes(item.phase)) return;
  const motion = movementSpeed(item.transfer);
  item.speed = motion.units;
  if (!item.mixer || motion.animation === movementSpeed(previousTransfer).animation) return;
  const clip = item.root.userData.clips?.find(c => c.name === motion.animation);
  if (clip) {
    item.mixer.stopAllAction();
    item.mixer.clipAction(clip).play();
  }
}
