import { useEffect, useMemo, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

export function BarcodeScanner(props: {
  onDetected: (value: string) => void;
  paused?: boolean;
  variant?: "full" | "narrow";
}) {
  const { onDetected, paused, variant = "narrow" } = props;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reader = useMemo(() => new BrowserMultiFormatReader(), []);

  useEffect(() => {
    if (paused) return;

    let active = true;
    setError(null);

    const run = async () => {
      try {
        if (!videoRef.current) return;
        await reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
          if (!active) return;
          const text = result?.getText?.();
          if (!text) return;
          onDetected(text);
        });
      } catch (e: any) {
        if (!active) return;
        setError(e?.message ? String(e.message) : "Falha ao iniciar câmera");
      }
    };

    run();

    return () => {
      active = false;
      try {
        (reader as any).reset?.();
        (reader as any).stopContinuousDecode?.();
      } catch {
      }
    };
  }, [reader, onDetected, paused]);

  return (
    <div style={{ width: "100%", maxWidth: variant === "narrow" ? 520 : undefined, margin: "0 auto" }}>
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
        <div
          style={{
            position: "absolute",
            left: 16,
            right: 16,
            bottom: 16,
            padding: "10px 12px",
            borderRadius: 12,
            background: "rgba(0,0,0,0.55)",
            color: "white",
            fontSize: 14,
          }}
        >
          Aponte a câmera para o código de barras
        </div>
      </div>
      {error ? (
        <div style={{ marginTop: 12, color: "#b42318", fontSize: 14 }}>
          {error}
        </div>
      ) : null}
    </div>
  );
}
