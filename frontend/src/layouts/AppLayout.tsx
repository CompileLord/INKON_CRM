import { Outlet } from "react-router-dom";
import { Sidebar } from "../components/Sidebar";
import { Header } from "../components/Header";
import { StudentBottomNav } from "../components/student/StudentBottomNav";

export function AppLayout() {
  return (
    <div className="flex min-h-screen bg-cream">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col pb-16 md:pb-0">
        <Header />
        <main className="flex-1 px-4 py-6 md:px-7">
          <Outlet />
        </main>
      </div>
      <StudentBottomNav />
    </div>
  );
}
