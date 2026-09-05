import { ref } from "vue";

/**
 * FEAT-DEV01 W-CAP1 任务产能说明弹层的共享开关。
 * 弹层组件(capacity-explainer-sheet.vue)在 earn 页挂载一次;设备卡产能行 /
 * 新机补贴 badge / 任务池提示线等多个入口通过本组合式函数打开同一实例
 * (单一实现多处入口,不双源)。模块级 ref:与页面生命周期无关的轻量 UI 态,
 * 关闭即复位,无持久化。
 */
const visible = ref(false);

export function useCapacityExplainer() {
  return {
    visible,
    open() {
      visible.value = true;
    },
    close() {
      visible.value = false;
    },
  };
}
