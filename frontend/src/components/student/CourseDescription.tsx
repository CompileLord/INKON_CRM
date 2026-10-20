import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { SectionCard } from "../ui/SectionCard";

const DESCRIPTION_COLLAPSE_THRESHOLD: number = 140;

interface CourseDescriptionProps {
  description: string;
}

export function CourseDescription({ description }: CourseDescriptionProps) {
  const { t } = useTranslation("student");
  const [open, setOpen] = useState<boolean>(false);
  const descriptionId: string = useId();
  const isLong: boolean = description.length > DESCRIPTION_COLLAPSE_THRESHOLD;

  return (
    <SectionCard title={t("courseDescription")}>
      <p id={descriptionId} className={`select-text break-words text-sm leading-6 text-muted ${open ? "" : "line-clamp-2"}`}>
        {description}
      </p>
      {isLong && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={descriptionId}
          onClick={() => setOpen((current: boolean) => !current)}
          className="inline-flex min-h-11 w-fit items-center text-sm font-medium text-maroon-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {open ? t("showLess") : t("showMore")}
        </button>
      )}
    </SectionCard>
  );
}
