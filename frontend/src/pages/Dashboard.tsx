import { useAuthStore } from "../store/authStore";
import { GreetingBanner } from "../components/dashboard/GreetingBanner";
import { StatsRow } from "../components/dashboard/StatsRow";
import { AttentionList } from "../components/dashboard/AttentionList";
import { ActivityFeed } from "../components/dashboard/ActivityFeed";
import { TodayLessons } from "../components/dashboard/TodayLessons";
import { AccountantDashboard } from "../components/dashboard/AccountantDashboard";
import { PageContainer } from "../components/ui/PageContainer";
import { MentorDashboard } from "../components/dashboard/MentorDashboard";
import { StudentDashboard } from "../components/dashboard/StudentDashboard";

export function Dashboard() {
  const role = useAuthStore((s) => s.role);

  if (role === "accountant") return <AccountantDashboard />;
  if (role === "mentor") return <MentorDashboard />;
  if (role === "student") return <StudentDashboard />;

  return (
    <PageContainer>
      <GreetingBanner />
      <StatsRow />
      <TodayLessons showMentor />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[3fr_2fr]">
        <AttentionList />
        <ActivityFeed />
      </div>
    </PageContainer>
  );
}
