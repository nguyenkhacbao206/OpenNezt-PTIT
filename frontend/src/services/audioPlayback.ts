/**
 * audioPlayback — phát clip base64 nhận từ `tts.audio`, theo HÀNG ĐỢI TUẦN TỰ.
 *
 * Khi cắt nhiều segment, backend gửi nhiều `tts.audio`; phát ngay lập tức sẽ
 * CHỒNG tiếng. Nên xếp hàng và phát lần lượt (clip xong mới clip kế) — giống
 * reference client (backend/static/index.html · enqueueAudio/playNext).
 *
 * Backend edge-tts trả **MP3**; mock trả **WAV** (nhận diện qua header base64).
 */
import { createAudioPlayer } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';

const queue: string[] = [];
let busy = false;
let seq = 0;

/** Xếp một clip base64 vào hàng đợi; tự phát nếu đang rảnh. */
export function playBase64Audio(base64: string): void {
  if (!base64) return;
  queue.push(base64);
  if (!busy) void playNext();
}

async function playNext(): Promise<void> {
  const base64 = queue.shift();
  if (!base64) {
    busy = false;
    return;
  }
  busy = true;

  let player: ReturnType<typeof createAudioPlayer> | null = null;
  const advance = () => {
    try {
      player?.remove();
    } catch {
      /* noop */
    }
    player = null;
    void playNext(); // sang clip kế
  };

  try {
    const ext = base64.startsWith('UklGR') ? 'wav' : 'mp3';
    const path = `${FileSystem.cacheDirectory}tts-${(seq += 1)}.${ext}`;
    await FileSystem.writeAsStringAsync(path, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    player = createAudioPlayer(path);
    let done = false;
    const finishOnce = () => {
      if (done) return;
      done = true;
      advance();
    };
    player.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish) finishOnce();
    });
    // Chốt an toàn: nếu vì lý do gì không nhận được didJustFinish.
    setTimeout(finishOnce, 30000);
    player.play();
  } catch {
    advance(); // clip lỗi → bỏ qua, phát clip kế
  }
}
