import { FilesetResolver, FaceDetector, ImageEmbedder } from "@mediapipe/tasks-vision";

const WASM_ROOT = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";
const FACE_DETECTOR_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";
const IMAGE_EMBEDDER_MODEL =
  "https://storage.googleapis.com/mediapipe-models/image_embedder/mobilenet_v3_small/float32/1/mobilenet_v3_small.tflite";

let faceDetectorPromise: Promise<FaceDetector> | null = null;
let imageEmbedderPromise: Promise<ImageEmbedder> | null = null;

async function getFaceDetector() {
  if (!faceDetectorPromise) {
    faceDetectorPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
      return await FaceDetector.createFromModelPath(vision, FACE_DETECTOR_MODEL);
    })();
  }
  return await faceDetectorPromise;
}

async function getImageEmbedder() {
  if (!imageEmbedderPromise) {
    imageEmbedderPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
      return await ImageEmbedder.createFromModelPath(vision, IMAGE_EMBEDDER_MODEL);
    })();
  }
  return await imageEmbedderPromise;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export async function extractFaceEmbedding(video: HTMLVideoElement): Promise<number[]> {
  if (!video.videoWidth || !video.videoHeight) {
    throw new Error("Câmera não está pronta");
  }

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const faceDetector = await getFaceDetector();
  const detections = faceDetector.detect(canvas);
  const detection = detections?.detections?.[0];
  const bbox = detection?.boundingBox;
  if (!bbox) {
    throw new Error("Nenhum rosto detectado");
  }

  const x = clamp(Math.floor(bbox.originX ?? 0), 0, canvas.width - 1);
  const y = clamp(Math.floor(bbox.originY ?? 0), 0, canvas.height - 1);
  const w = clamp(Math.floor(bbox.width ?? 0), 1, canvas.width - x);
  const h = clamp(Math.floor(bbox.height ?? 0), 1, canvas.height - y);

  const crop = document.createElement("canvas");
  crop.width = w;
  crop.height = h;
  const cropCtx = crop.getContext("2d");
  if (!cropCtx) throw new Error("Canvas indisponível");
  cropCtx.drawImage(canvas, x, y, w, h, 0, 0, w, h);

  const embedder = await getImageEmbedder();
  const embedRes: any = (embedder as any).embed ? (embedder as any).embed(crop) : (embedder as any).embedForVideo?.(crop);
  const embedding =
    embedRes?.embeddings?.[0]?.floatEmbedding ||
    embedRes?.embeddings?.[0]?.embedding ||
    embedRes?.embeddings?.[0] ||
    null;

  if (!embedding || !Array.isArray(embedding)) {
    throw new Error("Falha ao gerar embedding");
  }

  const vec: number[] = embedding.map((v: any) => Number(v)).filter((n: any) => Number.isFinite(n));
  if (vec.length === 0) {
    throw new Error("Embedding inválido");
  }

  return vec;
}

