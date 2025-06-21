import * as stringUtils from '~/utils/string';
import * as dateUtils from '~/utils/date';
import { CompleteRecords } from '~/models/session';
import {
  createChildBlock,
  getChildBlock,
  getOrCreateBlockOnPage,
  getOrCreateChildBlock,
  getOrCreatePage,
  getChildBlocksOnPage,
  getChildBlocksByUid,
} from '~/queries/utils';

const getEmojiFromGrade = (grade) => {
  switch (grade) {
    case 5:
      return '🟢';
    case 4:
      return '🔵';
    case 3:
      return '🟠';
    case 2:
      return '🟠';
    case 0:
      return '🔴';
    default:
      return '🟢';
  }
};

export const savePracticeData = async ({ refUid, dataPageTitle, dateCreated, ...data }) => {
  await getOrCreatePage(dataPageTitle);
  const dataBlockUid = await getOrCreateBlockOnPage(dataPageTitle, 'data', -1, {
    open: false,
    heading: 3,
  });

  // Get child that matches refUid
  const cardDataBlockUid = await getOrCreateChildBlock(dataBlockUid, `((${refUid}))`, 0, {
    open: false,
  });

  const referenceDate = dateCreated || new Date();
  const dateCreatedRoamDateString = stringUtils.dateToRoamDateString(referenceDate);
  const emoji = getEmojiFromGrade(data.grade);
  const newDataBlockId = await createChildBlock(
    cardDataBlockUid,
    `[[${dateCreatedRoamDateString}]] ${emoji}`,
    0,
    {
      open: false,
    }
  );

  // Insert new block info
  const nextDueDate = data.nextDueDate || dateUtils.addDays(referenceDate, data.interval);

  for (const key of Object.keys(data)) {
    let value = data[key];
    if (key === 'nextDueDate') {
      value = `[[${stringUtils.dateToRoamDateString(nextDueDate)}]]`;
    } else if (key === 'fsrsState' && typeof value === 'object' && value !== null) {
      // 序列化FSRS状态对象为JSON字符串
      value = JSON.stringify(value);
    }

    await createChildBlock(newDataBlockId, `${key}:: ${value}`, -1);
  }
};

interface BulkSavePracticeDataOptions {
  token: string;
  records: CompleteRecords;
  selectedUids: string[];
  dataPageTitle: string;
}

export const bulkSavePracticeData = async ({
  token,
  records,
  selectedUids,
  dataPageTitle,
}: BulkSavePracticeDataOptions) => {
  await getOrCreatePage(dataPageTitle);
  const dataBlockUid = await getOrCreateBlockOnPage(dataPageTitle, 'data', -1, {
    open: false,
    heading: 3,
  });
  const graphName = window.roamAlphaAPI.graph.name;

  const payload = {
    graphName,
    data: {
      action: 'batch-actions',
      actions: [],
    },
  };

  // Create practice entries
  for (const refUid of selectedUids) {
    // Check if entry already exists, if it does, delete it first so we don't
    // have duplicates
    const existingEntryUid = getChildBlock(dataBlockUid, `((${refUid}))`);
    if (existingEntryUid) {
      payload.data.actions.push({
        action: 'delete-block',
        block: {
          uid: existingEntryUid,
        },
      });
    }

    const entryUid = window.roamAlphaAPI.util.generateUID();
    payload.data.actions.push({
      action: 'create-block',
      location: {
        'parent-uid': dataBlockUid,
        order: 0,
      },
      block: {
        string: `((${refUid}))`,
        uid: entryUid,
        open: false,
      },
    });

    // Add sessions
    const sessions = records[refUid];
    for (const session of sessions) {
      // Add Session Heading
      const dateCreatedRoamDateString = stringUtils.dateToRoamDateString(session.dateCreated);
      const emoji = getEmojiFromGrade(session.grade);
      const sessionHeadingUid = window.roamAlphaAPI.util.generateUID();
      payload.data.actions.push({
        action: 'create-block',
        location: {
          'parent-uid': entryUid,
          order: 0,
        },
        block: {
          string: `[[${dateCreatedRoamDateString}]] ${emoji}`,
          uid: sessionHeadingUid,
          open: false,
        },
      });

      // Add Session Data
      for (const key of Object.keys(session)) {
        let value = session[key];
        if (key === 'dateCreated') continue; // no need to store this
        if (key === 'nextDueDate') {
          value = `[[${stringUtils.dateToRoamDateString(value)}]]`;
        } else if (key === 'fsrsState' && typeof value === 'object' && value !== null) {
          // 序列化FSRS状态对象为JSON字符串
          value = JSON.stringify(value);
        }
        payload.data.actions.push({
          action: 'create-block',
          location: {
            'parent-uid': sessionHeadingUid,
            order: -1,
          },
          block: {
            string: `${key}:: ${value}`,
            open: false,
          },
        });
      }
    }
  }
  const baseUrl = 'https://roam-memo-server.onrender.com';
  try {
    await fetch(`${baseUrl}/save-roam-sr-data`, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('Error Bulk Saving', error);
  }
};

// 🎯 协同排名系统 - 核心API函数
export const loadCardRankings = async ({ 
  dataPageTitle 
}: { 
  dataPageTitle: string; 
}): Promise<string[]> => {
  try {
    await getOrCreatePage(dataPageTitle);
    const dataBlockUid = await getOrCreateBlockOnPage(dataPageTitle, 'data', -1, {
      open: false,
      heading: 3,
    });

    // 查找"**Priority Rankings**"容器block
    const priorityContainerUid = getChildBlock(dataBlockUid, '**Priority Rankings**');
    if (!priorityContainerUid) return [];

    // 在容器中查找priority-ranking数据
    const containerBlocks = await getChildBlocksByUid(priorityContainerUid);
    const priorityBlock = containerBlocks?.find(block => 
      block.string && block.string.startsWith('priority-ranking::')
    );

    if (!priorityBlock) return [];

    const orderString = priorityBlock.string.replace('priority-ranking::', '').trim();
    if (!orderString) return [];

    // 支持双重括号格式的解析：((uid1)),((uid2)),((uid3))
    const rankings = orderString
      .split(',')
      .map(uid => uid.trim())
      .map(uid => {
        // 移除双重括号，如果存在的话
        if (uid.startsWith('((') && uid.endsWith('))')) {
          return uid.slice(2, -2);
        }
        return uid;
      })
      .filter(uid => uid);
    
    console.log('🎯 协同排名系统 - 从容器中成功读取排名列表:', rankings.length, '个卡片');
    return rankings;
  } catch (error) {
    console.error('协同排名系统 - 读取排名列表失败:', error);
    return [];
  }
};

export const saveCardRankings = async ({ 
  dataPageTitle, 
  rankings 
}: { 
  dataPageTitle: string; 
  rankings: string[]; 
}) => {
  try {
    if (!window.roamAlphaAPI) {
      throw new Error('Roam Alpha API 不可用');
    }

    await getOrCreatePage(dataPageTitle);
    const dataBlockUid = await getOrCreateBlockOnPage(dataPageTitle, 'data', -1, {
      open: false,
      heading: 3,
    });

    // 获取或创建"Priority Rankings"容器block
    const priorityContainerUid = await getOrCreateChildBlock(
      dataBlockUid, 
      '**Priority Rankings**', // 使用粗体格式标识
      0, // 放在data block的最前面
      { 
        open: false,
        // 移除heading属性，使用普通block
      }
    );

    // 在容器中查找现有的priority-ranking数据
    const containerBlocks = await getChildBlocksByUid(priorityContainerUid);
    const existingRankingBlock = containerBlocks?.find(block => 
      block.string && block.string.startsWith('priority-ranking::')
    );
    
    // 使用双重括号格式：((uid1)),((uid2)),((uid3))
    const rankingString = rankings.map(uid => `((${uid}))`).join(',');
    const fullString = `priority-ranking:: ${rankingString}`;
    
    if (existingRankingBlock) {
      // 更新现有的ranking block
      await window.roamAlphaAPI.updateBlock({
        block: {
          uid: existingRankingBlock.uid,
          string: fullString
        }
      });
      console.log('🎯 协同排名系统 - 在容器中更新排名列表:', rankings.length, '个卡片');
    } else {
      // 在容器中创建新的ranking block
      await createChildBlock(priorityContainerUid, fullString, -1);
      console.log('🎯 协同排名系统 - 在容器中创建排名列表:', rankings.length, '个卡片');
    }
  } catch (error) {
    console.error('协同排名系统 - 保存排名列表失败:', error);
    throw error;
  }
};

// 🎯 获取卡片的当前排名
export const getCardRank = (cardUid: string, rankings: string[]): number => {
  const index = rankings.indexOf(cardUid);
  return index === -1 ? rankings.length + 1 : index + 1; // 排名从1开始
};

// 🎯 批量保存排名变更（协同处理）
export const bulkSaveRankingChanges = async ({ 
  rankingChanges,
  dataPageTitle,
  allCardUids
}: { 
  rankingChanges: Record<string, number>; 
  dataPageTitle: string;
  allCardUids: string[];
}) => {
  try {
    let currentRankings = await loadCardRankings({ dataPageTitle });
    if (currentRankings.length === 0) {
      currentRankings = [...allCardUids];
    }
    
    let newRankings = [...currentRankings];
    
    // 处理每个变更（按照目标排名从小到大处理，确保正确性）
    const sortedChanges = Object.entries(rankingChanges).sort(([,a], [,b]) => a - b);
    
    for (const [cardUid, targetRank] of sortedChanges) {
      newRankings = newRankings.filter(uid => uid !== cardUid);
      const insertIndex = Math.max(0, Math.min(targetRank - 1, newRankings.length));
      newRankings.splice(insertIndex, 0, cardUid);
    }
    
    await saveCardRankings({ dataPageTitle, rankings: newRankings });
  } catch (error) {
    console.error('协同排名系统 - 批量保存排名变更失败:', error);
    throw error;
  }
};
