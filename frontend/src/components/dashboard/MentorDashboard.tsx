import { useTranslation } from "react-i18next";
import { MentorStatsStrip } from "../mentor/MentorStatsStrip";
import { MentorTodayLessons } from "../mentor/MentorTodayLessons";
import { MentorGradingQueue } from "../mentor/MentorGradingQueue";
import { MentorActiveCourses } from "../mentor/MentorActiveCourses";
import { PageContainer } from "../ui/PageContainer";
import { PageHeader } from "../ui/PageHeader";

export function MentorDashboard() {
  const { t } = useTranslation("dashboard");
  return (
    <PageContainer>
      <PageHeader title={t("teacherDashboard")} />
      <MentorStatsStrip />
      <MentorTodayLessons />
      <MentorGradingQueue />
      <MentorActiveCourses />
    </PageContainer>
  );
}
