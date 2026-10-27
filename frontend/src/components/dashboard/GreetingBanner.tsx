import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, UserPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { UserCreateResponse } from "../../lib/users/types";
import { StudentFormPanel } from "../students/StudentFormPanel";
import { Button } from "../ui/Button";
import { PageHeader } from "../ui/PageHeader";

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
        title={t("title")}
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
