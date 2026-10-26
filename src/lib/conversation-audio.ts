export type ConversationSound = 'send' | 'receive';
type AudioVoice = { play(kind: ConversationSound): void; unlock(): void; stop(): void; destroy(): void };

/** Foreground, opt-in feedback. No delayed/replayed alerts after mute or return. */
export function createConversationAudio(options: {
  enabled: () => boolean; visible: () => boolean; createVoice?: () => AudioVoice; now?: () => number;
}) {
  let voice: AudioVoice | undefined, disposed = false;
  const last = new Map<ConversationSound, number>();
  const allowed = () => !disposed && options.enabled() && options.visible();
  function unlock() {
    if (!allowed()) return;
    try { voice ??= (options.createVoice ?? createPlatformVoice)(); voice.unlock(); } catch { /* Audio is optional. */ }
  }
  function play(kind: ConversationSound) {
    if (!allowed() || !voice) return;
    const now = (options.now ?? Date.now)();
    if (now - (last.get(kind) ?? -Infinity) < 400) return;
    last.set(kind, now);
    try { voice.play(kind); } catch { /* Never interrupt messaging or queue audio for later. */ }
  }
  function stop() { last.clear(); try { voice?.stop(); } catch { /* Optional media. */ } }
  function destroy() { disposed = true; stop(); try { voice?.destroy(); } catch { /* Optional media. */ } voice = undefined; }
  return { unlock, play, stop, destroy };
}

function createPlatformVoice(): AudioVoice {
  // #ifdef H5
  const AudioCtor = typeof window !== 'undefined'
    ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
  if (AudioCtor) {
    const context = new AudioCtor();
    const nodes = new Set<OscillatorNode>();
    let destroyed = false;
    const stop = () => { for (const node of nodes) { try { node.stop(); } catch { /* Already ended. */ } } nodes.clear(); };
    return {
      unlock() { if (!destroyed && context.state === 'suspended') void context.resume().catch(() => undefined); },
      play(kind) {
        if (destroyed || context.state !== 'running') return;
        stop();
        const start = context.currentTime;
        const notes = kind === 'send' ? [[0, 660, .07], [.045, 990, .09]] : [[0, 784, .09], [.07, 622, .12]];
        for (const [offset, frequency, length] of notes) {
          const oscillator = context.createOscillator(), gain = context.createGain();
          oscillator.type = 'sine'; oscillator.frequency.value = frequency;
          gain.gain.setValueAtTime(0, start + offset);
          gain.gain.linearRampToValueAtTime(.07, start + offset + .008);
          gain.gain.exponentialRampToValueAtTime(.0001, start + offset + length);
          oscillator.connect(gain); gain.connect(context.destination); nodes.add(oscillator);
          oscillator.onended = () => { nodes.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
          oscillator.start(start + offset); oscillator.stop(start + offset + length + .01);
        }
      },
      stop,
      destroy() { destroyed = true; stop(); void context.close().catch(() => undefined); },
    };
  }
  // #endif
  // Native uses bundled WAVs and respects the device silent switch.
  const player = uni.createInnerAudioContext();
  player.autoplay = false; player.loop = false; player.obeyMuteSwitch = true; player.volume = .55;
  player.onError(() => { /* Playback denial is silent; never alter message state. */ });
  return {
    unlock() {},
    play(kind) { player.stop(); player.src = `/static/audio/chat-${kind}.wav`; player.play(); },
    stop() { player.stop(); },
    destroy() { player.destroy(); },
  };
}
