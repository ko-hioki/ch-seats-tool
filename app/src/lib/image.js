// 画像の自動縮小・圧縮 (dataURL 化)

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('画像の読み込みに失敗しました'));
    };
    img.src = url;
  });
}

function dataUrlBytes(dataUrl) {
  const base64 = dataUrl.split(',')[1] ?? '';
  return Math.floor(base64.length * 0.75);
}

/**
 * フロア図面用: 長辺 maxSize px に縮小し、targetBytes 以下になるよう
 * JPEG 品質を段階的に下げて圧縮する。
 * @returns {Promise<{dataUrl: string, width: number, height: number}>}
 */
export async function compressFloorImage(file, maxSize = 2000, targetBytes = 500 * 1024) {
  const img = await loadImageFromFile(file);
  let { width, height } = img;
  const scale = Math.min(1, maxSize / Math.max(width, height));
  width = Math.round(width * scale);
  height = Math.round(height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  // 図面は白背景前提 (透過 PNG 対策)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  let dataUrl = '';
  for (const quality of [0.85, 0.75, 0.6, 0.45, 0.3]) {
    dataUrl = canvas.toDataURL('image/jpeg', quality);
    if (dataUrlBytes(dataUrl) <= targetBytes) break;
  }
  return { dataUrl, width, height };
}

/**
 * メンバーアイコン用: 正方形にクロップして縮小。
 * @returns {Promise<string>} dataURL
 */
export async function compressIconImage(file, size = 96) {
  const img = await loadImageFromFile(file);
  const minSide = Math.min(img.width, img.height);
  const sx = (img.width - minSide) / 2;
  const sy = (img.height - minSide) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
  return canvas.toDataURL('image/jpeg', 0.8);
}
