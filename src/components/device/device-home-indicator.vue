<template>
  <view class="nx-home-indicator" aria-hidden="true" />
</template>

<style scoped>
.nx-home-indicator {
  height: 22px;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 8px;
  box-sizing: border-box;
  pointer-events: none;
}
.nx-home-indicator::after {
  content: "";
  width: 134px;
  height: 5px;
  border-radius: 3px;
  background: var(--v5-home-indicator);
}
</style>
