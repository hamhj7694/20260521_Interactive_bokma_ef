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

const DEBUG = false;
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

const FOG_IN_DURATION = 2200; // 붉은 안개 서서히 생성
const FOG_HOLD_DURATION = 500; // 붉은 안개 유지
const DOOR_REVEAL_DURATION = 1500; // door_one.png 크게 줌인된 상태로 서서히 등장
const DOOR_HOLD_DURATION = 700; // 문 고정
const ZOOM_OUT_DURATION = 800; // 사람 누끼 + door 빠르게 줌아웃

const MAGIC_HOLD_DURATION = 2000; // 줌아웃 완료 후 주술 영역 최종 화면 유지 시간

// 영역 절단 > 토막 벌어지기
const SLASH_DRAW_DURATION = 650; // 절단선이 빠르게 그어지는 시간
const SLASH_HOLD_DURATION = 300; // 균열선 유지 시간
const SLICE_SPLIT_DURATION = 850; // 균열선을 기준으로 화면 조각들이 벌어지는 시간

const SLICED_MAGIC_HOLD_DURATION = 1000; // 조각난 주술 영역 유지 시간
const MAGIC_DISSOLVE_DURATION = 5200; // 주술 영역이 테두리부터 가루처럼 사라지는 시간

// =====================================================
// 5. Door / Person Scene Settings
// =====================================================

// 문 등장/고정 크기
const DOOR_START_SCALE = 1.5;

// 문 최종 줌아웃 크기
const DOOR_FINAL_SCALE = 0.45;

// 문 등장 시작 위치
// 화면 높이 기준. -값일수록 위로 올라감
// const DOOR_REVEAL_START_OFFSET_RATIO = -0.6;

// 문 등장/고정 시 화면 세로 기준 중심 위치
// 0.0 = 화면 맨 위, 0.5 = 화면 중앙, 1.0 = 화면 맨 아래
const DOOR_REVEAL_CENTER_Y_RATIO = 0.14;

// 문 최종 기본 위치
const DOOR_DEFAULT_OFFSET_Y = -4;

// 인물 누끼 최종 줌아웃 크기
const PERSON_FINAL_SCALE = 0.15;

// 인물 누끼 최종 기준점
// 0.5 = 화면 중앙, 0.75 = 화면 아래쪽
const PERSON_FINAL_PIVOT_Y = 0.75;

// 전경 붉은 물 최종 진하기
const FRONT_WATER_FINAL_ALPHA = 1;

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

// 절단선 연출 설정
const SLASH_DELAY_STEP = 0.055;

const STATE_NORMAL = 'NORMAL';
const STATE_SEQUENCE = 'SEQUENCE';
const STATE_FINAL = 'FINAL';

let sceneState = STATE_NORMAL;
let sequenceStartedAt = null;
let sequenceTriggered = false;

// 칼날 균열 자국 랜덤 생성 관련 변수 추가
let slashLines = [];
let slashLinesGenerated = false;

// 화면 조각 분리 연출용 캡처 캔버스
const sliceSourceCanvas = document.createElement('canvas');
const sliceSourceCtx = sliceSourceCanvas.getContext('2d');

let sliceSourceCaptured = false;
let slicePieces = [];
let slicePiecesGenerated = false;

// 조각난 일반 캠 전환용 캔버스
const realityCanvas = document.createElement('canvas');
const realityCtx = realityCanvas.getContext('2d');

// 테두리 가루화 마스크용 임시 캔버스
const dissolveCanvas = document.createElement('canvas');
const dissolveCtx = dissolveCanvas.getContext('2d');

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

  // 절단선은 시퀀스마다 한 번만 랜덤 생성되도록 초기화
  slashLines = [];
  slashLinesGenerated = false;

  // 화면 조각 분리 연출 초기화
  sliceSourceCaptured = false;
  slicePieces = [];
  slicePiecesGenerated = false;
}

function drawSequenceScene() {
  const { width, height } = getStageSize();

  ctx.clearRect(0, 0, width, height);

  const now = performance.now();
  const elapsed = now - sequenceStartedAt;
  const phase = getSequencePhase(elapsed);

  // 화면 높이 기준 문 시작 위치
  // const doorRevealStartOffsetY =
  //   height * DOOR_REVEAL_START_OFFSET_RATIO;
  const doorRevealStartOffsetY =
    height * DOOR_REVEAL_CENTER_Y_RATIO - height / 2;

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

// 줌아웃 이후 2초 동안 주술 영역 최종 화면 유지
if (phase === 'MAGIC_HOLD') {
  drawMagicFinalScene();
  return;
}

// 2초 후, 절단선이 빠르게 그어짐
if (phase === 'SLASH_DRAW') {
  const localElapsed =
    elapsed -
    (
      FOG_IN_DURATION +
      FOG_HOLD_DURATION +
      DOOR_REVEAL_DURATION +
      DOOR_HOLD_DURATION +
      ZOOM_OUT_DURATION +
      MAGIC_HOLD_DURATION
    );

  const t = easeOutCubic(localElapsed / SLASH_DRAW_DURATION);

  drawMagicFinalScene();
  drawSlashLines(t);

  return;
}

if (phase === 'SLASH_HOLD') {
  drawMagicFinalScene();
  drawSlashLines(1);

  return;
}

// 균열선을 기준으로 화면 전체가 조각나며 벌어짐
if (phase === 'SLICE_SPLIT') {
  const localElapsed =
    elapsed -
    (
      FOG_IN_DURATION +
      FOG_HOLD_DURATION +
      DOOR_REVEAL_DURATION +
      DOOR_HOLD_DURATION +
      ZOOM_OUT_DURATION +
      MAGIC_HOLD_DURATION +
      SLASH_DRAW_DURATION +
      SLASH_HOLD_DURATION
    );

  const t = easeOutCubic(localElapsed / SLICE_SPLIT_DURATION);

  drawSlicedMagicScene(t);

  return;
}

// 조각난 주술 영역 캡처 이미지 1초 유지
if (phase === 'SLICED_MAGIC_HOLD') {
  drawSlicedMagicScene(1);
  return;
}

// 조각 테두리부터 주술 영역이 타들어가고, 아래에서 일반 캠이 드러남
if (phase === 'MAGIC_DISSOLVE') {
  const localElapsed =
    elapsed -
    (
      FOG_IN_DURATION +
      FOG_HOLD_DURATION +
      DOOR_REVEAL_DURATION +
      DOOR_HOLD_DURATION +
      ZOOM_OUT_DURATION +
      MAGIC_HOLD_DURATION +
      SLASH_DRAW_DURATION +
      SLASH_HOLD_DURATION +
      SLICE_SPLIT_DURATION +
      SLICED_MAGIC_HOLD_DURATION
    );

  const t = easeInOutCubic(localElapsed / MAGIC_DISSOLVE_DURATION);

  drawMagicDissolveToReality(t);

  return;
}

// 최종 고정 상태
// 같은 조각 구조로 일반 캠 화면 유지
drawSlicedRealityScene();
}

function getSequencePhase(elapsed) {
  const t1 = FOG_IN_DURATION;
  const t2 = t1 + FOG_HOLD_DURATION;
  const t3 = t2 + DOOR_REVEAL_DURATION;
  const t4 = t3 + DOOR_HOLD_DURATION;
  const t5 = t4 + ZOOM_OUT_DURATION;
  const t6 = t5 + MAGIC_HOLD_DURATION;
  const t7 = t6 + SLASH_DRAW_DURATION;
  const t8 = t7 + SLASH_HOLD_DURATION;
  const t9 = t8 + SLICE_SPLIT_DURATION;
  const t10 = t9 + SLICED_MAGIC_HOLD_DURATION;
  const t11 = t10 + MAGIC_DISSOLVE_DURATION;

  if (elapsed < t1) return 'FOG_IN';
  if (elapsed < t2) return 'FOG_HOLD';
  if (elapsed < t3) return 'DOOR_REVEAL';
  if (elapsed < t4) return 'DOOR_HOLD';
  if (elapsed < t5) return 'ZOOM_OUT';
  if (elapsed < t6) return 'MAGIC_HOLD';
  if (elapsed < t7) return 'SLASH_DRAW';
  if (elapsed < t8) return 'SLASH_HOLD';
  if (elapsed < t9) return 'SLICE_SPLIT';
  if (elapsed < t10) return 'SLICED_MAGIC_HOLD';
  if (elapsed < t11) return 'MAGIC_DISSOLVE';

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

function drawMagicFinalScene() {
  drawFogBackground(1);
  drawDoorScaled(DOOR_FINAL_SCALE, 1, DOOR_DEFAULT_OFFSET_Y);

  // 연출 > 인물 누끼 관련 주석 처리(필요시 주석 해제)
  // drawPersonLayerScaled(PERSON_FINAL_SCALE, PERSON_FINAL_PIVOT_Y);

  drawFrontWaterLayer(FRONT_WATER_FINAL_ALPHA);
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function randomChoice(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function ensureSlashLines() {
  if (slashLinesGenerated) return;

  slashLines = generateSlashLines();
  slashLinesGenerated = true;
}

function generateSlashLines() {
  const { width, height } = getStageSize();

  const extendX = width * 0.14;
  const extendY = height * 0.14;

  const generatedLines = [];

  // ===== 세로 계열 5개 =====
  // 기준 위치는 유지하되, 각 선마다 살짝 다른 기울기 부여
  const verticalBases = [0.13, 0.31, 0.5, 0.68, 0.87];

  verticalBases.forEach((base) => {
    const topX = base + randomRange(-0.025, 0.025);
    const bottomX = base + randomRange(-0.055, 0.055);

    generatedLines.push({
      x1: width * topX,
      y1: -extendY,
      x2: width * bottomX,
      y2: height + extendY,
    });
  });

  // ===== 가로 계열 4개 =====
  // 큰 덩어리 구조는 유지하되, 완전 수평처럼 보이지 않게 흔들기
  const horizontalBases = [0.16, 0.36, 0.59, 0.82];

  horizontalBases.forEach((base) => {
    const leftY = base + randomRange(-0.035, 0.035);
    const rightY = base + randomRange(-0.055, 0.055);

    generatedLines.push({
      x1: -extendX,
      y1: height * leftY,
      x2: width + extendX,
      y2: height * rightY,
    });
  });

  // ===== 약한 대각선 1개 =====
  // 왼쪽/오른쪽 중 한쪽에만 랜덤하게 생성
  // const diagonalSide = Math.random() < 0.5 ? 'left' : 'right';

  // if (diagonalSide === 'left') {
  //   generatedLines.push({
  //     x1: width * randomRange(0.04, 0.12),
  //     y1: height + extendY * randomRange(0.2, 0.55),
  //     x2: width * randomRange(0.25, 0.38),
  //     y2: -extendY * randomRange(0.15, 0.4),
  //   });
  // } else {
  //   generatedLines.push({
  //     x1: width * randomRange(0.68, 0.78),
  //     y1: -extendY * randomRange(0.15, 0.45),
  //     x2: width * randomRange(0.9, 0.98),
  //     y2: height + extendY * randomRange(0.2, 0.5),
  //   });
  // }

  return generatedLines;
}

function drawSlashLines(progress = 1) {
  ensureSlashLines();

  slashLines.forEach((line, index) => {
    const delayedProgress =
      (progress - index * SLASH_DELAY_STEP) /
      (1 - index * SLASH_DELAY_STEP);

    const t = Math.max(0, Math.min(1, delayedProgress));

    if (t <= 0) return;

    drawSingleSlashLine(line, easeOutCubic(t));
  });
}

function drawSingleSlashLine(line, progress = 1) {
  const x = lerp(line.x1, line.x2, progress);
  const y = lerp(line.y1, line.y2, progress);

  ctx.save();

  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';

  // 1) 바깥 어두운 선
  ctx.strokeStyle = 'rgba(53, 0, 0, 0.92)';
  ctx.lineWidth = 2.8;
  ctx.beginPath();
  ctx.moveTo(line.x1, line.y1);
  ctx.lineTo(x, y);
  ctx.stroke();

  // 2) 안쪽 밝은 선
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(line.x1, line.y1);
  ctx.lineTo(x, y);
  ctx.stroke();

  ctx.restore();
}

function drawSlashLinesToContext(targetCtx, progress = 1) {
  ensureSlashLines();

  slashLines.forEach((line, index) => {
    const delayedProgress =
      (progress - index * SLASH_DELAY_STEP) /
      (1 - index * SLASH_DELAY_STEP);

    const t = Math.max(0, Math.min(1, delayedProgress));

    if (t <= 0) return;

    drawSingleSlashLineToContext(targetCtx, line, easeOutCubic(t));
  });
}

function drawSingleSlashLineToContext(targetCtx, line, progress = 1) {
  const x = lerp(line.x1, line.x2, progress);
  const y = lerp(line.y1, line.y2, progress);

  targetCtx.save();

  targetCtx.lineCap = 'butt';
  targetCtx.lineJoin = 'miter';

  // 1) 바깥 어두운 선
  targetCtx.strokeStyle = 'rgba(53, 0, 0, 0.92)';
  targetCtx.lineWidth = 2.8;
  targetCtx.beginPath();
  targetCtx.moveTo(line.x1, line.y1);
  targetCtx.lineTo(x, y);
  targetCtx.stroke();

  // 2) 안쪽 밝은 선
  targetCtx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
  targetCtx.lineWidth = 1.1;
  targetCtx.beginPath();
  targetCtx.moveTo(line.x1, line.y1);
  targetCtx.lineTo(x, y);
  targetCtx.stroke();

  targetCtx.restore();
}

function captureSliceSource() {
  const { width, height } = getStageSize();
  const dpr = window.devicePixelRatio || 1;

  sliceSourceCanvas.width = Math.floor(width * dpr);
  sliceSourceCanvas.height = Math.floor(height * dpr);

  sliceSourceCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  sliceSourceCtx.clearRect(0, 0, width, height);

  // 메인 캔버스에 최종 주술 화면 + 균열선을 먼저 그림
  drawMagicFinalScene();
  drawSlashLines(1);

  // 그 결과물을 통째로 캡처
  sliceSourceCtx.drawImage(
    canvas,
    0,
    0,
    canvas.width,
    canvas.height,
    0,
    0,
    width,
    height
  );

  sliceSourceCaptured = true;
}

function ensureSlicePieces() {
  if (slicePiecesGenerated) return;

  slicePieces = generateSlicePieces();
  slicePiecesGenerated = true;
}

function generateSlicePieces() {
  ensureSlashLines();

  const { width, height } = getStageSize();

  // slashLines 구조:
  // 0~4 = 세로선 5개
  // 5~8 = 가로선 4개
  // 대각선은 사용하지 않음

  const boundaryVerticalLeft = {
    x1: 0,
    y1: -height,
    x2: 0,
    y2: height * 2,
  };

  const boundaryVerticalRight = {
    x1: width,
    y1: -height,
    x2: width,
    y2: height * 2,
  };

  const boundaryHorizontalTop = {
    x1: -width,
    y1: 0,
    x2: width * 2,
    y2: 0,
  };

  const boundaryHorizontalBottom = {
    x1: -width,
    y1: height,
    x2: width * 2,
    y2: height,
  };

  const verticalLines = [
    boundaryVerticalLeft,
    ...slashLines.slice(0, 5),
    boundaryVerticalRight,
  ];

  const horizontalLines = [
    boundaryHorizontalTop,
    ...slashLines.slice(5, 9),
    boundaryHorizontalBottom,
  ];

  // 화면 중앙 기준으로 선 순서 정렬
  verticalLines.sort((a, b) => {
    return getLineXAtY(a, height * 0.5) - getLineXAtY(b, height * 0.5);
  });

  horizontalLines.sort((a, b) => {
    return getLineYAtX(a, width * 0.5) - getLineYAtX(b, width * 0.5);
  });

  const pieces = [];

  for (let row = 0; row < horizontalLines.length - 1; row += 1) {
    for (let col = 0; col < verticalLines.length - 1; col += 1) {
      const topLine = horizontalLines[row];
      const bottomLine = horizontalLines[row + 1];
      const leftLine = verticalLines[col];
      const rightLine = verticalLines[col + 1];

      const topLeft = getLineIntersection(leftLine, topLine);
      const topRight = getLineIntersection(rightLine, topLine);
      const bottomRight = getLineIntersection(rightLine, bottomLine);
      const bottomLeft = getLineIntersection(leftLine, bottomLine);

      if (!topLeft || !topRight || !bottomRight || !bottomLeft) continue;

      // 조각이 흩어질 방향을 상/하/좌/우 중 랜덤 선택
      const splitDirection = randomChoice([
        { x: -1, y: 0 }, // 왼쪽
        { x: 1, y: 0 },  // 오른쪽
        { x: 0, y: -1 }, // 위쪽
        { x: 0, y: 1 },  // 아래쪽
      ]);

      // 방향이 너무 기계적으로 보이지 않도록 약간 비틀기
      const directionJitterX = randomRange(-0.28, 0.28);
      const directionJitterY = randomRange(-0.28, 0.28);

      let dirX = splitDirection.x + directionJitterX;
      let dirY = splitDirection.y + directionJitterY;

      const dirLength = Math.hypot(dirX, dirY) || 1;
      dirX /= dirLength;
      dirY /= dirLength;

      // 조각마다 이동 거리 랜덤
      const pushAmount = randomRange(18 ,52);

      // 조각마다 추가 흔들림
      const randomPushX = randomRange(-6, 6);
      const randomPushY = randomRange(-6, 6);

      // 조각마다 랜덤 회전
      // 0.12 rad ≒ 6.9도
      const rotationAmount = randomRange(-0.075, 0.075);

      pieces.push({
        points: [
          topLeft,
          topRight,
          bottomRight,
          bottomLeft,
        ],
        dx: dirX * pushAmount + randomPushX,
        dy: dirY * pushAmount + randomPushY,
        rotation: rotationAmount,
        burnSeed: randomRange(0, 1000),
      });
    }
  }

  return pieces;
}

function getLineIntersection(lineA, lineB) {
  const x1 = lineA.x1;
  const y1 = lineA.y1;
  const x2 = lineA.x2;
  const y2 = lineA.y2;

  const x3 = lineB.x1;
  const y3 = lineB.y1;
  const x4 = lineB.x2;
  const y4 = lineB.y2;

  const denominator =
    (x1 - x2) * (y3 - y4) -
    (y1 - y2) * (x3 - x4);

  if (Math.abs(denominator) < 0.0001) return null;

  const px =
    ((x1 * y2 - y1 * x2) * (x3 - x4) -
      (x1 - x2) * (x3 * y4 - y3 * x4)) /
    denominator;

  const py =
    ((x1 * y2 - y1 * x2) * (y3 - y4) -
      (y1 - y2) * (x3 * y4 - y3 * x4)) /
    denominator;

  return {
    x: px,
    y: py,
  };
}

function getLineXAtY(line, targetY) {
  const dy = line.y2 - line.y1;

  if (Math.abs(dy) < 0.0001) {
    return (line.x1 + line.x2) * 0.5;
  }

  const t = (targetY - line.y1) / dy;
  return lerp(line.x1, line.x2, t);
}

function getLineYAtX(line, targetX) {
  const dx = line.x2 - line.x1;

  if (Math.abs(dx) < 0.0001) {
    return (line.y1 + line.y2) * 0.5;
  }

  const t = (targetX - line.x1) / dx;
  return lerp(line.y1, line.y2, t);
}

function drawSlicedMagicScene(progress = 1) {
  if (!sliceSourceCaptured) {
    captureSliceSource();
  }

  ensureSlicePieces();

  drawSlicedSceneFromCanvas(sliceSourceCanvas, progress, 1);
}

function drawSlicedRealityScene() {
  drawRealityToCanvas();

  ensureSlicePieces();

  drawSlicedSceneFromCanvas(realityCanvas, 1, 1);
}

function drawMagicDissolveToReality(progress = 1) {
  const { width, height } = getStageSize();

  if (!sliceSourceCaptured) {
    captureSliceSource();
  }

  drawRealityToCanvas();
  ensureSlicePieces();

  ctx.clearRect(0, 0, width, height);

  // 조각 사이 벌어진 부분은 검은색
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, width, height);

  // 1) 아래에는 일반 캠 조각을 먼저 그림
  drawSlicedSceneFromCanvas(realityCanvas, 1, 1, false);

  // 2) 위에는 주술 영역 조각을 올리고, 외곽 → 중앙 순서로 재처럼 제거함
  const dissolveT = Math.max(0, Math.min(1, progress));

  slicePieces.forEach((piece) => {
    drawEdgeDustDissolvePiece(piece, dissolveT);
  });
}

function drawSlicedSceneFromCanvas(sourceCanvas, splitProgress = 1, alpha = 1, clearBackground = true) {
  const { width, height } = getStageSize();

  if (clearBackground) {
    ctx.clearRect(0, 0, width, height);

    // 조각 사이 벌어진 부분은 검은색
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, width, height);
  }

  slicePieces.forEach((piece) => {
    drawSingleSlicedPiece(sourceCanvas, piece, splitProgress, alpha);
  });
}

function drawSingleSlicedPiece(sourceCanvas, piece, splitProgress = 1, alpha = 1) {
  const { width, height } = getStageSize();

  const moveX = piece.dx * splitProgress;
  const moveY = piece.dy * splitProgress;
  const rotation = piece.rotation * splitProgress;

  const center = getPieceCenter(piece.points);

  ctx.save();

  ctx.globalAlpha = alpha;

  ctx.translate(center.x + moveX, center.y + moveY);
  ctx.rotate(rotation);
  ctx.translate(-center.x, -center.y);

  ctx.beginPath();
  ctx.moveTo(piece.points[0].x, piece.points[0].y);

  for (let i = 1; i < piece.points.length; i += 1) {
    ctx.lineTo(piece.points[i].x, piece.points[i].y);
  }

  ctx.closePath();
  ctx.clip();

  ctx.drawImage(
    sourceCanvas,
    0,
    0,
    sourceCanvas.width,
    sourceCanvas.height,
    0,
    0,
    width,
    height
  );

  ctx.restore();
}

function drawEdgeDustDissolvePiece(piece, progress = 1) {
  const { width, height } = getStageSize();
  const dpr = window.devicePixelRatio || 1;

  const t = Math.max(0, Math.min(1, progress));

  // 후반부에는 잔상/반동 없이 깔끔하게 제거
  if (t >= 0.985) return;

  const targetW = Math.floor(width * dpr);
  const targetH = Math.floor(height * dpr);

  if (dissolveCanvas.width !== targetW || dissolveCanvas.height !== targetH) {
    dissolveCanvas.width = targetW;
    dissolveCanvas.height = targetH;
  }

  dissolveCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  dissolveCtx.clearRect(0, 0, width, height);

  const center = getPieceCenter(piece.points);

  const moveX = piece.dx;
  const moveY = piece.dy;
  const rotation = piece.rotation;

  // 1) 임시 캔버스에 주술 영역 조각을 먼저 그림
  dissolveCtx.save();

  dissolveCtx.translate(center.x + moveX, center.y + moveY);
  dissolveCtx.rotate(rotation);
  dissolveCtx.translate(-center.x, -center.y);

  dissolveCtx.beginPath();
  dissolveCtx.moveTo(piece.points[0].x, piece.points[0].y);

  for (let i = 1; i < piece.points.length; i += 1) {
    dissolveCtx.lineTo(piece.points[i].x, piece.points[i].y);
  }

  dissolveCtx.closePath();
  dissolveCtx.clip();

  // 너무 빨리 투명해지지 않게 약한 페이드만 적용   
  const lateFadeT = Math.max(0, Math.min(1, (t - 0.82) / 0.18));
  dissolveCtx.globalAlpha = 1 - smoothstep(lateFadeT) * 0.95;

  dissolveCtx.drawImage(
    sliceSourceCanvas,
    0,
    0,
    sliceSourceCanvas.width,
    sliceSourceCanvas.height,
    0,
    0,
    width,
    height,
  );

  // 2) 외곽 → 중앙 순서로 영역 이미지를 재처럼 지워나감
  dissolveCtx.globalAlpha = 1;
  dissolveCtx.globalCompositeOperation = 'destination-out';
  erasePieceAsSoftVaporBands(dissolveCtx, piece, t);

  dissolveCtx.restore();

  // 3) 완성된 주술 조각만 메인 캔버스에 얹음
  // 아래에는 이미 현실 캠 조각이 그려져 있으므로,
  // 지워진 부분으로 현실 캠이 바로 드러남
  ctx.drawImage(
    dissolveCanvas,
    0,
    0,
    dissolveCanvas.width,
    dissolveCanvas.height,
    0,
    0,
    width,
    height,
  );

  // 구멍 대신 균열이 생기고, 작은 파편이 무너지는 느낌
  // drawEdgeCracks(piece, t);
  // drawEdgeFragments(piece, t);

  // 원본 영역 이미지 조각이 위로 흩날려 날아가는 연출
  // drawImageAshFragments(piece, t);
  if (piece.burnSeed % 1 > 0.45) {
    drawSoftVaporMist(piece, t);
  }
}

function drawSoftVaporMist(piece, progress = 1) {
  if (progress <= 0.08 || progress >= 0.92) return;

  const center = getPieceCenter(piece.points);
  const bounds = getPieceBounds(piece.points);
  const pieceSize = Math.max(bounds.width, bounds.height);
  const seed = piece.burnSeed || 0;

  const moveX = piece.dx;
  const moveY = piece.dy;
  const rotation = piece.rotation;

  const mistAlpha = Math.sin(progress * Math.PI) * 0.06;
  const mistCount = 2;

  ctx.save();

  ctx.translate(center.x + moveX, center.y + moveY);
  ctx.rotate(rotation);
  ctx.translate(-center.x, -center.y);

  for (let i = 0; i < mistCount; i += 1) {
    const randA = pseudoRandom(seed + i * 41);
    const randB = pseudoRandom(seed + i * 67);
    const randC = pseudoRandom(seed + i * 89);

    const angle = randA * Math.PI * 2;
    const distance = pieceSize * (0.15 + randB * 0.28);

    const baseX = center.x + Math.cos(angle) * distance;
    const baseY = center.y + Math.sin(angle) * distance;

    const driftX =
      Math.sin(progress * 5 + randA * Math.PI * 2) *
      (10 + randB * 22);

    const driftY =
      -progress *
      (16 + randC * 32);

    const x = baseX + driftX;
    const y = baseY + driftY;

    const radius = 28 + randB * 50;

    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(90, 90, 90, ${mistAlpha})`);
    gradient.addColorStop(0.5, `rgba(55, 55, 55, ${mistAlpha * 0.4})`);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// function drawEdgeCracks(piece, progress = 1) {
//   if (progress <= 0.05 || progress >= 0.95) return;

//   const center = getPieceCenter(piece.points);
//   const seed = piece.burnSeed || 0;

//   const moveX = piece.dx;
//   const moveY = piece.dy;
//   const rotation = piece.rotation;

//   const crackAlpha = Math.sin(progress * Math.PI) * 0.42;
//   const cracksPerEdge = 8;

//   ctx.save();

//   ctx.translate(center.x + moveX, center.y + moveY);
//   ctx.rotate(rotation);
//   ctx.translate(-center.x, -center.y);

//   ctx.lineCap = 'butt';
//   ctx.lineJoin = 'miter';
//   ctx.strokeStyle = `rgba(12, 6, 7, ${crackAlpha})`;
//   ctx.lineWidth = 1;

//   piece.points.forEach((a, edgeIndex) => {
//     const b = piece.points[(edgeIndex + 1) % piece.points.length];

//     for (let i = 0; i < cracksPerEdge; i += 1) {
//       const randA = pseudoRandom(seed + edgeIndex * 101 + i * 17);
//       const randB = pseudoRandom(seed + edgeIndex * 173 + i * 23);
//       const randC = pseudoRandom(seed + edgeIndex * 211 + i * 31);

//       const start = randA * 0.28;
//       const localT = Math.max(0, Math.min(1, (progress - start) / 0.58));

//       if (localT <= 0) continue;

//       const edgeT = (i + 0.5) / cracksPerEdge;

//       const edgeX = lerp(a.x, b.x, edgeT);
//       const edgeY = lerp(a.y, b.y, edgeT);

//       const toCenterX = center.x - edgeX;
//       const toCenterY = center.y - edgeY;
//       const len = Math.hypot(toCenterX, toCenterY) || 1;

//       const normalX = toCenterX / len;
//       const normalY = toCenterY / len;

//       const crackLength = 8 + randB * 24 * localT;
//       const sideBend = (randC - 0.5) * 10;

//       const startX = edgeX;
//       const startY = edgeY;

//       const endX =
//         edgeX +
//         normalX * crackLength +
//         -normalY * sideBend;

//       const endY =
//         edgeY +
//         normalY * crackLength +
//         normalX * sideBend;

//       ctx.beginPath();
//       ctx.moveTo(startX, startY);
//       ctx.lineTo(endX, endY);
//       ctx.stroke();

//       // 짧은 보조 균열
//       if (randB > 0.58) {
//         const branchT = 0.45 + randA * 0.25;
//         const branchX = lerp(startX, endX, branchT);
//         const branchY = lerp(startY, endY, branchT);

//         ctx.beginPath();
//         ctx.moveTo(branchX, branchY);
//         ctx.lineTo(
//           branchX + -normalY * (4 + randC * 8),
//           branchY + normalX * (4 + randC * 8),
//         );
//         ctx.stroke();
//       }
//     }
//   });

//   ctx.restore();
// }

// function drawEdgeFragments(piece, progress = 1) {
//   if (progress <= 0.04 || progress >= 0.9) return;

//   const { width, height } = getStageSize();

//   const center = getPieceCenter(piece.points);
//   const seed = piece.burnSeed || 0;

//   const moveX = piece.dx;
//   const moveY = piece.dy;
//   const rotation = piece.rotation;

//   const fragmentAlpha = Math.sin(progress * Math.PI) * 0.22;
//   const fragmentsPerEdge = 5;

//   ctx.save();

//   ctx.translate(center.x + moveX, center.y + moveY);
//   ctx.rotate(rotation);
//   ctx.translate(-center.x, -center.y);

//   piece.points.forEach((a, edgeIndex) => {
//     const b = piece.points[(edgeIndex + 1) % piece.points.length];

//     for (let i = 0; i < fragmentsPerEdge; i += 1) {
//       const randA = pseudoRandom(seed + edgeIndex * 101 + i * 17);
//       const randB = pseudoRandom(seed + edgeIndex * 173 + i * 23);
//       const randC = pseudoRandom(seed + edgeIndex * 211 + i * 31);

//       const start = randA * 0.36;
//       const localT = Math.max(0, Math.min(1, (progress - start) / 0.56));

//       if (localT <= 0 || localT >= 1) continue;

//       const edgeT = (i + 0.5) / fragmentsPerEdge;

//       const edgeX = lerp(a.x, b.x, edgeT);
//       const edgeY = lerp(a.y, b.y, edgeT);

//       const toCenterX = center.x - edgeX;
//       const toCenterY = center.y - edgeY;
//       const len = Math.hypot(toCenterX, toCenterY) || 1;

//       const normalX = toCenterX / len;
//       const normalY = toCenterY / len;

//       // 파편이 바깥쪽으로 살짝 떨어지고 아래로 무너지는 느낌
//       const fallX = -normalX * localT * (8 + randB * 18) + (randA - 0.5) * 16;
//       const fallY = localT * (10 + randC * 28);

//       const fragW = 3 + randB * 5;
//       const fragH = 2 + randC * 4;
//       const angle = (randA - 0.5) * 1.1 + localT * (randB - 0.5) * 1.5;

//       ctx.save();

//       ctx.translate(edgeX + fallX, edgeY + fallY);
//       ctx.rotate(angle);

//       ctx.beginPath();
//       ctx.rect(-fragW / 2, -fragH / 2, fragW, fragH);
//       ctx.clip();

//       ctx.globalAlpha = fragmentAlpha * (1 - localT);

//       // 파편 자체는 원본 영역 이미지에서 잘려 나온 것처럼 보이게 함
//       ctx.drawImage(
//         sliceSourceCanvas,
//         0,
//         0,
//         sliceSourceCanvas.width,
//         sliceSourceCanvas.height,
//         0,
//         0,
//         width,
//         height,
//       );

//       ctx.restore();
//     }
//   });

//   ctx.restore();
// }

//회색 점 가루 날아가는 함수
// function drawAshBandParticles(piece, progress = 1) {
//   if (progress <= 0.04 || progress >= 0.96) return;

//   const center = getPieceCenter(piece.points);
//   const bounds = getPieceBounds(piece.points);
//   const pieceSize = Math.max(bounds.width, bounds.height);
//   const seed = piece.burnSeed || 0;

//   const moveX = piece.dx;
//   const moveY = piece.dy;
//   const rotation = piece.rotation;

//   const bandCount = 7;
//   const particlesPerEdge = 7;
//   const totalDepth = pieceSize * 0.5;

//   ctx.save();

//   ctx.translate(center.x + moveX, center.y + moveY);
//   ctx.rotate(rotation);
//   ctx.translate(-center.x, -center.y);

//   piece.points.forEach((a, edgeIndex) => {
//     const b = piece.points[(edgeIndex + 1) % piece.points.length];

//     for (let s = 0; s < particlesPerEdge; s += 1) {
//       const edgeT = (s + 0.5) / particlesPerEdge;

//       const edgeX = lerp(a.x, b.x, edgeT);
//       const edgeY = lerp(a.y, b.y, edgeT);

//       const toCenterX = center.x - edgeX;
//       const toCenterY = center.y - edgeY;
//       const len = Math.hypot(toCenterX, toCenterY) || 1;

//       const normalX = toCenterX / len;
//       const normalY = toCenterY / len;

//       for (let band = 0; band < bandCount; band += 1) {
//         const randA = pseudoRandom(seed + edgeIndex * 41 + s * 7 + band * 11);
//         const randB = pseudoRandom(seed + edgeIndex * 67 + s * 13 + band * 17);
//         const randC = pseudoRandom(seed + edgeIndex * 89 + s * 19 + band * 23);

//         // band 0 = 가장 바깥, 숫자가 커질수록 안쪽
//         const bandStart = (band / bandCount) * 0.78 + randA * 0.035;
//         const bandDuration = 0.22;

//         const localT = Math.max(
//           0,
//           Math.min(1, (progress - bandStart) / bandDuration),
//         );

//         if (localT <= 0 || localT >= 1) continue;

//         const bandFrom = totalDepth * (band / bandCount);
//         const bandTo = totalDepth * ((band + 1) / bandCount);
//         const depth = lerp(bandFrom, bandTo, localT);

//         const baseX = edgeX + normalX * depth;
//         const baseY = edgeY + normalY * depth;

//         // 위로 흩날리는 움직임
//         const riseY = localT * (16 + randC * 42);
//         const spreadX = (randB - 0.5) * (10 + localT * 26);

//         // 바람/난기류처럼 흔들림
//         const swirlX =
//           Math.sin(localT * 5.4 + randA * Math.PI * 2) * (4 + randB * 8);

//         const swirlY =
//           Math.cos(localT * 4.2 + randC * Math.PI * 2) * (1.5 + randA * 3.5);

//         const x = baseX + spreadX + swirlX;
//         const y = baseY - riseY + swirlY;

//         const size = 0.45 + randA * 1.35;
//         const alpha = (1 - localT) * (0.08 + randB * 0.14);

//         const grayBase = 42 + Math.floor(randC * 26);
//         const r = grayBase + 8;
//         const g = grayBase + 4;
//         const bColor = grayBase + 2;

//         ctx.fillStyle = `rgba(${r}, ${g}, ${bColor}, ${alpha})`;
//         ctx.beginPath();
//         ctx.arc(x, y, size, 0, Math.PI * 2);
//         ctx.fill();
//       }
//     }
//   });

//   ctx.restore();
// }

// 원본 이미지 조각이 가루처럼 되어서 흩날리는 버전

// function drawImageAshFragments(piece, progress = 1) {
//   if (progress <= 0.04 || progress >= 0.98) return;

//   const center = getPieceCenter(piece.points);
//   const bounds = getPieceBounds(piece.points);
//   const pieceSize = Math.max(bounds.width, bounds.height);
//   const seed = piece.burnSeed || 0;

//   const moveX = piece.dx;
//   const moveY = piece.dy;
//   const rotation = piece.rotation;

//   const bandCount = 7;
//   const fragmentsPerEdge = 7;
//   const totalDepth = pieceSize * 0.52;

//   ctx.save();

//   ctx.translate(center.x + moveX, center.y + moveY);
//   ctx.rotate(rotation);
//   ctx.translate(-center.x, -center.y);

//   piece.points.forEach((a, edgeIndex) => {
//     const b = piece.points[(edgeIndex + 1) % piece.points.length];

//     for (let s = 0; s < fragmentsPerEdge; s += 1) {
//       const edgeT = (s + 0.5) / fragmentsPerEdge;

//       const edgeX = lerp(a.x, b.x, edgeT);
//       const edgeY = lerp(a.y, b.y, edgeT);

//       const toCenterX = center.x - edgeX;
//       const toCenterY = center.y - edgeY;
//       const len = Math.hypot(toCenterX, toCenterY) || 1;

//       const normalX = toCenterX / len;
//       const normalY = toCenterY / len;

//       for (let band = 0; band < bandCount; band += 1) {
//         const randA = pseudoRandom(seed + edgeIndex * 41 + s * 7 + band * 11);
//         const randB = pseudoRandom(seed + edgeIndex * 67 + s * 13 + band * 17);
//         const randC = pseudoRandom(seed + edgeIndex * 89 + s * 19 + band * 23);

//         // 바깥 → 안쪽 순서
//         const bandStart = (band / bandCount) * 0.78 + randA * 0.035;
//         const bandDuration = 0.22;

//         const localT = Math.max(
//           0,
//           Math.min(1, (progress - bandStart) / bandDuration),
//         );

//         if (localT <= 0 || localT >= 1) continue;

//         const bandFrom = totalDepth * (band / bandCount);
//         const bandTo = totalDepth * ((band + 1) / bandCount);
//         const depth = lerp(bandFrom, bandTo, localT);

//         // 조각이 생성되는 원래 위치
//         const baseX = edgeX + normalX * depth;
//         const baseY = edgeY + normalY * depth;

//         // ===== 위로 흩날리는 움직임 =====
//         const riseY = localT * (18 + randC * 44);
//         const spreadX = (randB - 0.5) * (12 + localT * 30);

//         const swirlX =
//           Math.sin(localT * 5.5 + randA * Math.PI * 2) * (4 + randB * 8);

//         const swirlY =
//           Math.cos(localT * 4.3 + randC * Math.PI * 2) * (1.5 + randA * 3.5);

//         const x = baseX + spreadX + swirlX;
//         const y = baseY - riseY + swirlY;

//         // ===== 실제 이미지 조각 크기 =====
//         const fragW = 1.8 + randA * 4.2;
//         const fragH = 1.2 + randB * 3.4;

//         // 원본에서 샘플링할 영역
//         const srcW = fragW * 1.8;
//         const srcH = fragH * 1.8;
//         const srcX = baseX - srcW / 2;
//         const srcY = baseY - srcH / 2;

//         const fragRotation =
//           (randC - 0.5) * 1.2 + localT * (randB - 0.5) * 1.1;

//         const alpha = (1 - localT) * (0.16 + randA * 0.24);

//         ctx.save();

//         ctx.globalAlpha = alpha;
//         ctx.translate(x, y);
//         ctx.rotate(fragRotation);

//         // 잘게 잘린 원본 이미지 조각처럼 보이게
//         ctx.beginPath();
//         ctx.rect(-fragW / 2, -fragH / 2, fragW, fragH);
//         ctx.clip();

//         ctx.drawImage(
//           sliceSourceCanvas,
//           srcX,
//           srcY,
//           srcW,
//           srcH,
//           -fragW / 2,
//           -fragH / 2,
//           fragW,
//           fragH,
//         );

//         ctx.restore();
//       }
//     }
//   });

//   ctx.restore();
// }

// function erasePieceAsAshBands(targetCtx, piece, progress = 1) {
//   const center = getPieceCenter(piece.points);
//   const bounds = getPieceBounds(piece.points);
//   const pieceSize = Math.max(bounds.width, bounds.height);
//   const seed = piece.burnSeed || 0;

//   // 외곽 → 중앙까지 몇 단계로 사라질지
//   const bandCount = 8;

//   // 각 변에서 얼마나 촘촘히 샘플링할지
//   const samplesPerEdge = 22;

//   // 조각 중심 방향으로 얼마나 깊게 들어갈지
//   const totalDepth = pieceSize * 0.58;

//   piece.points.forEach((a, edgeIndex) => {
//     const b = piece.points[(edgeIndex + 1) % piece.points.length];

//     for (let s = 0; s <= samplesPerEdge; s += 1) {
//       const edgeT = s / samplesPerEdge;

//       const edgeX = lerp(a.x, b.x, edgeT);
//       const edgeY = lerp(a.y, b.y, edgeT);

//       const toCenterX = center.x - edgeX;
//       const toCenterY = center.y - edgeY;
//       const len = Math.hypot(toCenterX, toCenterY) || 1;

//       const normalX = toCenterX / len;
//       const normalY = toCenterY / len;

//       for (let band = 0; band < bandCount; band += 1) {
//         const randA = pseudoRandom(seed + edgeIndex * 101 + s * 17 + band * 13);
//         const randB = pseudoRandom(seed + edgeIndex * 173 + s * 23 + band * 19);
//         const randC = pseudoRandom(seed + edgeIndex * 211 + s * 31 + band * 29);

//         // band 0 = 가장 바깥쪽
//         // band가 커질수록 중앙 쪽
//         const bandStart = (band / bandCount) * 0.78 + randA * 0.035;
//         const bandDuration = 0.2;

//         const localT = Math.max(
//           0,
//           Math.min(1, (progress - bandStart) / bandDuration),
//         );

//         if (localT <= 0) continue;

//         const bandFrom = totalDepth * (band / bandCount);
//         const bandTo = totalDepth * ((band + 1) / bandCount);

//         const depth = lerp(bandFrom, bandTo, localT);

//         const jitterX = (randB - 0.5) * 6;
//         const jitterY = (randC - 0.5) * 6;

//         const x = edgeX + normalX * depth + jitterX;
//         const y = edgeY + normalY * depth + jitterY;

//         // 재처럼 작게 흩어지는 침식 모양
//         const radiusX = 0.8 + randB * 2.8;
//         const radiusY = 0.6 + randC * 2.2;
//         const rot = randA * Math.PI;

//         targetCtx.save();
//         targetCtx.translate(x, y);
//         targetCtx.rotate(rot);

//         targetCtx.beginPath();
//         targetCtx.ellipse(0, 0, radiusX, radiusY, 0, 0, Math.PI * 2);
//         targetCtx.fill();

//         targetCtx.restore();
//       }
//     }
//   });
// }

function smoothstep(t) {
  const v = Math.max(0, Math.min(1, t));
  return v * v * (3 - 2 * v);
}

function erasePieceAsSoftVaporBands(targetCtx, piece, progress = 1) {
  const center = getPieceCenter(piece.points);
  const bounds = getPieceBounds(piece.points);
  const pieceSize = Math.max(bounds.width, bounds.height);
  const seed = piece.burnSeed || 0;

  const bandCount = 5;
  const samplesPerEdge = 5;
  const totalDepth = pieceSize * 0.62;

  targetCtx.save();

  // 핵심: 점처럼 뚫리지 않고, 부드럽게 깎이게
  targetCtx.filter = 'blur(5px)';

  piece.points.forEach((a, edgeIndex) => {
    const b = piece.points[(edgeIndex + 1) % piece.points.length];

    for (let s = 0; s <= samplesPerEdge; s += 1) {
      const edgeT = s / samplesPerEdge;

      const edgeX = lerp(a.x, b.x, edgeT);
      const edgeY = lerp(a.y, b.y, edgeT);

      const toCenterX = center.x - edgeX;
      const toCenterY = center.y - edgeY;
      const len = Math.hypot(toCenterX, toCenterY) || 1;

      const normalX = toCenterX / len;
      const normalY = toCenterY / len;

      for (let band = 0; band < bandCount; band += 1) {
        const randA = pseudoRandom(seed + edgeIndex * 97 + s * 17 + band * 11);
        const randB = pseudoRandom(seed + edgeIndex * 131 + s * 23 + band * 19);
        const randC = pseudoRandom(seed + edgeIndex * 167 + s * 31 + band * 29);

        // 바깥 band부터 안쪽 band 순서로 진행
        const bandStart = (band / bandCount) * 0.74 + randA * 0.03;
        const bandDuration = 0.28;

        const localT = Math.max(
          0,
          Math.min(1, (progress - bandStart) / bandDuration),
        );

        if (localT <= 0) continue;

        const eased = smoothstep(localT);

        const bandFrom = totalDepth * (band / bandCount);
        const bandTo = totalDepth * ((band + 1) / bandCount);
        const depth = lerp(bandFrom, bandTo, eased);

        const x =
          edgeX +
          normalX * depth +
          (randB - 0.5) * 10;

        const y =
          edgeY +
          normalY * depth +
          (randC - 0.5) * 10 -
          eased * (6 + randA * 12);

        // 작고 많은 구멍 느낌이 아니라,
        // 크고 흐린 침식 덩어리로 지움
        const radiusX = 10 + randB * 18;
        const radiusY = 7 + randC * 14;
        const rot = randA * Math.PI;

        targetCtx.globalAlpha = 0.18 + eased * 0.32;

        targetCtx.save();
        targetCtx.translate(x, y);
        targetCtx.rotate(rot);

        targetCtx.beginPath();
        targetCtx.ellipse(0, 0, radiusX, radiusY, 0, 0, Math.PI * 2);
        targetCtx.fill();

        targetCtx.restore();
      }
    }
  });

  targetCtx.filter = 'none';
  targetCtx.restore();
}

// function drawEdgeDustParticles(piece, progress = 1) {
//   if (progress <= 0.08 || progress >= 0.84) return;

//   const center = getPieceCenter(piece.points);

//   const moveX = piece.dx;
//   const moveY = piece.dy;
//   const rotation = piece.rotation;

//   const particleAlpha = Math.sin(progress * Math.PI) * 0.34;
//   const samplesPerEdge = 9;
//   const seed = piece.burnSeed || 0;

//   ctx.save();

//   ctx.translate(center.x + moveX, center.y + moveY);
//   ctx.rotate(rotation);
//   ctx.translate(-center.x, -center.y);

//   piece.points.forEach((a, edgeIndex) => {
//     const b = piece.points[(edgeIndex + 1) % piece.points.length];

//     for (let s = 0; s <= samplesPerEdge; s += 1) {
//       const n = pseudoRandom(seed + edgeIndex * 59 + s * 17);

//       // 입자가 너무 많아지지 않게 일부만 그림
//       if (n < 0.45) continue;

//       const edgeT = s / samplesPerEdge;

//       const x = lerp(a.x, b.x, edgeT);
//       const y = lerp(a.y, b.y, edgeT);

//       const driftX =
//         (pseudoRandom(seed + edgeIndex * 13 + s * 3) - 0.5) *
//         28 *
//         progress;

//       const driftY =
//         -progress *
//         (10 + pseudoRandom(seed + edgeIndex * 7 + s * 19) * 24);

//       const size =
//         0.55 +
//         pseudoRandom(seed + edgeIndex * 23 + s * 31) *
//         1.35;

//       const alpha =
//         particleAlpha *
//         (1 - progress * 0.45) *
//         pseudoRandom(seed + edgeIndex * 41 + s * 5);

//       ctx.fillStyle = `rgba(60, 55, 55, ${alpha})`;
//       ctx.beginPath();
//       ctx.arc(x + driftX, y + driftY, size, 0, Math.PI * 2);
//       ctx.fill();
//     }
//   });

//   ctx.restore();
// }

function getPieceBounds(points) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  points.forEach((point) => {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  });

  return {
    width: maxX - minX,
    height: maxY - minY,
  };
}

function pseudoRandom(value) {
  const x = Math.sin(value) * 43758.5453;
  return x - Math.floor(x);
}

function drawRealityToCanvas() {
  const { width, height } = getStageSize();
  const dpr = window.devicePixelRatio || 1;

  realityCanvas.width = Math.floor(width * dpr);
  realityCanvas.height = Math.floor(height * dpr);

  realityCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  realityCtx.clearRect(0, 0, width, height);

  if (!cameraReady || video.readyState < 2) {
    realityCtx.fillStyle = '#111';
    realityCtx.fillRect(0, 0, width, height);
    return;
  }

  const rect = getVideoDrawRect();

  realityCtx.save();

  if (MIRROR_VIEW) {
    realityCtx.translate(width, 0);
    realityCtx.scale(-1, 1);

    realityCtx.drawImage(
      video,
      width - rect.x - rect.width,
      rect.y,
      rect.width,
      rect.height
    );
  } else {
    realityCtx.drawImage(
      video,
      rect.x,
      rect.y,
      rect.width,
      rect.height
    );
  }

  realityCtx.restore();

  // 현실 캠 조각 위에도 기존 균열선이 남도록 추가
  drawSlashLinesToContext(realityCtx, 1);
}

function getPieceCenter(points) {
  let x = 0;
  let y = 0;

  points.forEach((point) => {
    x += point.x;
    y += point.y;
  });

  return {
    x: x / points.length,
    y: y / points.length,
  };
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