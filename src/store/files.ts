/**
 * Reading files in and handing files out.
 *
 * Phase 1 sharing is file-based on purpose (no accounts, no server), so this is
 * the seam where a .margins bundle leaves the device. Web and native diverge
 * completely here: expo-sharing does not exist in a browser, and a browser
 * cannot write to a document directory, so each path is handled explicitly
 * rather than papered over.
 */
import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';

export interface PickedFile {
  name: string;
  contents: string;
}

/**
 * Prompts for a file and returns its text, or null if the user cancelled.
 * Accepts anything: the pickers on both platforms are unreliable about MIME
 * types for uncommon extensions like .margins, and rejecting a file the user
 * deliberately chose is worse than reading it and failing to parse.
 */
export async function pickTextFile(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || result.assets.length === 0) return null;

  const asset = result.assets[0];

  // On web the picker hands back a real File object; there is no path to read.
  if (asset.file) {
    return { name: asset.name, contents: await asset.file.text() };
  }

  const file = new File(asset.uri);
  return { name: asset.name, contents: await file.text() };
}

/**
 * Hands a generated file to the user: the share sheet on native, a download in
 * the browser.
 */
export async function exportTextFile(
  filename: string,
  contents: string,
  mimeType = 'application/json'
): Promise<{ ok: boolean; message?: string }> {
  if (Platform.OS === 'web') {
    try {
      const blob = new Blob([contents], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      // Revoking immediately can cancel the download in some browsers.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      return { ok: true };
    } catch {
      return { ok: false, message: 'Your browser blocked the download.' };
    }
  }

  try {
    const file = new File(Paths.cache, filename);
    if (file.exists) file.delete();
    file.create();
    file.write(contents);

    if (!(await Sharing.isAvailableAsync())) {
      return { ok: false, message: `Saved to ${file.uri}, but sharing is unavailable here.` };
    }
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: filename });
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not share the file.' };
  }
}
