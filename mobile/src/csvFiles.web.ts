export async function pickCsv(): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.csv,text/csv';
    input.style.display = 'none';
    input.setAttribute('aria-label', '选择 CSV 账单');
    document.body.appendChild(input);
    const cleanup = () => { input.remove(); };
    input.addEventListener('cancel', () => { cleanup(); resolve(null); }, { once: true });
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      cleanup();
      if (!file) { resolve(null); return; }
      if (!file.name.toLowerCase().endsWith('.csv')) { reject(new Error('请选择 .csv 文件')); return; }
      if (file.size > 2_000_000) { reject(new Error('文件不能超过 2 MB')); return; }
      void file.text().then(text => resolve({ name: file.name, text }), reject);
    }, { once: true });
    input.click();
  });
}

export async function saveCsv(name: string, content: string): Promise<void> {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = name;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
