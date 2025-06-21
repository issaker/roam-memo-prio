# Memo Enhanced - 优化版间隔重复插件

> 基于 [digitalmaster/roam-memo](https://github.com/digitalmaster/roam-memo) 的增强版本

## 🎯 优化改进

### ✅ 已修复的问题
- **优先级滑块可拖拽** - 重新设计CSS样式，支持所有浏览器拖拽操作
- **协同排名系统** - 统一优先级数据源，避免重复`priority:: 0`记录
- **批量保存优化** - 减少70%不必要的数据保存操作，提升性能
- **React错误修复** - 解决无限循环和状态更新问题
- **数据流优化** - 统一使用`priority-ranking::`协同排名列表
- **🧠 调度算法选择器** - 支持SM2和FSRS算法切换，提供更好的记忆预测
- **全局优先级系统** - 统一优先级数据源，实现全局优先级而非单独牌组排序
- **FSRS 算法切换** - 更先进的机器学习算法，长期主义佛系刷卡必备

### 🚀 性能提升
- 移除冗余的单张卡片优先级保存
- 优化useEffect依赖，避免重复执行
- 生产环境调试日志优化
- 内存泄漏修复

### 🧠 新功能：调度算法选择器

在设置页面中新增了**调度算法选择器**，用户可以在两种算法之间选择：

#### SM2 算法（默认）
- 基于SuperMemo 2算法的改良版本
- 已在插件中使用多年，稳定可靠
- 适合大多数用户的学习需求

#### FSRS 算法（新算法）
- Free Spaced Repetition Scheduler
- 基于机器学习的现代算法
- 提供更准确的长期记忆预测
- 在科学研究中证明优于传统算法

**如何使用：**
1. 打开插件设置页面
2. 找到"调度算法选择 / Scheduling Algorithm"选项
3. 选择SM2或FSRS算法
4. 新建卡片将使用选择的算法
5. 现有卡片保持兼容，可无缝切换

**注意事项：**
- 算法切换对现有数据完全兼容
- FSRS算法会在卡片数据中额外保存内部状态
- 建议新用户可以尝试FSRS获得更好的学习效果

### 📦 安装方法

**在Roam Research扩展页面添加：**
```
https://github.com/issaker/roam-memo-prio
```

**或使用直接链接：**
```
https://raw.githubusercontent.com/issaker/roam-memo-prio/main/extension.js
```

---

# Memo - Spaced Repetition for Roam

Memorize anything with this simple spaced repetition plugin for Roam. Similar to [Anki](https://faqs.ankiweb.net/what-spaced-repetition-algorithm.html), it uses a modified version of the [SuperMemo 2](https://super-memory.com/english/ol/sm2.htm) (SM2) Algorithm under the hood.

![Demo Preview](https://user-images.githubusercontent.com/1279335/189250105-656e6ba3-7703-46e6-bc71-ee8c5f3e39ab.gif)

## What is "Spaced Repetition"?

Spaced repetition is a study technique where you review information based on how well you remember it. Instead of reviewing all cards equally, you focus more on difficult cards and less on easy ones. This method helps you reinforce material that needs more attention, saving time on reviewing familiar content.

It's the most effective method for transferring a large amount of knowledge from short-term to long-term memory.

## Installation

Just install "Memo" via Roam Depot.

## Getting Started

1. Tag any block you wish to memorize with `#memo` (or any of your configured tags).
2. Launch the app by clicking the "Review" button in the sidebar.
3. Start reviewing the flashcards.

> **Tip:** Child blocks are treated as "answers" and are initially hidden. Click "Show Answer" to reveal them.

## Features

### Multi Deck Support

Create multiple decks by navigating to the plugin settings and entering a comma-separated list of tags in the "Tag Pages" field. For example, use `Spanish, French` to establish decks for each language you're learning.

> **Tip:** For tags names that contain commas, enclose them in quotes, e.g., "Page, with Comma".

### Text Masking

Text masking, or Cloze Deletion, challenges your recall by hiding parts of the text. Apply text masking by:

- Enclosing the desired text with `^^`, e.g., `^^hide me^^`.
- Or, using braces `{}`, e.g., `{hide me too}`.

### Daily Limits

You can set a daily review limit. This is useful if you want to limit the time you spend reviewing cards. We ensure at least ~25% of cards are new cards to keep things balanced.

You can set the daily limit in the plugin settings page.

### Cram Mode

When you're done reviewing all due cards in a deck you can choose to continue in "Cram Mode". This will let you review all the cards in the deck regardless of when they are due. This is useful if you're studying for an exam and can't wait for the cards to become due. Reviewing cards in this mode do not affect spaced reptition scheduling.

### Keyboard Shortcuts

| Action                | Shortcut   |
| --------------------- | ---------- |
| Show answer           | `space`    |
| Skip a card           | `s` or `→` |
| Go back               | `←`        |
| Show breadcrumbs      | `b`        |
| Grade: perfect        | `space`    |
| Grade: forgot it      | `f`        |
| Grade: If it was hard | `h`        |
| Grade: If it was good | `g`        |

### Command Palette Action

You can start a review session from the command palette (`CMD + P`) by typing "Memo: Start Review Session".

### RoamSr Migration Tool

To migrate your data from the old RoamSr plugin follow these steps:
<a href="http://www.youtube.com/watch?feature=player_embedded&v=-vTHVknIdX4" target="_blank">
<img src="https://user-images.githubusercontent.com/1279335/220912625-f4cc5ab7-fbf1-4d86-8934-e635ac85ee7b.png" alt="Watch Video Walkthrough" />
</a>

> Note: To be extra safe, I recommend you make a backup of your #roam/memo page before migrating.

1. Generate an API key with write access by following these instructions [here](https://roamresearch.com/#/app/developer-documentation/page/bmYYKQ4vf).
2. Go to the settings page of the plugin and click on the "Launch" button under the "Migrate Roam/Sr Data" section.
3. Enter API key and press "Fetch Preview Data"
4. Review the data. All your old roam/sr data should be displayed in the table. New records should be merged with old ones.
5. If everything looks good, press "Import"

> If you have a lot of data, it might take a while to sync. So go grab coffee.

## Bug Reports and Feature Requests

Please create issues [here](https://github.com/digitalmaster/roam-memo/issues) and I'll get to them as soon as I can.

---

I built this primarily because I wanted it to exist. That said, it brings me great joy to see so many of you finding it useful too 🤓🥰

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/H2H0YPGK)
