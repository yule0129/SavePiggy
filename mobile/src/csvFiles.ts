import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export async function pickCsv(): Promise<{ name: string; text: string } | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  if (result.canceled) return null;
  const asset = result.assets[0];
  const file = new File(asset.uri);
  try {
    if (!asset.name.toLowerCase().endsWith('.csv')) throw new Error('请选择 .csv 文件，暂不支持 Excel、ZIP 和截图');
    if ((asset.size ?? file.size) > 2_000_000) throw new Error('文件不能超过 2 MB');
    return { name: asset.name, text: await file.text() };
  } finally {
    // Only remove the copy made by DocumentPicker in this app's cache.
    if (file.uri.startsWith(Paths.cache.uri) && file.exists) file.delete();
  }
}

export async function saveCsv(name: string, content: string): Promise<void> {
  if (!await Sharing.isAvailableAsync()) throw new Error('当前设备不支持文件分享');
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  try {
    await file.write(content);
    await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: '保存 CSV 模板' });
  } finally { if (file.exists) file.delete(); }
}
