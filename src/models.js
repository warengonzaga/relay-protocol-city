import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { assetUrl } from "./config.js";

const MODEL_KEYS = [
  "character-a",
  "character-b",
  "sedan",
  "taxi",
  "delivery",
  "truck",
  "bus",
  "airplane",
  "train-electric-city-a",
  "train-electric-city-c",
  "building-a",
  "building-b",
  "building-c",
  "building-d",
  "building-f",
  "building-g",
  "building-i",
  "building-skyscraper-a",
  "building-type-a",
  "building-type-c",
  "tree-large",
  "tree-small",
  "detail-parasol-a",
  "light-curved",
];

export async function loadModels() {
  const manifestResponse = await fetch(assetUrl("models/manifest.json"));
  if (!manifestResponse.ok)
    throw new Error("The model manifest could not be loaded.");
  const { models } = await manifestResponse.json();
  const loader = new GLTFLoader();
  const loaded = new Map();
  const results = await Promise.allSettled(
    MODEL_KEYS.map(async (key) => {
      const gltf = await loader.loadAsync(assetUrl(models[key].url));
      gltf.scene.traverse((node) => {
        if (!node.isMesh) return;
        node.castShadow = true;
        node.receiveShadow = true;
        for (const material of Array.isArray(node.material)
          ? node.material
          : [node.material]) {
          if ("roughness" in material) material.roughness = 0.85;
        }
      });
      loaded.set(key, gltf);
    }),
  );
  const missing = MODEL_KEYS.filter(
    (_, index) => results[index].status === "rejected",
  );
  if (missing.length)
    throw new Error(
      `Models unavailable: ${missing.join(", ")}. Please reload.`,
    );

  return {
    create(key, size, axis = "y") {
      const gltf = loaded.get(key);
      if (!gltf) throw new Error(`Unknown model: ${key}`);
      const object = clone(gltf.scene);
      const box = new THREE.Box3().setFromObject(object);
      const dimensions = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const scale = size / dimensions[axis];
      object.scale.multiplyScalar(scale);
      object.position.set(
        -center.x * scale,
        -box.min.y * scale,
        -center.z * scale,
      );
      const group = new THREE.Group();
      group.add(object);
      group.userData.height = dimensions.y * scale;
      group.userData.width = dimensions.x * scale;
      group.userData.length = dimensions.z * scale;
      group.userData.clips = gltf.animations;
      group.userData.model = object;
      return group;
    },
    dispose() {
      const geometries = new Set();
      const materials = new Set();
      const textures = new Set();
      loaded.forEach((gltf) =>
        gltf.scene.traverse((node) => {
          if (!node.isMesh) return;
          geometries.add(node.geometry);
          (Array.isArray(node.material)
            ? node.material
            : [node.material]
          ).forEach((material) => {
            materials.add(material);
            Object.values(material).forEach((value) => {
              if (value?.isTexture) textures.add(value);
            });
          });
        }),
      );
      textures.forEach((value) => value.dispose());
      materials.forEach((value) => value.dispose());
      geometries.forEach((value) => value.dispose());
    },
  };
}
