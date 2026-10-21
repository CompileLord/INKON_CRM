import { useTranslation } from "react-i18next";
import { StatGroup, StatTile } from "../ui/StatGroup";
import { ScoreFormat } from "../profile/ScoreFormat";
import { formatNumber } from "../../i18n/formatters";
import type { MentorProfileResponse } from "../../lib/users/types";

export function MentorSummary({ profile }: { profile: MentorProfileResponse }) {
  const { t, i18n } = useTranslation("mentorProfile");
  const share: number | null | undefined = profile.avg_score_defined_ratios_mean;
  return (
    <div data-profile-summary>
      <StatGroup>
        <StatTile label={t("summary.courses")} value={formatNumber(profile.active_courses.length, i18n.language)} />
        <StatTile label={t("summary.students")} value={formatNumber(profile.active_students_count, i18n.language)} />
        <StatTile label={t("summary.result")} value={ScoreFormat.shareLabel(share, i18n.language)} />
      </StatGroup>
    </div>
  );
}
