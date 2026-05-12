import './style.css';

const video = document.querySelector('#webcam');
const canvas = document.querySelector('#stage');
const ctx = canvas.getContext('2d');

const DEBUG = true;
const MIRROR_VIEW = true;

const doorImage = new Image();
doorImage.src = '/door_one.png';

let hands = null;
let isHandsProcessing = false;

let latestHands = [];

let isDoorGestureActive = false;
let isLeftGestureActive = false;
let isRightGestureActive = false;

let cameraReady = false;

let rawLeftGestureActive = false;
let rawRightGestureActive = false;
let rawDoorGestureActive = false;

let doorFalseFrameCount = 0;

let oneHandGestureStartTime = null;
let oneHandGestureHoldProgress = 0;

const DOOR_OFF_FRAME_THRESHOLD = 8;
const ONE_HAND_HOLD_DURATION = 2000;

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

init();

async function init() {
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  await setupCamera();
  setupMediaPipeHands();

  renderLoop();
}

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
  hands = new Hands({
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

function renderLoop() {
  /**
   * 렌더 순서 고정
   * 1. drawCoverVideo()
   * 2. processHands()
   * 3. evaluateGesture()
   * 4. drawDoorOverlay()
   * 5. drawHands()
   * 6. drawDebugPanel()
   */
  drawCoverVideo();
  processHands();
  evaluateGesture();
  drawDoorOverlay();
  drawHands();
  drawDebugPanel();

  requestAnimationFrame(renderLoop);
}

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
      rect.height,
    );
  } else {
    ctx.drawImage(
      video,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
    );
  }

  ctx.restore();
}

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

function evaluateGesture() {
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

  // 왼손 또는 오른손 중 한 손 이상 수인 true면 발동
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
      isDoorGestureActive = true;
    }

    return;
  }

  doorFalseFrameCount += 1;

  if (doorFalseFrameCount >= DOOR_OFF_FRAME_THRESHOLD) {
    oneHandGestureStartTime = null;
    oneHandGestureHoldProgress = 0;
    isDoorGestureActive = false;
  }
}

function drawDoorOverlay() {
  if (!isDoorGestureActive) return;
  if (!doorImage.complete) return;

  const { width, height } = getStageSize();

  const overlayW = Math.min(width * 0.55, 520);
  const overlayH = overlayW * (doorImage.height / doorImage.width);

  const x = width / 2 - overlayW / 2;
  const y = height / 2 - overlayH / 2;

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.drawImage(doorImage, x, y, overlayW, overlayH);
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

function drawDebugPanel() {
  if (!DEBUG) return;

  const { width } = getStageSize();

  const rightHand = latestHands.find((hand) => hand.label === 'Right');
  const leftHand = latestHands.find((hand) => hand.label === 'Left');

  const lines = [
    `cameraReady: ${cameraReady}`,
    `hands: ${latestHands.length}`,
    `left hand detected: ${Boolean(leftHand)}`,
    `right hand detected: ${Boolean(rightHand)}`,
    `left gesture: ${rawLeftGestureActive}`,
    `right gesture: ${rawRightGestureActive}`,
    `door active: ${isDoorGestureActive}`,
    `hold progress: ${oneHandGestureHoldProgress.toFixed(2)}`,
    `false frames: ${doorFalseFrameCount}`,
    `door image loaded: ${doorImage.complete}`,
  ];

  ctx.save();

  const panelW = 280;
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

/**
 * 현재 단계 기준 수인 판별
 * - 검지 폄
 * - 중지 폄
 * - 약지 접힘
 * - 새끼 접힘
 *
 * 왼손/오른손 모두 같은 기준으로 우선 판별
 * (다음 단계에서 손별로 더 세밀하게 분리 가능)
 */
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