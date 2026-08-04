import { useEffect } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AppLayout } from "./layouts/AppLayout";
import { Dashboard } from "./pages/Dashboard";
import { Students } from "./pages/Students";
import { StudentProfile } from "./pages/StudentProfile";
import { Mentors } from "./pages/Mentors";
import { MentorProfile } from "./pages/MentorProfile";
import { Courses } from "./pages/Courses";
import { CourseProfile } from "./pages/CourseProfile";
import { Journals } from "./pages/Journals";
import { JournalDetail } from "./pages/JournalDetail";
import { Finance } from "./pages/Finance";
import { Audit } from "./pages/Audit";
import { Settings } from "./pages/Settings";
import { Login } from "./pages/Login";
import { VerifyEmail } from "./pages/VerifyEmail";
import { SetPassword } from "./pages/SetPassword";
import { Notifications } from "./pages/Notifications";
import { AuthGuard } from "./components/auth/AuthGuard";
import { RoleGuard } from "./components/auth/RoleGuard";
import { GuestRoute } from "./components/auth/GuestRoute";
import { SetPasswordRoute } from "./components/auth/SetPasswordRoute";
import { bootstrapAuth } from "./lib/authBootstrap";

import { MyCourses } from "./pages/student/MyCourses";
import { MyCourseDetail } from "./pages/student/MyCourseDetail";
import { MyJournalPeriod } from "./pages/student/MyJournalPeriod";

const router = createBrowserRouter([
  {
    path: "/login",
    element: (
      <GuestRoute>
        <Login />
      </GuestRoute>
    ),
  },
  {
    path: "/verify-email",
    element: (
      <GuestRoute>
        <VerifyEmail />
      </GuestRoute>
    ),
  },
  {
    path: "/set-password",
    element: (
      <SetPasswordRoute>
        <SetPassword />
      </SetPasswordRoute>
    ),
  },
  {
    element: <AuthGuard />,
    children: [
      {
        element: <RoleGuard />,
        children: [
          {
            path: "/",
            element: <AppLayout />,
            children: [
              { index: true, element: <Dashboard /> },
              { path: "my/courses", element: <MyCourses /> },
              { path: "my/courses/:courseId", element: <MyCourseDetail /> },
              { path: "my/journal/:journalId", element: <MyJournalPeriod /> },
              { path: "students", element: <Students /> },
              { path: "students/:id", element: <StudentProfile /> },
              { path: "mentors", element: <Mentors /> },
              { path: "mentors/:id", element: <MentorProfile /> },
              { path: "courses", element: <Courses /> },
              { path: "courses/:id", element: <CourseProfile /> },
              { path: "journals", element: <Journals /> },
              { path: "journals/:id", element: <JournalDetail /> },
              { path: "finance", element: <Finance /> },
              { path: "audit", element: <Audit /> },
              { path: "settings", element: <Settings /> },
              { path: "notifications", element: <Notifications /> },
            ],
          },
        ],
      },
    ],
  },
]);

function App() {
  useEffect(() => {
    bootstrapAuth();
  }, []);

  return <RouterProvider router={router} />;
}

export default App;
