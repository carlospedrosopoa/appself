import { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";
import {
  kioskAdicionarItem,
  kioskBuscarAtletaPorTelefone,
  kioskCadastrarFaceAtleta,
  kioskGetComanda,
  kioskGetComandaPorNumero,
  kioskGetPoint,
  kioskListarProdutos,
  kioskObterOuCriarComanda,
  kioskReconhecerAtleta,
  type KioskAtleta,
  type KioskCard,
  type KioskItem,
  type KioskPoint,
  type KioskProduto,
} from "./api/kiosk";
import { BarcodeScanner } from "./components/BarcodeScanner";
import { FaceIdentify } from "./components/FaceIdentify";
import { buildPixPayload } from "./features/pix/pix";
import QRCode from "qrcode";

type Step = "idle" | "phone" | "face" | "comanda" | "scan" | "products";

const POINT_ID = import.meta.env.VITE_POINT_ID as string | undefined;
const FACE_MODEL_VERSION = "mediapipe-image-embedder-v1";
const PIX_CIDADE = "PORTO ALEGRE";

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
  const [numeroComanda, setNumeroComanda] = useState("");
  const [manualBarcode, setManualBarcode] = useState("");
  const [point, setPoint] = useState<KioskPoint | null>(null);
  const [atleta, setAtleta] = useState<KioskAtleta | null>(null);
  const [card, setCard] = useState<KioskCard | null>(null);
  const [items, setItems] = useState<KioskItem[]>([]);
  const [faceSaved, setFaceSaved] = useState(false);
  const [showFaceEnroll, setShowFaceEnroll] = useState(false);
  const [showPix, setShowPix] = useState(false);
  const [pixQrDataUrl, setPixQrDataUrl] = useState<string | null>(null);
  const [produtosRapidos, setProdutosRapidos] = useState<KioskProduto[]>([]);
  const [produtos, setProdutos] = useState<KioskProduto[]>([]);
  const [loadingProdutos, setLoadingProdutos] = useState(false);

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
    setStep("face");
  }, []);

  const startComandaFlow = useCallback(() => {
    setError(null);
    setStep("comanda");
  }, []);

  const reset = useCallback(() => {
    setStep("idle");
    setBusy(false);
    setError(null);
    setPhone("");
    setNumeroComanda("");
    setManualBarcode("");
    setAtleta(null);
    setCard(null);
    setItems([]);
    setFaceSaved(false);
    setShowFaceEnroll(false);
    setShowPix(false);
    setPixQrDataUrl(null);
    setProdutosRapidos([]);
    setProdutos([]);
    setLoadingProdutos(false);
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

  useEffect(() => {
    if (!pointId) return;
    let cancelled = false;
    kioskGetPoint(pointId)
      .then((p) => {
        if (cancelled) return;
        setPoint(p);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
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
      setShowFaceEnroll(false);
      setStep("comanda");
    } catch (e: any) {
      setError(e?.message ? String(e.message) : "Falha ao buscar atleta");
    } finally {
      setBusy(false);
    }
  }, [phone, pointId, refreshCard]);

  const handleBuscarPorNumeroComanda = useCallback(async () => {
    const numero = Number(String(numeroComanda || "").trim());
    if (!Number.isFinite(numero) || numero <= 0) return;
    setError(null);
    setBusy(true);
    try {
      const res = await kioskGetComandaPorNumero({ pointId, numeroCard: numero });
      setAtleta(res.atleta);
      setCard(res.card);
      setItems(res.itens);
      setFaceSaved(false);
      setShowFaceEnroll(false);
      setManualBarcode("");
      setStep("comanda");
    } catch (e: any) {
      setError(e?.message ? String(e.message) : "Falha ao abrir comanda");
    } finally {
      setBusy(false);
    }
  }, [numeroComanda, pointId]);

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
        const a = res.candidatos[0];
        setAtleta({ id: a.id, nome: a.nome, telefone: a.telefone });
        const opened = await kioskObterOuCriarComanda({ pointId, atletaId: a.id });
        setCard(opened.card);
        await refreshCard(opened.card.id);
        setFaceSaved(false);
        setShowFaceEnroll(false);
        setStep("comanda");
      } catch (e: any) {
        setError(e?.message ? String(e.message) : "Falha ao reconhecer atleta");
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
        const msg = e?.message ? String(e.message) : "Falha ao adicionar item";
        const m = msg.toLowerCase();
        if (
          m.includes("produto não encontrado") ||
          m.includes("produto nao encontrado") ||
          m.includes("produto não disponível no autoatendimento") ||
          m.includes("produto nao disponivel no autoatendimento")
        ) {
          setError(`Produto não encontrado (código: ${value})`);
        } else {
          setError(msg);
        }
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
  const pixPayload = useMemo(() => {
    if (!card) return null;
    const chave = point?.pixChave ? String(point.pixChave).trim() : "";
    if (!chave) return null;
    return buildPixPayload({
      chave,
      valor: total,
      nomeRecebedor: point?.nome || "Carlão BT Online",
      cidadeRecebedor: PIX_CIDADE,
      txid: `CARD${card.numeroCard}`,
    });
  }, [card, point?.nome, point?.pixChave, total]);

  useEffect(() => {
    if (!showPix || !pixPayload) {
      setPixQrDataUrl(null);
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(pixPayload, { margin: 1, width: 320, errorCorrectionLevel: "M" })
      .then((url: string) => {
        if (cancelled) return;
        setPixQrDataUrl(url);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [pixPayload, showPix]);

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
        setShowFaceEnroll(false);
      } catch (e: any) {
        setFaceSaved(false);
        setError(e?.message ? String(e.message) : "Falha ao cadastrar rosto");
      } finally {
        setBusy(false);
      }
    },
    [atleta, pointId]
  );

  useEffect(() => {
    if (step !== "products") return;
    if (!pointId) return;
    if (!card) return;
    let cancelled = false;
    setLoadingProdutos(true);
    kioskListarProdutos({ pointId })
      .then((res) => {
        if (cancelled) return;
        setProdutosRapidos(res.rapidos || []);
        setProdutos(res.produtos || []);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setError(e?.message ? String(e.message) : "Falha ao listar produtos");
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingProdutos(false);
      });
    return () => {
      cancelled = true;
    };
  }, [card, pointId, step]);

  const handleAdicionarProduto = useCallback(
    async (produtoId: string) => {
      if (!card) return;
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        await kioskAdicionarItem({ pointId, cardId: card.id, produtoId, quantidade: 1 });
        await refreshCard(card.id);
        setStep("comanda");
      } catch (e: any) {
        setError(e?.message ? String(e.message) : "Falha ao adicionar item");
      } finally {
        setBusy(false);
      }
    },
    [busy, card, pointId, refreshCard]
  );

  return (
    <div className="kiosk">
      <div className="kiosk__top">
        <div className="kiosk__brand">
          <div className="kiosk__brandLeft">
            {point?.logoUrl ? <img className="kiosk__logo" src={point.logoUrl} alt={point.nome} /> : null}
            <div className="kiosk__brandText">
              <div className="kiosk__brandTitle">{point?.nome || "Autoatendimento"}</div>
              <div className="kiosk__brandBadge">Autoatendimento</div>
            </div>
          </div>
        </div>
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
            <div className="welcome">
              {point?.logoUrl ? <img className="welcome__logo" src={point.logoUrl} alt={point.nome} /> : null}
              <h1 className="title">Bem-vindo</h1>
            </div>
            <p className="muted">Para começar, identifique o atleta.</p>
            <button className="btn" onClick={startPhoneFlow} disabled={busy || !pointId}>
              Identificar por telefone
            </button>
            <button className="btn btn--ghost" onClick={startFaceFlow} disabled={busy || !pointId}>
              Identificar por rosto
            </button>
            <div className="divider" />
            <div className="subtitle">Já tem o número da comanda?</div>
            <div className="row">
              <input
                className="input"
                value={numeroComanda}
                onChange={(e) => setNumeroComanda(e.target.value)}
                placeholder="Número da comanda"
                inputMode="numeric"
              />
              <button className="btn" onClick={handleBuscarPorNumeroComanda} disabled={busy || !pointId || String(numeroComanda).trim().length === 0}>
                Abrir
              </button>
            </div>
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
            <FaceIdentify onEmbedding={handleFaceEmbedding} disabled={busy} size="large" />
          </div>
        ) : null}

        {step === "comanda" && card ? (
          <div className="stack">
            <div className="row row--space">
              <div>
                {atleta ? <div className="subtitle">{atleta.nome}</div> : <div className="subtitle">Comanda</div>}
                <div className="muted">Comanda #{card.numeroCard}</div>
              </div>
              <div className="total">{formatMoney(total)}</div>
            </div>

            {atleta && atleta.id !== "avulso" && atleta.id !== "user" ? (
              <div className="stack">
                <div className="row row--space">
                  <div className="muted">Reconhecimento facial</div>
                  {showFaceEnroll ? (
                    <button className="btn btn--ghost" onClick={() => setShowFaceEnroll(false)} disabled={busy}>
                      Fechar câmera
                    </button>
                  ) : (
                    <button className="btn btn--ghost" onClick={() => setShowFaceEnroll(true)} disabled={busy}>
                      Criar/atualizar
                    </button>
                  )}
                </div>
                {showFaceEnroll ? <FaceIdentify onEmbedding={handleCadastrarRosto} disabled={busy} size="large" /> : null}
                {faceSaved ? <div className="alert alert--success">Reconhecimento facial salvo.</div> : null}
              </div>
            ) : null}

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

            <div className="row row--wrap">
              <button className="btn" onClick={() => setStep("products")} disabled={busy}>
                Adicionar item
              </button>
              <button className="btn btn--ghost" onClick={() => setStep("scan")} disabled={busy}>
                Ler código de barras
              </button>
              <button className="btn btn--ghost" onClick={() => setShowPix(true)} disabled={busy || total <= 0 || !point?.pixChave}>
                Gerar QRCode Pix
              </button>
            </div>
          </div>
        ) : null}

        {step === "scan" && card ? (
          <div className="stack">
            <div className="row row--space">
              <div>
                {atleta ? <div className="subtitle">{atleta.nome}</div> : <div className="subtitle">Comanda</div>}
                <div className="muted">Comanda #{card.numeroCard}</div>
              </div>
              <button className="btn btn--ghost" onClick={startComandaFlow} disabled={busy}>
                Voltar
              </button>
            </div>

            <BarcodeScanner onDetected={handleDetectedBarcode} paused={busy} variant="narrow" />

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

        {step === "products" && card ? (
          <div className="stack">
            <div className="row row--space">
              <div>
                <div className="subtitle">Adicionar item</div>
                <div className="muted">Comanda #{card.numeroCard}</div>
              </div>
              <button className="btn btn--ghost" onClick={startComandaFlow} disabled={busy}>
                Voltar
              </button>
            </div>

            {loadingProdutos ? <div className="muted">Carregando produtos…</div> : null}

            {!loadingProdutos && produtosRapidos.length > 0 ? (
              <div className="stack">
                <div className="subtitle">Acesso rápido</div>
                <div className="productGrid productGrid--quick">
                  {produtosRapidos.map((p) => (
                    <button key={p.id} className="productCard" onClick={() => handleAdicionarProduto(p.id)} disabled={busy}>
                      <div className="productCard__name">{p.nome}</div>
                      <div className="productCard__meta">
                        <span>{formatMoney(p.precoVenda)}</span>
                        {p.categoria ? <span className="productCard__pill">{p.categoria}</span> : null}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {!loadingProdutos && produtos.length > 0 ? (
              <div className="stack">
                <div className="subtitle">Produtos</div>
                <div className="productList">
                  {Object.entries(
                    produtos.reduce<Record<string, KioskProduto[]>>((acc, p) => {
                      const key = p.categoria ? String(p.categoria) : "Outros";
                      (acc[key] ||= []).push(p);
                      return acc;
                    }, {})
                  )
                    .sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
                    .map(([categoria, list]) => (
                      <div key={categoria} className="stack">
                        <div className="muted">{categoria}</div>
                        <div className="productGrid">
                          {list.map((p) => (
                            <button key={p.id} className="productCard" onClick={() => handleAdicionarProduto(p.id)} disabled={busy}>
                              <div className="productCard__name">{p.nome}</div>
                              <div className="productCard__meta">
                                <span>{formatMoney(p.precoVenda)}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ) : null}

            {!loadingProdutos && produtosRapidos.length === 0 && produtos.length === 0 ? (
              <div className="muted">Nenhum produto ativo encontrado.</div>
            ) : null}
          </div>
        ) : null}
      </div>

      {showPix && card && pixPayload ? (
        <div className="modalOverlay" role="dialog" aria-modal="true">
          <div className="modalCard">
            <div className="row row--space">
              <div>
                <div className="subtitle">Pix</div>
                <div className="muted">
                  Comanda #{card.numeroCard} • {formatMoney(total)}
                </div>
              </div>
              <button
                className="btn btn--ghost"
                onClick={() => {
                  setShowPix(false);
                  setPixQrDataUrl(null);
                }}
                disabled={busy}
              >
                Fechar
              </button>
            </div>

            <div className="pixBox">
              {pixQrDataUrl ? <img className="pixQr" src={pixQrDataUrl} alt="QRCode Pix" /> : <div className="muted">Gerando QRCode…</div>}
            </div>

            {pixPayload ? (
              <button
                className="btn"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(pixPayload);
                  } catch {
                  }
                }}
                disabled={!pixPayload}
              >
                Copiar código Pix
              </button>
            ) : null}

            {pixPayload ? <div className="muted selectable pixCode">{pixPayload}</div> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
