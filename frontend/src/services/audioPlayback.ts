/**
 * audioPlayback — phát clip base64 nhận từ `tts.audio`.
 *
 * Backend edge-tts trả **MP3**; mock trả **WAV**. Nhận diện qua header base64
 * ("UklGR" = "RIFF" → WAV, còn lại coi là MP3), ghi ra cache rồi phát bằng
 * expo-audio (player cần nguồn là file/URI).
 */
import { createAudioPlayer } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';

export async function playBase64Audio(base64: string): Promise<void> {
  if (!base64) return;
  const ext = base64.startsWith('UklGR') ? 'wav' : 'mp3';
  const path = `${FileSystem.cacheDirectory}tts-${Date.now()}.${ext}`;
  await FileSystem.writeAsStringAsync(path, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const player = createAudioPlayer(path);
  player.play();
  // Giải phóng sau khi clip có lẽ đã phát xong (tránh rò bộ nhớ).
  setTimeout(() => {
    try {
      player.remove();
    } catch {
      /* noop */
    }
  }, 30000);
}
