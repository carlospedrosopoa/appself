import { apiFetch } from "./http";

export type KioskAtleta = {
  id: string;
  nome: string;
  telefone?: string | null;
};

export type KioskCard = {
  id: string;
  pointId: string;
  numeroCard: number;
  status: string;
  valorTotal: number;
};

export type KioskItem = {
  id: string;
  produtoId: string;
  quantidade: number;
  precoUnitario: number;
  precoTotal: number;
  produto?: {
    id: string;
    nome: string;
    precoVenda: number;
  } | null;
};

export async function kioskBuscarAtletaPorTelefone(input: {
  pointId: string;
  telefone: string;
}) {
  return await apiFetch<{ atleta: KioskAtleta }>(`/api/kiosk/atleta/por-telefone`, {
    method: "POST",
    json: input,
  });
}

export async function kioskReconhecerAtleta(input: {
  pointId: string;
  embedding: number[];
  topK?: number;
  threshold?: number;
  modelVersion?: string;
}) {
  return await apiFetch<{ candidatos: Array<KioskAtleta & { score: number }> }>(`/api/kiosk/atleta/reconhecer`, {
    method: "POST",
    json: input,
  });
}

export async function kioskObterOuCriarComanda(input: {
  pointId: string;
  atletaId: string;
}) {
  return await apiFetch<{ card: KioskCard }>(`/api/kiosk/comanda/obter-ou-criar`, {
    method: "POST",
    json: input,
  });
}

export async function kioskGetComanda(input: { pointId: string; cardId: string }) {
  const { pointId, cardId } = input;
  return await apiFetch<{ card: KioskCard; itens: KioskItem[] }>(
    `/api/kiosk/comanda/${encodeURIComponent(cardId)}?pointId=${encodeURIComponent(pointId)}&incluirItens=true`,
    { method: "GET" }
  );
}

export async function kioskAdicionarItem(input: {
  pointId: string;
  cardId: string;
  barcode: string;
  quantidade: number;
}) {
  const { pointId, cardId, ...body } = input;
  return await apiFetch<{ item: KioskItem; cardValorTotal: number }>(
    `/api/kiosk/comanda/${encodeURIComponent(cardId)}/adicionar-item?pointId=${encodeURIComponent(pointId)}`,
    {
      method: "POST",
      json: body,
    }
  );
}
