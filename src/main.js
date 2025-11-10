import { initScene, scene, renderer, camera } from './world/scene.js';
import { initCharacter, updateCharacter, checkCharacterPosition } from './player/character.js';
import { initCameraControl, updateCamera } from './ui/cameraController.js';
import { initInput, updateInput } from './core/input.js';
import { initOverlay } from './ui/overlay.js';
import { showMarker, updateMarker } from './ui/marker.js';
import { initSpells, updateSpells } from './player/spells.js';
import { socket } from "./network/socket.js";
import { initHealthBars, updateHealthBars } from './ui/healthBars.js';

 

 
 socket.on("connect", () => {
  console.log("Connecté au serveur Socket.IO !", socket.id);
  });

 initScene();
 initCharacter(scene);
 initInput();
 initOverlay();
 initCameraControl(renderer.domElement);
 initSpells();
initHealthBars(camera, renderer.domElement);

let lastTime = performance.now();
let isHidden = false;
let accumulatedHiddenTime = 0;

function animate(now = performance.now()) {
  const rawDelta = (now - lastTime) / 1000;
  lastTime = now;
  // Clamp excessively large delta (tab hidden throttling) to avoid physics leaps
  const delta = Math.min(rawDelta, 0.05);

  if (!isHidden) {
    updateCharacter(delta);
    updateCamera(delta);
    updateMarker(delta);
    updateSpells(delta);
    checkCharacterPosition();
    updateInput();
    renderer.render(scene, camera);
  } else {
    // When hidden, skip heavy updates; still render occasionally for state safety
    accumulatedHiddenTime += rawDelta;
    if (accumulatedHiddenTime >= 1.0) { // render once per second while hidden
      renderer.render(scene, camera);
      accumulatedHiddenTime = 0;
    }
  }
  updateHealthBars();
  requestAnimationFrame(animate);
}
animate();

// Visibility handling: pause intensive work and force resync on focus
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    isHidden = true;
    accumulatedHiddenTime = 0;
  } else {
    isHidden = false;
    // Force a position resend & request snapshot for fast resync
    try { socket.emit('snapshotRequest'); } catch {}
  }
});
