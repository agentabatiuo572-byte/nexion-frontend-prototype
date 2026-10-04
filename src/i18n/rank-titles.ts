import type { LocaleCode } from "./index";

// F1 的 13 个公开名称；动态运营自定义名不在这张翻译表中。
const PUBLISHED_TITLES: Record<string, { en: string; vi: string }> = {
  注册会员: { en: "Registered Member", vi: "Thành viên đã đăng ký" },
  活跃新星: { en: "Rising Star", vi: "Ngôi sao mới" },
  团队达人: { en: "Team Expert", vi: "Chuyên gia đội nhóm" },
  一星大使: { en: "One-Star Ambassador", vi: "Đại sứ 1 sao" },
  二星大使: { en: "Two-Star Ambassador", vi: "Đại sứ 2 sao" },
  三星大使: { en: "Three-Star Ambassador", vi: "Đại sứ 3 sao" },
  四星大使: { en: "Four-Star Ambassador", vi: "Đại sứ 4 sao" },
  五星大使: { en: "Five-Star Ambassador", vi: "Đại sứ 5 sao" },
  资深领袖: { en: "Senior Leader", vi: "Lãnh đạo kỳ cựu" },
  钻石领袖: { en: "Diamond Leader", vi: "Lãnh đạo Kim cương" },
  皇冠领袖: { en: "Crown Leader", vi: "Lãnh đạo Vương miện" },
  传奇大使: { en: "Legendary Ambassador", vi: "Đại sứ huyền thoại" },
  名誉董事: { en: "Honorary Director", vi: "Thành viên HĐQT danh dự" },
};

export function publishedRankTitle(title: string, locale: LocaleCode): string {
  return PUBLISHED_TITLES[title]?.[locale === "vi" ? "vi" : "en"] ?? "";
}
