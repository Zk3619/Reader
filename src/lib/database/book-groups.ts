/**
 * 书籍分组数据访问对象（兼容层 → reader_book_groups / audio_groups）
 * @deprecated 新代码请使用 media-groups.ts
 */

export {
  getShelfGroups as getAllGroups,
  getUserGroups,
  getGroupById,
  getGroupByName,
  insertGroup,
  updateGroup,
  deleteGroup,
  enableGroup,
  getGroupIdsSum,
  getMaxOrder,
  canAddGroup,
  getUnusedGroupId,
  updateGroupsOrder,
} from '@/lib/database/media-groups';
