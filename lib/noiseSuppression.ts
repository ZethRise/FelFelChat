/** Noise suppression disabled — stub exports. */
export async function applyNoiseSuppression(stream: MediaStream): Promise<MediaStream> {
  return stream;
}

export function cleanupNoiseSuppression(): void {
  /* no-op */
}
