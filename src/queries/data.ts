import { getStringBetween, parseConfigString, parseRoamDateString } from '~/utils/string';
import * as stringUtils from '~/utils/string';
import { CompleteRecords, Records, RecordUid, ReviewModes } from '~/models/session';
import { Today } from '~/models/practice';
import {
  addDueCards,
  addNewCards,
  calculateCombinedCounts,
  calculateCompletedTodayCounts,
  calculateTodayStatus,
  initializeToday,
  restoreCompletedUids,
} from '~/queries/today';
import { getChildBlocksOnPage } from './utils';
// 🎯 FIXED: 直接导入协同排名系统函数，避免动态导入问题
import { loadCardRankings, saveCardRankings } from '~/queries/save';

// 🎯 改进：使用模块级状态而非全局状态，减少竞态条件风险
const prefillState = {
  isInProgress: false,
  lastTime: 0,
  debounceMs: 1000,
};

export const getPracticeData = async ({
  tagsList,
  dataPageTitle,
  dailyLimit,
  isCramming,
  shuffleCards,
  cachedData,
  defaultPriority = 70,
}) => {
  const pluginPageData = (await getPluginPageData({
    dataPageTitle,
    limitToLatest: false,
  })) as CompleteRecords;

  const today = initializeToday({ tagsList, cachedData });
  const sessionData = {};
  const cardUids: Record<string, RecordUid[]> = {};

  for (const tag of tagsList) {
    const { sessionData: currentSessionData, cardUids: currentCardUids } = await getSessionData({
      pluginPageData,
      tag,
      dataPageTitle,
    });

    sessionData[tag] = currentSessionData;
    cardUids[tag] = currentCardUids;
  }

  // 计算所有tagged的卡片
  const allCardUids = new Set<string>();
  for (const tag of tagsList) {
    cardUids[tag].forEach(uid => allCardUids.add(uid));
  }
  const allCardsCount = Math.max(1, allCardUids.size);

  // 🚀 FIXED: 先更新排序列表，再加载 - 让用户设置立即生效
  await updatePriorityOrderWithSettings(allCardUids, dataPageTitle, defaultPriority);
  
  // 加载更新后的卡片排名列表
  const priorityOrder = await loadCardRankings({ dataPageTitle });

  await calculateCompletedTodayCounts({
    today,
    tagsList,
    sessionData,
  });

  addNewCards({ today, tagsList, cardUids, pluginPageData, shuffleCards, priorityOrder });
  addDueCards({
    today,
    tagsList,
    sessionData,
    isCramming,
    shuffleCards,
    priorityOrder,
  });

  calculateCombinedCounts({ today, tagsList });
  limitRemainingPracticeData({ today, dailyLimit, tagsList, isCramming });
  calculateCombinedCounts({ today, tagsList });
  calculateTodayStatus({ today, tagsList });

  return {
    practiceData: pluginPageData,
    todayStats: today,
    allCardsCount,
    priorityOrder,
    allCardUids: Array.from(allCardUids),
  };
};

// 🚀 NEW: 根据当前设置更新排序列表
const updatePriorityOrderWithSettings = async (
  allCardUids: Set<string>, 
  dataPageTitle: string, 
  defaultPriority: number
) => {
  // 防重复执行检查
  const now = Date.now();
  if (prefillState.isInProgress || (now - prefillState.lastTime) < prefillState.debounceMs) {
    return;
  }

  prefillState.isInProgress = true;
  prefillState.lastTime = now;

  try {
    // 1. 加载现有排序列表
    const existingPriorityOrder = await loadCardRankings({ dataPageTitle });
    
    // 2. 找出缺失的新卡片
    const missingCards = Array.from(allCardUids).filter(uid => !existingPriorityOrder.includes(uid));
    
    if (missingCards.length === 0) {
      if (process.env.NODE_ENV === 'development') {
        console.log('🎯 [排序更新] 无新卡片，无需更新');
      }
      return;
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('🎯 [排序更新] 发现新卡片:', missingCards, '当前defaultPriority:', defaultPriority);
    }
    
    // 3. 新卡片倒序进入排名列表
    const reversedMissingCards = [...missingCards].reverse();
    
    // 4. 根据当前defaultPriority计算插入位置
    const totalCardsAfter = existingPriorityOrder.length + reversedMissingCards.length;
    const insertPosition = Math.max(0, Math.ceil(totalCardsAfter * (1 - defaultPriority / 100)) - 1);
    
    // 5. 生成新的排序列表
    const updatedPriorityOrder = [...existingPriorityOrder];
    updatedPriorityOrder.splice(insertPosition, 0, ...reversedMissingCards);
    
    if (process.env.NODE_ENV === 'development') {
      console.log('🎯 [排序更新] 插入位置:', insertPosition, '更新后排序:', updatedPriorityOrder);
    }
    
    // 6. 保存更新后的排序列表
    await saveCardRankings({ 
      dataPageTitle, 
      rankings: updatedPriorityOrder 
    });
    
    if (process.env.NODE_ENV === 'development') {
      console.log('🎯 [排序更新] 排序列表已保存');
    }
  } catch (error) {
    console.error('🎯 [排序更新] 更新失败:', error);
  } finally {
    prefillState.isInProgress = false;
  }
};

export const getDataPageQuery = (dataPageTitle) => `[
  :find ?page
  :where
    [?page :node/title "${dataPageTitle}"]
]`;

export const dataPageReferencesIdsQuery = `[
  :find ?refUid
  :in $ ?tag ?dataPage
  :where
    [?tagPage :node/title ?tag]
    [?tagRefs :block/refs ?tagPage]
    [?tagRefs :block/uid ?refUid]
    [?tagRefs :block/page ?homePage]
    [(!= ?homePage ?dataPage)]
  ]`;
const getPageReferenceIds = async (tag, dataPageTitle): Promise<string[]> => {
  // First query the data page so that we can exclude those references from the results
  const dataPageResult = window.roamAlphaAPI.q(getDataPageQuery(dataPageTitle));

  const dataPageUid = dataPageResult.length ? dataPageResult[0][0] : '';

  const results = window.roamAlphaAPI.q(dataPageReferencesIdsQuery, tag, dataPageUid);

  return results.map((arr) => arr[0]);
};

export const getSelectedTagPageBlocksIds = async (selectedTag): Promise<string[]> => {
  const queryResults = await getChildBlocksOnPage(selectedTag);

  if (!queryResults.length) return [];

  const children = queryResults[0][0].children;
  const filteredChildren = children.filter((child) => !!child.string);

  return filteredChildren.map((arr) => arr.uid);
};

// Ensure that the reviewMode field is always present
const ensureReviewModeField = (record) => {
  const hasReviewModeField = record.children.some((child) => child.string.includes('reviewMode'));
  const children = hasReviewModeField
    ? record.children
    : [
        ...record.children,
        {
          order: record.children.length,
          string: `reviewMode:: ${ReviewModes.DefaultSpacedInterval}`,
        },
      ];

  return {
    ...record,
    children,
  };
};

const parseFieldValues = (object, node) => {
  for (const field of ensureReviewModeField(node).children) {
    const [key, value] = parseConfigString(field.string);

    if (key === 'nextDueDate') {
      object[key] = parseRoamDateString(getStringBetween(value, '[[', ']]'));
    } else if (value === 'true' || value === 'false') {
      object[key] = value === 'true';
    } else if (stringUtils.isNumeric(value)) {
      object[key] = Number(value);
    } else {
      object[key] = value;
    }
  }
};

const mapPluginPageDataLatest = (queryResultsData): Records =>
  queryResultsData
    .map((arr) => arr[0])[0]
    .children?.reduce((acc, cur) => {
      const uid = getStringBetween(cur.string, '((', '))');
      acc[uid] = {};

      if (!cur.children) return acc;

      const latestChild = cur.children.find((child) => child.order === 0);
      acc[uid].dateCreated = parseRoamDateString(getStringBetween(latestChild.string, '[[', ']]'));

      if (!latestChild.children) return acc;
      parseFieldValues(acc[uid], latestChild);

      return acc;
    }, {}) || {};

const mapPluginPageData = (queryResultsData): CompleteRecords =>
  queryResultsData
    .map((arr) => arr[0])[0]
    .children?.reduce((acc, cur) => {
      const uid = getStringBetween(cur.string, '((', '))');
      acc[uid] = [];

      // Add date
      if (!cur.children) return acc;

      for (const child of cur.children) {
        const record = {
          refUid: uid,
          dateCreated: parseRoamDateString(getStringBetween(child.string, '[[', ']]')),
        };

        if (!child.children) return acc;

        parseFieldValues(record, child);

        acc[uid].push(record);
      }

      return acc;
    }, {}) || {};

export const getPluginPageBlockDataQuery = `[
  :find (pull ?pluginPageChildren [
    :block/string
    :block/children
    :block/order
    {:block/children ...}])
    :in $ ?pageTitle ?dataBlockName
    :where
    [?page :node/title ?pageTitle]
    [?page :block/children ?pluginPageChildren]
    [?pluginPageChildren :block/string ?dataBlockName]
  ]`;

const getPluginPageBlockData = async ({ dataPageTitle, blockName }) => {
  return await window.roamAlphaAPI.q(getPluginPageBlockDataQuery, dataPageTitle, blockName);
};

export const getPluginPageData = async ({ dataPageTitle, limitToLatest = true }) => {
  const queryResultsData = await getPluginPageBlockData({ dataPageTitle, blockName: 'data' });

  if (!queryResultsData.length) return {};

  return limitToLatest
    ? mapPluginPageDataLatest(queryResultsData)
    : mapPluginPageData(queryResultsData);
};

const mapPluginPageCachedData = (queryResultsData) => {
  const data = queryResultsData.map((arr) => arr[0])[0].children;
  if (!data || !data.length) return {};

  if (!data?.length) return {};

  return (
    data.reduce((acc, cur) => {
      const tag = getStringBetween(cur.string, '[[', ']]');
      acc[tag] =
        cur.children?.reduce((acc, cur) => {
          if (!cur.string) return acc;
          const [key, value] = cur.string.split('::').map((s: string) => s.trim());

          const date = parseRoamDateString(value);
          acc[key] = date ? date : value;

          return acc;
        }, {}) || {};
      return acc;
    }, {}) || {}
  );
};

export const getPluginPageCachedData = async ({ dataPageTitle }) => {
  const queryResultsData = await getPluginPageBlockData({ dataPageTitle, blockName: 'cache' });

  if (!queryResultsData.length) return {};

  return mapPluginPageCachedData(queryResultsData);
};

/**
 * Gets all the card referencing a tag, then finds all the practice session data for those cards
 */
export const getSessionData = async ({
  pluginPageData,
  tag,
  dataPageTitle,
}: {
  pluginPageData: CompleteRecords;
  tag: string;
  dataPageTitle: string;
}) => {
  // Get all the cards for the tag
  const tagReferencesIds = await getPageReferenceIds(tag, dataPageTitle);
  const tagPageBlocksIds = await getSelectedTagPageBlocksIds(tag);
  const allTagCardsUids = tagReferencesIds.concat(tagPageBlocksIds);

  // Filter out due cards that aren't references to the currently selected tag
  // @TODO: we could probably do this at getPluginPageData query for a
  // performance boost
  const selectedTagCardsData = Object.keys(pluginPageData).reduce((acc, cur) => {
    if (allTagCardsUids.indexOf(cur) > -1) {
      acc[cur] = pluginPageData[cur];
    }
    return acc;
  }, {});

  return {
    sessionData: selectedTagCardsData,
    cardUids: allTagCardsUids,
  };
};

/**
 *  Limit of cards to practice ensuring that due cards are always
 *  first but ~25% new cards are still practiced when limit is less than total due
 *  cards.
 */
const limitRemainingPracticeData = ({
  today,
  dailyLimit,
  tagsList,
  isCramming,
}: {
  today: Today;
  dailyLimit: number;
  tagsList: string[];
  isCramming: boolean;
}) => {
  const totalCards = today.combinedToday.due + today.combinedToday.new;

  // When no need to limit, return;
  if (!dailyLimit || !totalCards || isCramming) {
    return;
  }

  restoreCompletedUids({ today, tagsList });

  // Initialize selected cards
  const selectedCards = tagsList.reduce(
    (acc, currentTag) => ({
      ...acc,
      [currentTag]: {
        newUids: [],
        dueUids: [],
      },
    }),
    {}
  );

  // @MAYBE: Consider making this a config option
  const targetNewCardsRatio = 0.25;
  const targetTotalCards = dailyLimit;
  // We use Math.max here to ensure we have at leats one card even when targetTotal is < 4.
  // The exception is when targetTotal is 1, in which case we want to prioritize due cards
  const targetNewCards =
    targetTotalCards === 1 ? 0 : Math.max(1, Math.floor(targetTotalCards * targetNewCardsRatio));
  const targetDueCards = targetTotalCards - targetNewCards;

  let totalNewAdded = 0;
  let totalDueAdded = 0;
  let totalAdded = totalNewAdded + totalDueAdded;

  // Add one card at a time (Round Robin style) to evenly select cards from each
  // deck.
  roundRobinLoop: while (totalAdded < totalCards) {
    for (const currentTag of tagsList) {
      // if (rounds > 5) break roundRobinLoop;
      totalAdded = totalNewAdded + totalDueAdded;

      if (totalAdded === targetTotalCards) {
        break roundRobinLoop;
      }

      const currentCards = selectedCards[currentTag];
      const nextNewIndex = currentCards.newUids.length;
      const nextNewCard = today.tags[currentTag].newUids[nextNewIndex];
      const nextDueIndex = currentCards.dueUids.length;
      const nextDueCard = today.tags[currentTag].dueUids[nextDueIndex];

      const stillNeedNewCards = totalNewAdded < targetNewCards;
      const stillNeedDueCards = totalDueAdded < targetDueCards;
      const stillHaveDueCards = !!nextDueCard || totalDueAdded < today.combinedToday.due;
      const stillHaveNewCards = !!nextNewCard || totalNewAdded < today.combinedToday.new;

      // Add new card
      if (nextNewCard && (stillNeedNewCards || !stillHaveDueCards)) {
        selectedCards[currentTag].newUids.push(today.tags[currentTag].newUids[nextNewIndex]);
        totalNewAdded++;

        continue;
      }

      // Add due card
      if (nextDueCard && (stillNeedDueCards || !stillHaveNewCards)) {
        selectedCards[currentTag].dueUids.push(today.tags[currentTag].dueUids[nextDueIndex]);
        totalDueAdded++;

        continue;
      }
    }
  }

  // Now that we've generated the original distribution we can subtract
  // completed cards from selected cards without affecting the original
  // distribution
  for (const tag of tagsList) {
    const tagStats = today.tags[tag];
    const completedDueUids = tagStats.completedDueUids;
    const completedNewUids = tagStats.completedNewUids;
    const remainingTargetDue = Math.max(
      selectedCards[tag].dueUids.length - completedDueUids.length,
      0
    );
    const remainingTargetNew = Math.max(
      selectedCards[tag].newUids.length - completedNewUids.length,
      0
    );

    selectedCards[tag].dueUids = selectedCards[tag].dueUids.slice(0, remainingTargetDue);
    selectedCards[tag].newUids = selectedCards[tag].newUids.slice(0, remainingTargetNew);
  }

  // Replace today values with selected cards
  for (const tag of tagsList) {
    today.tags[tag] = {
      ...today.tags[tag],
      dueUids: selectedCards[tag].dueUids,
      newUids: selectedCards[tag].newUids,
      due: selectedCards[tag].dueUids.length,
      new: selectedCards[tag].newUids.length,
    };
  }
};
