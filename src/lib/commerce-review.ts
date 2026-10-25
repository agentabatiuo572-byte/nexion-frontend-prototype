import { formatAmount } from '@/lib/amount-display';
import { nexGridBrandText } from '@/lib/brand-copy';

const copy = {
  zh: { provisioningLocationPending:'正在配置设备，部署地点待确认。', activatedLocationPending:'设备已激活，部署地点待确认。', walletLoading:'正在更新可用余额…', walletError:'余额暂未更新，请重试。', walletRefresh:'刷新余额', automaticVoucher:'自动使用最优可用券', releasedRewards:'本单已取消或结束，未发放的奖励不再发放。', bundleTitle:'组合订单 · {kinds} 款 / {units} 台', singleActivity:'此活动仅支持单款购买', singlePurchase:'查看商品并购买' },
  en: { provisioningLocationPending:'Device provisioning is in progress. Deployment location is pending.', activatedLocationPending:'Device activated. Deployment location is pending.', walletLoading:'Updating available balance…', walletError:'Balance could not be updated. Please retry.', walletRefresh:'Refresh balance', automaticVoucher:'Use the best available voucher', releasedRewards:'This order has ended. Unissued rewards will not be granted.', bundleTitle:'Bundle order · {kinds} products / {units} units', singleActivity:'This offer supports a single product', singlePurchase:'View product and buy' },
  vi: { provisioningLocationPending:'Đang thiết lập thiết bị. Địa điểm triển khai đang chờ xác nhận.', activatedLocationPending:'Thiết bị đã kích hoạt. Địa điểm triển khai đang chờ xác nhận.', walletLoading:'Đang cập nhật số dư khả dụng…', walletError:'Chưa cập nhật được số dư. Vui lòng thử lại.', walletRefresh:'Làm mới số dư', automaticVoucher:'Dùng phiếu giảm giá tốt nhất', releasedRewards:'Đơn này đã kết thúc. Phần thưởng chưa cấp sẽ không được cấp.', bundleTitle:'Đơn kết hợp · {kinds} sản phẩm / {units} thiết bị', singleActivity:'Ưu đãi này chỉ hỗ trợ một sản phẩm', singlePurchase:'Xem sản phẩm và mua' },
};
export function commerceCopy(locale:string) { return copy[locale === 'zh' || locale === 'vi' ? locale : 'en']; }
export function commerceAmount(value:Parameters<typeof formatAmount>[0]) { return formatAmount(value).replace(/\B(?=(\d{3})+\.)/g, ','); }
export function commerceOrderTitle(order:{productName:string;quantity:number;lineItems?:{sku:string;quantity:number}[]},locale:string) {
  const lines=order.lineItems??[];
  const kinds=new Set(lines.map(line=>line.sku)).size;
  return kinds>1 ? commerceCopy(locale).bundleTitle.replace('{kinds}',String(kinds)).replace('{units}',String(lines.reduce((sum,line)=>sum+line.quantity,0))) : nexGridBrandText(order.productName);
}
