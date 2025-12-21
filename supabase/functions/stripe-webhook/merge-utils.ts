/**
 * メンバーレコードマージユーティリティ
 * 孤児レコード検出とマージ判定のロジック
 */

export interface MemberRecord {
  id: string;
  email: string | null;
  line_user_id: string | null;
  tier: string | null;
}

/**
 * 孤児レコードかどうかを判定
 * - emailがnullでline_user_idがあり、tierがfreeの場合は孤児
 */
export function isOrphanRecord(record: MemberRecord): boolean {
  return record.email === null &&
    record.line_user_id !== null &&
    record.tier === "free";
}

/**
 * マージ可能かどうかを判定
 * - 有料レコードにline_user_idがない場合、孤児レコードからマージ可能
 */
export function canMergeLineId(
  paidRecord: MemberRecord,
  orphanRecord: MemberRecord,
): boolean {
  // 有料レコードにline_user_idがすでにある場合はマージ不可
  if (paidRecord.line_user_id !== null) {
    return false;
  }
  // 孤児レコードにline_user_idがない場合もマージ不可
  if (orphanRecord.line_user_id === null) {
    return false;
  }
  // 孤児レコードでなければマージ不可
  if (!isOrphanRecord(orphanRecord)) {
    return false;
  }
  return true;
}

/**
 * 重複レコードかどうかを判定
 * - 同じline_user_idを持つ複数のレコードが存在
 */
export function isDuplicateByLineId(
  records: MemberRecord[],
  lineUserId: string,
): boolean {
  const matchingRecords = records.filter((r) => r.line_user_id === lineUserId);
  return matchingRecords.length > 1;
}

/**
 * マージ対象の孤児レコードを特定
 * - emailがnull、line_user_idがあり、tierがfreeのレコードを返す
 */
export function findOrphanRecords(records: MemberRecord[]): MemberRecord[] {
  return records.filter(isOrphanRecord);
}

/**
 * 有料tierかどうかを判定
 */
export function isPaidTier(tier: string | null): boolean {
  return tier === "library" || tier === "master";
}
