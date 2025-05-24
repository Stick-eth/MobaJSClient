 import { initScene, scene, renderer, camera } from './scene.js';
 import { initCharacter, updateCharacter } from './character.js';
 import { initCameraControl, updateCamera } from './cameraController.js';
 import { initInput } from './input.js';
 import { initOverlay } from './overlay.js';
import { showMarker, updateMarker } from './marker.js';

 initScene();
 initCharacter(scene);
 initInput();
 initOverlay();
 initCameraControl(renderer.domElement);

 let lastTime = performance.now();
 function animate(now = performance.now()) {
   const delta = (now - lastTime) / 1000;
   lastTime = now;

   updateCharacter(delta);
   updateCamera(delta);
  updateMarker(delta);

   renderer.render(scene, camera);
   requestAnimationFrame(animate);
 }
 animate();
