// Only implementation narration; fees, risk, transaction conditions and API documentation remain valid copy.
export const INTERNAL_COPY_PATTERNS = [
  /服务端|后端|验收场次|测试夹具|聚合口径|投影口径|后台统一配置|配置已具备|配置尚不完整|原直属购买预算|不会伪造|不伪造|不根据余额差推断|不会显示旧缓存|缺少课程 ID|手机任务心跳|不会把读取失败当成空会话|安全重放同一份答案/,
  /server[- ](?:verified|confirmed|backed|published|projection|aggregate|snapshot)|local (?:fallback|mock|projection)|never (?:fabricates?|fakes?)|no (?:fabricated|fake) (?:data|success)|fall back to a stale cache|no course ID|send its task heartbeat|No empty inbox is assumed|attempt can be replayed safely/i,
  /dữ liệu giả|dự phòng cục bộ|tổng hợp từ máy chủ|xác minh từ máy chủ|không (?:tạo|giả lập) (?:dữ liệu|thành công)|không hiển thị bản lưu cũ|thiếu ID bài học|nhịp tim tác vụ|Lỗi tải không được xem là hộp thư trống|gửi lại cùng một lượt một cách an toàn/i,
];
