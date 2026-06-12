// PDF 図面のクライアント側レンダリング (pdfjs-dist)
// 1 ページ目を高解像度 (長辺 maxSize px) で canvas に描画し、PNG Blob を返す。
// 返した Blob はそのまま compressFloorImage に渡せる。
// pdfjs 本体はサイズが大きいので動的 import で遅延読み込みする。

export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name ?? '');
}

/**
 * PDF の 1 ページ目を画像化する。
 */
export async function renderPdfFirstPage(
  file: File,
  maxSize = 2000
): Promise<{ blob: Blob; numPages: number }> {
  const [pdfjs, workerMod] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerMod.default;

  const data = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data }).promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.max(1, maxSize / Math.max(base.width, base.height));
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d')!;
    // 図面は白背景前提 (透過対策)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, canvas, viewport }).promise;

    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('PDF の画像化に失敗しました'))),
        'image/png'
      )
    );
    return { blob, numPages: doc.numPages };
  } finally {
    // pdfjs-dist v6 の型定義に destroy が無いが、実体には存在しうるため optional call で呼ぶ
    (doc as unknown as { destroy?: () => void }).destroy?.();
  }
}
