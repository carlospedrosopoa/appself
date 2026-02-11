import { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";
import {
  kioskAdicionarItem,
  kioskBuscarAtletaPorTelefone,
  kioskCadastrarFaceAtleta,
  kioskGetComanda,
  kioskObterOuCriarComanda,
  kioskReconhecerAtleta,
  type KioskAtleta,
  type KioskCard,
  type KioskItem,
} from "./api/kiosk";
import { BarcodeScanner } from "./components/BarcodeScanner";
import { FaceIdentify } from "./components/FaceIdentify";

type Step = "idle" | "phone" | "face" | "pick" | "comanda" | "scan";

const POINT_ID = import.meta.env.VITE_POINT_ID as string | undefined;
const FACE_MODEL_VERSION = "mediapipe-image-embedder-v1";

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

export default function App() {
  const [step, setStep] = useState<Step>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [phone, setPhone] = useState("");
  const [manualBarcode, setManualBarcode] = useState("");
  const [atleta, setAtleta] = useState<KioskAtleta | null>(null);
  const [card, setCard] = useState<KioskCard | null>(null);
  const [items, setItems] = useState<KioskItem[]>([]);
  const [candidatos, setCandidatos] = useState<Array<KioskAtleta & { score: number }>>([]);
  const [faceSaved, setFaceSaved] = useState(false);

  const pointId = useMemo(() => (POINT_ID ? String(POINT_ID) : ""), []);

  const refreshCard = useCallback(
    async (cardId: string) => {
      const res = await kioskGetComanda({ pointId, cardId });
      setCard(res.card);
      setItems(res.itens);
    },
    [pointId]
  );

  const startPhoneFlow = useCallback(() => {
    setError(null);
    setStep("phone");
  }, []);

  const startFaceFlow = useCallback(() => {
    setError(null);
    setCandidatos([]);
    setStep("face");
  }, []);

  const reset = useCallback(() => {
    setStep("idle");
    setBusy(false);
    setError(null);
    setPhone("");
    setManualBarcode("");
    setAtleta(null);
    setCard(null);
    setItems([]);
    setCandidatos([]);
    setFaceSaved(false);
  }, []);

  useEffect(() => {
    if (step === "idle") return;
    const t = window.setTimeout(() => reset(), 120_000);
    return () => window.clearTimeout(t);
  }, [reset, step, busy, phone, manualBarcode, atleta, card, items]);

  useEffect(() => {
    if (pointId) return;
    setError("VITE_POINT_ID não configurado");
  }, [pointId]);

  const handleBuscarPorTelefone = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const telefone = normalizePhone(phone);
      const res = await kioskBuscarAtletaPorTelefone({ pointId, telefone });
      setAtleta(res.atleta);
      const opened = await kioskObterOuCriarComanda({ pointId, atletaId: res.atleta.id });
      setCard(opened.card);
      await refreshCard(opened.card.id);
      setFaceSaved(false);
      setStep("comanda");
    } catch (e: any) {
      setError(e?.message ? String(e.message) : "Falha ao buscar atleta");
    } finally {
      setBusy(false);
    }
  }, [phone, pointId, refreshCard]);

  const handleFaceEmbedding = useCallback(
    async (embedding: number[]) => {
      setError(null);
      setBusy(true);
      try {
        const res = await kioskReconhecerAtleta({ pointId, embedding, topK: 5, threshold: 0.5, modelVersion: FACE_MODEL_VERSION });
        if (!res.candidatos || res.candidatos.length === 0) {
          setError("Nenhum atleta reconhecido. Tente novamente ou use telefone.");
          return;
        }
        if (res.candidatos.length === 1) {
          const a = res.candidatos[0];
          setAtleta({ id: a.id, nome: a.nome, telefone: a.telefone });
          const opened = await kioskObterOuCriarComanda({ pointId, atletaId: a.id });
          setCard(opened.card);
          await refreshCard(opened.card.id);
          setFaceSaved(false);
          setStep("comanda");
          return;
        }
        setCandidatos(res.candidatos);
        setStep("pick");
      } catch (e: any) {
        setError(e?.message ? String(e.message) : "Falha ao reconhecer atleta");
      } finally {
        setBusy(false);
      }
    },
    [pointId, refreshCard]
  );

  const handleSelecionarCandidato = useCallback(
    async (a: KioskAtleta) => {
      setError(null);
      setBusy(true);
      try {
        setAtleta(a);
        const opened = await kioskObterOuCriarComanda({ pointId, atletaId: a.id });
        setCard(opened.card);
        await refreshCard(opened.card.id);
        setFaceSaved(false);
        setStep("comanda");
      } catch (e: any) {
        setError(e?.message ? String(e.message) : "Falha ao abrir comanda");
      } finally {
        setBusy(false);
      }
    },
    [pointId, refreshCard]
  );

  const handleDetectedBarcode = useCallback(
    async (value: string) => {
      if (!card) return;
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        await kioskAdicionarItem({ pointId, cardId: card.id, barcode: value, quantidade: 1 });
        await refreshCard(card.id);
      } catch (e: any) {
        setError(e?.message ? String(e.message) : "Falha ao adicionar item");
      } finally {
        setBusy(false);
      }
    },
    [busy, card, pointId, refreshCard]
  );

  const handleManualBarcode = useCallback(async () => {
    const value = manualBarcode.trim();
    if (!value) return;
    await handleDetectedBarcode(value);
    setManualBarcode("");
  }, [handleDetectedBarcode, manualBarcode]);

  const total = useMemo(() => items.reduce((acc, it) => acc + (it.precoTotal || 0), 0), [items]);

  const handleCadastrarRosto = useCallback(
    async (embedding: number[]) => {
      if (!atleta) return;
      setBusy(true);
      setError(null);
      try {
        await kioskCadastrarFaceAtleta({
          pointId,
          atletaId: atleta.id,
          embedding,
          modelVersion: FACE_MODEL_VERSION,
        });
        setFaceSaved(true);
      } catch (e: any) {
        setFaceSaved(false);
        setError(e?.message ? String(e.message) : "Falha ao cadastrar rosto");
      } finally {
        setBusy(false);
      }
    },
    [atleta, pointId]
  );

  return (
    <div className="kiosk">
      <div className="kiosk__top">
        <div className="kiosk__brand">Autoatendimento</div>
        <div className="kiosk__actions">
          {step !== "idle" ? (
            <button className="btn btn--ghost" onClick={reset} disabled={busy}>
              Sair
            </button>
          ) : null}
        </div>
      </div>

      <div className="kiosk__card">
        {error ? <div className="alert alert--error">{error}</div> : null}

        {step === "idle" ? (
          <div className="stack">
            <h1 className="title">Bem-vindo</h1>
            <p className="muted">Para começar, identifique o atleta.</p>
            <button className="btn" onClick={startPhoneFlow} disabled={busy || !pointId}>
              Identificar por telefone
            </button>
            <button className="btn btn--ghost" onClick={startFaceFlow} disabled={busy || !pointId}>
              Identificar por rosto
            </button>
          </div>
        ) : null}

        {step === "phone" ? (
          <div className="stack">
            <h2 className="subtitle">Identificar atleta</h2>
            <label className="label">
              Telefone
              <input
                className="input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(00) 00000-0000"
                inputMode="tel"
              />
            </label>
            <button
              className="btn"
              onClick={handleBuscarPorTelefone}
              disabled={busy || normalizePhone(phone).length < 10 || !pointId}
            >
              {busy ? "Buscando..." : "Continuar"}
            </button>
          </div>
        ) : null}

        {step === "face" ? (
          <div className="stack">
            <div className="row row--space">
              <h2 className="subtitle">Reconhecimento facial</h2>
              <button className="btn btn--ghost" onClick={startPhoneFlow} disabled={busy}>
                Usar telefone
              </button>
            </div>
            <div className="muted">Posicione o rosto na câmera e toque em Reconhecer.</div>
            <FaceIdentify onEmbedding={handleFaceEmbedding} disabled={busy} />
          </div>
        ) : null}

        {step === "pick" ? (
          <div className="stack">
            <div className="row row--space">
              <h2 className="subtitle">Selecione seu perfil</h2>
              <button className="btn btn--ghost" onClick={startFaceFlow} disabled={busy}>
                Tentar novamente
              </button>
            </div>
            <div className="list">
              {candidatos.map((c) => (
                <button
                  key={c.id}
                  className="btn btn--ghost"
                  onClick={() => handleSelecionarCandidato({ id: c.id, nome: c.nome, telefone: c.telefone })}
                  disabled={busy}
                >
                  {c.nome} ({Math.round(c.score * 100)}%)
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {step === "comanda" && atleta && card ? (
          <div className="stack">
            <div className="row row--space">
              <div>
                <div className="subtitle">{atleta.nome}</div>
                <div className="muted">Comanda #{card.numeroCard}</div>
              </div>
              <div className="total">{formatMoney(total)}</div>
            </div>

            <div className="stack">
              <div className="muted">Criar/atualizar reconhecimento facial</div>
              <FaceIdentify onEmbedding={handleCadastrarRosto} disabled={busy} />
              {faceSaved ? <div className="alert alert--success">Reconhecimento facial salvo.</div> : null}
            </div>

            <div className="list">
              {items.length === 0 ? (
                <div className="muted">Nenhum item lançado ainda.</div>
              ) : (
                items.map((it) => (
                  <div className="list__item" key={it.id}>
                    <div className="list__left">
                      <div className="item__name">{it.produto?.nome ?? "Produto não cadastrado"}</div>
                      <div className="muted">
                        {it.quantidade} x {formatMoney(it.precoUnitario)}
                      </div>
                      {!it.produto?.nome ? <div className="muted selectable">Código de barras: {it.produtoId}</div> : null}
                    </div>
                    <div className="item__price">{formatMoney(it.precoTotal)}</div>
                  </div>
                ))
              )}
            </div>

            <button className="btn" onClick={() => setStep("scan")} disabled={busy}>
              Ler código de barras
            </button>
          </div>
        ) : null}

        {step === "scan" && atleta && card ? (
          <div className="stack">
            <div className="row row--space">
              <div>
                <div className="subtitle">{atleta.nome}</div>
                <div className="muted">Comanda #{card.numeroCard}</div>
              </div>
              <button className="btn btn--ghost" onClick={() => setStep("comanda")} disabled={busy}>
                Voltar
              </button>
            </div>

            <BarcodeScanner onDetected={handleDetectedBarcode} paused={busy} />

            <div className="row">
              <input
                className="input"
                value={manualBarcode}
                onChange={(e) => setManualBarcode(e.target.value)}
                placeholder="Digite o código (fallback)"
                inputMode="numeric"
              />
              <button className="btn" onClick={handleManualBarcode} disabled={busy || manualBarcode.trim().length === 0}>
                Adicionar
              </button>
            </div>

            <div className="muted">
              Ao ler, o item é lançado automaticamente (quantidade 1). Para repetir, leia novamente.
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
