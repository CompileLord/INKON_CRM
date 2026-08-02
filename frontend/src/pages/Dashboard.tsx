import { useAuthStore } from "../store/authStore";
import { GreetingBanner } from "../components/dashboard/GreetingBanner";
import { StatsRow } from "../components/dashboard/StatsRow";
import { AttentionList } from "../components/dashboard/AttentionList";
import { ActivityFeed } from "../components/dashboard/ActivityFeed";
import { AccountantDashboard } from "../components/dashboard/AccountantDashboard";
import { MentorDashboard } from "../components/dashboard/MentorDashboard";
import { StudentDashboard } from "../components/dashboard/StudentDashboard";

export function Dashboard() {
  const role = useAuthStore((s) => s.role);

  if (role === "accountant") return <AccountantDashboard />;
  if (role === "mentor") return <MentorDashboard />;
  if (role === "student") return <StudentDashboard />;

  return (
    <div className="flex flex-col gap-5">
      <GreetingBanner />
      <StatsRow />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AttentionList />
        <ActivityFeed />
      </div>
    </div>
  );
}
