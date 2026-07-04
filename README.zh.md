# playcaptcha

一个抓娃娃机形式的验证码。

它会随机指定一个玩偶，你用摇杆（或方向键）控制爪子移动，按下红色按钮，爪子会下降并抓住正下方的玩偶。把它运到投放口上方并松手——抓对了即通过验证，抓错了玩偶会弹回堆里，重新来过。

底层没有物理引擎，只有阻尼弹簧和脚本化阶段，全部跑在一个 rAF 循环里。React 状态只在阶段切换时才变化，其余都是通过 ref 直接写 transform，在低配设备上也能保持流畅。

有一点显而易见但值得说明：这只验证用户是否在**操作**，而不验证是谁在操作。请把它放在真正的鉴权检查前面，不要用它替代真正的鉴权。

<video src="https://github.com/user-attachments/assets/bc6bd3f6-173a-4aa8-a2ac-09cb47742179" controls muted loop width="420"></video>

在线体验：https://feralui.vercel.app/#/captcha

本项目是 [FeralUI](https://github.com/mortspace/feralui) 的一部分。

## 安装

```bash
npm install playcaptcha
```

将 `assets/` 目录复制到你的应用静态资源目录下。组件默认在 `/toys/` 路径下查找玩偶图片，在 `/playcaptcha.svg` 路径下查找 logo，可通过 `assetBase` 修改。

```tsx
import { ClawCaptcha } from 'playcaptcha'
import 'playcaptcha/clawcaptcha.css'

<ClawCaptcha onVerify={() => unlock()} />
```

不传 `target` 时每次挂载会随机选一个玩偶。也可以固定指定：

```tsx
<ClawCaptcha target="duck" onVerify={() => unlock()} />
```

12 个玩偶 id：`duck`（小黄鸭）`bear`（泰迪熊）`panda`（熊猫）`bunny`（兔子）`dino`（恐龙）`penguin`（企鹅）`fox`（狐狸）`frog`（青蛙）`whale`（鲸鱼）`cat`（猫咪）`puppy`（小狗）`unicorn`（独角兽）

## Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `target` | `ToyId` | 随机 | 指定目标玩偶，不传时每次挂载随机选取。 |
| `onVerify` | `() => void` | — | 正确玩偶投入托盘时触发一次。 |
| `title` | `string` | — | 机器上方的标题，不传时使用当前语言的默认标题。 |
| `assetBase` | `string` | `'/toys/'` | 玩偶 PNG 图片的 URL 前缀。 |
| `className` | `string` | — | 根元素的额外 class。 |
| `language` | `'en' \| 'zh'` | `'en'` | 界面语言，支持英文和中文。 |
| `randomizeToyPosition` | `boolean` | `true` | 每次挂载时是否随机目标玩偶在堆里的位置。 |
| `randomizeClawPosition` | `boolean` | `true` | 每次挂载时是否随机爪子在轨道上的起始位置。 |

## 多语言

内置英文和中文支持：

```tsx
<ClawCaptcha language="zh" onVerify={() => unlock()} />
```

## 主题定制

在任意祖先元素上设置 CSS 变量：

```css
:root {
  --clawcap-bg: #ffffff;     /* 卡片背景 */
  --clawcap-ink: #1c1c1e;    /* 文字颜色 */
  --clawcap-muted: #8a8a8e;  /* 次要文字 */
  --clawcap-accent: #1c1c1e; /* 弹窗按钮 + 焦点环 */
  --clawcap-action: #ff5159; /* 大红按钮 */
}
```

键盘可完整操作（方向键 + 空格/回车），摇杆是真正的 slider role，`prefers-reduced-motion` 会将装饰性动画（入场翻滚、彩纸、环形脉冲）替换为即时状态切换。

MIT 协议。玩偶渲染图存放于 assets/toys。
