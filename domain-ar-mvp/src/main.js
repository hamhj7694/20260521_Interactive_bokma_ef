import './style.css';

// =====================================================
// 1. DOM / Canvas
// =====================================================

const video = document.querySelector('#webcam');
const canvas = document.querySelector('#stage');
const ctx = canvas.getContext('2d');
const cameraStatus = document.querySelector('#camera-status');

// =====================================================
// 2. Global Settings
// =====================================================

const DEBUG = true;
const MIRROR_VIEW = true;

// =====================================================
// 3. Assets
// =====================================================

const doorImage = new Image();
doorImage.src = `${import.meta.env.BASE_URL}door_one.png`;

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

// 조각 테두리부터 주술 영역이 타들어가고, 아래에서 일반 캠이 드러남
const SLICED_MAGIC_HOLD_DURATION = 1000; // 조각난 주술 영역 유지 시간
const MAGIC_DISSOLVE_DURATION = 2800; // 주술 영역이 타들어가며 사라지는 시간

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

// 6-1. 복마어주자 전용 변수
// 절단선 연출 설정
const SLASH_LINE_WIDTH = 2.2;
const SLASH_DELAY_STEP = 0.055;

const STATE_NORMAL = 'NORMAL';
const STATE_BOKMA = 'BOKMA';
const STATE_PUGA = 'PUGA';
const STATE_FINAL = 'FINAL';

const TECHNIQUE_NONE = null;
const TECHNIQUE_BOKMA = 'BOKMA';
const TECHNIQUE_PUGA = 'PUGA';

let activeTechnique = TECHNIQUE_NONE;
let techniqueStartedAt = null;

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

//-----------------------------------------------------
// 6-2. 푸가 전용 변수
const PUGA_CONTEXT_NORMAL = 'NORMAL';
const PUGA_CONTEXT_SLICED = 'SLICED';

let pugaContext = PUGA_CONTEXT_NORMAL;

// =====================================================
// 7. MediaPipe / Segmentation State
// =====================================================

let hands = null;
let isHandsProcessing = false;
let latestHands = [];

let segmenter = null;
let isSegmentationProcessing = false;
let segmentationReady = false;
let lastSegmentationTime = 0;
const SEGMENTATION_INTERVAL = 100;

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
const ONE_HAND_HOLD_DURATION = 3000;

const BOKMA_BORDER_HOLD_AFTER_START_DURATION = 1000;
const BOKMA_BORDER_FADE_DURATION = 500;

//------------------------------------------------------
// 푸가 신호 유지 판정
const PUGA_SIGNAL_HOLD_DURATION = 2000;
const PUGA_OFF_FRAME_THRESHOLD = 10;

let pugaSignalStartTime = null;
let pugaSignalHoldProgress = 0;
let pugaFalseFrameCount = 0;
let rawPugaSignalActive = false;

//-----------------------------------------------------
// 푸가 단계 변수 추가
const PUGA_STAGE_NONE = 0;
const PUGA_STAGE_HAND_FLAME = 1;
const PUGA_STAGE_FIRE_PILLAR = 2;
const PUGA_STAGE_CONTROL_READY = 3;
const PUGA_STAGE_CONTROL = 4;

let pugaStage = PUGA_STAGE_NONE;

// const PUGA_HAND_TOUCH_DISTANCE_RATIO = 0.26; //푸가 1단계에 사용 안함
const PUGA_HAND_SEPARATE_DISTANCE_RATIO = 0.22;

//푸가 디버그 변수
let pugaDebugReason = '';

// 푸가 불꽃/불기둥 연출 상태
let pugaLastLeftCenter = null;
let pugaLastRightCenter = null;
let pugaLastHandsSeenAt = null;
const PUGA_ORB_HOLD_DURATION = 1000; // 1단계 불꽃 구슬 유지 시간(ms)
const PUGA_FIRE_ORB_RADIUS = 84; // 불꽃 구슬 기본 크기
const PUGA_PILLAR_BASE_WIDTH = 90; // 불기둥 시작 두께
const PUGA_PILLAR_MAX_WIDTH = 120; // 불기둥 최대 두께

let pugaPillarProgress = 0;
let pugaLockedPillarLength = null;

// 3단계 불기둥 각도 통제
let pugaControlledAngle = null;
let pugaLastControlledAngle = null;

let pugaLockedPillarCenter = null;
let pugaLockedPillarAngle = null;

let pugaControlBlendStartedAt = null;
let pugaControlBlendProgress = 0;

let pugaControlledCenter = null;
let pugaLastControlledCenter = null;

let pugaControlPoseLastSeenAt = null;
let pugaControlPoseLost = false;

const PUGA_CONTROL_POSE_MAX_LOST_DURATION = 1200; // 손가락 인식 끊김 허용 시간
const PUGA_CONTROL_MAX_ANGLE_JUMP = Math.PI * 0.55; // 약 99도 이상 튀면 무시

// 3단계 이후: leftHand 랜드마크 크기로 불기둥 두께 제어
let pugaControlHandBaseTrackerSize = null;
let pugaDynamicPillarWidth = null;
let pugaDynamicPillarScale = 1;

const PUGA_PILLAR_DYNAMIC_WIDTH_SMOOTHING = 0.18;

// 통제권 획득 이후 손 크기에 따른 불기둥 크기 배율
const PUGA_PILLAR_MIN_SCALE = 0.1; // 최소 50%
const PUGA_PILLAR_MAX_SCALE = 50.0; // 최대 5000%

const PUGA_CONTROL_BLEND_DURATION = 700; // 권한이 넘어가는 시간(ms)

const PUGA_CONTROL_FINGER_DISTANCE_RATIO = 0.16; //손가락이 불 기둥 근처에 있어야 하는 거리
const PUGA_CONTROL_ANGLE_SMOOTHING = 0.18; // 낮을수록 부드럽게 회전

const PUGA_HAND_LOST_GRACE_DURATION = 900; // 손 인식 끊겨도 유지되는 시간(ms)
const PUGA_PILLAR_GROW_SPEED = 0.055; // 불기둥으로 변하는 속도
const PUGA_MAX_PILLAR_LENGTH_RATIO = 0.7; // 푸가 불꽃 최대 길이(화면 가로 길이 대비)

const PUGA_PILLAR_TIP_WIDTH_RATIO = 0.04; // 양끝 최소 두께. 낮을수록 뾰족함
const PUGA_PILLAR_CENTER_BULGE = 1.0; // 중앙 두께. 높을수록 중앙이 두꺼움
const PUGA_PILLAR_EDGE_WAVE = 8; // 불기둥 가장자리 흔들림

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
  window.addEventListener('keydown', handleKeyDown);
  document.querySelector('#reset-effect')?.addEventListener('click', resetEffect);

  function handleKeyDown(event) {
    if (event.key.toLowerCase() === 'r') {
      resetEffect();
    }
  }

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
    if (cameraStatus) cameraStatus.textContent = '카메라 연결됨 · 손동작을 취해 보세요';
  } catch (error) {
    console.error('웹캠을 시작할 수 없습니다.', error);
    if (cameraStatus) cameraStatus.textContent =
      '카메라를 사용할 수 없어요. 브라우저 권한과 HTTPS 연결을 확인하세요.';
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

  evaluateGesture();

  if (sceneState === STATE_NORMAL) {
    drawCoverVideo();
    if (rawDoorGestureActive) {
      drawBokmaChargeBorder(oneHandGestureHoldProgress);
    }
    drawHands();
  } else if (sceneState === STATE_BOKMA) {
    drawBokmaSequence();
  } else if (sceneState === STATE_PUGA) {
    drawPugaSequence();
  } else if (sceneState === STATE_FINAL) {
    drawSlicedRealityScene();
    drawHands();
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

// function processSegmentationThrottled() {
//   const now = performance.now();

//   if (now - lastSegmentationTime < SEGMENTATION_INTERVAL) return;

//   lastSegmentationTime = now;
//   processSegmentation();
// }

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
  if (
    sceneState !== STATE_NORMAL &&
    sceneState !== STATE_FINAL
  ) return;

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

  const pugaSignalActive =
    isPugaSignalGesture(leftHand, rightHand);

  rawPugaSignalActive = pugaSignalActive;

  // FINAL, 즉 토막난 캠 상태에서는 푸가만 허용
  if (sceneState === STATE_FINAL) {
    updatePugaSignalHoldState(pugaSignalActive);
    return;
  }

  // NORMAL 상태에서는 푸가 신호를 우선 판정
  if (pugaSignalActive) {
    updatePugaSignalHoldState(true);

    // 푸가 신호가 잡히는 동안 복마 게이지는 초기화
    oneHandGestureStartTime = null;
    oneHandGestureHoldProgress = 0;
    doorFalseFrameCount = 0;

    return;
  }

  updatePugaSignalHoldState(false);
  updateOneHandHoldState(oneHandGestureActive);
}

function resetEffect() {
  sceneState = STATE_NORMAL;
  sequenceStartedAt = null;
  sequenceTriggered = false;

  // 18-1. 복마어주자 초기화
  slashLines = [];
  slashLinesGenerated = false;

  sliceSourceCaptured = false;
  slicePieces = [];
  slicePiecesGenerated = false;

  // 공통 게이지 초기화
  oneHandGestureStartTime = null;
  oneHandGestureHoldProgress = 0;
  doorFalseFrameCount = 0;

  // 푸가 신호 초기화
  pugaSignalStartTime = null;
  pugaSignalHoldProgress = 0;
  pugaFalseFrameCount = 0;
  rawPugaSignalActive = false;
  pugaContext = PUGA_CONTEXT_NORMAL;
  pugaStage = PUGA_STAGE_NONE;
  pugaDebugReason = '';

  pugaLastLeftCenter = null;
  pugaLastRightCenter = null;
  pugaLastHandsSeenAt = null;
  pugaPillarProgress = 0;
  pugaLockedPillarLength = null;
  pugaControlledAngle = null;
  pugaLastControlledAngle = null;

  pugaLockedPillarCenter = null;
  pugaLockedPillarAngle = null;

  pugaControlBlendStartedAt = null;
  pugaControlBlendProgress = 0;

  pugaControlledCenter = null;
  pugaLastControlledCenter = null;

  pugaControlPoseLastSeenAt = null;
  pugaControlPoseLost = false;

  pugaControlHandBaseTrackerSize = null;
  pugaDynamicPillarWidth = null;
  pugaDynamicPillarScale = 1;

  activeTechnique = TECHNIQUE_NONE;
  techniqueStartedAt = null;
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
      startBokmaSequence();
    }

    return;
  }

  doorFalseFrameCount += 1;

  if (doorFalseFrameCount >= DOOR_OFF_FRAME_THRESHOLD) {
    oneHandGestureStartTime = null;
    oneHandGestureHoldProgress = 0;
  }
}

function updatePugaSignalHoldState(pugaSignalActive) {
  const now = performance.now();

  if (pugaSignalActive) {
    pugaFalseFrameCount = 0;

    if (pugaSignalStartTime === null) {
      pugaSignalStartTime = now;
    }

    const elapsed = now - pugaSignalStartTime;

    pugaSignalHoldProgress = Math.min(
      elapsed / PUGA_SIGNAL_HOLD_DURATION,
      1,
    );

    if (elapsed >= PUGA_SIGNAL_HOLD_DURATION) {
      startPugaSequence();
    }

    return;
  }

  pugaFalseFrameCount += 1;

  if (pugaFalseFrameCount >= PUGA_OFF_FRAME_THRESHOLD) {
    pugaSignalStartTime = null;
    pugaSignalHoldProgress = 0;
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

function isPugaSignalGesture(leftHand, rightHand) {
  pugaDebugReason = '';

  if (!leftHand || !rightHand) {
    pugaDebugReason = 'need two hands';
    return false;
  }

  const leftCenter = getPalmCenter(leftHand.points);
  const rightCenter = getPalmCenter(rightHand.points);

  if (!leftCenter || !rightCenter) {
    pugaDebugReason = 'no palm center';
    return false;
  }

  const leftSoftCurl = isPugaVerySoftCurledHand(leftHand.landmarks);
  const rightSoftCurl = isPugaVerySoftCurledHand(rightHand.landmarks);

  if (!leftSoftCurl || !rightSoftCurl) {
    pugaDebugReason = `curl fail L:${leftSoftCurl} R:${rightSoftCurl}`;
    return false;
  }

  pugaDebugReason = 'ok';
  return true;
}

function getFingerDirectionFromPalm(points) {
  if (!points || points.length < 21) return null;

  const palmCenter = getPalmCenter(points);
  if (!palmCenter) return null;

  const tips = [
    points[FINGER.index.tip],
    points[FINGER.middle.tip],
    points[FINGER.ring.tip],
    points[FINGER.pinky.tip],
  ].filter(Boolean);

  if (tips.length < 4) return null;

  const avgTipY =
    tips.reduce((sum, point) => sum + point.y, 0) / tips.length;

  const deltaY = avgTipY - palmCenter.y;

  const threshold = 4;

  if (deltaY > threshold) return 'DOWN';
  if (deltaY < -threshold) return 'UP';

  return null;
}

function getFingerAimDirectionY(points) {
  if (!points || points.length < 21) return null;

  const tips = [
    points[FINGER.index.tip],
    points[FINGER.middle.tip],
    points[FINGER.ring.tip],
    points[FINGER.pinky.tip],
  ].filter(Boolean);

  const mcps = [
    points[FINGER.index.mcp],
    points[FINGER.middle.mcp],
    points[FINGER.ring.mcp],
    points[FINGER.pinky.mcp],
  ].filter(Boolean);

  if (tips.length < 4 || mcps.length < 4) return null;

  const avgTipY =
    tips.reduce((sum, point) => sum + point.y, 0) / tips.length;

  const avgMcpY =
    mcps.reduce((sum, point) => sum + point.y, 0) / mcps.length;

  const deltaY = avgTipY - avgMcpY;

  // 화면 좌표계: y가 커질수록 아래
  // 기존 palmCenter 기준보다 훨씬 안정적.
  const threshold = 10;

  if (deltaY > threshold) return 'DOWN';
  if (deltaY < -threshold) return 'UP';

  return null;
}

function isPugaVerySoftCurledHand(landmarks) {
  if (!landmarks || landmarks.length < 21) return false;

  const softCurledCount = [
    FINGER.index,
    FINGER.middle,
    FINGER.ring,
    FINGER.pinky,
  ].filter((finger) => {
    return isFingerNotFullyStraight(landmarks, finger);
  }).length;

  // 테스트 1차: 1개만 살짝 말려도 인정
  // 인식이 너무 쉬우면 2로 올리면 됨.
  return softCurledCount >= 1;
}

function isFingerNotFullyStraight(landmarks, finger) {
  const tip = landmarks[finger.tip];
  const pip = landmarks[finger.pip];
  const mcp = landmarks[finger.mcp];

  if (!tip || !pip || !mcp) return false;

  const tipToMcp = getLandmarkDistance(tip, mcp);
  const pipToMcp = getLandmarkDistance(pip, mcp);

  // 손가락이 완전히 쫙 펴져 있으면 tipToMcp가 pipToMcp보다 훨씬 김.
  // 살짝이라도 말리면 이 비율이 줄어듦.
  return tipToMcp < pipToMcp * 2.2;
}

function getLandmarkDistance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z || 0) - (b.z || 0);

  return Math.hypot(dx, dy, dz);
}

function isOpenHandGesture(landmarks) {
  if (!landmarks || landmarks.length < 21) return false;

  const indexExtended = isFingerExtendedVertical(landmarks, FINGER.index);
  const middleExtended = isFingerExtendedVertical(landmarks, FINGER.middle);
  const ringExtended = isFingerExtendedVertical(landmarks, FINGER.ring);
  const pinkyExtended = isFingerExtendedVertical(landmarks, FINGER.pinky);

  return (
    indexExtended &&
    middleExtended &&
    ringExtended &&
    pinkyExtended
  );
}

function getPalmCenter(points) {
  if (!points || points.length < 21) return null;

  const wrist = points[0];
  const indexMcp = points[5];
  const middleMcp = points[9];
  const ringMcp = points[13];
  const pinkyMcp = points[17];

  if (!wrist || !indexMcp || !middleMcp || !ringMcp || !pinkyMcp) {
    return null;
  }

  return {
    x: (
      wrist.x +
      indexMcp.x +
      middleMcp.x +
      ringMcp.x +
      pinkyMcp.x
    ) / 5,
    y: (
      wrist.y +
      indexMcp.y +
      middleMcp.y +
      ringMcp.y +
      pinkyMcp.y
    ) / 5,
  };
}

function getPugaControlAngleFromLeftFingers(leftHand, pillarCenter) {
  if (!leftHand || !leftHand.points || leftHand.points.length < 21) {
    return null;
  }

  const indexTip = leftHand.points[FINGER.index.tip];
  const middleTip = leftHand.points[FINGER.middle.tip];

  if (!indexTip || !middleTip || !pillarCenter) return null;

  const fingerCenter = {
    x: (indexTip.x + middleTip.x) / 2,
    y: (indexTip.y + middleTip.y) / 2,
  };

  const { width, height } = getStageSize();

  const controlRadius =
    Math.min(width, height) * PUGA_CONTROL_FINGER_DISTANCE_RATIO;

  const distanceFromPillarCenter = Math.hypot(
    fingerCenter.x - pillarCenter.x,
    fingerCenter.y - pillarCenter.y,
  );

  // 검지/중지의 중앙이 불기둥 중심 근처에 들어와야 조종 시작
  if (distanceFromPillarCenter > controlRadius) {
    return null;
  }

  const dx = middleTip.x - indexTip.x;
  const dy = middleTip.y - indexTip.y;

  if (Math.hypot(dx, dy) < 8) return null;

  return Math.atan2(dy, dx);
}

function getPugaControlPoseFromLeftFingers(leftHand, pillarCenter) {
  if (!leftHand || !leftHand.points) {
    return null;
  }

  const indexTip = leftHand.points[FINGER.index.tip];
  const middleTip = leftHand.points[FINGER.middle.tip];

  if (!indexTip || !middleTip || !pillarCenter) return null;

  const fingerCenter = {
    x: (indexTip.x + middleTip.x) / 2,
    y: (indexTip.y + middleTip.y) / 2,
  };

  const { width, height } = getStageSize();

  const controlRadius =
    Math.min(width, height) * PUGA_CONTROL_FINGER_DISTANCE_RATIO;

  const distanceFromPillarCenter = Math.hypot(
    fingerCenter.x - pillarCenter.x,
    fingerCenter.y - pillarCenter.y,
  );

  if (distanceFromPillarCenter > controlRadius) {
    return null;
  }

  const dx = middleTip.x - indexTip.x;
  const dy = middleTip.y - indexTip.y;

  if (Math.hypot(dx, dy) < 8) return null;

  return {
    center: fingerCenter,
    angle: Math.atan2(dy, dx),
  };
}

function getHandTrackerSize(hand) {
  if (!hand || !hand.points || hand.points.length < 21) {
    return null;
  }

  const xs = hand.points.map((point) => point.x);
  const ys = hand.points.map((point) => point.y);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const boxWidth = maxX - minX;
  const boxHeight = maxY - minY;

  const trackerSize = Math.hypot(boxWidth, boxHeight);

  if (!Number.isFinite(trackerSize) || trackerSize < 1) {
    return null;
  }

  return trackerSize;
}

function getPugaDynamicPillarWidth(controlHand, baseWidth) {
  const currentTrackerSize = getHandTrackerSize(controlHand);

  // leftHand 인식이 잠깐 끊기면 마지막 불기둥 두께 유지
  if (currentTrackerSize === null) {
    return pugaDynamicPillarWidth ?? baseWidth;
  }

  // 통제권이 넘어간 뒤 처음 잡힌 leftHand 크기를 기준 크기로 저장
  if (pugaControlHandBaseTrackerSize === null) {
    pugaControlHandBaseTrackerSize = currentTrackerSize;
  }

  const rawScale =
    currentTrackerSize / pugaControlHandBaseTrackerSize;

  // 기준 크기 대비 50% ~ 200% 사이로 제한
  const clampedScale = clamp(
    rawScale,
    PUGA_PILLAR_MIN_SCALE,
    PUGA_PILLAR_MAX_SCALE,
  );

  pugaDynamicPillarScale = clampedScale;

  const targetWidth =
    baseWidth * clampedScale;

  pugaDynamicPillarWidth =
    pugaDynamicPillarWidth === null
      ? targetWidth
      : lerp(
          pugaDynamicPillarWidth,
          targetWidth,
          PUGA_PILLAR_DYNAMIC_WIDTH_SMOOTHING,
        );

  return pugaDynamicPillarWidth;
}

function getPugaControlPoseFromLeftFingersFree(leftHand) {
  if (!leftHand || !leftHand.points) {
    return null;
  }

  const indexTip = leftHand.points[FINGER.index.tip];
  const middleTip = leftHand.points[FINGER.middle.tip];

  if (!indexTip || !middleTip) return null;

  const fingerCenter = {
    x: (indexTip.x + middleTip.x) / 2,
    y: (indexTip.y + middleTip.y) / 2,
  };

  const dx = middleTip.x - indexTip.x;
  const dy = middleTip.y - indexTip.y;

  if (Math.hypot(dx, dy) < 8) return null;

  return {
    center: fingerCenter,
    angle: Math.atan2(dy, dx),
  };
}

function lerpAngle(from, to, amount) {
  const difference = Math.atan2(
    Math.sin(to - from),
    Math.cos(to - from),
  );

  return from + difference * amount;
}

function getAngleDifference(from, to) {
  return Math.abs(
    Math.atan2(
      Math.sin(to - from),
      Math.cos(to - from),
    ),
  );
}

function lerpPoint(from, to, amount) {
  return {
    x: lerp(from.x, to.x, amount),
    y: lerp(from.y, to.y, amount),
  };
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
// 17. Sequence
// =====================================================
// 17-1. 스쿠나 복마어주자
// -----------------------------------------------------
function startBokmaSequence() {
  if (sequenceTriggered) return;

  sequenceTriggered = true;
  sceneState = STATE_BOKMA;
  sequenceStartedAt = performance.now();

  // 절단선은 시퀀스마다 한 번만 랜덤 생성되도록 초기화
  slashLines = [];
  slashLinesGenerated = false;

  // 화면 조각 분리 연출 초기화
  sliceSourceCaptured = false;
  slicePieces = [];
  slicePiecesGenerated = false;

  activeTechnique = TECHNIQUE_BOKMA;
  techniqueStartedAt = performance.now();
}

function drawBokmaSequence() {
  const { width, height } = getStageSize();

  ctx.clearRect(0, 0, width, height);

  const now = performance.now();
  const elapsed = now - sequenceStartedAt;
  const phase = getBokmaPhase(elapsed);

  // 화면 높이 기준 문 시작 위치
  // const doorRevealStartOffsetY =
  //   height * DOOR_REVEAL_START_OFFSET_RATIO;
  const doorRevealStartOffsetY =
    height * DOOR_REVEAL_CENTER_Y_RATIO - height / 2;

  if (phase === 'FINAL') {
    sceneState = STATE_FINAL;
    activeTechnique = TECHNIQUE_NONE;
    techniqueStartedAt = null;
  }

  // 0.0~1.2초: 기존 캠 화면 위에 붉은 안개가 서서히 덮이게 처리
  if (phase === 'FOG_IN') {
    const rawT = elapsed / FOG_IN_DURATION;
    const t = easeInCubic(rawT);

    drawCoverVideo();
    drawFogBackground(t);

  if (elapsed < BOKMA_BORDER_HOLD_AFTER_START_DURATION) {
    drawBokmaChargeBorder(1);
  } else {
    const fadeElapsed =
      elapsed - BOKMA_BORDER_HOLD_AFTER_START_DURATION;

    const fadeProgress = Math.min(
      fadeElapsed / BOKMA_BORDER_FADE_DURATION,
      1
    );

    drawBokmaChargeBorder(1, 1 - fadeProgress);
  }

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

function getBokmaPhase(elapsed) {
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

// -----------------------------------------------------
// 17-2. 스쿠나 푸가 
// -----------------------------------------------------
function startPugaSequence() {
  if (activeTechnique !== TECHNIQUE_NONE) return;

  pugaContext =
    sceneState === STATE_FINAL
      ? PUGA_CONTEXT_SLICED
      : PUGA_CONTEXT_NORMAL;

  sceneState = STATE_PUGA;
  activeTechnique = TECHNIQUE_PUGA;

  sequenceStartedAt = performance.now();
  techniqueStartedAt = performance.now();

  pugaStage = PUGA_STAGE_HAND_FLAME;

  // 푸가 진입 순간 복마 게이지 초기화
  oneHandGestureStartTime = null;
  oneHandGestureHoldProgress = 0;
  doorFalseFrameCount = 0;

  pugaSignalStartTime = null;
  pugaSignalHoldProgress = 0;
  pugaFalseFrameCount = 0;

  pugaLastLeftCenter = null;
  pugaLastRightCenter = null;
  pugaLastHandsSeenAt = null;
  pugaPillarProgress = 0;
  pugaLockedPillarLength = null;
  pugaControlledAngle = null;
  pugaLastControlledAngle = null;

  pugaLockedPillarCenter = null;
  pugaLockedPillarAngle = null;

  pugaControlBlendStartedAt = null;
  pugaControlBlendProgress = 0;

  pugaControlledCenter = null;
  pugaLastControlledCenter = null;

  pugaControlHandBaseTrackerSize = null;
  pugaDynamicPillarWidth = null;
}

function drawPugaSequence() {
  if (pugaContext === PUGA_CONTEXT_SLICED) {
    drawSlicedRealityScene();
  } else {
    drawCoverVideo();
  }

  const now = performance.now();

  const leftHand = latestHands.find((hand) => hand.label === 'Left');
  const rightHand = latestHands.find((hand) => hand.label === 'Right');

  const currentLeftCenter = leftHand ? getPalmCenter(leftHand.points) : null;
  const currentRightCenter = rightHand ? getPalmCenter(rightHand.points) : null;

  const bothHandsVisible =
    Boolean(currentLeftCenter) && Boolean(currentRightCenter);

  if (bothHandsVisible) {
    pugaLastLeftCenter = currentLeftCenter;
    pugaLastRightCenter = currentRightCenter;
    pugaLastHandsSeenAt = now;
  }

  const pugaPillarAlreadyStarted =
    pugaStage >= PUGA_STAGE_FIRE_PILLAR;

  const canUseLastHands =
    pugaLastHandsSeenAt !== null &&
    (
      pugaPillarAlreadyStarted ||
      now - pugaLastHandsSeenAt < PUGA_HAND_LOST_GRACE_DURATION
    );

  const leftCenter =
    currentLeftCenter || (canUseLastHands ? pugaLastLeftCenter : null);

  const rightCenter =
    currentRightCenter || (canUseLastHands ? pugaLastRightCenter : null);

  if (leftCenter && rightCenter) {
    const rawDistance = Math.hypot(
      leftCenter.x - rightCenter.x,
      leftCenter.y - rightCenter.y,
    );

    const { width, height } = getStageSize();

    const separateDistance =
      Math.min(width, height) * PUGA_HAND_SEPARATE_DISTANCE_RATIO;

    const maxPillarLength =
      width * PUGA_MAX_PILLAR_LENGTH_RATIO;

    const pugaElapsed =
      techniqueStartedAt ? now - techniqueStartedAt : 0;

    const orbHoldFinished =
      pugaElapsed >= PUGA_ORB_HOLD_DURATION;

    if (
      pugaStage < PUGA_STAGE_FIRE_PILLAR &&
      orbHoldFinished &&
      rawDistance > separateDistance
    ) {
      pugaStage = PUGA_STAGE_FIRE_PILLAR;
    }

    const midpoint = {
      x: (leftCenter.x + rightCenter.x) / 2,
      y: (leftCenter.y + rightCenter.y) / 2,
    };

    // 1단계: 양손 중앙에 원형 불꽃 구슬 유지
    if (pugaStage < PUGA_STAGE_FIRE_PILLAR) {
      pugaPillarProgress = 0;
      pugaLockedPillarLength = null;
      drawPugaFireOrb(midpoint, 1);
    }

    // 2단계: 구슬이 불기둥으로 서서히 변형
    if (pugaStage >= PUGA_STAGE_FIRE_PILLAR) {
      pugaPillarProgress = Math.min(
        pugaPillarProgress + PUGA_PILLAR_GROW_SPEED,
        1,
      );

      const clampedDistance = Math.min(rawDistance, maxPillarLength);

      // 3단계 발동 조건:
      // 2단계 불기둥이 최대 길이에 도달하면 CONTROL 단계로 진입

      // 2.5단계 발동 조건:
      // 불기둥이 최대 길이에 도달하면 길이/중심/각도 고정
      const reachedMaxPillarLength =
        rawDistance >= maxPillarLength * 0.98 ||
        clampedDistance >= maxPillarLength * 0.98 ||
        pugaLockedPillarLength !== null;

      if (reachedMaxPillarLength) {
        pugaLockedPillarLength = maxPillarLength;

        if (pugaStage < PUGA_STAGE_CONTROL_READY) {
          pugaStage = PUGA_STAGE_CONTROL_READY;

          pugaLockedPillarCenter = { ...midpoint };
          pugaLockedPillarAngle = Math.atan2(
            rightCenter.y - leftCenter.y,
            rightCenter.x - leftCenter.x,
          );

          pugaControlBlendStartedAt = null;
          pugaControlBlendProgress = 0;

          pugaControlledCenter = null;
          pugaLastControlledCenter = null;
          pugaControlledAngle = null;
          pugaLastControlledAngle = null;
        }
      }

      const pillarLength =
        pugaLockedPillarLength !== null
          ? pugaLockedPillarLength
          : clampedDistance;

      // 기본값: 2단계에서는 양손 기준
      let renderCenter = midpoint;
      let renderAngle = Math.atan2(
        rightCenter.y - leftCenter.y,
        rightCenter.x - leftCenter.x,
      );

      // 2.5단계부터는 양손 위치를 더 이상 기준으로 쓰지 않음.
      // CONTROL_READY / CONTROL 모두 잠긴 값을 기본 기준으로 사용.
      if (pugaStage >= PUGA_STAGE_CONTROL_READY) {
        renderCenter = pugaLockedPillarCenter || renderCenter;
        renderAngle =
          pugaLockedPillarAngle !== null
            ? pugaLockedPillarAngle
            : renderAngle;
      }

      // 2.5단계:
      // 미러 화면 기준 왼손처럼 보이는 손을 쓰기 위해
      // MediaPipe label 기준 rightHand를 전달함
      if (pugaStage === PUGA_STAGE_CONTROL_READY) {
        const controlPose = getPugaControlPoseFromLeftFingers(
          rightHand,
          pugaLockedPillarCenter || midpoint,
        );

        if (controlPose) {
          pugaControlledCenter = controlPose.center;
          pugaControlledAngle = controlPose.angle;

          if (pugaControlBlendStartedAt === null) {
            pugaControlBlendStartedAt = now;
          }

          const blendElapsed =
            now - pugaControlBlendStartedAt;

          pugaControlBlendProgress = Math.min(
            blendElapsed / PUGA_CONTROL_BLEND_DURATION,
            1,
          );

          const blendT = easeInOutCubic(pugaControlBlendProgress);

          // 시작값은 2.5단계에서 고정된 불기둥 중심/각도
          const startCenter = pugaLockedPillarCenter || midpoint;
          const startAngle = pugaLockedPillarAngle ?? renderAngle;

          // 목표값은 왼손 검지/중지 선의 중심/각도
          renderCenter = lerpPoint(
            startCenter,
            pugaControlledCenter,
            blendT,
          );

          renderAngle = lerpAngle(
            startAngle,
            pugaControlledAngle,
            blendT,
          );

          if (pugaControlBlendProgress >= 1) {
            pugaStage = PUGA_STAGE_CONTROL;
          }
        }
      }

      // 3단계:
      // 통제권을 얻은 이후에는 거리 제한 없이
      // 미러링 기준 왼손처럼 보이는 손, 코드상 rightHand의 검지/중지를 계속 따라감
      if (pugaStage >= PUGA_STAGE_CONTROL) {
        const controlPose = getPugaControlPoseFromLeftFingersFree(
          rightHand,
        );

        const hasValidControlPose = Boolean(controlPose);

        if (hasValidControlPose) {
          const nextAngle = controlPose.angle;

          const hasPreviousAngle =
            pugaLastControlledAngle !== null ||
            pugaControlledAngle !== null;

          const currentAngleForCheck =
            pugaLastControlledAngle !== null
              ? pugaLastControlledAngle
              : pugaControlledAngle;

          const angleJump =
            hasPreviousAngle
              ? getAngleDifference(currentAngleForCheck, nextAngle)
              : 0;

          // 검지/중지 재인식 순간 각도가 비정상적으로 크게 튀면
          // 그 프레임은 잘못된 인식으로 보고 무시
          const angleLooksSafe =
            angleJump <= PUGA_CONTROL_MAX_ANGLE_JUMP;

          if (angleLooksSafe) {
            pugaControlledCenter = controlPose.center;
            pugaControlledAngle = controlPose.angle;

            pugaControlPoseLastSeenAt = now;
            pugaControlPoseLost = false;
          }
        } else {
          pugaControlPoseLost = true;
        }

        // 손가락 인식이 끊겼거나, 잘못된 각도값이 들어온 프레임에서는
        // 새 목표값을 갱신하지 않고 마지막 정상 위치/각도를 그대로 사용
        if (pugaControlledCenter) {
          pugaLastControlledCenter =
            pugaLastControlledCenter === null
              ? pugaControlledCenter
              : lerpPoint(
                  pugaLastControlledCenter,
                  pugaControlledCenter,
                  PUGA_CONTROL_ANGLE_SMOOTHING,
                );

          renderCenter = pugaLastControlledCenter;
        } else if (pugaLastControlledCenter) {
          renderCenter = pugaLastControlledCenter;
        }

        if (pugaControlledAngle !== null) {
          pugaLastControlledAngle =
            pugaLastControlledAngle === null
              ? pugaControlledAngle
              : lerpAngle(
                  pugaLastControlledAngle,
                  pugaControlledAngle,
                  PUGA_CONTROL_ANGLE_SMOOTHING,
                );

          renderAngle = pugaLastControlledAngle;
        } else if (pugaLastControlledAngle !== null) {
          renderAngle = pugaLastControlledAngle;
        }
      }

      const scaledPillarLength =
        pugaStage >= PUGA_STAGE_CONTROL
          ? pillarLength * pugaDynamicPillarScale
          : pillarLength;

      const halfLength = scaledPillarLength / 2;

      const pillarStart = {
        x: renderCenter.x - Math.cos(renderAngle) * halfLength,
        y: renderCenter.y - Math.sin(renderAngle) * halfLength,
      };

      const pillarEnd = {
        x: renderCenter.x + Math.cos(renderAngle) * halfLength,
        y: renderCenter.y + Math.sin(renderAngle) * halfLength,
      };

      let customPillarWidth = null;

      if (pugaStage >= PUGA_STAGE_CONTROL) {
        // 통제권 획득 직후의 기본 불기둥 두께를 기준값으로 사용
        // PUGA_PILLAR_MAX_WIDTH = 현재 기본 최대 두께
        const basePillarWidth = PUGA_PILLAR_MAX_WIDTH;

        customPillarWidth = getPugaDynamicPillarWidth(
          rightHand,
          basePillarWidth,
        );
      }

      drawPugaFirePillarFromCenter(
        renderCenter,
        pillarStart,
        pillarEnd,
        scaledPillarLength,
        pugaPillarProgress,
        customPillarWidth,
      );
    }
  }

  drawHands();
}

function getPugaPhase(elapsed) {}

// =====================================================
// 18. Drawing Effects
// =====================================================
// 18-1.  스쿠나 복마어주자
// -----------------------------------------------------

function drawBokmaChargeBorder(progress = 0, alphaMultiplier = 1) {
  const { width, height } = getStageSize();
  const time = performance.now() * 0.001;

  const t = Math.max(0, Math.min(1, progress));
  const pulse = 0.85 + Math.sin(time * 5) * 0.15;

  const alpha = (0.55 + t * 0.4) * pulse * alphaMultiplier;
  const edgeSize = 90 + t * 50;

  ctx.save();

  // 상단
  let gradient = ctx.createLinearGradient(0, 0, 0, edgeSize);
  gradient.addColorStop(0, `rgba(0, 0, 0, ${alpha})`);
  gradient.addColorStop(0.35, `rgba(80, 0, 0, ${alpha * 0.65})`);
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, edgeSize);

  // 하단
  gradient = ctx.createLinearGradient(0, height, 0, height - edgeSize);
  gradient.addColorStop(0, `rgba(0, 0, 0, ${alpha})`);
  gradient.addColorStop(0.35, `rgba(80, 0, 0, ${alpha * 0.65})`);
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, height - edgeSize, width, edgeSize);

  // 좌측
  gradient = ctx.createLinearGradient(0, 0, edgeSize, 0);
  gradient.addColorStop(0, `rgba(0, 0, 0, ${alpha})`);
  gradient.addColorStop(0.35, `rgba(80, 0, 0, ${alpha * 0.65})`);
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, edgeSize, height);

  // 우측
  gradient = ctx.createLinearGradient(width, 0, width - edgeSize, 0);
  gradient.addColorStop(0, `rgba(0, 0, 0, ${alpha})`);
  gradient.addColorStop(0.35, `rgba(80, 0, 0, ${alpha * 0.65})`);
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(width - edgeSize, 0, edgeSize, height);

  ctx.restore();
}

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

  // ===== 세로 계열 7개 =====
  // 기준 위치는 유지하되, 각 선마다 살짝 다른 기울기 부여
  const verticalBases = [0.08, 0.22, 0.36, 0.5, 0.64, 0.78, 0.92];

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

  // ===== 가로 계열 5개 =====
  // 큰 덩어리 구조는 유지하되, 완전 수평처럼 보이지 않게 흔들기
  const horizontalBases = [0.12, 0.30, 0.48, 0.66, 0.84];

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
    ...slashLines.slice(0, 7),
    boundaryVerticalRight,
  ];

  const horizontalLines = [
    boundaryHorizontalTop,
    ...slashLines.slice(7, 12),
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

      const centerX =
        (topLeft.x + topRight.x + bottomRight.x + bottomLeft.x) / 4;

      const centerY =
        (topLeft.y + topRight.y + bottomRight.y + bottomLeft.y) / 4;

      const distanceFromScreenCenter =
        Math.hypot(
          centerX - width * 0.5,
          centerY - height * 0.5
        );

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
        centerDistance: distanceFromScreenCenter,
      });
    }
  }

  const maxDistance = Math.max(
    ...pieces.map(piece => piece.centerDistance)
  );

  pieces.forEach(piece => {
    piece.distanceRatio =
      piece.centerDistance / maxDistance;
  });

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

  // 2) 위에는 주술 영역 조각을 테두리부터 줄어드는 마스크로 그림
  const dissolveT = Math.max(0, Math.min(1, progress));

  slicePieces.forEach((piece) => {
    const startDelay =
      (1 - piece.distanceRatio) * 0.7;

    const localT =
      Math.max(
        0,
        Math.min(
          1,
          (dissolveT - startDelay) / 0.3
        )
      );

    drawDustDissolvePiece(piece, localT);
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

// 조각난 영역 --> 일반 캠 전환
function drawDustDissolvePiece(piece, progress = 1) {
  const { width, height } = getStageSize();

  const center = getPieceCenter(piece.points);

  const moveX = piece.dx;
  const moveY = piece.dy;
  const rotation = piece.rotation;

  const dissolveProgress = Math.max(0, Math.min(1, progress));
  if (dissolveProgress >= 0.88) return;

  const bounds = getPieceBounds(piece.points);
  const pieceSize = Math.max(bounds.width, bounds.height);

  // 조각 가장자리부터 서서히 안쪽으로 무너지는 깊이
  const dissolveInset = pieceSize * dissolveProgress * 0.2;

  const dissolvedPoints = makeDissolvedPolygonPoints(
    piece.points,
    center,
    dissolveInset,
    dissolveProgress,
    piece.burnSeed || 0,
  );

  ctx.save();

  ctx.translate(center.x + moveX, center.y + moveY);
  ctx.rotate(rotation);
  ctx.translate(-center.x, -center.y);

  // 남아 있는 주술 조각 영역
  ctx.beginPath();
  ctx.moveTo(dissolvedPoints[0].x, dissolvedPoints[0].y);

  for (let i = 1; i < dissolvedPoints.length; i += 1) {
    ctx.lineTo(dissolvedPoints[i].x, dissolvedPoints[i].y);
  }

  ctx.closePath();
  ctx.clip();

  // 후반으로 갈수록 조용히 투명해짐
  ctx.globalAlpha = Math.pow(Math.max(0, 1 - dissolveProgress), 1.6);

  ctx.drawImage(
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

  ctx.restore();

  // 가장자리 잔상과 가루 입자
  // drawDissolveEdge(piece, dissolvedPoints, dissolveProgress);
  drawDustParticles(piece, dissolvedPoints, dissolveProgress);
}

function drawDissolveEdge(piece, points, progress = 1) {
  const center = getPieceCenter(piece.points);

  const moveX = piece.dx;
  const moveY = piece.dy;
  const rotation = piece.rotation;

  const edgeAlpha =
    progress < 0.96
      ? Math.sin(progress * Math.PI) * 0.45
      : 0;

  if (edgeAlpha <= 0) return;

  ctx.save();

  ctx.translate(center.x + moveX, center.y + moveY);
  ctx.rotate(rotation);
  ctx.translate(-center.x, -center.y);

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // 검은 탄 자국이 아니라, 흐릿한 재/먼지 경계
  ctx.strokeStyle = `rgba(35, 28, 30, ${0.42 * edgeAlpha})`;
  ctx.lineWidth = 7;
  drawClosedPolyline(points);

  ctx.strokeStyle = `rgba(150, 115, 105, ${0.18 * edgeAlpha})`;
  ctx.lineWidth = 2.2;
  drawClosedPolyline(points);

  ctx.strokeStyle = `rgba(210, 190, 175, ${0.1 * edgeAlpha})`;
  ctx.lineWidth = 1;
  drawClosedPolyline(points);

  ctx.restore();
}

function makeDissolvedPolygonPoints(points, center, inset, progress, seed = 0) {
  const result = [];
  const samplesPerEdge = 16;

  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];

    for (let s = 0; s < samplesPerEdge; s += 1) {
      const t = s / samplesPerEdge;

      const x = lerp(a.x, b.x, t);
      const y = lerp(a.y, b.y, t);

      const dx = center.x - x;
      const dy = center.y - y;
      const len = Math.hypot(dx, dy) || 1;

      const nx = dx / len;
      const ny = dy / len;

      // 불규칙하게 가장자리가 부서지는 느낌
      const noiseA = Math.sin(
        x * 0.023 +
        y * 0.031 +
        seed * 0.71 +
        progress * 4.2,
      );

      const noiseB = Math.sin(
        x * 0.061 -
        y * 0.047 +
        seed * 1.13 +
        progress * 7.7,
      );

      const noise = noiseA * 0.6 + noiseB * 0.4;

      // 너무 튀지 않게 거칠기 제한
      const roughness = 3 + progress * 10;
      const localInset = inset + noise * roughness;

      result.push({
        x: x + nx * localInset,
        y: y + ny * localInset,
      });
    }
  }

  return result;
}

function drawDustParticles(piece, edgePoints, progress = 1) {
  if (progress <= 0.08 || progress >= 0.82) return;

  const center = getPieceCenter(piece.points);

  const moveX = piece.dx;
  const moveY = piece.dy;
  const rotation = piece.rotation;

  const particleAlpha = Math.sin(progress * Math.PI) * 0.48;

  ctx.save();

  ctx.translate(center.x + moveX, center.y + moveY);
  ctx.rotate(rotation);
  ctx.translate(-center.x, -center.y);

  // 가루는 많으면 싼티남. 적고 작게.
  const step = Math.max(1, Math.floor(edgePoints.length / 18));

  for (let i = 0; i < edgePoints.length; i += step) {
    const p = edgePoints[i];

    const seed = piece.burnSeed || 0;

    const n1 = pseudoRandom(i * 13.17 + seed * 0.31);
    const n2 = pseudoRandom(i * 27.91 + seed * 0.47);
    const n3 = pseudoRandom(i * 41.73 + seed * 0.59);

    // 위로 날리되, 좌우로 살짝 흩어짐
    const driftX = (n1 - 0.5) * 44 * progress;
    const driftY = -progress * (26 + n2 * 42);

    // 후반부에는 더 퍼지면서 흐려짐
    const spreadX = (n3 - 0.5) * progress * 24;

    const size = 0.6 + n2 * 1.7;

    const alpha = particleAlpha * (1 - progress * 0.35);

    // 어두운 재 입자
    ctx.fillStyle = `rgba(55, 48, 48, ${0.36 * alpha})`;
    ctx.beginPath();
    ctx.arc(
      p.x + driftX + spreadX,
      p.y + driftY,
      size,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    // 아주 약한 붉은 잔광. 과하지 않게.
    // if (n1 > 0.68) {
    //   ctx.fillStyle = `rgba(160, 70, 55, ${0.12 * alpha})`;
    //   ctx.beginPath();
    //   ctx.arc(
    //     p.x + driftX * 0.8,
    //     p.y + driftY * 0.8,
    //     size * 0.7,
    //     0,
    //     Math.PI * 2,
    //   );
    //   ctx.fill();
    // }
  }

  ctx.restore();
}

function drawClosedPolyline(points) {
  if (!points.length) return;

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(points[i].x, points[i].y);
  }

  ctx.closePath();
  ctx.stroke();
}

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

// function drawPersonRedAura(progress = 0) {
//   if (!segmentationReady) return;
//   if (!personCanvas.width || !personCanvas.height) return;

//   const { width } = getStageSize();
//   const rect = getVideoDrawRect();

//   const time = performance.now() * 0.001;
//   const glowAlpha = 0.18 + progress * 0.45;
//   const blurSize = 8 + progress * 18 + Math.sin(time * 8) * 2;

//   ctx.save();

//   ctx.globalCompositeOperation = 'lighter';
//   ctx.filter = `blur(${blurSize}px)`;
//   ctx.globalAlpha = glowAlpha;

//   // drawPersonCanvasMirrored(rect, width);

//   ctx.filter = 'none';
//   ctx.globalAlpha = 0.35 + progress * 0.45;
//   ctx.shadowColor = 'rgba(255, 30, 20, 0.9)';
//   ctx.shadowBlur = 18 + progress * 24;

//   // drawPersonCanvasMirrored(rect, width);

//   ctx.restore();
// }

// function drawPersonCanvasMirrored(rect, stageWidth) {
//   if (MIRROR_VIEW) {
//     ctx.save();
//     ctx.translate(stageWidth, 0);
//     ctx.scale(-1, 1);
//     ctx.drawImage(
//       personCanvas,
//       stageWidth - rect.x - rect.width,
//       rect.y,
//       rect.width,
//       rect.height
//     );
//     ctx.restore();
//   } else {
//     ctx.drawImage(
//       personCanvas,
//       rect.x,
//       rect.y,
//       rect.width,
//       rect.height
//     );
//   }
// }

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

// -----------------------------------------------------
// 18-2.  스쿠나 푸가
// -----------------------------------------------------
function drawPugaFireOrb(center, intensity = 1) {
  const time = performance.now() * 0.001;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const pulse =
    1 +
    Math.sin(time * 8) * 0.08 +
    Math.sin(time * 15) * 0.04;

  const baseRadius = PUGA_FIRE_ORB_RADIUS * pulse;

  const coreGradient = ctx.createRadialGradient(
    center.x,
    center.y,
    0,
    center.x,
    center.y,
    baseRadius * 1.55,
  );

  coreGradient.addColorStop(0, `rgba(255, 245, 180, ${0.95 * intensity})`);
  coreGradient.addColorStop(0.28, `rgba(255, 170, 40, ${0.82 * intensity})`);
  coreGradient.addColorStop(0.58, `rgba(255, 55, 10, ${0.45 * intensity})`);
  coreGradient.addColorStop(1, 'rgba(120, 0, 0, 0)');

  ctx.fillStyle = coreGradient;
  ctx.beginPath();
  ctx.arc(center.x, center.y, baseRadius * 1.55, 0, Math.PI * 2);
  ctx.fill();

  // 불꽃 입자
  for (let i = 0; i < 18; i += 1) {
    const seed = i * 1.37;
    const angle = seed + time * (2.5 + i * 0.03);
    const radius =
      baseRadius * (0.45 + pseudoRandom(i * 8.71) * 1.1);

    const x =
      center.x +
      Math.cos(angle) * radius;

    const y =
      center.y +
      Math.sin(angle) * radius -
      Math.abs(Math.sin(time * 3 + i)) * 8;

    const size =
      5 +
      pseudoRandom(i * 13.11) * 11;

    const particleGradient = ctx.createRadialGradient(
      x,
      y,
      0,
      x,
      y,
      size,
    );

    particleGradient.addColorStop(0, 'rgba(255, 245, 170, 0.9)');
    particleGradient.addColorStop(0.35, 'rgba(255, 125, 20, 0.55)');
    particleGradient.addColorStop(1, 'rgba(180, 0, 0, 0)');

    ctx.fillStyle = particleGradient;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawPugaHandFlame(center, intensity = 1) {
  const time = performance.now() * 0.001;

  ctx.save();

  ctx.globalCompositeOperation = 'lighter';

  for (let i = 0; i < 9; i += 1) {
    const angle =
      time * 4.5 +
      i * 0.9;

    const radius =
      18 +
      Math.sin(time * 5 + i) * 6;

    const x =
      center.x +
      Math.cos(angle) * radius * 0.45;

    const y =
      center.y -
      12 -
      Math.abs(Math.sin(angle)) * 18 -
      i * 1.5;

    const flameSize =
      22 +
      Math.sin(time * 8 + i) * 5;

    const gradient = ctx.createRadialGradient(
      x,
      y,
      0,
      x,
      y,
      flameSize,
    );

    gradient.addColorStop(0, `rgba(255, 245, 170, ${0.65 * intensity})`);
    gradient.addColorStop(0.35, `rgba(255, 95, 20, ${0.38 * intensity})`);
    gradient.addColorStop(1, 'rgba(150, 0, 0, 0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, flameSize, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawPugaFirePillar(start, end) {
  const time = performance.now() * 0.001;

  const dx = end.x - start.x;
  const dy = end.y - start.y;

  const distance = Math.hypot(dx, dy);
  if (distance < 1) return;

  const angle = Math.atan2(dy, dx);

  const centerX = (start.x + end.x) / 2;
  const centerY = (start.y + end.y) / 2;

  const pillarWidth = Math.min(90, Math.max(34, distance * 0.22));

  ctx.save();

  ctx.translate(centerX, centerY);
  ctx.rotate(angle);

  ctx.globalCompositeOperation = 'lighter';

  // 바깥 불기둥
  const outerGradient = ctx.createLinearGradient(
    0,
    -pillarWidth,
    0,
    pillarWidth,
  );

  outerGradient.addColorStop(0, 'rgba(160, 0, 0, 0)');
  outerGradient.addColorStop(0.25, 'rgba(255, 60, 10, 0.35)');
  outerGradient.addColorStop(0.5, 'rgba(255, 210, 70, 0.55)');
  outerGradient.addColorStop(0.75, 'rgba(255, 60, 10, 0.35)');
  outerGradient.addColorStop(1, 'rgba(160, 0, 0, 0)');

  ctx.fillStyle = outerGradient;
  ctx.beginPath();

  const leftX = -distance / 2;
  const rightX = distance / 2;

  ctx.moveTo(leftX, 0);

  for (let x = leftX; x <= rightX; x += 18) {
    const wave =
      Math.sin(x * 0.04 + time * 8) * 10 +
      Math.sin(x * 0.09 - time * 6) * 5;

    ctx.lineTo(x, -pillarWidth * 0.5 + wave);
  }

  for (let x = rightX; x >= leftX; x -= 18) {
    const wave =
      Math.sin(x * 0.05 - time * 7) * 10 +
      Math.sin(x * 0.08 + time * 5) * 5;

    ctx.lineTo(x, pillarWidth * 0.5 + wave);
  }

  ctx.closePath();
  ctx.fill();

  // 중심 고열 코어
  ctx.strokeStyle = 'rgba(255, 245, 180, 0.75)';
  ctx.lineWidth = Math.max(8, pillarWidth * 0.18);
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(leftX, 0);

  for (let x = leftX; x <= rightX; x += 16) {
    const wave =
      Math.sin(x * 0.05 + time * 10) * 5;

    ctx.lineTo(x, wave);
  }

  ctx.stroke();

  ctx.restore();
}

function drawPugaFirePillarFromCenter(
  center,
  leftCenter,
  rightCenter,
  targetLength,
  progress = 1,
  customPillarWidth = null,
) {
  const time = performance.now() * 0.001;

  const dx = rightCenter.x - leftCenter.x;
  const dy = rightCenter.y - leftCenter.y;

  const rawDistance = Math.hypot(dx, dy);
  if (rawDistance < 1) {
    drawPugaFireOrb(center, 1);
    return;
  }

  const angle = Math.atan2(dy, dx);

  const t = easeOutCubic(Math.max(0, Math.min(1, progress)));

  const orbRadius = PUGA_FIRE_ORB_RADIUS * 1.25;
  const currentLength = lerp(orbRadius, targetLength, t);

  const defaultPillarWidth =
    lerp(
      PUGA_PILLAR_BASE_WIDTH,
      Math.min(
        PUGA_PILLAR_MAX_WIDTH,
        Math.max(PUGA_PILLAR_BASE_WIDTH * 0.58, targetLength * 0.18),
      ),
      t,
    );

  const pillarWidth =
    customPillarWidth !== null
      ? customPillarWidth
      : defaultPillarWidth;

  ctx.save();

  ctx.translate(center.x, center.y);
  ctx.rotate(angle);

  ctx.globalCompositeOperation = 'lighter';

  const leftX = -currentLength / 2;
  const rightX = currentLength / 2;
  const length = Math.max(1, rightX - leftX);

  // 바깥 불꽃 글로우
  const glowGradient = ctx.createLinearGradient(
    0,
    -pillarWidth,
    0,
    pillarWidth,
  );

  glowGradient.addColorStop(0, 'rgba(120, 0, 0, 0)');
  glowGradient.addColorStop(0.16, `rgba(255, 35, 0, ${0.34 + t * 0.18})`);
  glowGradient.addColorStop(0.38, `rgba(255, 120, 20, ${0.5 + t * 0.22})`);
  glowGradient.addColorStop(0.5, `rgba(255, 245, 150, ${0.68 + t * 0.22})`);
  glowGradient.addColorStop(0.62, `rgba(255, 120, 20, ${0.5 + t * 0.22})`);
  glowGradient.addColorStop(0.84, `rgba(190, 0, 0, ${0.28 + t * 0.16})`);
  glowGradient.addColorStop(1, 'rgba(120, 0, 0, 0)');

  ctx.fillStyle = glowGradient;
  ctx.beginPath();

  // 왼쪽 끝을 뾰족하게 시작
  ctx.moveTo(leftX, 0);

  // 위쪽 외곽선
  for (let x = leftX; x <= rightX; x += 12) {
    const ratio = (x - leftX) / length;

    // 0 at ends, 1 at center
    const centerBulge = Math.pow(Math.sin(ratio * Math.PI), 0.72);

    const halfWidth =
      pillarWidth *
      (
        PUGA_PILLAR_TIP_WIDTH_RATIO +
        centerBulge * PUGA_PILLAR_CENTER_BULGE
      ) *
      t;

    const wave =
      (
        Math.sin(x * 0.045 + time * 8.5) * PUGA_PILLAR_EDGE_WAVE +
        Math.sin(x * 0.11 - time * 5.7) * PUGA_PILLAR_EDGE_WAVE * 0.45
      ) *
      centerBulge *
      t;

    ctx.lineTo(x, -halfWidth + wave);
  }

  // 오른쪽 끝을 뾰족하게 찍음
  ctx.lineTo(rightX, 0);

  // 아래쪽 외곽선
  for (let x = rightX; x >= leftX; x -= 12) {
    const ratio = (x - leftX) / length;

    const centerBulge = Math.pow(Math.sin(ratio * Math.PI), 0.72);

    const halfWidth =
      pillarWidth *
      (
        PUGA_PILLAR_TIP_WIDTH_RATIO +
        centerBulge * PUGA_PILLAR_CENTER_BULGE
      ) *
      t;

    const wave =
      (
        Math.sin(x * 0.052 - time * 8) * PUGA_PILLAR_EDGE_WAVE +
        Math.sin(x * 0.1 + time * 5.4) * PUGA_PILLAR_EDGE_WAVE * 0.45
      ) *
      centerBulge *
      t;

    ctx.lineTo(x, halfWidth + wave);
  }

  ctx.closePath();
  ctx.fill();

  // 중심 고열 코어도 끝으로 갈수록 얇아지는 형태로 그림
  const coreGradient = ctx.createLinearGradient(
    0,
    -pillarWidth * 0.25,
    0,
    pillarWidth * 0.25,
  );

  coreGradient.addColorStop(0, 'rgba(255, 120, 20, 0)');
  coreGradient.addColorStop(0.5, `rgba(255, 245, 180, ${0.72 + t * 0.22})`);
  coreGradient.addColorStop(1, 'rgba(255, 120, 20, 0)');

  ctx.fillStyle = coreGradient;
  ctx.beginPath();

  ctx.moveTo(leftX, 0);

  for (let x = leftX; x <= rightX; x += 14) {
    const ratio = (x - leftX) / length;
    const centerBulge = Math.pow(Math.sin(ratio * Math.PI), 1.05);

    const coreHalfWidth =
      pillarWidth * 0.18 * centerBulge * t;

    const wave =
      Math.sin(x * 0.06 + time * 12) * 3.5 * centerBulge * t;

    ctx.lineTo(x, -coreHalfWidth + wave);
  }

  ctx.lineTo(rightX, 0);

  for (let x = rightX; x >= leftX; x -= 14) {
    const ratio = (x - leftX) / length;
    const centerBulge = Math.pow(Math.sin(ratio * Math.PI), 1.05);

    const coreHalfWidth =
      pillarWidth * 0.18 * centerBulge * t;

    const wave =
      Math.sin(x * 0.06 + time * 12) * 3.5 * centerBulge * t;

    ctx.lineTo(x, coreHalfWidth + wave);
  }

  ctx.closePath();
  ctx.fill();

  // 양끝 불꽃 잔상은 너무 둥글면 뾰족함을 해치므로 약하게
  drawLocalPugaEndFlare(leftX, 0, 0.55);
  drawLocalPugaEndFlare(rightX, 0, 0.55);

  ctx.restore();

  // 중앙 구슬 잔광
  drawPugaFireOrb(center, 0.28 * (1 - t) + 0.12);
}

function drawLocalPugaEndFlare(x, y, intensity = 1) {
  const time = performance.now() * 0.001;

  const radius =
    26 +
    Math.sin(time * 10 + x * 0.01) * 4;

  const gradient = ctx.createRadialGradient(
    x,
    y,
    0,
    x,
    y,
    radius,
  );

  gradient.addColorStop(0, `rgba(255, 245, 170, ${0.85 * intensity})`);
  gradient.addColorStop(0.38, `rgba(255, 120, 20, ${0.45 * intensity})`);
  gradient.addColorStop(1, 'rgba(180, 0, 0, 0)');

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
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
    sceneState === STATE_BOKMA && sequenceStartedAt
      ? getBokmaPhase(performance.now() - sequenceStartedAt)
      : sceneState;

  const lines = [
    `puga signal: ${rawPugaSignalActive}`,
    `puga hold progress: ${pugaSignalHoldProgress.toFixed(2)}`,
    `puga false frames: ${pugaFalseFrameCount}`,
    `puga stage: ${pugaStage}`,
    `puga reason: ${pugaDebugReason}`,
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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