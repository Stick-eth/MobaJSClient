 import { initScene, scene, renderer, camera } from './world/scene.js';
 import { initCharacter, updateCharacter, checkCharacterPosition } from './player/character.js';
 import { initCameraControl, updateCamera } from './ui/cameraController.js';
 import { initInput } from './core/input.js';
 import { initOverlay } from './ui/overlay.js';
 import { showMarker, updateMarker } from './ui/marker.js';
 import { initSpells, updateSpells } from './player/spells.js';
 import { socket } from "./network/socket.js";
 import { updateInput } from './core/input.js';

 

 
 socket.on("connect", () => {
  console.log("Connecté au serveur Socket.IO !", socket.id);
  });

 initScene();
 initCharacter(scene);
 initInput();
 initOverlay();
 initCameraControl(renderer.domElement);
 initSpells();

 let lastTime = performance.now();
 function animate(now = performance.now()) {
   const delta = (now - lastTime) / 1000;
   lastTime = now;

   updateCharacter(delta);
   updateCamera(delta);
   updateMarker(delta);
   updateSpells(delta);
   checkCharacterPosition();
   updateInput();

   renderer.render(scene, camera);
   requestAnimationFrame(animate);
 }
 animate();
