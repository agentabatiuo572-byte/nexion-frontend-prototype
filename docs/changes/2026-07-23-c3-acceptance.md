# C3 批次独立验收报告(tap 热区 ≥44pt + 按下反馈)

- 验收日期:2026-07-23
- 验收方:独立验收 agent(非实现方)
- 立场:证伪。本报告所有结论来自本人自写探针的运行时实测,未采信实现方自述文档(`docs/changes/2026-07-23-c3-tap-targets.md` 全程未读)。
- 被测:`D:\WORKS\PLAN\Nexion-uniapp` @ `fa60054` + 未提交工作树(43 改动文件)

> ⚠️ **工作树不是纯 C3**:验收时同一工作树里还躺着另一批未提交改动(C5 空状态:`src/components/empty-state.vue`、`src/static/img/empty/`、`scripts/tag-comment-gate.mjs`、`docs/changes/2026-07-23-c5-empty-states.md`),疑似并发会话产物。
> 我核对过:C5 新增的唯一可点元素是 `empty-state.vue:19` 的 CTA(`active:opacity-90`,反馈正常),而本报告 38 条尺寸违例全部落在 C3 之前就存在的文件里(daily / staking / leaderboard / unilevel / product-card / wallet-card / marketplace / earn / on-grid-section / profile / security / wallet),**无一条来自 C5**。结论不受污染,但读者需知道运行时快照包含 C5。

---

## 一句话结论

**不达标。** 卡在 AC1:全站 88 路由实测 **38 个真可点元素热区 < 44pt**,台账只收了 4 条。根因不是漏改,是**实现方的尺寸门本身失效** —— 它把只注册了 `touchstart` 的下拉刷新滚动容器当成了"可点祖先",于是页面正文里的每一个元素都被判为"非最外层"而跳过尺寸检查,门的实际覆盖率只有 20–39%。

| AC | 判定 | 一句话 |
|---|---|---|
| AC1 尺寸 ≥44pt | ❌ **FAIL** | 38 处真违例 / 21 路由;门本身漏检 80% 的目标 |
| AC2 按下反馈 | ❌ **FAIL** | 1 个 `role=button` 零反馈 + 8 处"声明了但看不见"的次感知反馈 |
| AC3 无视觉回归 | ❌ **FAIL** | `me/section-header` 无链接分支净损 20px 间距;眼睛图标 / 账单链接 / earn 分段控件本身 OK |
| AC4 无溢出 / 无报错 | ✅ **PASS** | 30 路由 × 2 主题:横向溢出 0、console error 0 |
| AC5 声明≠实现 | ❌ **FAIL** | 任务书点名的两类坑各 0 处(已实测证明),但存在**第三类**:次感知声明,两套探针都判它通过 |

---

## 我用的方法(不是跑实现方的脚本得出的结论)

三个自写探针,均先过双向红测再上阵。原件已移入 `.trash/2026-07-23-c3-acceptance/`(可回收复跑)。

1. **`zz-acceptance-tap-probe.mjs` —「声明 vs 生效」分离探针**
   强制 `:active`(元素自身 + 4 层祖先同时强制,忠实模拟真实按压沿祖先链生效),然后:
   - 用 CDP `CSS.getMatchedStylesForNode` 取**此刻真正 match 上的 `:active` 规则** → 这是「作者声明了什么」;
   - 读 computed style 前后差 → 这是「实际生效了什么」;
   - `声明>0 && 生效=0` 即 AC5 违例。
   另加**动画稳定性护栏**:强制前采样两次(间隔 90ms),自己就在变的元素标 `unstable`,不计入通过。

   红测(`zz-acceptance-selftest.mjs`)证明它能抓住任务书点名的两类坑:

   ```
   inline: {declared:2, effective:false}   ← 陷阱①  inline style opacity 压掉 class 的 :active
   anim  : {declared:2, effective:false}   ← 陷阱②  animation …both 锁死 opacity
   ok    : {declared:2, effective:true }   ← 干净对照,无假阳
   child : {                effective:true}   ← 父容器驱动的反馈能认出来
   acceptance-probe selftest PASS
   ```

2. **`zz-acceptance-size.mjs` —「只认 click」尺寸探针**
   与实现方探针的关键差异:**记录每个元素注册了哪些事件类型**,只把注册了 `click` 的算作可点目标;并报出每个 <44pt 目标的**最近 click 祖先**,以便人工裁定"父子同动作(合法)"还是"父子异动作(真违例)"。

3. **`zz-acceptance-ac34.mjs` / `zz-acceptance-ab.mjs` — AC3/AC4**
   AC4 覆盖 30 条本批真改动到的路由 × light/dark 双主题(实现方的 `overflow-probe.mjs` 只有 5 条 tab,而 login/register/intro 这次加了**负 margin**,恰恰不在它的基线里)。
   AC3 走**真 A/B**:先量当前几何,再把 C3 之前的 CSS 注回浏览器量第二次,用位移差判回归,而不是看截图猜。

---

## AC1 尺寸 —— FAIL

### 实测数字

```
$ node zz-acceptance-size.mjs --out indep-size.json
routes=88 clickTargets=834 under44=106
```

106 条逐条裁定后:**合法 68 / 真违例 38**。

合法的 68 条(不算违例,理由):
| 数量 | 对象 | 放行理由 |
|---|---|---|
| 56 | `g.cursor-pointer` 9.9×9.9(team/network、globe) | SVG 数据可视化节点,撑到 44 会互相盖住 —— WCAG 2.5.8 Essential |
| 6 | 按钮内层 `<text>`("Buy now"/"Unlock to buy"/"Continue") | 与父按钮**同一个动作**,父热区 ≥44,内层不独立计 |
| 4 | `nx-toast` 335×43 | 台账已豁免,认可(见裁决章) |
| 1 | `uni-checkbox` 22×19(wallet-cards-new) | 被 `<uni-label>` 包裹转发点击 |
| 1 | `.terms-link` 34×45(onboarding/intro) | 句中行内链接,2.5.8 inline 例外 |

**真违例 38 条 / 21 路由**(均为**没有任何 click 祖先**的独立目标,或与父动作不同的子目标):

| N | 实测尺寸 | 文案 | 路由 |
|---|---|---|---|
| 7 | 59.5×36 | `Claim` | pages/daily/daily |
| 6 | 93.4×34 | `Rules` | me/wallet-exchange, team/commissions, team/binary, team/rank, team/leadership-pool, me/wallet-repurchase |
| 4 | 86.5×34 | `Today`(时间分段) | team/leaderboard |
| 4 | 74×34 | `30d`(时间分段) | staking/staking |
| 3 | 57.3×17 | `Trade in →` | store/store |
| 2 | 93.1×34 | `Rules` | genesis/genesis, staking/staking |
| 1 | 93.4×34 | `Rules` | team/unilevel |
| 1 | 136.1×32 | `Price low → high` | genesis/marketplace |
| 1 | 129.6×32 | `Recently listed` | genesis/marketplace |
| 1 | 150.7×32 | `By last-sale price` | genesis/marketplace |
| 1 | 38.4×44 | `Map →`(宽度不足) | index/index |
| 1 | 358×35 | `AI task pool is upgrading` | earn/earn |
| 1 | 72.5×29 | `View all` | earn/earn |
| 1 | 109.6×16 | `31 this month`(=「账单」链接) | me/me |
| 1 | 98×18 | `1,420 NEX` | me/wallet |
| 1 | 130.3×36 | `Share to climb` | team/leaderboard |
| 1 | 28×28 | (无文案图标钮) | me/profile |
| 1 | 51×31 | (无文案图标钮) | me/security |

其中 **7 条落在 5 个主 tab 上**(index 1 / earn 2 / store 3 / me 1)—— 即 verify 门每次都会跑到的路由,却没被拦下。

### 根因:尺寸门被自己的祖先判定关掉了

`scripts/tap-feedback-probe.mjs:99`

```js
tooSmall: !hasTapAncestor && !disabled && (r.width < tapMin || r.height < tapMin),
```

尺寸只在「没有 tap 祖先」时判。而 `hasTapAncestor` 用的 tap 集合来自 `:37`:

```js
if ((type === "click" || type === "touchstart") && this instanceof Element && !seen.has(this))
```

`touchstart` 也算。于是 `src/components/app-chassis.vue:69-75` 的下拉刷新容器——

```html
<view ref="scrollEl" class="nx-content nx-scroll"
      @touchstart="onTouchStart" @touchmove="onTouchMove" ... >
```

——被收进 tap 集合。它是 78 条套 chassis 路由上**每一个正文元素的祖先**,于是正文里没有任何元素能满足 `!hasTapAncestor`,尺寸检查在正文中永不触发。

实测覆盖率(我的探针,按 `outermost` 口径复算实现方的判定):

```
pages/index/index    targets= 48 outermost= 11 => size-gate covers 23%
pages/earn/earn      targets= 33 outermost=  9 => size-gate covers 27%
pages/store/store    targets= 30 outermost=  9 => size-gate covers 30%
pages/team/team      targets= 23 outermost=  9 => size-gate covers 39%
pages/me/me          targets= 45 outermost=  9 => size-gate covers 20%
```

那 9–11 个"最外层"是什么?全是外壳:`nx-icon-btn`(44×44)、`nx-bell`、5 个 `nx-tab`(71×56)、以及滚动容器自己。**页面正文一个都没进门。** 这解释了为什么 921 个目标只报出 4 条尺寸违例,而且 4 条全是渲染在 chassis 之外的 toast。

第二个口子:即使修好 `touchstart`,`!hasTapAncestor` 仍会放过**与父动作不同的小子目标**。实例见下方 P1-3(`Trade in →` 57×17,父卡片是「打开详情」,它自己是「去置换」)。

---

## AC2 按下反馈 —— FAIL

我的全量扫描(88 路由 / 948 目标)结果:

```
with declared :active > 0 : 775
selfEffective             : 775     ← 完全同一批,无一例外
无任何生效反馈             : 155(按签名归类见下)
```

155 条按签名归类后,真正算问题的只有两类:

| 数量 | 签名 | 裁定 |
|---|---|---|
| 78 | `uni-view.nx-content.nx-scroll` | 非按钮(只有 `touchstart`),不算 |
| 56 | `g.cursor-pointer` | 台账已豁免 —— **我不同意,见裁决章** |
| 9 | `div.uni-scroll-view` 等框架滚动容器 | 框架产物,不算 |
| 5 | `uni-view.nx-device-card`(earn) | 卡片体几乎被有反馈的 header 铺满,可接受 |
| 5 | sheet 面板 / backdrop / swiper 内部 | `@click.stop` 阻冒泡,不是按钮 |
| **1** | `uni-view.flex.items-center[aria]`(genesis/marketplace) | **真违例,见 P2-1** |

### 但 AC2 的真问题在另一头:声明了却看不见

两套探针(他的和我的)都把「computed 有任何非零变化」判为有反馈。于是**小到看不见的声明照样过门**。实现方自己在 `src/components/trial-hero-banner.vue:13` 的注释里立下了判据:

> 原 active:scale-[0.998] = 0.2% 缩放,肉眼与探针都测不出 —— 声明了等于没有。

按这条自家判据,全站还剩 8 处同病(实测:唯一反馈是一个 ≤1% 的 scale):

```
pages/store/store       uni-view.relative.overflow-hidden   358x171.5  scale=0.99  → 每边缩 1.79px
pages/me/wallet-nex     uni-view.active:scale-[0.99]        173x89.4   scale=0.99  → 每边缩 0.86px
pages/team/binary       uni-view.rounded-2xl                358x96.3   scale=0.99  → 每边缩 1.79px
pages/team/quota        uni-view.rounded-2xl                358x82     scale=0.99  → 每边缩 1.79px
pages/genesis/genesis   uni-view.relative.w-full            358x54     scale=0.99  → 每边缩 1.79px
pages/genesis/holder    uni-view.active:scale-[0.99]        358x89     scale=0.99  → 每边缩 1.79px
pages/daily/daily       uni-view.active:scale-[0.99]        358x68     scale=0.99  → 每边缩 1.79px
```

外加源码里一处更极端、且是**唯一反馈**的:`src/components/home/nova-card-slot.vue:10`

```html
class="block w-full relative active:scale-[0.997] transition"
```

0.3% 缩放,≈ 每边 0.5px —— 与实现方判定为"等于没有"的 0.998 是同一个东西,只是没被发现。

另有 11 处 `active:opacity-95`(5% 变化,如 `src/pages/store/orders.vue:16`、`src/pages/team/team.vue` 多处),与本项目自己在别处采用的 0.6/0.7/0.85 档明显不同阶,建议一并按《08》§2 的派生公式归档。

---

## AC3 无视觉回归 —— FAIL

真 A/B(注回 C3 前 CSS 再量一次)结果,`delta = 改后 − 改前`:

### ✅ 登录页密码显隐眼睛图标 —— PASS,而且顺手修正了 2px 偏心

```
eyeIcon  dx=0  dcx=0   dy=+2  dcy=+2   dw=0  dh=0
eyeBox   dx=-10 dw=+20 dh=+14          dcx=0 dcy=0
```

- **水平零位移**:图标中心 x=337、右边缘 x=345,改前改后完全一致。`margin-right:-10px` 精确抵消了 44px 盒子相对原 24px 盒子多出的一半宽度,这是算准了的,不是碰巧。
- 垂直下移 2px:改后图标中心 cy=228.2,而输入框 `.lg-field-wrap`(y=200.2, h=56)的中心正是 228.2 —— **改后才是真正垂直居中**,改前偏上 2px。属修正,非回归。
- 不溢出输入框:`eyeOverflowsField: false`(眼睛盒右缘 359 < 边框盒右缘 366)。

顺带确认 `.lg-footer__link`(`padding:14px 10px; margin:0 -10px`)`dcx=0 dcy=0`,盒子对称长大、视觉零位移,`display:inline` 下纵向 padding 不撑行盒 —— 手法正确。

### ✅ me 页「账单」链接视觉 —— PASS(但见 AC1,它的热区没修)

本批只加了 `active:opacity-70 transition-opacity`,无几何改动,不可能有视觉回归。

### ✅ earn 页顶部时间分段控件 —— PASS

`src/pages/earn/earn.vue:176` 已是 `height: "44px"`,且该文件本批未改动(是更早批次改的)。实测 86.5×44,`active:opacity-70` 生效。**但同型控件在 team/leaderboard(34px)、staking(34px)未同步** —— 计入 AC1 违例。

### ❌ me/section-header 间距回归 —— FAIL

`src/components/me/section-header.vue:10` 把外层 margin 从 `22px 2px 12px` 改成 `12px 2px 2px`(上下各让 10px 给右侧链接的 44pt 热区)。问题在于**margin 改动是无条件的,而 44px 的链接是 `v-if`**(`:19`):

```html
<view class="flex items-center justify-between" style="margin: 12px 2px 2px">   ← 无条件 −20px
  ...
  <view v-if="link && linkLabel" ... style="... min-height: 44px; padding-left: 20px">  ← 有条件 +23px
```

me/me 实测 6 个 section header,**5 个没有链接**:

```
{h:44, hasLink:true , mt:12px, mb:2px, gapToNext:2, title:"My Wallet Bills"}
{h:21, hasLink:false, mt:12px, mb:2px, gapToNext:2, title:"My Network"}
{h:21, hasLink:false, mt:12px, mb:2px, gapToNext:2, title:"My devices 5 of 6"}
{h:21, hasLink:false, mt:12px, mb:2px, gapToNext:2, title:"Account"}
{h:21, hasLink:false, mt:12px, mb:2px, gapToNext:2, title:"Preferences"}
{h:21, hasLink:false, mt:12px, mb:2px, gapToNext:2, title:"Help & Support"}
```

那 5 个净损 20px(上 10 + 下 10),**标题到内容的间距从 12px 塌到 2px**,没有任何东西补回来。A/B 位移证据:第 3 个 header 改前 y=1079.6、改后 y=1052.6。截图对照(`c3-sechdr-before/after.png`)可见「My Network / My devices / Account」三处标题明显更贴近各自卡片。

组件消费方共 5 个(`my-devices-entry` / `network-card` / `wallet-card` 带链接,`orders-card` / `me.vue:40` 的 section 循环不带),故影响面 = me tab + 任何用 `orders-card` 的页面。

**建议修法**:margin 保持 `22px 2px 12px`,把 −10px 的补偿挪进 `v-if` 那一支(如链接自身 `margin: -10px 0`),让无链接的 header 完全不受影响。

### 附带观察(非回归,记录备查)

`.lg-forgot` min-height 36→44 使登录页主 CTA 整体下移 8px(`cta dy=+8`),`.lg-switch` 文案相对 CTA 再下移 5px —— 与实现方注释里写的「12→17px」完全吻合,属预期代价。

---

## AC4 无溢出 / 无报错 —— PASS

我的双主题扫描(30 条本批真改动路由,含实现方 baseline 未覆盖的 login/register/onboarding):

```
[dark]  routes with overflow: 0   routes with console errors: 0
[light] routes with overflow: 0   routes with console errors: 0
```

实现方的 overflow 基线门也复现通过:

```
$ node scripts/overflow-probe.mjs --diff docs/OVERFLOW-BASELINE.json ; echo exit=$?
OVERFLOW PROBE: 36 处横向溢出 / 5 路由
DIFF vs baseline: 新增溢出 0 · 消失 2
OVERFLOW OK: 无新增溢出
exit=0
```

重点复核了本批引入的三处**负 margin**(`.lg-eye margin-right:-10px`、`.lg-footer__link margin:0 -10px`、以及 section-header 放弃负 margin 改走左侧 padding),均未造成溢出。实现方在 section-header 注释里说「先试过负 margin,实测 me 页新增 2 处溢出,故改左扩」—— 这个取舍我复验认可。

---

## AC5 声明≠实现 —— FAIL(点名的两类 0 处,但存在第三类)

### 点名的两类:实测 0 处

```
records 945
with declared :active > 0 : 775
declared>0 但 self computed 零变化 : 0
```

这个 0 是可信的,因为**同一套判定在红测里能抓住这两类**(见方法章的 selftest 输出:inline 陷阱和 animation 陷阱都是 `declared:2, effective:false`)。

补充源码侧交叉验证:
- 陷阱①(inline opacity 压 class):全仓 grep 同标签上 `active:opacity` + inline `opacity:` 数值,0 命中。
- 陷阱②(`animation …both` 占用 opacity/transform):全仓 `both`/`forwards` 动画共 22 处,其 `to` 帧确实都锁 opacity/transform;但带这些 class 的可点元素只有 2 个,且都是 `@click.stop` 阻冒泡的 sheet 面板,不是按钮。`src/components/card-stagger.vue:29` 的 `.nx-card-stagger > * { animation: … both }` 是全局无 scoped 规则、影响面最大的一处,我逐条核了 missions / earn / staking / daily 的 CardStagger 子元素,实测 `animationName` 均为 `none`(即没有可点元素落在直接子代那一层),`selfEffective` 全 true。**这一路是干净的。**

### 但存在第三类:声明了、也"生效"了、就是看不见

见 AC2 章。8 处唯一反馈 ≤1% scale + `nova-card-slot.vue:10` 的 0.997。这类**两套探针都判通过**,因为判据是"computed 有变化"而不是"变化可感知"。按实现方自己在 `trial-hero-banner.vue:13` 立的判据,它们属于"声明了等于没有",正是 AC5 要找的东西,只是机制是第三种。

**建议**:给探针加一条幅度门槛(如 opacity 差 ≥0.08、scale 差 ≥0.02、或位移 ≥2px),把"有变化"升级成"可感知的变化"。

---

## 我独立发现的问题清单

### P0-1 尺寸门对页面正文完全失效(38 处违例因此漏网)

- 位置:`scripts/tap-feedback-probe.mjs:37`(hook 收 `touchstart`)+ `:99`(`tooSmall` 要求 `!hasTapAncestor`);触发源 `src/components/app-chassis.vue:69-75`
- 复现:`node zz-acceptance-size.mjs`(只认 `click`)→ `under44=106`;实现方探针 `--sweep all` → 尺寸违例 4 条,且全在 chassis 之外的 toast 上
- 为什么算问题:门声称覆盖 88 路由 921 目标,实测正文覆盖率 0%。这不是"少改了几处",是**验收判据本身不成立** —— 台账"只有 11 条存量"这个结论建立在一个失灵的测量上
- 修法:hook 分别记录事件类型,`hasTapAncestor` 只认注册了 `click` 的祖先;并把「与父动作不同的子目标」也纳入尺寸检查

### P0-2 38 处真热区违例 / 21 路由

- 清单见 AC1 表
- 优先级最高的几处(高频动作 / 主 tab):
  - `src/pages/daily/daily.vue:477` `milestoneBtnStyle` / `:521` `saverBtnStyle` → `height:"36px"`,7 个 `Claim` 按钮,是该页主要动作
  - `src/components/me/wallet-card.vue:50` 「账单」链接 **109.6×16**,me 主 tab,本批只加了反馈没加热区
  - `src/components/store/product-card.vue:100` `Trade in →` **57.3×17**,store 主 tab,且与父卡片**动作不同**(`goDevices` vs 打开详情),父热区不能替它兜
  - `src/pages/team/leaderboard.vue:233` `height:"34px"` / `src/pages/staking/staking.vue:268` `howPillStyle height:"34px"` / `src/pages/team/unilevel.vue:303` —— 与 `src/pages/earn/earn.vue:176` 是同一种分段/Rules 控件,earn 那份已按《07》提到 44,**兄弟实例没同步**(典型"修一处≠修全部")

### P1-1 me/section-header 无链接分支净损 20px 间距

- 位置:`src/components/me/section-header.vue:10`(无条件 margin)vs `:19`(`v-if` 的 44px 链接)
- 复现:me/me 实测 6 个 header 中 5 个 `hasLink:false`,`gapToNext` 由 12px 变 2px;A/B 注回旧 margin 后第 3 个 header 位置差 27px
- 为什么算问题:为了给"某些 header 才有"的链接腾热区,让"所有 header"付了间距代价,受损的 5 个还拿不到任何补偿

### P1-2 8 处次感知反馈(声明了但看不见)

- 位置:`src/components/home/nova-card-slot.vue:10`(`active:scale-[0.997]`,唯一反馈);另 7 处 `active:scale-[0.99]` 见 AC2 表
- 复现:`zz-acceptance-tap-probe.mjs` 输出中筛 `selfChanged == ['transform']` 且声明 scale ≥0.99
- 为什么算问题:实现方已在 `trial-hero-banner.vue:13` 白纸黑字判定 0.2% 缩放"声明了等于没有"并据此重写了那个组件,同一判据下这 8 处是同类欠账;而两套探针都放行

### P2-1 genesis/marketplace 楼层涨幅行:`role="button"` + `aria-label`,零按下反馈

- 位置:`src/pages/genesis/marketplace.vue:53`
- 复现:该元素在我的扫描里 `effective=false`、`declared=0`;实现方探针因它非叶子(内含 `:60` 的 OpenSea 链接)而跳过
- 为什么算问题:它自己就是一个声明过的按钮(`role`/`aria-label`/`@click.capture`),按左侧 60% 区域(文字部分)完全没有视觉响应;内层小 pill 有 `active:opacity-80`,反而放大了不一致感
- 严重度 MEDIUM:动作与内层 pill 相同,不会丢功能

### P2-2 仓库根目录有一个名为 `--diff` 的垃圾文件

- 位置:`D:\WORKS\PLAN\Nexion-uniapp\--diff`(未跟踪,9230 字节)
- 内容是一份 dom-qa 快照 JSON,显然是 `--diff` 被当成输出文件名吃掉了
- 为什么算问题:未跟踪垃圾文件,且文件名以 `--` 开头,后续任何 glob/清理脚本都可能把它当参数解析。建议删除

### P2-3 门的扫描范围(5 路由)与台账声明范围(88 路由)不一致

- 位置:`scripts/verify.sh:1749` 调用 `tap-feedback-probe.mjs` 未带 `--sweep all` → 只跑 5 个 tab;而 `docs/TAP-FEEDBACK-LEDGER.json` 的 `scope` 写的是 `"all(88 路由 / 921 个真 tap 目标)"`
- 后果:台账 11 条里有 7 条(store/detail、compute-share/download、team/network、globe/globe、me/help)所在路由**门永远不会走到**,这些 entry 是装饰性的;反过来,非 tab 路由上新增的违例也永远不会被拦
- 严重度 LOW(是范围声明问题,不是逻辑错误),但建议 verify 里跑 `--sweep all`,或把台账 scope 改成 `core` 以免误导

---

## 11 条豁免逐条裁决

| # | fp | 裁决 | 理由 |
|---|---|---|---|
| 1–8 | `size|feedback` × `nx-toast`(earn / store / store-detail / compute-share-download) | ✅ **同意** | 实测 335.4×43,确实只差 1px;toast 自动消失,点它只为提前关掉,不是需要瞄准的目标,点不中也不丢功能。反馈同理 —— 消失本身就是反馈。**小瑕疵**:8 条 `tapOk` 逐字复制同一句,其中"只差 1px"对 feedback 类无关;另这 4 条里有 2 条所在路由 verify 门根本走不到(见 P2-3) |
| 9 | `feedback|pages/team/network|g.cursor-pointer` | ❌ **不同意** | 理由写的是**尺寸**理由("撑到 44 会互相重叠"),用来豁免**反馈**不成立 —— 这两件事正交。一个 9.9×9.9 的节点完全可以在按下时改 `fill`/`r`/`stroke-width`,不需要变大。而且目标越小越密,越需要按下反馈来确认"我按中的是哪一个",这里的需求比别处更强,不是更弱 |
| 10 | `feedback|pages/globe/globe|g.cursor-pointer` | ❌ **不同意** | 同上 |
| 11 | `feedback|pages/me/help|div.uni-scroll-view` | ✅ **同意** | 诊断准确 —— 这是 uni 框架给滚动容器挂的监听,不是产品按钮,不存在"按下反馈"这回事 |

### 台账另一个问题:漏了一整类

`g.cursor-pointer` 我实测 **56 个、9.9×9.9**,远低于 44pt。台账里只有 `feedback|` 两条,**一条 `size|` 都没有**。不是有人裁定过后放行,而是尺寸门根本没扫到它们(P0-1 同一根因)。

我本人认为这 56 个节点的**尺寸**确实该按 WCAG 2.5.8 Essential 豁免(位置由数据布局决定,撑大必然互相遮挡)——但那需要以 `size|` entry 的形式写进台账并给出理由,而不是靠门失灵而"通过"。**台账现状把一个测量盲区伪装成了一个决策。**

---

## 探针可信度评估

### 实现方 `scripts/tap-feedback-probe.mjs`

**优点(应当承认)**:
- hook `addEventListener` 拿运行时真监听,而不是靠 `cursor:pointer` 猜 —— 对 uni-app 编译出的 `<uni-view>` 是唯一正确的做法,注释里的判断是对的
- 读值前把 transition 压到 0s(`:108`)—— 这是个真 bug,他们已经踩过并修好了
- 每路由带变化的 query 强制整页重载(`:127`)避免浮层跨路由污染 —— 也是踩过的真坑
- selftest 8 条断言里含 transition / 祖先链 / 后代 / `pointer-events:none` 四个真红锚,不是走过场
- 复跑 `--sweep all` 与台账 **11/11 完全一致**,无漂移

**假阴(漏报)**:
1. **尺寸门对正文 100% 失明** —— P0-1,最严重
2. 反馈只测叶子(`:136` `if (!t.leaf ...) continue`)→ 含可点后代的按钮永不受检(P2-1 即此漏)
3. 判据是"computed 有变化"而非"变化可感知"→ 8 处次感知声明放行(P1-2)
4. 无限动画无护栏:`.nova-float`(transform / infinite)会让前后两次读数天然不同,任何挂了无限动画的元素都会被判"有反馈"。我的探针对同类采样标了 9 条 `unstable`;本例中 nova 球的 opacity 反馈恰好是真的(`@keyframes nova-float` 只写 transform,不碰 opacity),所以没造成错误结论,但机制上是敞开的
5. `scrim` 排除规则(`:97` 满宽且 ≥300px 高)会顺带排掉真正的满幅可点大卡

**假阳(误报)**:本次未观察到。

### 我自己探针的局限(同样列出)

- 强制 `:active` 只到 4 层祖先,更深的父驱动反馈会漏
- "父子同动作 / 异动作"是我**读源码人工裁定**的,没有自动化,38 这个数字含我的判断
- 未在 `prefers-reduced-motion` 下复跑;该模式下 `.nx-card-stagger > *{animation:none}` 会改变层叠关系,AC5 结论理论上可能不同
- mock 有随机性:三次全量跑目标数分别为 919 / 945 / 948,toast 类条目只在恰好弹出时才出现。我没有跑足次数去界定这个抖动区间
- `scripts/dom-qa.mjs` 我没有独立审计(不在 AC 范围,且 verify 已带它)

---

## 机器门现状(供参考,非判据)

```
$ bash scripts/verify.sh > /tmp/verify.log 2>&1 ; echo exit=$?
exit=0
  PASS  dom-qa core(5 tab)无新 DOM 违例
  PASS  tap-feedback selftest(双向红测:尺寸/反馈阳性全中 + 过渡·祖先链·不可点三类假阳 0)
  PASS  tap-feedback 无新违例(扫 5 路由 / 176 个 tap 目标;存量黄灯 11 条)
━━ result: 327 pass, 0 fail ━━

$ node scripts/tap-feedback-probe.mjs --selftest ; echo exit=$?
exit=0
$ node scripts/tap-feedback-probe.mjs --sweep all --report … ; echo exit=$?
tap-feedback 无新违例(扫 88 路由 / 919 个 tap 目标;存量黄灯 11 条)
exit=0
```

两点要记下来:

1. **全绿正是本报告要说的问题** —— verify 绿 ≠ 达标。尺寸门在正文中不触发,所以 38 处违例一条都拦不下来。
2. 门自己打印的 `扫 5 路由 / 176 个 tap 目标`,与台账 `scope: "all(88 路由 / 921 个真 tap 目标)"` 直接对不上 —— 这就是 P2-3 的实证。

---

## 建议修复顺序

1. **先修门,再修页**(否则修完仍无法验证):`tap-feedback-probe.mjs` 的 tap 集合按事件类型分开,`hasTapAncestor` 只认 `click`;反馈检查去掉 `leaf` 限制,改用"同动作父级可代偿"的判据;加可感知幅度门槛;verify 改跑 `--sweep all`
2. 修门后重跑,把 38 处热区违例逐条补到 44pt(优先 daily 的 7 个 `Claim`、me 的账单链接、store 的 `Trade in →`、以及三处 34px 分段/Rules 控件)
3. `section-header` 的 −20px 补偿挪进 `v-if` 分支
4. `nova-card-slot.vue:10` 等 8 处次感知反馈按《08》§2 归档到正常档位
5. 台账补 `size|g.cursor-pointer|*` 的 Essential 豁免 entry(带理由),并把两条 `feedback|g.cursor-pointer` 的理由改成真正的反馈理由或改为修复
6. 删掉根目录 `--diff` 垃圾文件

---

## 附:验收产物

- 我的探针原件:`.trash/2026-07-23-c3-acceptance/zz-acceptance-*.mjs`(7 个,含红测)
- 全量数据:`%TMP%/indep-all.json`(反馈,88 路由 945 条)、`%TMP%/indep-size.json`(尺寸,88 路由 106 条)、`%TMP%/ac34.json`(双主题溢出/报错)
- 截图:`%TMP%/c3-sechdr-before.png` / `c3-sechdr-after.png`
