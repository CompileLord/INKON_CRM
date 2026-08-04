import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

// Russian
import ruCommon from "./locales/ru/common.json";
import ruAuth from "./locales/ru/auth.json";
import ruDashboard from "./locales/ru/dashboard.json";
import ruStudents from "./locales/ru/students.json";
import ruMentors from "./locales/ru/mentors.json";
import ruCourses from "./locales/ru/courses.json";
import ruEnrollments from "./locales/ru/enrollments.json";
import ruJournals from "./locales/ru/journals.json";
import ruFinance from "./locales/ru/finance.json";
import ruDocuments from "./locales/ru/documents.json";
import ruAudit from "./locales/ru/audit.json";
import ruSettings from "./locales/ru/settings.json";
import ruNotifications from "./locales/ru/notifications.json";
import ruValidation from "./locales/ru/validation.json";

import ruStudent from "./locales/ru/student.json";

// English
import enCommon from "./locales/en/common.json";
import enAuth from "./locales/en/auth.json";
import enDashboard from "./locales/en/dashboard.json";
import enStudents from "./locales/en/students.json";
import enMentors from "./locales/en/mentors.json";
import enCourses from "./locales/en/courses.json";
import enEnrollments from "./locales/en/enrollments.json";
import enJournals from "./locales/en/journals.json";
import enFinance from "./locales/en/finance.json";
import enDocuments from "./locales/en/documents.json";
import enAudit from "./locales/en/audit.json";
import enSettings from "./locales/en/settings.json";
import enNotifications from "./locales/en/notifications.json";
import enValidation from "./locales/en/validation.json";
import enStudent from "./locales/en/student.json";

// Tajik
import tgCommon from "./locales/tg/common.json";
import tgAuth from "./locales/tg/auth.json";
import tgDashboard from "./locales/tg/dashboard.json";
import tgStudents from "./locales/tg/students.json";
import tgMentors from "./locales/tg/mentors.json";
import tgCourses from "./locales/tg/courses.json";
import tgEnrollments from "./locales/tg/enrollments.json";
import tgJournals from "./locales/tg/journals.json";
import tgFinance from "./locales/tg/finance.json";
import tgDocuments from "./locales/tg/documents.json";
import tgAudit from "./locales/tg/audit.json";
import tgSettings from "./locales/tg/settings.json";
import tgNotifications from "./locales/tg/notifications.json";
import tgValidation from "./locales/tg/validation.json";
import tgStudent from "./locales/tg/student.json";

export const defaultNS = "common";
export const resources = {
  ru: {
    common: ruCommon,
    auth: ruAuth,
    dashboard: ruDashboard,
    students: ruStudents,
    mentors: ruMentors,
    courses: ruCourses,
    enrollments: ruEnrollments,
    journals: ruJournals,
    finance: ruFinance,
    documents: ruDocuments,
    audit: ruAudit,
    settings: ruSettings,
    notifications: ruNotifications,
    validation: ruValidation,
    student: ruStudent,
  },
  en: {
    common: enCommon,
    auth: enAuth,
    dashboard: enDashboard,
    students: enStudents,
    mentors: enMentors,
    courses: enCourses,
    enrollments: enEnrollments,
    journals: enJournals,
    finance: enFinance,
    documents: enDocuments,
    audit: enAudit,
    settings: enSettings,
    notifications: enNotifications,
    validation: enValidation,
    student: enStudent,
  },
  tg: {
    common: tgCommon,
    auth: tgAuth,
    dashboard: tgDashboard,
    students: tgStudents,
    mentors: tgMentors,
    courses: tgCourses,
    enrollments: tgEnrollments,
    journals: tgJournals,
    finance: tgFinance,
    documents: tgDocuments,
    audit: tgAudit,
    settings: tgSettings,
    notifications: tgNotifications,
    validation: tgValidation,
    student: tgStudent,
  },
} as const;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    defaultNS,
    fallbackLng: "ru",
    supportedLngs: ["ru", "en", "tg"],
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
    },
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
