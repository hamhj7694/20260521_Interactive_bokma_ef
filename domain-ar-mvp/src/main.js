import './style.css';

// =====================================================
// 1. DOM / Canvas
// =====================================================

const video = document.querySelector('#webcam');
const canvas = document.querySelector('#stage');
const ctx = canvas.getContext('2d');

// =====================================================
// 2. Global Settings
// =====================================================

const DEBUG = true;
const MIRROR_VIEW = true;

// =====================================================
// 3. Assets
// =====================================================

const doorImage = new Image();
doorImage.src = '/door_one.png';

// =====================================================
// 4. Timeline Settings
// =====================================================

// ===== 연출 타임라인 =====
// 0.0~1.2초: 붉은 안개 서서히 생성
// 1.2~2.2초: 붉은 안개 유지
// 2.2~3.2초: door_one.png 크게 줌인된 상태로 서서히 등장
// 3.2~4.2초: 문 고정
// 4.2~5.0초: 사람 누끼 + door 빠르게 줌아웃
const FOG_IN_DURATION = 2200;
const FOG_HOLD_DURATION = 1000;
const DOOR_REVEAL_DURATION = 1000;
const DOOR_HOLD_DURATION = 1000;
const ZOOM_OUT_DURATION = 800;

// =====================================================
// 5. Door / Person Scene Settings
// =====================================================

// 문 등장/고정 크기
const DOOR_START_SCALE = 2.25;

// 문 최종 줌아웃 크기
const DOOR_FINAL_SCALE = 0.45;

// 문 등장 시작 위치
// 화면 높이 기준. -값일수록 위로 올라감
const DOOR_REVEAL_START_OFFSET_RATIO = -0.8;

// 문 최종 기본 위치
const DOOR_DEFAULT_OFFSET_Y = -4;

// 인물 누끼 최종 줌아웃 크기
const PERSON_FINAL_SCALE = 0.15;

// 인물 누끼 최종 기준점
// 0.5 = 화면 중앙, 0.75 = 화면 아래쪽
const PERSON_FINAL_PIVOT_Y = 0.75;

// 전경 붉은 물 최종 진하기
const FRONT_WATER_FINAL_ALPHA = 1;

// 전경 붉은 물 세로 위치
// 0.8 = 화면 아래쪽, 숫자가 작을수록 위로 올라감
const FRONT_WATER_Y_RATIO = 0.8;

// 전경 붉은 물 높이
const FRONT_WATER_HEIGHT_RATIO = 0.16;

// 전경 붉은 물 폭
const FRONT_WATER_WIDTH_RATIO = 0.78;

// 전경 붉은 물결 움직임 강도
const FRONT_WATER_WAVE_AMOUNT = 5;

// 전경 붉은 물 높이(문 이미지 기준, 숫자 클수록 아래 0~1)
const FRONT_WATER_DOOR_RELATIVE_Y = 1;

// =====================================================
// 6. Scene State
// =====================================================

const STATE_NORMAL = 'NORMAL';
const STATE_SEQUENCE = 'SEQUENCE';
const STATE_FINAL = 'FINAL';

let sceneState = STATE_NORMAL;
let sequenceStartedAt = null;
let sequenceTriggered = false;

// =====================================================
// 7. MediaPipe / Segmentation State
// =====================================================

let hands = null;
let isHandsProcessing = false;
let latestHands = [];

let segmenter = null;
let isSegmentationProcessing = false;
let segmentationReady = false;

let cameraReady = false;

const personCanvas = document.createElement('canvas');
const personCtx = personCanvas.getContext('2d');

// =====================================================
// 8. Gesture State
// =====================================================

let isLeftGestureActive = false;
let isRightGestureActive = false;

let rawLeftGestureActive = false;
let rawRightGestureActive = false;
let rawDoorGestureActive = false;

let doorFalseFrameCount = 0;
let oneHandGestureStartTime = null;
let oneHandGestureHoldProgress = 0;

const DOOR_OFF_FRAME_THRESHOLD = 8;
const ONE_HAND_HOLD_DURATION = 2000;

// =====================================================
// 9. Hand Landmark Settings
// =====================================================

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

const FINGER = {
  thumb: {
    tip: 4,
    ip: 3,
    mcp: 2,
  },
  index: {
    tip: 8,
    pip: 6,
    mcp: 5,
  },
  middle: {
    tip: 12,
    pip: 10,
    mcp: 9,
  },
  ring: {
    tip: 16,
    pip: 14,
    mcp: 13,
  },
  pinky: {
    tip: 20,
    pip: 18,
    mcp: 17,
  },
};

// =====================================================
// 10. Init
// =====================================================

init();

async function init() {
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  await loadScriptIfNeeded(
    'Hands',
    'https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js',
  );

  // 연출 > 인물 누끼 관련 주석 처리(필요시 주석 해제)
  // await loadScriptIfNeeded(
  //   'SelfieSegmentation',
  //   'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js',
  // );

  await setupCamera();
  setupMediaPipeHands();
  // setupSegmentation(); // 연출 > 인물 누끼 관련 주석 처리(필요시 주석 해제)

  renderLoop();
}

// =====================================================
// 11. Camera / MediaPipe Setup
// =====================================================

async function setupCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: 'user',
      },
      audio: false,
    });

    video.srcObject = stream;

    await new Promise((resolve) => {
      video.onloadedmetadata = () => {
        video.play();
        resolve();
      };
    });

    cameraReady = true;
  } catch (error) {
    console.error('웹캠을 시작할 수 없습니다.', error);
  }
}

function setupMediaPipeHands() {
  hands = new window.Hands({
    locateFile: (file) => {
      return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
    },
  });

  hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.65,
    minTrackingConfidence: 0.65,
  });

  hands.onResults((results) => {
    latestHands = normalizeHands(results);
    isHandsProcessing = false;
  });
}

function setupSegmentation() {
  segmenter = new window.SelfieSegmentation({
    locateFile: (file) => {
      return `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`;
    },
  });

  segmenter.setOptions({
    modelSelection: 1,
    selfieMode: false,
  });

  segmenter.onResults((results) => {
    makePersonLayer(results);
    isSegmentationProcessing = false;
    segmentationReady = true;
  });
}

// =====================================================
// 12. Main Render Loop
// =====================================================

function renderLoop() {
  processHands();

  // 연출 > 인물 누끼 관련 주석 처리(필요시 주석 해제)
  // if (sceneState === STATE_SEQUENCE || sceneState === STATE_FINAL) {
  //   processSegmentation();
  // }

  evaluateGesture();

  if (sceneState === STATE_NORMAL) {
    drawCoverVideo();
    drawHands();
  } else {
    drawSequenceScene();
  }

  drawDebugPanel();

  requestAnimationFrame(renderLoop);
}

// =====================================================
// 13. Canvas / Video Helpers
// =====================================================

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;

  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function getStageSize() {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

function getVideoDrawRect() {
  const { width: canvasW, height: canvasH } = getStageSize();

  const videoW = video.videoWidth || 1280;
  const videoH = video.videoHeight || 720;

  const canvasRatio = canvasW / canvasH;
  const videoRatio = videoW / videoH;

  let drawW;
  let drawH;
  let drawX;
  let drawY;

  if (videoRatio > canvasRatio) {
    drawH = canvasH;
    drawW = drawH * videoRatio;
    drawX = (canvasW - drawW) / 2;
    drawY = 0;
  } else {
    drawW = canvasW;
    drawH = drawW / videoRatio;
    drawX = 0;
    drawY = (canvasH - drawH) / 2;
  }

  return {
    x: drawX,
    y: drawY,
    width: drawW,
    height: drawH,
  };
}

function drawCoverVideo() {
  const { width, height } = getStageSize();

  ctx.clearRect(0, 0, width, height);

  if (!cameraReady || video.readyState < 2) {
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, width, height);
    return;
  }

  const rect = getVideoDrawRect();

  ctx.save();

  if (MIRROR_VIEW) {
    ctx.translate(width, 0);
    ctx.scale(-1, 1);

    ctx.drawImage(
      video,
      width - rect.x - rect.width,
      rect.y,
      rect.width,
      rect.height
    );
  } else {
    ctx.drawImage(
      video,
      rect.x,
      rect.y,
      rect.width,
      rect.height
    );
  }

  ctx.restore();
}

// =====================================================
// 14. Hands Processing
// =====================================================

function processHands() {
  if (!hands) return;
  if (!cameraReady) return;
  if (video.readyState < 2) return;
  if (isHandsProcessing) return;

  isHandsProcessing = true;

  hands.send({ image: video }).catch((error) => {
    console.error('MediaPipe Hands 처리 오류:', error);
    isHandsProcessing = false;
  });
}

function normalizeHands(results) {
  const landmarksList = results.multiHandLandmarks || [];
  const handednessList = results.multiHandedness || [];

  return landmarksList.map((landmarks, index) => {
    const handedness = handednessList[index];
    const label = handedness?.label || 'Unknown';

    return {
      label,
      landmarks,
      points: landmarks.map((landmark) => {
        return landmarkToCanvasPoint(landmark);
      }),
    };
  });
}

function landmarkToCanvasPoint(landmark) {
  const rect = getVideoDrawRect();

  const xRatio = MIRROR_VIEW ? 1 - landmark.x : landmark.x;

  return {
    x: rect.x + xRatio * rect.width,
    y: rect.y + landmark.y * rect.height,
    z: landmark.z,
  };
}

// =====================================================
// 15. Segmentation Processing
// =====================================================

function processSegmentation() {
  if (!segmenter) return;
  if (!cameraReady) return;
  if (video.readyState < 2) return;
  if (isSegmentationProcessing) return;

  isSegmentationProcessing = true;

  segmenter.send({ image: video }).catch((error) => {
    console.error('Selfie Segmentation 처리 오류:', error);
    isSegmentationProcessing = false;
  });
}

function makePersonLayer(results) {
  const sourceW = video.videoWidth || 1280;
  const sourceH = video.videoHeight || 720;

  personCanvas.width = sourceW;
  personCanvas.height = sourceH;

  personCtx.clearRect(0, 0, sourceW, sourceH);

  // 1. 사람 마스크
  personCtx.drawImage(results.segmentationMask, 0, 0, sourceW, sourceH);

  // 2. 마스크 안에만 원본 캠 영상 넣기
  personCtx.globalCompositeOperation = 'source-in';
  personCtx.drawImage(results.image, 0, 0, sourceW, sourceH);

  // 3. 합성 모드 복구
  personCtx.globalCompositeOperation = 'source-over';
}

// =====================================================
// 16. Gesture Logic
// =====================================================

function evaluateGesture() {
  if (sceneState !== STATE_NORMAL) return;

  isLeftGestureActive = false;
  isRightGestureActive = false;

  const leftHand = latestHands.find((hand) => hand.label === 'Left');
  const rightHand = latestHands.find((hand) => hand.label === 'Right');

  if (leftHand) {
    isLeftGestureActive = isDoorGesture(leftHand.landmarks);
  }

  if (rightHand) {
    isRightGestureActive = isDoorGesture(rightHand.landmarks);
  }

  rawLeftGestureActive = isLeftGestureActive;
  rawRightGestureActive = isRightGestureActive;

  const oneHandGestureActive =
    rawLeftGestureActive || rawRightGestureActive;

  rawDoorGestureActive = oneHandGestureActive;

  updateOneHandHoldState(oneHandGestureActive);
}

function updateOneHandHoldState(oneHandGestureActive) {
  const now = performance.now();

  if (oneHandGestureActive) {
    doorFalseFrameCount = 0;

    if (oneHandGestureStartTime === null) {
      oneHandGestureStartTime = now;
    }

    const elapsed = now - oneHandGestureStartTime;

    oneHandGestureHoldProgress = Math.min(
      elapsed / ONE_HAND_HOLD_DURATION,
      1,
    );

    if (elapsed >= ONE_HAND_HOLD_DURATION) {
      startDoorSequence();
    }

    return;
  }

  doorFalseFrameCount += 1;

  if (doorFalseFrameCount >= DOOR_OFF_FRAME_THRESHOLD) {
    oneHandGestureStartTime = null;
    oneHandGestureHoldProgress = 0;
  }
}

function isDoorGesture(landmarks) {
  if (!landmarks || landmarks.length < 21) return false;

  const indexExtended = isFingerExtendedVertical(landmarks, FINGER.index);
  const middleExtended = isFingerExtendedVertical(landmarks, FINGER.middle);
  const ringFolded = isFingerFoldedVertical(landmarks, FINGER.ring);
  const pinkyFolded = isFingerFoldedVertical(landmarks, FINGER.pinky);

  return (
    indexExtended &&
    middleExtended &&
    ringFolded &&
    pinkyFolded
  );
}

function isFingerExtendedVertical(landmarks, finger) {
  const tip = landmarks[finger.tip];
  const pip = landmarks[finger.pip];
  const mcp = landmarks[finger.mcp];

  if (!tip || !pip || !mcp) return false;

  const tipAbovePip = tip.y < pip.y;
  const pipAboveMcp = pip.y < mcp.y;

  return tipAbovePip && pipAboveMcp;
}

function isFingerFoldedVertical(landmarks, finger) {
  const tip = landmarks[finger.tip];
  const pip = landmarks[finger.pip];

  if (!tip || !pip) return false;

  return tip.y > pip.y;
}

// =====================================================
// 17. Sequence / Door Scene
// =====================================================

function startDoorSequence() {
  if (sequenceTriggered) return;

  sequenceTriggered = true;
  sceneState = STATE_SEQUENCE;
  sequenceStartedAt = performance.now();
}

function drawSequenceScene() {
  const { width, height } = getStageSize();

  ctx.clearRect(0, 0, width, height);

  const now = performance.now();
  const elapsed = now - sequenceStartedAt;
  const phase = getSequencePhase(elapsed);

  // 화면 높이 기준 문 시작 위치
  const doorRevealStartOffsetY =
    height * DOOR_REVEAL_START_OFFSET_RATIO;

  if (phase === 'FINAL') {
    sceneState = STATE_FINAL;
  }

  // 0.0~1.2초: 기존 캠 화면 위에 붉은 안개가 서서히 덮이게 처리
  if (phase === 'FOG_IN') {
    const rawT = elapsed / FOG_IN_DURATION;
    const t = easeInCubic(rawT);

    drawCoverVideo();
    drawFogBackground(t);

    // 연출 > 인물 누끼 관련 주석 처리(필요시 주석 해제)
    // if (segmentationReady) {
    //   drawPersonLayerScaled(1, 0.5);
    // }

    return;
  }

  // 누끼가 아직 준비되지 않은 상태에서 FOG_IN 이후 단계로 넘어간 경우 // 연출 > 인물 누끼 관련 주석 처리(필요시 주석 해제)
  // if (!segmentationReady) {
  //   drawCoverVideo();
  //   return;
  // }

  // 1.2~2.2초: 붉은 안개 유지
  if (phase === 'FOG_HOLD') {
    drawFogBackground(1);
    //drawPersonLayerScaled(1, 0.5); // 연출 > 인물 누끼 관련 주석 처리(필요시 주석 해제)

    return;
  }

  // 2.2~3.2초: 문 등장
  // 문 크기는 고정, 투명도만 증가
  // 문 위치는 줌아웃 전까지 최초 위치 유지
  if (phase === 'DOOR_REVEAL') {
    const localElapsed =
      elapsed - (FOG_IN_DURATION + FOG_HOLD_DURATION);

    const t = easeOutCubic(localElapsed / DOOR_REVEAL_DURATION);

    const doorScale = DOOR_START_SCALE;
    const doorAlpha = lerp(0, 1, t);
    const doorOffsetY = doorRevealStartOffsetY;

    drawFogBackground(1);
    drawDoorScaled(doorScale, doorAlpha, doorOffsetY);
    // drawPersonLayerScaled(1, 0.5); // 연출 > 인물 누끼 관련 주석 처리(필요시 주석 해제)

    return;
  }

  // 3.2~4.2초: 문 고정
  // DOOR_REVEAL 마지막 위치/크기와 동일하게 유지
  if (phase === 'DOOR_HOLD') {
    drawFogBackground(1);
    drawDoorScaled(DOOR_START_SCALE, 1, doorRevealStartOffsetY);
    //drawPersonLayerScaled(1, 0.5); // 연출 > 인물 누끼 관련 주석 처리(필요시 주석 해제)

    return;
  }

  // 4.2~5.0초: 문과 인물 누끼 줌아웃
  // 문 크기와 인물 크기는 따로 조절
  // 문은 최초 위치에서 기본 위치로 이동
  // 인물 기준점도 0.5에서 0.75로 부드럽게 이동
  if (phase === 'ZOOM_OUT') {
    const localElapsed =
      elapsed -
      (
        FOG_IN_DURATION +
        FOG_HOLD_DURATION +
        DOOR_REVEAL_DURATION +
        DOOR_HOLD_DURATION
      );

    const t = easeOutCubic(localElapsed / ZOOM_OUT_DURATION);

    const doorScale = lerp(DOOR_START_SCALE, DOOR_FINAL_SCALE, t);
    const doorOffsetY = lerp(
      doorRevealStartOffsetY,
      DOOR_DEFAULT_OFFSET_Y,
      t,
    );

    // 연출 > 인물 누끼 관련 주석 처리(필요시 주석 해제)
    // const personScale = lerp(1, PERSON_FINAL_SCALE, t);
    // const personPivotY = lerp(0.5, PERSON_FINAL_PIVOT_Y, t);

    drawFogBackground(1);
    drawDoorScaled(doorScale, 1, doorOffsetY);
    // drawPersonLayerScaled(personScale, personPivotY); // 연출 > 인물 누끼 관련 주석 처리(필요시 주석 해제)

    // 줌아웃이 진행될수록 전경 물 서서히 생김
    const frontWaterAlpha = lerp(0, FRONT_WATER_FINAL_ALPHA, t);
    drawFrontWaterLayer(frontWaterAlpha);

    return;
  }

  // 최종 고정 상태
  // ZOOM_OUT 마지막 값과 완전히 동일하게 유지
  drawFogBackground(1);
  drawDoorScaled(DOOR_FINAL_SCALE, 1, DOOR_DEFAULT_OFFSET_Y);
  // drawPersonLayerScaled(PERSON_FINAL_SCALE, PERSON_FINAL_PIVOT_Y); // 연출 > 인물 누끼 관련 주석 처리(필요시 주석 해제)

  // 최종 장면에서 문 하단 경계를 전경 붉은 물로 가림
  drawFrontWaterLayer(FRONT_WATER_FINAL_ALPHA);
}

function getSequencePhase(elapsed) {
  const t1 = FOG_IN_DURATION;
  const t2 = t1 + FOG_HOLD_DURATION;
  const t3 = t2 + DOOR_REVEAL_DURATION;
  const t4 = t3 + DOOR_HOLD_DURATION;
  const t5 = t4 + ZOOM_OUT_DURATION;

  if (elapsed < t1) return 'FOG_IN';
  if (elapsed < t2) return 'FOG_HOLD';
  if (elapsed < t3) return 'DOOR_REVEAL';
  if (elapsed < t4) return 'DOOR_HOLD';
  if (elapsed < t5) return 'ZOOM_OUT';

  return 'FINAL';
}

// =====================================================
// 18. Drawing Effects
// =====================================================

function drawFogBackground(intensity = 1) {
  const { width, height } = getStageSize();
  const time = performance.now() * 0.001;

  ctx.save();

  ctx.fillStyle = `rgba(10, 2, 4, ${0.88 * intensity})`;
  ctx.fillRect(0, 0, width, height);

  const baseGradient = ctx.createRadialGradient(
    width / 2,
    height / 2,
    80,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.75,
  );

  baseGradient.addColorStop(0, `rgba(180, 30, 30, ${0.45 * intensity})`);
  baseGradient.addColorStop(0.6, `rgba(100, 0, 0, ${0.35 * intensity})`);
  baseGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

  ctx.fillStyle = baseGradient;
  ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < 10; i++) {
    const x =
      width / 2 +
      Math.cos(time * 0.45 + i * 1.21) * width * 0.3;

    const y =
      height / 2 +
      Math.sin(time * 0.33 + i * 0.93) * height * 0.23;

    const radius = 130 + Math.sin(time * 0.9 + i) * 38;

    const fog = ctx.createRadialGradient(x, y, 0, x, y, radius);

    fog.addColorStop(0, `rgba(165, 18, 18, ${0.2 * intensity})`);
    fog.addColorStop(1, 'rgba(165, 18, 18, 0)');

    ctx.fillStyle = fog;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawFrontWaterLayer(alpha = 1) {
  const { width, height } = getStageSize();
  const time = performance.now() * 0.001;

  const centerX = width / 2;

  const doorW = width * DOOR_FINAL_SCALE;
  const doorH = doorW * (doorImage.height / doorImage.width);
  const doorY = height / 2 - doorH / 2 + DOOR_DEFAULT_OFFSET_Y;

  const baseY = doorY + doorH * FRONT_WATER_DOOR_RELATIVE_Y;

  const waterW = width * FRONT_WATER_WIDTH_RATIO;
  const waterH = height * FRONT_WATER_HEIGHT_RATIO;

  ctx.save();

  // 앞쪽 물결 라인
  ctx.beginPath();

  const startX = centerX - waterW * 0.72;
  const endX = centerX + waterW * 0.72;
  const waveY = baseY - waterH * 0.28;

  ctx.moveTo(startX, waveY);

  for (let x = startX; x <= endX; x += 28) {
    const progress = (x - startX) / (endX - startX);
    const wave =
      Math.sin(progress * Math.PI * 4 + time * 1.4) *
      FRONT_WATER_WAVE_AMOUNT;

    ctx.lineTo(x, waveY + wave);
  }

  ctx.lineTo(endX, baseY + waterH * 0.45);
  ctx.lineTo(startX, baseY + waterH * 0.45);
  ctx.closePath();

  const waveGradient = ctx.createLinearGradient(
    centerX,
    waveY - waterH * 0.2,
    centerX,
    baseY + waterH * 0.55,
  );

  waveGradient.addColorStop(0, `rgba(210, 35, 30, ${0.34 * alpha})`);
  waveGradient.addColorStop(0.45, `rgba(120, 0, 0, ${0.28 * alpha})`);
  waveGradient.addColorStop(1, `rgba(35, 0, 0, ${0.05 * alpha})`);

  ctx.fillStyle = waveGradient;
  ctx.fill();

  // 물 표면 하이라이트
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = `rgba(255, 70, 55, ${0.18 * alpha})`;
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.moveTo(startX, waveY);

  for (let x = startX; x <= endX; x += 24) {
    const progress = (x - startX) / (endX - startX);
    const wave =
      Math.sin(progress * Math.PI * 5 + time * 1.7) *
      FRONT_WATER_WAVE_AMOUNT *
      0.6;

    ctx.lineTo(x, waveY + wave);
  }

  ctx.stroke();

  ctx.restore();
}

function drawPersonLayerScaled(groupScale = 1, pivotYRatio = 0.5) {
  if (personCanvas.width === 0 || personCanvas.height === 0) return;

  const { width, height } = getStageSize();
  const rect = getVideoDrawRect();

  const pivotX = width / 2;
  const pivotY = height * pivotYRatio;

  ctx.save();

  ctx.translate(pivotX, pivotY);
  ctx.scale(groupScale, groupScale);
  ctx.translate(-pivotX, -pivotY);

  if (MIRROR_VIEW) {
    ctx.translate(width, 0);
    ctx.scale(-1, 1);

    ctx.drawImage(
      personCanvas,
      width - rect.x - rect.width,
      rect.y,
      rect.width,
      rect.height,
    );
  } else {
    ctx.drawImage(
      personCanvas,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
    );
  }

  ctx.restore();
}

function drawDoorScaled(doorScale, alpha, offsetY = 0) {
  if (!doorImage.complete) return;

  const { width, height } = getStageSize();

  const doorW = width * doorScale;
  const doorH = doorW * (doorImage.height / doorImage.width);

  const x = width / 2 - doorW / 2;
  const y = height / 2 - doorH / 2 + offsetY;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(doorImage, x, y, doorW, doorH);
  ctx.restore();
}

function drawHands() {
  if (!latestHands.length) return;

  latestHands.forEach((hand) => {
    const points = hand.points;

    drawHandLines(points, hand.label);
    drawHandPoints(points, hand.label);
    drawHandLabel(points, hand.label);
  });
}

function drawHandLines(points, label) {
  ctx.save();

  ctx.lineWidth = 3;
  ctx.strokeStyle = label === 'Right'
    ? 'rgba(0, 255, 160, 0.95)'
    : 'rgba(70, 170, 255, 0.95)';

  ctx.beginPath();

  HAND_CONNECTIONS.forEach(([startIndex, endIndex]) => {
    const start = points[startIndex];
    const end = points[endIndex];

    if (!start || !end) return;

    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
  });

  ctx.stroke();
  ctx.restore();
}

function drawHandPoints(points, label) {
  ctx.save();

  const fillColor = label === 'Right'
    ? 'rgba(0, 255, 160, 1)'
    : 'rgba(70, 170, 255, 1)';

  points.forEach((point, index) => {
    ctx.beginPath();
    ctx.arc(point.x, point.y, index === 0 ? 6 : 4.5, 0, Math.PI * 2);
    ctx.fillStyle = fillColor;
    ctx.fill();

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.stroke();
  });

  ctx.restore();
}

function drawHandLabel(points, label) {
  const wrist = points[0];
  if (!wrist) return;

  ctx.save();

  ctx.font = 'bold 16px Arial';
  ctx.textBaseline = 'middle';

  const text = label === 'Right' ? 'USER RIGHT' : 'USER LEFT';
  const paddingX = 8;
  const paddingY = 5;
  const textW = ctx.measureText(text).width;
  const boxW = textW + paddingX * 2;
  const boxH = 26;

  const x = wrist.x + 12;
  const y = wrist.y - 18;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.fillRect(x, y, boxW, boxH);

  ctx.fillStyle = '#fff';
  ctx.fillText(text, x + paddingX, y + boxH / 2);

  ctx.restore();
}

// =====================================================
// 19. Debug
// =====================================================

function drawDebugPanel() {
  if (!DEBUG) return;

  const { width } = getStageSize();

  const rightHand = latestHands.find((hand) => hand.label === 'Right');
  const leftHand = latestHands.find((hand) => hand.label === 'Left');

  const phase =
    sceneState === STATE_SEQUENCE && sequenceStartedAt
      ? getSequencePhase(performance.now() - sequenceStartedAt)
      : sceneState;

  const lines = [
    `cameraReady: ${cameraReady}`,
    `hands: ${latestHands.length}`,
    `left hand detected: ${Boolean(leftHand)}`,
    `right hand detected: ${Boolean(rightHand)}`,
    `left gesture: ${rawLeftGestureActive}`,
    `right gesture: ${rawRightGestureActive}`,
    `one hand gesture: ${rawDoorGestureActive}`,
    `hold progress: ${oneHandGestureHoldProgress.toFixed(2)}`,
    `false frames: ${doorFalseFrameCount}`,
    `sequenceTriggered: ${sequenceTriggered}`,
    `sceneState: ${sceneState}`,
    `phase: ${phase}`,
    `segmentationReady: ${segmentationReady}`,
    `door image loaded: ${doorImage.complete}`,
  ];

  ctx.save();

  const panelW = 310;
  const panelH = 28 + lines.length * 22;
  const x = width - panelW - 16;
  const y = 16;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.68)';
  ctx.fillRect(x, y, panelW, panelH);

  ctx.fillStyle = '#fff';
  ctx.font = '14px Arial';
  ctx.textBaseline = 'top';

  lines.forEach((line, index) => {
    ctx.fillText(line, x + 14, y + 14 + index * 22);
  });

  ctx.restore();
}

// =====================================================
// 20. Utility
// =====================================================

function easeOutCubic(t) {
  const v = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - v, 3);
}

function easeInOutCubic(t) {
  const v = Math.max(0, Math.min(1, t));

  return v < 0.5
    ? 4 * v * v * v
    : 1 - Math.pow(-2 * v + 2, 3) / 2;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function loadScriptIfNeeded(globalName, src) {
  if (window[globalName]) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');

    script.src = src;
    script.onload = resolve;
    script.onerror = reject;

    document.head.appendChild(script);
  });
}

function easeInCubic(t) {
  const v = Math.max(0, Math.min(1, t));
  return v * v * v;
}