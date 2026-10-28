import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, UserPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { UserCreateResponse } from "../../lib/users/types";
import { StudentFormPanel } from "../students/StudentFormPanel";
import { Button } from "../ui/Button";
import { PageHeader } from "../ui/PageHeader";
import { SCHOOL_TIMEZONE } from "../../i18n/formatters";

type GreetingPeriod = "morning" | "afternoon" | "evening";

export function greetingPeriodFor(moment: Date): GreetingPeriod {
  const hour: number = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: SCHOOL_TIMEZONE }).format(moment)) % 24;
  if (hour < 12) return "morning";
  return hour < 18 ? "afternoon" : "evening";
}

interface GreetingBannerProps {
  onAcceptPayment: () => void;
}

export function GreetingBanner({ onAcceptPayment }: GreetingBannerProps) {
  const { t } = useTranslation("dashboard");
  const navigate = useNavigate();
  const [isStudentPanelOpen, setIsStudentPanelOpen] = useState<boolean>(false);

  const handleStudentCreated = (_action: "created" | "updated", user?: UserCreateResponse): void => {
    if (user?.id === undefined) return;
    navigate(`/students/${user.id}`, {
      state: {
        createdStudentId: user.id,
        createdParentLinkCode: user.parent_link_code ?? null,
        createdCredentials: user.credentials_channel ? { channel: user.credentials_channel, maskedPhone: user.credentials_masked_phone ?? null } : null,
      },
    });
  };

  return (
    <>
      <PageHeader
        title={t(`greeting.${greetingPeriodFor(new Date())}`)}
        actions={
          <>
            <Button type="button" variant="secondary" onClick={() => setIsStudentPanelOpen(true)}>
              <UserPlus size={18} aria-hidden="true" />
              {t("addStudent")}
            </Button>
            <Button type="button" onClick={onAcceptPayment}>
              <Plus size={18} aria-hidden="true" />
              {t("acceptPayment")}
            </Button>
          </>
        }
      />
      <StudentFormPanel open={isStudentPanelOpen} mode="create" onClose={() => setIsStudentPanelOpen(false)} onSaved={handleStudentCreated} />
    </>
  );
}
