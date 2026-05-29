export const CCR_JOB_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;

export const CCR_JOB_NAME_HELP = "任务名必须以英文字母开头，只能包含英文字母、数字和下划线，例如 sync_cz 或 ccr_job_01";

export function isValidCcrJobName(name: string) {
  return CCR_JOB_NAME_PATTERN.test(name);
}
