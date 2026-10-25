<template><view class="nx-list-group"><slot /></view></template>
<style scoped>
.nx-list-group { overflow: hidden; border-radius: var(--ui-radius-surface, 22px); background: var(--v5-surface); border: 1px solid var(--v5-border); }
.nx-list-group :deep(.nx-list-row + .nx-list-row) { border-top: 1px solid var(--v5-border); }
</style>
