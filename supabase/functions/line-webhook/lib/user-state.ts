/**
 * ユーザー状態管理モジュール
 */
import { extractErrorMessage } from "../../_shared/error-utils.ts";
import { anonymizeUserId, createLogger } from "../../_shared/logger.ts";
import { supabase } from "../../_shared/supabase.ts";
import type { DiagnosisState } from "./diagnosis-flow.ts";

const log = createLogger("user-state");

/** ユーザーモード（プロンプト整形 or リスクチェック） */
export type UserMode = "polish" | "risk_check" | null;

/** ユーザー状態（診断 or ツールモード） */
export interface UserState {
  mode?: UserMode;
  diagnosis?: DiagnosisState;
  pendingEmail?: string; // メルマガ同意確認待ちのメールアドレス
}

/**
 * ユーザー状態を取得
 */
export async function getUserState(
  lineUserId: string,
): Promise<UserState | null> {
  const { data, error } = await supabase
    .from("users")
    .select("diagnosis_state")
    .eq("line_user_id", lineUserId)
    .maybeSingle();

  if (error) {
    log.error("getUserState failed", {
      userId: anonymizeUserId(lineUserId),
      errorMessage: error.message,
    });
    return null;
  }

  return data?.diagnosis_state as UserState | null;
}

/**
 * ユーザー状態を更新
 */
export async function updateUserState(
  lineUserId: string,
  state: UserState | null,
): Promise<void> {
  const { error } = await supabase
    .from("users")
    .update({ diagnosis_state: state })
    .eq("line_user_id", lineUserId);

  if (error) {
    log.error("updateUserState failed", {
      userId: anonymizeUserId(lineUserId),
      errorMessage: error.message,
    });
  }
}

/**
 * ユーザー状態をクリア
 */
export async function clearUserState(lineUserId: string): Promise<void> {
  await updateUserState(lineUserId, null);
}

/**
 * 診断状態を取得
 */
export async function getDiagnosisState(
  lineUserId: string,
): Promise<DiagnosisState | null> {
  const state = await getUserState(lineUserId);
  return state?.diagnosis ?? null;
}

/**
 * 診断状態を更新
 */
export async function updateDiagnosisState(
  lineUserId: string,
  diagnosisState: DiagnosisState | null,
): Promise<void> {
  if (diagnosisState) {
    await updateUserState(lineUserId, { diagnosis: diagnosisState });
  } else {
    await clearUserState(lineUserId);
  }
}

/**
 * 診断状態をクリア
 */
export async function clearDiagnosisState(lineUserId: string): Promise<void> {
  await clearUserState(lineUserId);
}

/**
 * ツールモードを設定
 */
export async function setToolMode(
  lineUserId: string,
  mode: UserMode,
): Promise<void> {
  log.info("Setting tool mode", { userId: anonymizeUserId(lineUserId), mode });
  await updateUserState(lineUserId, { mode });
}

/**
 * ツールモードを取得
 */
export async function getToolMode(lineUserId: string): Promise<UserMode> {
  const state = await getUserState(lineUserId);
  return state?.mode ?? null;
}

/**
 * 保留中のメールアドレスを設定
 */
export async function setPendingEmail(
  lineUserId: string,
  email: string,
): Promise<void> {
  try {
    log.debug("setPendingEmail called", {
      userId: anonymizeUserId(lineUserId),
    });
    const currentState = await getUserState(lineUserId);
    await updateUserState(lineUserId, { ...currentState, pendingEmail: email });
    log.info("Pending email saved", { userId: anonymizeUserId(lineUserId) });
  } catch (err) {
    log.error("setPendingEmail failed", {
      userId: anonymizeUserId(lineUserId),
      errorMessage: extractErrorMessage(err),
    });
    throw err;
  }
}

/**
 * 保留中のメールアドレスを取得
 */
export async function getPendingEmail(
  lineUserId: string,
): Promise<string | null> {
  const state = await getUserState(lineUserId);
  return state?.pendingEmail ?? null;
}

/**
 * 保留中のメールアドレスをクリア
 */
export async function clearPendingEmail(lineUserId: string): Promise<void> {
  const currentState = await getUserState(lineUserId);
  if (currentState) {
    const { pendingEmail: _, ...rest } = currentState;
    await updateUserState(
      lineUserId,
      Object.keys(rest).length > 0 ? rest : null,
    );
  }
}
