import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { scene } from './scene.js';

const loader = new GLTFLoader();

export function loadModel(url, position = new THREE.Vector3()) {
  return new Promise((resolve) => {
    loader.load(
      url,
      (gltf) => {
        const model = gltf.scene;
        model.position.copy(position);
        scene.add(model);
        resolve(model);
      },
      undefined,
      (err) => {
        console.error(`Failed to load model: ${url}`, err);
        resolve(null);
      }
    );
  });
}
