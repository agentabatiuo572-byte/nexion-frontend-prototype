/** Public promotion disclosure only. Checkout, rewards and account pages remain private. */
export function isPublicPromotionRoute(route:string,activityId:unknown):boolean {
  const path=route.replace(/^#?\/?/,'').split('?')[0];
  if(path==='pages/events/events')return true;
  return typeof activityId==='string'&&activityId.trim().length>0&&['pages/store/store','pages/store/detail'].includes(path);
}
export function currentPublicPromotionRoute(route:string):boolean {
  let activityId:unknown;
  try {const pages=getCurrentPages();const page=pages[pages.length-1] as unknown as {route?:string;options?:Record<string,unknown>};if(page?.route===route)activityId=page.options?.activityId;}catch{/* native stack is not available during cold load */}
  // #ifdef H5
  if(typeof window!=='undefined'){
    const hash=window.location.hash.replace(/^#\/?/,'');
    if(hash.split('?')[0]===route)activityId=new URLSearchParams(hash.includes('?')?hash.slice(hash.indexOf('?')+1):'').get('activityId')??activityId;
  }
  // #endif
  return isPublicPromotionRoute(route,activityId);
}
