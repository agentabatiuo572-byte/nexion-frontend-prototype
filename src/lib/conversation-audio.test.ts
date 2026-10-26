import { afterEach, expect, it, vi } from 'vitest';
import { createConversationAudio } from './conversation-audio';
afterEach(() => vi.unstubAllGlobals());

function setup() {
  const state = { enabled: false, visible: true, now: 1000 };
  const voice = { unlock: vi.fn(), play: vi.fn(), stop: vi.fn(), destroy: vi.fn() };
  const createVoice = vi.fn(() => voice);
  const audio = createConversationAudio({ enabled: () => state.enabled, visible: () => state.visible, now: () => state.now, createVoice });
  return { state, voice, createVoice, audio };
}
it('requires both the saved preference and a foreground gesture before creating audio', () => {
  const h = setup(); h.audio.unlock(); h.audio.play('receive'); expect(h.createVoice).not.toHaveBeenCalled();
  h.state.enabled = true; h.audio.play('receive'); expect(h.voice.play).not.toHaveBeenCalled();
  h.audio.unlock(); h.audio.play('send'); expect(h.voice.play).toHaveBeenCalledExactlyOnceWith('send');
});
it('coalesces a burst without replaying missed messages after mute, hide, or destroy', () => {
  const h = setup(); h.state.enabled = true; h.audio.unlock();
  h.audio.play('receive'); h.audio.play('receive'); expect(h.voice.play).toHaveBeenCalledTimes(1);
  h.state.now += 500; h.state.visible = false; h.audio.stop(); h.audio.play('send');
  h.state.visible = true; expect(h.voice.play).toHaveBeenCalledTimes(1);
  h.state.enabled = false; h.audio.play('receive'); expect(h.voice.play).toHaveBeenCalledTimes(1);
  h.audio.destroy(); h.state.enabled = true; h.audio.unlock(); h.audio.play('send');
  expect(h.voice.destroy).toHaveBeenCalledOnce(); expect(h.createVoice).toHaveBeenCalledOnce();
});
it('never propagates unavailable audio or play errors into messaging', () => {
  const h = setup(); h.state.enabled = true; h.audio.unlock(); h.voice.play.mockImplementation(() => { throw new Error('blocked'); });
  expect(() => h.audio.play('send')).not.toThrow();
  const unavailable = createConversationAudio({ enabled: () => true, visible: () => true, createVoice() { throw new Error('no audio'); } });
  expect(() => unavailable.unlock()).not.toThrow(); expect(() => unavailable.play('receive')).not.toThrow();
});

it('uses gesture-resumed WebAudio with short enveloped notes and drops suspended playback', async () => {
  const oscillators: any[] = [], gains: any[] = [];
  const context = { state: 'suspended', currentTime: 2, destination: {},
    resume: vi.fn(async () => { context.state = 'running'; }), close: vi.fn(async () => {}),
    createOscillator: vi.fn(() => { const node = { frequency: { value: 0 }, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: () => {} }; oscillators.push(node); return node; }),
    createGain: vi.fn(() => { const gain = { gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() }; gains.push(gain); return gain; }) };
  vi.stubGlobal('window', { AudioContext: class { constructor() { return context; } } });
  let now = 1000;
  const audio = createConversationAudio({ enabled: () => true, visible: () => true, now: () => now });
  audio.unlock(); await Promise.resolve(); audio.play('send');
  expect(context.resume).toHaveBeenCalledOnce(); expect(oscillators.map(node => node.frequency.value)).toEqual([660, 990]);
  expect(gains[0].gain.linearRampToValueAtTime).toHaveBeenCalledWith(.07, 2.008);
  expect(oscillators[1].stop.mock.calls[0][0]).toBeCloseTo(2.145, 8);
  context.state = 'suspended'; now += 500; audio.play('receive'); expect(oscillators).toHaveLength(2);
  audio.unlock(); await Promise.resolve(); now += 500; audio.play('receive');
  expect(oscillators.slice(2).map(node => node.frequency.value)).toEqual([784, 622]);
  audio.destroy(); expect(context.close).toHaveBeenCalledOnce();
});

it('uses bundled native audio, obeys the silent switch and tears down without loops', () => {
  const player = { autoplay: true, loop: true, obeyMuteSwitch: false, volume: 1, src: '', onError: vi.fn(), play: vi.fn(), stop: vi.fn(), destroy: vi.fn() };
  vi.stubGlobal('window', undefined); vi.stubGlobal('uni', { createInnerAudioContext: () => player });
  const audio = createConversationAudio({ enabled: () => true, visible: () => true });
  audio.unlock(); audio.play('receive');
  expect(player.src).toBe('/static/audio/chat-receive.wav'); expect(player.play).toHaveBeenCalledOnce();
  expect(player.autoplay).toBe(false); expect(player.loop).toBe(false); expect(player.obeyMuteSwitch).toBe(true);
  audio.destroy(); expect(player.destroy).toHaveBeenCalledOnce();
});
