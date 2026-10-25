// Isolated preview records; routes resolve to the same fixture's orders/devices.
export function demoNotifications(locale, state, now, device, order) {
  const text = (zh, en, vi) => locale === 'zh' ? zh : locale === 'vi' ? vi : en;
  const at = (days, hour = 12) => {
    if (!days) return now;
    const date = new Date(now);
    date.setDate(date.getDate() - days);
    date.setHours(hour, 0, 0, 0);
    return date.getTime();
  };
  const rows = [
    { id: 901, kind: 'device', title: text('设备已开始运行', 'Device is running', 'Thiết bị đang chạy'),
      body: text(`设备 ${device.instanceNo} 已上线，可查看运行状态与收益。`, `Device ${device.instanceNo} is online. View its status and earnings.`, `Thiết bị ${device.instanceNo} đã trực tuyến. Xem trạng thái và thu nhập.`),
      ctaHref: `/pages/earn/device-detail?id=${encodeURIComponent(device.id)}`, createdAt: at(3) },
    { id: 902, kind: 'order', title: text('订单支付成功', 'Payment successful', 'Thanh toán thành công'),
      body: text(`订单 ${order.orderNo} 已支付 ${order.amountUsdt} USDT，可查看开通进度。`, `Order ${order.orderNo}: ${order.amountUsdt} USDT paid. View activation progress.`, `Đơn ${order.orderNo}: đã thanh toán ${order.amountUsdt} USDT. Xem tiến độ kích hoạt.`),
      ctaHref: `/pages/store/order-detail?id=${encodeURIComponent(order.orderNo)}`, createdAt: at(2) },
    { id: 903, kind: 'reward', title: text('新手任务进度', 'Newcomer tasks', 'Nhiệm vụ thành viên mới'),
      body: text('查看新手任务进度。', 'View newcomer tasks.', 'Xem nhiệm vụ mới.'), ctaHref: '/pages/missions/missions', createdAt: at(1) },
    { id: 904, kind: 'marketing', title: text('设备升级礼', 'Device upgrade offer', 'Ưu đãi nâng cấp'),
      body: text('升级优惠适用于符合活动条件的设备。购买前请查看适用商品、抵扣金额及完整规则。', 'Upgrade offers apply to eligible devices. Review eligible products, discounts and all conditions before purchase.', 'Ưu đãi nâng cấp dành cho thiết bị đủ điều kiện. Xem sản phẩm, mức giảm và đầy đủ điều kiện trước khi mua.'),
      ctaHref: '/pages/store/store', createdAt: at(1, 14) },
    { id: 905, kind: 'system', title: text('服务维护已完成', 'Maintenance complete', 'Bảo trì hoàn tất'),
      body: text('本次服务维护已完成，消息与订单查询已恢复。\n如页面仍显示维护前的内容，请返回后重新打开；尚未完成的操作请先查看当前状态再继续。', 'Maintenance is complete. Messages and order lookups are available again.\nIf a page still shows earlier information, reopen it. Check the current status of unfinished actions before continuing.', 'Bảo trì đã hoàn tất. Tin nhắn và tra cứu đơn hàng đã hoạt động lại.\nNếu trang vẫn hiển thị nội dung cũ, hãy mở lại. Kiểm tra trạng thái thao tác chưa hoàn tất trước khi tiếp tục.'),
      ctaHref: '', createdAt: at(0) },
  ];
  return rows.filter(row => !state.clearedNotificationIds?.includes(row.id)).map(row => ({
    ...row, priority: row.id === 903 ? 'high' : 'normal',
    ctaLabel: row.ctaHref ? text('查看详情', 'View details', 'Xem chi tiết') : '',
    readAt: state.read || state.readIds?.includes(row.id) || row.id >= 904 ? now : null,
  })).sort((a, b) => b.id - a.id);
}
