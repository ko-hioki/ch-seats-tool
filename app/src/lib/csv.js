// CSV / TSV パーサ (スプレッドシートからの貼り付けに対応)
// タブが含まれていれば TSV、それ以外は CSV として解釈する。

function parseDelimited(text, delimiter) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // 完全に空の行を除去
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

/**
 * @param {string} text
 * @returns {string[][]}
 */
export function parseTable(text) {
  const delimiter = text.includes('\t') ? '\t' : ',';
  return parseDelimited(text, delimiter);
}

/**
 * ヘッダー行から各列のマッピング先フィールドを推定する。
 * @param {string[]} header
 * @returns {string[]} 各列の推定フィールド ('' は不明)
 */
export function guessMapping(header) {
  return header.map((h) => {
    const t = (h || '').toLowerCase();
    if (/本名|氏名|名前|name/.test(t)) return 'name';
    if (/あだ名|ニックネーム|表示名|nickname/.test(t)) return 'nickname';
    if (/部署|チーム|所属|department|team/.test(t)) return 'department';
    if (/slack/.test(t)) return 'slackUserId';
    if (/メモ|備考|note/.test(t)) return 'note';
    return '';
  });
}
