import QRCode from "qrcode";

export type QrCardOptions = {
  tipUrl: string;
  guardName: string;
  merchantName?: string | null;
  subtitle?: string;
  logoUrl?: string | null;
};

/** Renders a print-friendly branded QR card as PNG data URL. */
export async function renderQrPrintCard(opts: QrCardOptions): Promise<string> {
  const width = 600;
  const height = 840;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    console.error("[TipGuard:qr] Canvas not supported");
    return "";
  }

  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, "#0f172a");
  grad.addColorStop(1, "#1e293b");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(251, 191, 36, 0.35)";
  ctx.lineWidth = 3;
  ctx.strokeRect(24, 24, width - 48, height - 48);

  ctx.fillStyle = "#fbbf24";
  ctx.font = "bold 28px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("TipGuard SA", width / 2, 72);

  ctx.fillStyle = "#f8fafc";
  ctx.font = "bold 36px system-ui, sans-serif";
  const guardLine = opts.guardName.slice(0, 40);
  ctx.fillText(guardLine, width / 2, 130);

  if (opts.merchantName) {
    ctx.fillStyle = "#94a3b8";
    ctx.font = "18px system-ui, sans-serif";
    ctx.fillText(opts.merchantName.slice(0, 48), width / 2, 168);
  }

  const qrSize = 320;
  const qrData = await QRCode.toDataURL(opts.tipUrl, {
    width: qrSize,
    margin: 2,
    color: { dark: "#0f172a", light: "#ffffff" },
  });

  if (opts.logoUrl) {
    try {
      const logo = await loadImage(opts.logoUrl);
      const ls = 56;
      ctx.save();
      ctx.beginPath();
      ctx.arc(width / 2, 220, ls / 2 + 4, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.drawImage(logo, width / 2 - ls / 2, 220 - ls / 2, ls, ls);
      ctx.restore();
    } catch {
      /* optional logo */
    }
  }

  const qrImg = await loadImage(qrData);
  const qrX = (width - qrSize) / 2;
  const qrY = opts.merchantName ? 200 : 180;
  ctx.fillStyle = "#fff";
  ctx.fillRect(qrX - 12, qrY - 12, qrSize + 24, qrSize + 24);
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "16px system-ui, sans-serif";
  ctx.fillText(opts.subtitle ?? "Scan to tip securely · ZAR", width / 2, qrY + qrSize + 48);

  ctx.fillStyle = "#64748b";
  ctx.font = "12px monospace";
  const shortUrl = opts.tipUrl.replace(/^https?:\/\//, "").slice(0, 42);
  ctx.fillText(shortUrl, width / 2, height - 56);

  return canvas.toDataURL("image/png");
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}
