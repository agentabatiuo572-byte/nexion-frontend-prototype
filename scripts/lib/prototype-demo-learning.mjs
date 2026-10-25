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
    { questionId: 'demo-q1', question: zh ? '在哪里查看设备的运行状态？' : vi ? 'Xem trạng thái thiết bị ở đâu?' : 'Where can you check a device’s status?', options: zh ? ['设备详情', '邀请海报'] : vi ? ['Chi tiết thiết bị', 'Áp phích mời'] : ['Device details', 'Invitation poster'] },
    { questionId: 'demo-q2', question: zh ? '已结算收益以什么为准？' : vi ? 'Thu nhập đã quyết toán dựa trên điều gì?' : 'What confirms settled earnings?', options: zh ? ['预估数字', '已完成的作业记录'] : vi ? ['Số ước tính', 'Bản ghi tác vụ hoàn thành'] : ['Estimates', 'Completed job records'] },
  ];
  overview.courses = overview.courses.map(course => {
    const result = state.learningResults?.[course.id];
    return { ...course, ...(course.id === 'review-course-3' ? { questions } : {}), ...(result ? { attempts: result.attempts, lastScore: result.score, completed: result.completed, rewardGranted: result.rewardGranted, progress: result.completed ? 100 : 25 } : {}) };
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
