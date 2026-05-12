import "./style.css";

const WIDTH = 1280;
const HEIGHT = 720;

const ACTIVATION_DISTANCE = 170;
const ACTIVATION_WINDOW_MS = 2000;
const REQUIRED_VALID_MS = 900;

const SIGN_LOCK_TIMEOUT_MS = 5000;
const OCCLUSION_CHARGE_GRACE_MS = 1200;

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const handsCountEl = document.getElementById("handsCount");
const leftDetectedEl = document.getElementById("leftDetected");
const rightDetectedEl = document.getElementById("rightDetected");
const stateEl = document.getElementById("state");
const cameraSizeEl = document.getElementById("cameraSize");

canvas.width = WIDTH;
canvas.height = HEIGHT;

let latestResults = null;
let state = "IDLE";

let validFrames = [];
let validMs = 0;
let handDistance = null;

let signLocked = false;
let signLockedTime = 0;

let lastCloseTime = 0;
let lastStableDistance = null;
let lastStableHandsTime = 0;

const doorImage = new Image();
doorImage.src = "/door_one.png";

function toCanvasPoint(landmark) {
  return {
    x: WIDTH - landmark.x * WIDTH,
    y: landmark.y * HEIGHT,
    z: landmark.z,
  };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function getSealPoint(landmarks) {
  const middleTip = toCanvasPoint(landmarks[12]);
  const ringTip = toCanvasPoint(landmarks[16]);

  return {
    x: (middleTip.x + ringTip.x) / 2,
    y: (middleTip.y + ringTip.y) / 2,
  };
}

function getWristX(landmarks) {
  return toCanvasPoint(landmarks[0]).x;
}

function angle(a, b, c) {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };

  const dot = ab.x * cb.x + ab.y * cb.y;
  const abLen = Math.hypot(ab.x, ab.y);
  const cbLen = Math.hypot(cb.x, cb.y);

  if (abLen === 0 || cbLen === 0) return 0;

  const cos = dot / (abLen * cbLen);
  return Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
}

function isFingerExtended(landmarks, mcp, pip, tip) {
  const a = toCanvasPoint(landmarks[mcp]);
  const b = toCanvasPoint(landmarks[pip]);
  const c = toCanvasPoint(landmarks[tip]);

  return angle(a, b, c) > 130;
}

function isPinkyFoldedForSign(landmarks) {
  const mcp = toCanvasPoint(landmarks[17]);
  const pip = toCanvasPoint(landmarks[18]);
  const tip = toCanvasPoint(landmarks[20]);

  const mcpToTip = distance(mcp, tip);
  const mcpToPip = distance(mcp, pip);

  return mcpToTip < mcpToPip * 1.55;
}

function isDomainSign(landmarks) {
  const middleExtended = isFingerExtended(landmarks, 9, 10, 12);
  const ringExtended = isFingerExtended(landmarks, 13, 14, 16);
  const pinkyFolded = isPinkyFoldedForSign(landmarks);

  return middleExtended && ringExtended && pinkyFolded;
}

function getStableHands(results) {
  if (!results?.multiHandLandmarks || results.multiHandLandmarks.length < 2) {
    return null;
  }

  const hands = results.multiHandLandmarks.map((landmarks) => {
    return {
      landmarks,
      wristX: getWristX(landmarks),
    };
  });

  hands.sort((a, b) => a.wristX - b.wristX);

  return {
    left: hands[0].landmarks,
    right: hands[1].landmarks,
  };
}

function drawMirroredVideo() {
  if (video.readyState < 2) return;

  ctx.save();
  ctx.scale(-1, 1);
  ctx.drawImage(video, -WIDTH, 0, WIDTH, HEIGHT);
  ctx.restore();
}

function drawLandmarks(landmarks, color = "#00ff99") {
  ctx.fillStyle = color;

  for (const landmark of landmarks) {
    const p = toCanvasPoint(landmark);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHandLabel(landmarks, label) {
  const wrist = toCanvasPoint(landmarks[0]);

  ctx.fillStyle = "white";
  ctx.font = "24px Arial";
  ctx.fillText(label, wrist.x + 12, wrist.y - 12);
}

function drawSealPoint(landmarks, color) {
  const p = getSealPoint(landmarks);

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
  ctx.fill();
}

function drawConnectionLine(leftLandmarks, rightLandmarks) {
  const leftPoint = getSealPoint(leftLandmarks);
  const rightPoint = getSealPoint(rightLandmarks);

  ctx.strokeStyle = handDistance <= ACTIVATION_DISTANCE ? "#ffff00" : "#ffffff";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(leftPoint.x, leftPoint.y);
  ctx.lineTo(rightPoint.x, rightPoint.y);
  ctx.stroke();
}

function drawDebugOverlay() {
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(16, HEIGHT - 150, 430, 122);

  ctx.fillStyle = "#00ff99";
  ctx.font = "22px Arial";
  ctx.fillText(`distance: ${handDistance ? Math.round(handDistance) : "-"}`, 32, HEIGHT - 112);
  ctx.fillText(`valid: ${(validMs / 1000).toFixed(1)} / ${(REQUIRED_VALID_MS / 1000).toFixed(1)}s`, 32, HEIGHT - 80);
  ctx.fillText(`signLocked: ${signLocked}`, 32, HEIGHT - 48);
}

function drawDomainDoor() {
  if (state !== "DOMAIN_READY") return;
  if (!doorImage.complete) return;

  const doorWidth = 520;
  const doorHeight = doorWidth * (doorImage.height / doorImage.width);

  const x = WIDTH / 2 - doorWidth / 2;
  const y = HEIGHT / 2 - doorHeight / 2;

  ctx.save();
  ctx.globalAlpha = 0.95;
  ctx.drawImage(doorImage, x, y, doorWidth, doorHeight);
  ctx.restore();
}

function updateGestureState(results) {
  const now = performance.now();
  const stableHands = getStableHands(results);

  validFrames = validFrames.filter((frame) => {
    return now - frame.time <= ACTIVATION_WINDOW_MS;
  });

  if (state === "DOMAIN_READY") {
    validMs = REQUIRED_VALID_MS;
    return;
  }

  if (signLocked && now - signLockedTime > SIGN_LOCK_TIMEOUT_MS) {
    signLocked = false;
    signLockedTime = 0;
    validFrames = [];
    validMs = 0;
    lastCloseTime = 0;
    lastStableDistance = null;
    lastStableHandsTime = 0;
  }

  if (stableHands) {
    const { left, right } = stableHands;

    const leftSeal = getSealPoint(left);
    const rightSeal = getSealPoint(right);
    handDistance = distance(leftSeal, rightSeal);

    lastStableDistance = handDistance;
    lastStableHandsTime = now;

    const leftSign = isDomainSign(left);
    const rightSign = isDomainSign(right);
    const bothSign = leftSign && rightSign;

    if (bothSign && !signLocked) {
      signLocked = true;
      signLockedTime = now;
    }

    const isClose = handDistance <= ACTIVATION_DISTANCE;

    if (isClose) {
      lastCloseTime = now;
    }

    if (signLocked && isClose) {
      validFrames.push({
        time: now,
        duration: 33,
      });
    }
  } else {
    handDistance = lastStableDistance;

    const recentlyHadStableHands =
      now - lastStableHandsTime <= OCCLUSION_CHARGE_GRACE_MS;

    const recentlyClose =
      now - lastCloseTime <= OCCLUSION_CHARGE_GRACE_MS;

    if (signLocked && recentlyHadStableHands && recentlyClose) {
      validFrames.push({
        time: now,
        duration: 33,
      });
    }
  }

  validMs = validFrames.reduce((sum, frame) => {
    return sum + frame.duration;
  }, 0);

  if (validMs >= REQUIRED_VALID_MS) {
    state = "DOMAIN_READY";
  } else if (signLocked && validMs > 0) {
    state = "CHARGING";
  } else if (signLocked) {
    state = "SIGN_LOCKED";
  } else {
    state = "IDLE";
  }
}

function updateDebug(results) {
  const handsCount = results.multiHandLandmarks?.length ?? 0;
  const stableHands = getStableHands(results);

  handsCountEl.textContent = handsCount;
  leftDetectedEl.textContent = Boolean(stableHands?.left);
  rightDetectedEl.textContent = Boolean(stableHands?.right);
  stateEl.textContent = state;
}

function render() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  drawMirroredVideo();

  const stableHands = getStableHands(latestResults);

  if (stableHands) {
    drawLandmarks(stableHands.left, "#00ff99");
    drawLandmarks(stableHands.right, "#ff3366");

    drawHandLabel(stableHands.left, "LEFT");
    drawHandLabel(stableHands.right, "RIGHT");

    drawSealPoint(stableHands.left, signLocked ? "#ffff00" : "#00ff99");
    drawSealPoint(stableHands.right, signLocked ? "#ffff00" : "#ff3366");

    if (handDistance !== null) {
      drawConnectionLine(stableHands.left, stableHands.right);
    }
  }

  drawDomainDoor();
  drawDebugOverlay();

  requestAnimationFrame(render);
}

async function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function setupHands() {
  await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js");
  await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js");

  const hands = new window.Hands({
    locateFile: (file) => {
      return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
    },
  });

  hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 0,
    minDetectionConfidence: 0.45,
    minTrackingConfidence: 0.45,
  });

  hands.onResults((results) => {
    latestResults = results;
    updateGestureState(results);
    updateDebug(results);
  });

  const camera = new window.Camera(video, {
    onFrame: async () => {
      await hands.send({ image: video });
    },
    width: WIDTH,
    height: HEIGHT,
  });

  await camera.start();

  cameraSizeEl.textContent = `${video.videoWidth} x ${video.videoHeight}`;
}

setupHands();
render();