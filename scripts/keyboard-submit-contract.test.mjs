import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("App login exposes keyboard-confirm submission on every final field", () => {
  const login = read("src/pages/login/login.vue");
  assert.match(login, /class="lg-phone__in"[^>]*:confirm-type="mode === 'password' \? 'next' : 'done'"[^>]*@confirm="onPhoneConfirm"/);
  assert.match(login, /class="lg-field--flex"[^>]*passwordPlaceholder[^>]*:focus="passwordFocused"[^>]*confirm-type="done"[^>]*@confirm="onPrimary"/);
  assert.match(login, /v-for="\(d, i\) in code"[^>]*:confirm-type="i === 5 \? 'done' : 'next'"[^>]*@confirm="i === 5 && onPrimary\(\)"/);
  assert.match(login, /newPasswordPlaceholder[^>]*confirm-type="next"[^>]*@confirm="focusResetConfirmation"/);
  assert.match(login, /confirmPasswordPlaceholder[^>]*confirm-type="done"[^>]*@confirm="onPrimary"/);
  assert.match(login, /function onPhoneConfirm\(\)[\s\S]*focusPassword\(\)/);
});

test("App registration exposes keyboard-confirm submission on each step's final field", () => {
  const register = read("src/pages/register/register.vue");
  assert.match(register, /class="rg-phone__in"[^>]*confirm-type="done"[^>]*@confirm="onCta"/);
  assert.match(register, /v-for="\(d, i\) in code"[^>]*:confirm-type="i === 5 \? 'done' : 'next'"[^>]*@confirm="i === 5 && onCta\(\)"/);
  assert.match(register, /invitePlaceholder[^>]*confirm-type="done"[^>]*@confirm="onCta"/);
  assert.match(register, /passwordPlaceholder[^>]*confirm-type="next"[^>]*@confirm="focusPasswordConfirmation"/);
  assert.match(register, /confirmPasswordPlaceholder[^>]*confirm-type="done"[^>]*@confirm="onCta"/);
});

test("App support conversation keeps the native send key wired to the send action", () => {
  const conversation = read("src/components/support/conversation-thread.vue");
  assert.match(conversation, /confirm-type="send"/);
  assert.match(conversation, /@confirm="onSend"/);
});
