# Priority Rankings 数据容器化改进

## 概述

为了优化 `priority-ranking` 数据字段的显示结构，我们添加了一个父级容器来组织这些数据，使页面结构更加清晰整洁。

## 更改前的数据结构

```
data (heading 3)
├── priority-ranking:: ((uid1)),((uid2)),((uid3))  <-- 直接暴露在data下
└── ((card_uid))
    └── [[date]] emoji
        ├── key:: value
        └── ...
```

## 更改后的数据结构

```
data (heading 3)
├── Priority Rankings (heading 6)  <-- 新增的容器block
│   └── priority-ranking:: ((uid1)),((uid2)),((uid3))  <-- 被包含在容器中
└── ((card_uid))
    └── [[date]] emoji
        ├── key:: value
        └── ...
```

## 主要优势

1. **组织性更好**: priority-ranking 数据被包含在专门的容器中
2. **页面更整洁**: 避免密密麻麻的数据字段直接暴露在data block下
3. **可折叠性**: 容器block可以折叠，隐藏详细的排名数据
4. **易于维护**: 所有排名相关的数据都集中在一个位置

## 技术实现

### 修改的函数

- `loadCardRankings()`: 现在在"Priority Rankings"容器中查找数据
- `saveCardRankings()`: 现在将数据保存到"Priority Rankings"容器中

### 容器特性

- **标题级别**: 6级标题 (heading 6)
- **位置**: 位于data block的最前面 (order: 0)
- **默认状态**: 折叠状态 (open: false)

## 向后兼容性

这个改进会自动将现有的 priority-ranking 数据迁移到新的容器结构中，不会丢失任何数据。

## 使用示例

当用户在页面中查看数据时，他们会看到：

```
### data
###### Priority Rankings
    priority-ranking:: ((card1)),((card2)),((card3))
((actual_card_ref))
    [[June 21st, 2024]] 🟢
        interval:: 7
        grade:: 5
        ...
```

这样用户可以专注于查看实际的卡片数据，而排名信息被整齐地收纳在专门的容器中。 