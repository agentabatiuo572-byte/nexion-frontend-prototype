import { computed } from "vue";
import { useLocaleStore } from "@/store/locale";

export type EntrySurfaceKey = "signed" | "h5" | "white";

const copy = {
  zh: {
    navTitle: "使用指南", eyebrow: "开始使用", title: "选择使用方式",
    body: "在 Android App 中管理手机算力，或通过网页查看收益、设备与账户。",
    otherWays: "其他使用方式",
    surfaces: {
      signed: {
        linkLabel: "Android 手机", summary: "校准、绑定并启用手机算力",
        kicker: "手机算力", title: "从 Android 手机开始",
        body: "手机算力需在 Android App 中完成校准与激活。完成后，可在设备页查看设备状态。",
        primaryLabel: "打开首页", secondaryLabel: "管理设备",
        steps: [
          { title: "登录 Android App", body: "使用你的账户登录，并按提示完成手机校准。" },
          { title: "绑定并激活", body: "前往设备页完成绑定，再按页面提示激活。" },
          { title: "查看记录", body: "设备激活后，可在收益页查看已完成作业与收益记录。" },
        ],
      },
      h5: {
        linkLabel: "网页查看", summary: "查看收益记录与设备状态",
        kicker: "随时查看", title: "用网页查看账户",
        body: "在浏览器中查看收益和设备。手机校准与激活需在 Android App 中完成。",
        primaryLabel: "查看收益", secondaryLabel: "管理设备",
        steps: [
          { title: "查看收益", body: "打开收益页，查看已完成作业和收益记录。" },
          { title: "查看设备", body: "在设备页查看已绑定设备及其最新状态。" },
          { title: "启用手机算力", body: "如需校准或激活手机，请前往 Android App。" },
        ],
      },
      white: {
        linkLabel: "账户管理", summary: "查看账户概览与登录安全",
        kicker: "账户与安全", title: "管理你的账户",
        body: "从首页查看账户概览，或前往安全设置管理登录方式与登录设备。",
        primaryLabel: "打开首页", secondaryLabel: "登录与安全",
        steps: [
          { title: "查看账户概览", body: "在首页查看收益、设备和待办事项。" },
          { title: "检查登录安全", body: "查看登录设备，管理账户的安全设置。" },
          { title: "查找帮助", body: "遇到问题时，可从首页帮助入口获取支持。" },
        ],
      },
    },
  },
  en: {
    navTitle: "Getting started", eyebrow: "Get started", title: "Choose how to use UVEL",
    body: "Manage phone computing in the Android app, or view earnings, devices and your account on the web.",
    otherWays: "Other ways to use UVEL",
    surfaces: {
      signed: {
        linkLabel: "Android phone", summary: "Calibrate, link and activate phone computing",
        kicker: "Phone computing", title: "Start with an Android phone",
        body: "Phone computing requires calibration and activation in the Android app. Then check its status on the devices page.",
        primaryLabel: "Open home", secondaryLabel: "Manage devices",
        steps: [
          { title: "Sign in on Android", body: "Sign in to your account and follow the phone calibration steps." },
          { title: "Link and activate", body: "Open the devices page to link your phone, then follow the activation steps." },
          { title: "View records", body: "After activation, check completed jobs and earnings on the earnings page." },
        ],
      },
      h5: {
        linkLabel: "Web access", summary: "View earnings records and device status",
        kicker: "Check anytime", title: "View your account on the web",
        body: "Check earnings and devices in your browser. Phone calibration and activation require the Android app.",
        primaryLabel: "View earnings", secondaryLabel: "Manage devices",
        steps: [
          { title: "View earnings", body: "Open the earnings page to check completed jobs and earnings records." },
          { title: "View devices", body: "Check your linked devices and their latest status on the devices page." },
          { title: "Activate phone computing", body: "Use the Android app to calibrate or activate your phone." },
        ],
      },
      white: {
        linkLabel: "Account management", summary: "Check your account overview and sign-in security",
        kicker: "Account and security", title: "Manage your account",
        body: "View your account overview from home, or manage sign-in methods and devices in security settings.",
        primaryLabel: "Open home", secondaryLabel: "Sign-in and security",
        steps: [
          { title: "View your overview", body: "Check earnings, devices and tasks on the home page." },
          { title: "Review sign-in security", body: "Review signed-in devices and manage your security settings." },
          { title: "Find help", body: "Use the help entry on the home page when you need support." },
        ],
      },
    },
  },
  vi: {
    navTitle: "Hướng dẫn sử dụng", eyebrow: "Bắt đầu", title: "Chọn cách sử dụng UVEL",
    body: "Quản lý năng lực tính toán của điện thoại trong ứng dụng Android, hoặc xem thu nhập, thiết bị và tài khoản trên web.",
    otherWays: "Cách sử dụng khác",
    surfaces: {
      signed: {
        linkLabel: "Điện thoại Android", summary: "Hiệu chuẩn, liên kết và kích hoạt điện thoại",
        kicker: "Tính toán trên điện thoại", title: "Bắt đầu với điện thoại Android",
        body: "Cần hiệu chuẩn và kích hoạt điện thoại trong ứng dụng Android. Sau đó, xem trạng thái tại trang thiết bị.",
        primaryLabel: "Mở trang chủ", secondaryLabel: "Quản lý thiết bị",
        steps: [
          { title: "Đăng nhập trên Android", body: "Đăng nhập tài khoản và làm theo hướng dẫn hiệu chuẩn điện thoại." },
          { title: "Liên kết và kích hoạt", body: "Mở trang thiết bị để liên kết điện thoại, rồi làm theo hướng dẫn kích hoạt." },
          { title: "Xem lịch sử", body: "Sau khi kích hoạt, xem tác vụ đã hoàn thành và thu nhập tại trang thu nhập." },
        ],
      },
      h5: {
        linkLabel: "Truy cập web", summary: "Xem lịch sử thu nhập và trạng thái thiết bị",
        kicker: "Xem bất cứ lúc nào", title: "Xem tài khoản trên web",
        body: "Xem thu nhập và thiết bị trong trình duyệt. Cần ứng dụng Android để hiệu chuẩn và kích hoạt điện thoại.",
        primaryLabel: "Xem thu nhập", secondaryLabel: "Quản lý thiết bị",
        steps: [
          { title: "Xem thu nhập", body: "Mở trang thu nhập để xem tác vụ đã hoàn thành và lịch sử thu nhập." },
          { title: "Xem thiết bị", body: "Xem thiết bị đã liên kết và trạng thái mới nhất tại trang thiết bị." },
          { title: "Kích hoạt điện thoại", body: "Dùng ứng dụng Android để hiệu chuẩn hoặc kích hoạt điện thoại." },
        ],
      },
      white: {
        linkLabel: "Quản lý tài khoản", summary: "Xem tổng quan tài khoản và bảo mật đăng nhập",
        kicker: "Tài khoản và bảo mật", title: "Quản lý tài khoản của bạn",
        body: "Xem tổng quan tại trang chủ, hoặc quản lý phương thức đăng nhập và thiết bị trong cài đặt bảo mật.",
        primaryLabel: "Mở trang chủ", secondaryLabel: "Đăng nhập và bảo mật",
        steps: [
          { title: "Xem tổng quan", body: "Xem thu nhập, thiết bị và việc cần làm tại trang chủ." },
          { title: "Kiểm tra bảo mật", body: "Xem thiết bị đăng nhập và quản lý cài đặt bảo mật." },
          { title: "Tìm trợ giúp", body: "Mở mục trợ giúp trên trang chủ khi cần hỗ trợ." },
        ],
      },
    },
  },
};

export function entrySurfaceCopyFor(locale: string) {
  return copy[locale === "zh" || locale === "vi" ? locale : "en"];
}

export function useEntrySurfaceCopy() {
  const locale = useLocaleStore();
  return computed(() => entrySurfaceCopyFor(locale.code));
}
