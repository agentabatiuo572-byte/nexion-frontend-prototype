<template>
  <view class="promotion-action">
    <view class="promotion-action-content"><slot /></view>
  </view>
</template>
<style src="./promotion.css"></style>
<style scoped>
.promotion-action { position:relative; isolation:isolate; overflow:hidden; }
.promotion-action-content { position:relative; z-index:1; }
</style>
