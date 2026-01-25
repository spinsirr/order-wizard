# FB Marketplace 一键上架功能设计

## 概述

Amazon Order Wizard 新增一键上架 FB Marketplace 功能，让用户可以快速将 Amazon 订单转卖到 Facebook Marketplace。支持单个/批量上架，可配置模板。

## 用户流程

### 单个上架

1. 用户在 Amazon 订单页面看到 "Save Order" 旁边的 "List on FB" 按钮
2. 点击后弹出预览窗口，显示：商品图片、标题、价格（根据模板计算）、描述
3. 用户可编辑任何字段、添加/删除图片
4. 点击确认，新标签页打开 FB Marketplace 创建页面，自动填充表单

### 批量上架

1. 用户在订单列表页可以勾选多个订单
2. 点击 "Batch List" 按钮，弹出队列预览（可逐个编辑或使用默认模板）
3. 确认后，右下角浮动窗口显示队列进度
4. 扩展依次打开 FB 标签页、填充、等待用户确认发布后处理下一个

### 首次使用

- 提供默认模板，用户开箱即用
- 可在 Options 页面自定义配置

## 数据爬取

### 从订单页获取（已有）

- 商品名称
- 商品图片
- 购买价格
- 订单日期

### 从商品主页额外爬取

- 商品描述（About this item）
- 商品特性/规格
- 商品分类（用于自动匹配 FB 分类）
- 更多/更高清的图片

### 爬取方式

使用后台 fetch 静默请求商品页 HTML 解析，用户无感知，体验更流畅。

## 技术架构

### 新增文件结构

```
apps/extension/src/
├── content/
│   ├── fbMarketplace/
│   │   ├── injector.ts      # 注入 "List on FB" 按钮
│   │   ├── scraper.ts       # 爬取商品主页详情
│   │   ├── formFiller.ts    # FB Marketplace 表单自动填充
│   │   └── previewModal.ts  # 预览/编辑弹窗
│   └── ...
├── background/
│   └── fbQueue.ts           # 批量队列管理
├── options/
│   ├── options.html         # Options 页面入口
│   └── Options.tsx          # 模板配置 UI
├── components/
│   └── FloatingQueue.tsx    # 右下角浮动进度窗
└── types/
    └── fbListing.ts         # Listing 相关类型定义
```

### 数据流

1. Content script 检测订单页 → 注入按钮
2. 点击按钮 → 发消息给 background script
3. Background 用 fetch 爬取商品主页 → 返回数据
4. Content script 显示预览弹窗
5. 确认后 → Background 管理队列，通知 FB 标签页的 content script 填充表单

## Options 页面配置

### 配置项

| 配置 | 类型 | 默认值 |
|------|------|--------|
| 售价折扣比例 | 数字滑块 | 80% |
| 商品状态 | 下拉选择 | New |
| 默认分类 | 下拉选择 | General |
| 取货地点 | 文本输入 | (空，FB会用用户位置) |
| 包含订单链接 | 开关 | 否 |
| 描述模板 | 多行文本 | 见下方 |

### 模板变量

- `{productName}` - 商品名称
- `{productDescription}` - 商品描述（从主页爬取）
- `{originalPrice}` - 原始价格
- `{sellingPrice}` - 计算后售价
- `{orderDate}` - 购买日期
- `{condition}` - 商品状态

### 默认描述模板

```
{productName}

{productDescription}

Condition: {condition}
Original price: ${originalPrice}
Purchased: {orderDate}

Pickup only. Message me if interested!
```

## 浮动队列窗口

### UI 设计

```
┌─────────────────────────────┐
│ FB Marketplace Queue    ─ ✕ │
├─────────────────────────────┤
│ ✓ iPhone Case         Done  │
│ ● USB Cable      Filling... │
│ ○ Keyboard           待处理 │
│ ○ Mouse              待处理 │
├─────────────────────────────┤
│ 1/4 completed    [Pause]    │
└─────────────────────────────┘
```

### 状态

- ○ 待处理（pending）
- ● 进行中（filling）- 正在填充 FB 表单
- ⏸ 等待确认（waiting）- 表单已填好，等用户在 FB 发布
- ✓ 完成（done）
- ✗ 失败（failed）- 可重试

### 交互

- 最小化按钮（─）→ 折叠成小图标，显示进度如 "2/4"
- 暂停/继续按钮 → 暂停队列处理
- 点击失败项 → 重试
- 关闭按钮（✕）→ 确认后清空队列

### 流程细节

- 每个订单填充完成后，状态变为 "等待确认"
- 用户在 FB 页面点击发布后，扩展检测到成功 → 标记完成 → 处理下一个

## FB Marketplace 表单填充

### 目标 URL

```
https://www.facebook.com/marketplace/create/item
```

### 填充字段

| 字段 | 填充方式 |
|------|----------|
| 图片 | 模拟文件上传（先下载 Amazon 图片为 Blob） |
| 标题 | 直接设置 input value + 触发 input 事件 |
| 价格 | 直接设置 input value |
| 分类 | 点击下拉 → 选择匹配项 |
| 状态 | 点击对应选项（New / Used - Like New 等） |
| 描述 | 设置 textarea value |
| 地点 | 如有配置，设置地点输入框 |

### 技术挑战

- FB 用 React，直接改 value 不会触发状态更新 → 需要 dispatch input/change 事件
- 图片上传需要构造 File 对象，模拟 drag-drop 或 input change
- 页面结构可能变化 → 用稳定的选择器（data-testid、aria-label）

### 填充完成后

- 不自动点击发布按钮（让用户最终确认）
- 扩展检测 URL 变化或成功提示 → 标记为完成

## 错误处理

### 爬取失败

- 商品页面无法访问 → 使用订单页已有信息，描述字段留空让用户填写
- 图片下载失败 → 提示用户手动上传图片

### 表单填充失败

- FB 页面结构变化 → 显示错误，提供手动复制数据的选项
- 用户未登录 FB → 提示登录后重试
- 填充超时 → 标记失败，可重试

### 队列中断

- 浏览器关闭 → 队列状态存储在 chrome.storage，重启后可恢复
- 用户关闭 FB 标签页 → 暂停当前项，提示用户

### 其他

- 订单已上架过 → 可选：记录已上架订单，显示提示避免重复
- Amazon 登录过期 → 提示用户刷新 Amazon 页面
