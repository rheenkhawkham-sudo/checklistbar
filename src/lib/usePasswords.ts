import { useCallback } from "react";
import { useI18n } from "@/lib/i18n";
import {
  requirePassword as basePrompt,
  changePassword as baseChange,
  type PasswordKind,
} from "@/lib/passwords";

export function usePasswords() {
  const { t } = useI18n();

  const require = useCallback(
    (kind: PasswordKind, promptKey: "enterToEditTasks" | "enterToEditEmails" | "enterToEditReport" | "enterToDeleteReport") =>
      basePrompt(kind, { prompt: t(promptKey), wrong: t("wrongPwAlert") }),
    [t],
  );

  const change = useCallback(
    (kind: PasswordKind) =>
      baseChange(kind, {
        current: t("promptCurrent"),
        wrongCurrent: t("pwWrong"),
        next: t("promptNew"),
        lengthErr: t("pwLengthErr"),
        confirm: t("promptConfirm"),
        mismatch: t("pwMismatch"),
        changed: t("pwChanged"),
      }),
    [t],
  );

  return { requirePassword: require, changePassword: change };
}
