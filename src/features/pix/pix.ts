function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function tlv(id: string, value: string) {
  const len = value.length;
  return `${id}${pad2(len)}${value}`;
}

function sanitizeMerchantName(name: string) {
  const cleaned = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s\-\.]/g, "")
    .trim();
  return cleaned.slice(0, 25) || "PAGAMENTO";
}

function sanitizeMerchantCity(city: string) {
  const cleaned = city
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s\-\.]/g, "")
    .trim();
  return cleaned.slice(0, 15) || "BRASIL";
}

function formatAmountBRL(amount: number) {
  const value = Math.max(0, Number(amount || 0));
  return value.toFixed(2);
}

function crc16Ccitt(payload: string) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function buildPixPayload(input: {
  chave: string;
  valor: number;
  nomeRecebedor: string;
  cidadeRecebedor: string;
  txid: string;
}) {
  const merchantAccountInfo = tlv(
    "26",
    tlv("00", "br.gov.bcb.pix") + tlv("01", input.chave)
  );

  const txid = (input.txid || "***").slice(0, 25);
  const additionalData = tlv("62", tlv("05", txid));

  const payloadNoCrc =
    tlv("00", "01") +
    tlv("01", "11") +
    merchantAccountInfo +
    tlv("52", "0000") +
    tlv("53", "986") +
    tlv("54", formatAmountBRL(input.valor)) +
    tlv("58", "BR") +
    tlv("59", sanitizeMerchantName(input.nomeRecebedor)) +
    tlv("60", sanitizeMerchantCity(input.cidadeRecebedor)) +
    additionalData +
    "6304";

  const crc = crc16Ccitt(payloadNoCrc);
  return payloadNoCrc + crc;
}

