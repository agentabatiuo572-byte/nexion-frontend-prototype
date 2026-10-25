// Loopback simulation only. Question answers and rewards below are illustrative.
import { createHash } from 'node:crypto';
import { fixture } from './design-review-fixture.mjs';
const proof = { serverCanonical: true, sourceEnvironment: 'PRODUCTION', runId: '' };
export function learningDemo(url, locale, state, request) {
  const prefix = '/api/content/learning/courses';
  if (!url.pathname.startsWith(prefix)) return undefined;
  const overview = fixture(new URL(prefix, url.origin), locale, state, request);
  const zh = locale === 'zh', vi = locale === 'vi';
  const questions = [
    { questionId: 'demo-q1', question: zh ? '登录验证码应当如何保管？' : vi ? 'Bạn nên bảo vệ mã xác minh đăng nhập thế nào?' : 'How should you protect a login verification code?', options: zh ? ['仅本人使用，不转发给他人', '发给陌生人代为登录'] : vi ? ['Chỉ tự sử dụng, không chia sẻ', 'Gửi cho người lạ đăng nhập hộ'] : ['Use it yourself; never share it', 'Send it to a stranger to sign in for you'] },
    { questionId: 'demo-q2', question: zh ? '发现陌生设备登录后，首先应当做什么？' : vi ? 'Bạn nên làm gì khi phát hiện thiết bị lạ đăng nhập?' : 'What should you do after noticing an unfamiliar signed-in device?', options: zh ? ['继续等待，不作处理', '检查账户安全并退出陌生设备'] : vi ? ['Bỏ qua và chờ đợi', 'Kiểm tra bảo mật và đăng xuất thiết bị lạ'] : ['Ignore it and wait', 'Review account security and sign out the unfamiliar device'] },
  ];
  overview.courses = overview.courses.map(course => {
    const result = state.learningResults?.[course.id];
    return { ...course, ...(course.id === 'review-course-3' ? { questions, body: zh ? '登录验证码仅供本人使用，请勿转发。定期检查账户安全中的已登录设备；发现陌生设备时，退出该设备并检查账户信息。' : vi ? 'Mã xác minh chỉ dành cho bạn; không chia sẻ. Thường xuyên kiểm tra thiết bị đã đăng nhập trong phần bảo mật. Nếu thấy thiết bị lạ, hãy đăng xuất thiết bị đó và kiểm tra tài khoản.' : 'Keep verification codes private. Review signed-in devices in account security. If you notice an unfamiliar device, sign it out and check your account information.' } : {}), ...(result ? { attempts: result.attempts, lastScore: result.score, completed: result.completed, rewardGranted: result.rewardGranted, progress: result.completed ? 100 : 25 } : {}) };
  });
  if (url.pathname === prefix) return state.dataState === 'empty' ? { ...overview, courses: [], totalCourses: 0, completedCourses: 0, earnedNex: 0 } : overview;
  const match = url.pathname.match(/\/courses\/(review-course-[1-3])(?:\/(start|complete|quiz)(?:\/receipts\/(.+))?)?$/);
  if (!match) return undefined;
  const [, id, action, receiptKey] = match;
  const course = overview.courses.find(item => item.id === id);
  if (receiptKey) return state.learningReceipts?.[decodeURIComponent(receiptKey)] || { status: 'ABSENT', committed: false, requestHash: null, result: null };
  if (action !== 'quiz' && action !== 'complete') return { ...course, progress: course.completed ? 100 : Math.max(1, course.progress) };
  const input = request.postDataJSON() || {};
  const key = request.headers?.()['idempotency-key'];
  if (key && state.learningReceipts?.[key]) return state.learningReceipts[key].result;
  if (action === 'complete' && course.questions.length) throw new Error('This demo course requires its quiz');
  const score = action === 'quiz' ? [0, 1].reduce((n, answer, index) => n + (input.answers?.[index] === answer ? 50 : 0), 0) : 100;
  const passed = score === 100;
  const result = { ...proof, courseId: id, version: 'v1', score, passed, completed: passed, rewardGranted: passed, rewardNex: passed ? 5 : 0, attempts: course.attempts + 1 };
  state.learningResults ??= {}; state.learningResults[id] = result;
  if (passed && !state.completed.includes(Number(id.slice(-1)))) state.completed.push(Number(id.slice(-1)));
  if (key) { state.learningReceipts ??= {}; state.learningReceipts[key] = { status: 'COMMITTED', committed: true, requestHash: createHash('sha256').update(JSON.stringify(input)).digest('hex'), result }; }
  return result;
}
