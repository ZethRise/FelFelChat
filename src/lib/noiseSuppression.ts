/**
 * Real-time noise suppression using RNNoise (via @sapphi-red/web-noise-suppressor).
 * Returns a new MediaStream with noise suppression applied.
 */

let audioContext: AudioContext | null = null;
let wasmBinary: ArrayBuffer | null = null;
let workletReady = false;

async function ensureSetup(): Promise<{ ctx: AudioContext; wasm: ArrayBuffer }> {
  if (!audioContext) {
    audioContext = new AudioContext({ sampleRate: 48000 });
  }

  if (!wasmBinary) {
    // Detect SIMD support
    const hasSimd = typeof WebAssembly !== 'undefined' && 'SIMD' in WebAssembly;
    const wasmUrl = hasSimd
      ? '/noise-suppress/rnnoise_simd.wasm'
      : '/noise-suppress/rnnoise.wasm';
    const res = await fetch(wasmUrl);
    if (!res.ok) throw new Error(`Failed to load RNNoise WASM from ${wasmUrl}`);
    wasmBinary = await res.arrayBuffer();
  }

  if (!workletReady) {
    await audioContext.audioWorklet.addModule('/noise-suppress/workletProcessor.js');
    workletReady = true;
  }

  return { ctx: audioContext, wasm: wasmBinary };
}

/**
 * Wraps a raw audio MediaStream through RNNoise noise suppression.
 * Returns a new MediaStream with the processed audio.
 */
export async function applyNoiseSuppression(
  rawStream: MediaStream,
): Promise<MediaStream> {
  const { ctx, wasm } = await ensureSetup();

  const { RnnoiseWorkletNode } = await import('@sapphi-red/web-noise-suppressor');

  const source = ctx.createMediaStreamSource(rawStream);
  const rnnoise = new RnnoiseWorkletNode(ctx, {
    maxChannels: 1,
    wasmBinary: wasm,
  });
  const destination = ctx.createMediaStreamDestination();

  source.connect(rnnoise);
  rnnoise.connect(destination);

  return destination.stream;
}

/**
 * Cleans up the shared AudioContext (call on logout / page unload).
 */
export function cleanupNoiseSuppression(): void {
  if (audioContext && audioContext.state !== 'closed') {
    audioContext.close().catch(() => {});
  }
  audioContext = null;
  workletReady = false;
}
