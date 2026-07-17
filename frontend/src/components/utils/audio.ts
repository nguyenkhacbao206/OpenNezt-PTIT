/**
 * Tiện ích âm thanh thuần (pure) — không đụng Web Audio API hay side-effect.
 *
 * Việc thu mic / giải mã / resample (cần AudioContext) nằm trong hook
 * `useMic`; ở đây chỉ có hai hàm thuần: đóng gói WAV và mã hoá base64.
 */

/**
 * Đóng gói mảng mẫu float32 [-1, 1] thành WAV PCM 16-bit mono.
 *
 * @param samples Mẫu âm thanh mono, giá trị trong [-1, 1].
 * @param sampleRate Tần số lấy mẫu (Hz), thường 16000 cho Whisper.
 * @returns ArrayBuffer chứa đúng một file WAV hợp lệ.
 */
export function encodeWavPcm16(
  samples: Float32Array,
  sampleRate: number,
): ArrayBuffer {
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample; // mono
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i += 1) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };

  // RIFF header
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  // fmt chunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // audio format = PCM
  view.setUint16(22, 1, true); // channels = mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample
  // data chunk
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i] ?? 0));
    // -1..1 -> -32768..32767
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += bytesPerSample;
  }
  return buffer;
}

/** Mã hoá ArrayBuffer thành chuỗi base64 (chunk nhỏ để tránh tràn stack). */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}
