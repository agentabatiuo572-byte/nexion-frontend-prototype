import { fmt } from "@/i18n/format";

type IdleCopy = { serverIdleClosed: string };

/** Recognize the server's exact idle-close notice; leave other content untouched. */
export function localizedIdleClose(text: string, copy: IdleCopy): string | null {
  const closed = /^会话已因用户闲置 ([1-9]\d*) 分钟自动结束,可重新发起会话。$/.exec(text);
  if (closed) return fmt(copy.serverIdleClosed, { n: closed[1] });
  return null;
}
