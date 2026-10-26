import { expect, it, vi } from 'vitest';
import { createConversationAudio } from './conversation-audio';

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
