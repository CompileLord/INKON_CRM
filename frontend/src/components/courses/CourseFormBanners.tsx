import { useTranslation } from "react-i18next";

interface CourseFormBannersProps {
  formError: string | undefined;
  hasPartialSuccess: boolean;
}

export function CourseFormBanners({ formError, hasPartialSuccess }: CourseFormBannersProps) {
  const { t } = useTranslation("courses");

  return (
    <>
      {formError && (
        <div role="alert" className="rounded-[10px] border border-destructive p-3 text-sm text-destructive">
          {formError}
        </div>
      )}

      {hasPartialSuccess && (
        <div role="alert" className="flex flex-col gap-1 rounded-[10px] border border-border bg-strip p-4 text-sm text-ink">
          <h3 className="font-semibold text-ink">{t("form.partialImageSuccessTitle")}</h3>
          <p className="text-muted">{t("form.partialImageSuccessMessage")}</p>
        </div>
      )}
    </>
  );
}
