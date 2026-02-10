import { useCallback, useEffect, useRef, useState } from "react";
import { extractFaceEmbedding } from "../features/face/extractFaceEmbedding";

export function FaceIdentify(props: {
  onEmbedding: (embedding: number[]) => void;
  disabled?: boolean;
}) {
  const { onEmbedding, disabled } = props;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    const start = async () => {
      try {
        setError(null);
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) return;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ? String(e.message) : "Falha ao iniciar câmera");
      }
    };

    start();

    return () => {
      cancelled = true;
      if (stream) {
        for (const t of stream.getTracks()) t.stop();
      }
    };
  }, []);

  const handleCapture = useCallback(async () => {
    if (!videoRef.current) return;
    setBusy(true);
    setError(null);
    try {
      const embedding = await extractFaceEmbedding(videoRef.current);
      onEmbedding(embedding);
    } catch (e: any) {
      setError(e?.message ? String(e.message) : "Falha ao reconhecer rosto");
    } finally {
      setBusy(false);
    }
  }, [onEmbedding]);

  return (
    <div style={{ width: "100%" }}>
      <div style={{ position: "relative", width: "100%", aspectRatio: "16/9", borderRadius: 16, overflow: "hidden" }}>
        <video
          ref={videoRef}
          muted
          playsInline
          style={{ width: "100%", height: "100%", objectFit: "cover", background: "#111" }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            border: "3px solid rgba(255,255,255,0.35)",
            boxShadow: "inset 0 0 0 9999px rgba(0,0,0,0.1)",
          }}
        />
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 12 }}>
        <button className="btn" onClick={handleCapture} disabled={disabled || busy}>
          {busy ? "Analisando..." : "Reconhecer"}
        </button>
      </div>

      {error ? (
        <div style={{ marginTop: 12 }} className="alert alert--error">
          {error}
        </div>
      ) : null}
    </div>
  );
}

