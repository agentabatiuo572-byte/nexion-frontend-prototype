export const TRUST_CATEGORY_KEYS = ['hosting', 'warranty', 'security', 'audit'] as const;
export type TrustCategoryKey = typeof TRUST_CATEGORY_KEYS[number];

export function trustResources(locale: string) {
  const copy = locale === "zh" ? {
    disclosures: "平台信息", pending: "资料尚未发布", viewDocument: "查看资料", categoryTitles: ["设备托管", "保修与售后", "账户与资金安全", "审计与储备证明"],
    about: "关于 UVEL", headline: "了解平台，再参与", subtitle: "平台说明、服务条款与风险信息，集中查看。", resources: "规则与资料", data: "平台运行数据", documents: "公开资料",
    items: [["UVT 使用说明", "获取、使用与相关规则"], ["服务条款", "服务范围、费用与你的权利"], ["隐私政策", "个人信息的使用与保护"], ["风险披露", "参与前了解适用风险与限制"]],
  } : locale === "vi" ? {
    disclosures: "Thông tin nền tảng", pending: "Tài liệu chưa được công bố", viewDocument: "Xem tài liệu", categoryTitles: ["Lưu trữ thiết bị", "Bảo hành và hậu mãi", "An toàn tài khoản và tiền", "Kiểm toán và dự trữ"],
    about: "Về UVEL", headline: "Tìm hiểu trước khi tham gia", subtitle: "Thông tin nền tảng, điều khoản và rủi ro tại một nơi.", resources: "Quy tắc và tài liệu", data: "Hoạt động nền tảng", documents: "Tài liệu công khai",
    items: [["Hướng dẫn UVT", "Cách nhận, sử dụng và các quy tắc liên quan"], ["Điều khoản dịch vụ", "Phạm vi dịch vụ, phí và quyền người dùng"], ["Chính sách quyền riêng tư", "Cách sử dụng và bảo vệ thông tin cá nhân"], ["Công bố rủi ro", "Rủi ro và giới hạn cần biết trước khi tham gia"]],
  } : {
    disclosures: "Platform information", pending: "Documents not yet published", viewDocument: "View document", categoryTitles: ["Device hosting", "Warranty and after-sales", "Account and fund security", "Audits and reserves"],
    about: "About UVEL", headline: "Understand before you participate", subtitle: "Platform information, terms and risks in one place.", resources: "Rules and resources", data: "Platform activity", documents: "Published documents",
    items: [["UVT guide", "How to earn and use UVT, and applicable rules"], ["Terms of service", "Service scope, fees and your rights"], ["Privacy policy", "How personal information is used and protected"], ["Risk disclosure", "Review applicable risks and limitations"]],
  };
  const paths = ["/pages/trust/nex", "/pages/onboarding/terms", "/pages/onboarding/privacy", "/pages/me/risk-disclosure"];
  return { ...copy, categories: TRUST_CATEGORY_KEYS.map((key,index) => ({key,title:copy.categoryTitles[index]})), items: copy.items.map(([title, body], i) => ({ title, body, href: paths[i] })) };
}
