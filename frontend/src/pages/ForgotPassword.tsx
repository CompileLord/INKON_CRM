import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AuthFrame } from "../layouts/AuthFrame";
import { ForgotPasswordCodeStep } from "../components/auth/ForgotPasswordCodeStep";
import { ForgotPasswordNewPasswordStep } from "../components/auth/ForgotPasswordNewPasswordStep";
import { ForgotPasswordRequestStep, type ForgotPasswordRequestMode } from "../components/auth/ForgotPasswordRequestStep";

type ForgotPasswordStep = "request" | "emailSent" | "smsSent" | "newPassword";

const backLinkClass: string =
  "inline-flex min-h-11 items-center self-start text-sm font-medium text-maroon-text underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out";

export function ForgotPassword() {
  const { t } = useTranslation(["auth", "validation", "common"]);
  const [step, setStep] = useState<ForgotPasswordStep>("request");
  const [mode, setMode] = useState<ForgotPasswordRequestMode>("default");
  const [login, setLogin] = useState<string>("");
  const [resetToken, setResetToken] = useState<string>("");

  const handleSent = (sentMode: ForgotPasswordRequestMode, sentLogin: string): void => {
    setLogin(sentLogin);
    setStep(sentMode === "fallback" ? "smsSent" : "emailSent");
  };

  return (
    <AuthFrame
      composition="animated-loop"
      editorialTitle={t("auth:editorialTitle")}
      editorialDescription={t("auth:editorialSubtitle")}
    >
      <div className="flex w-full flex-col gap-4">
        <div>
          <h1 className="text-2xl font-semibold leading-8 text-ink lg:text-[28px] lg:leading-9">{t("auth:forgot.title")}</h1>
          {step === "request" && <p className="mt-2 text-base leading-6 text-muted">{t("auth:forgot.subtitle")}</p>}
        </div>

        {step === "request" && (
          <ForgotPasswordRequestStep mode={mode} initialLogin={login} onChangeMode={setMode} onSent={handleSent} />
        )}

        {step === "smsSent" && (
          <p role="status" className="rounded-[10px] border border-border bg-strip p-3 text-sm text-ink">{t("auth:forgot.smsSent")}</p>
        )}

        {step === "emailSent" && (
          <>
            <p role="status" className="rounded-[10px] border border-border bg-strip p-3 text-sm text-ink">{t("auth:forgot.emailSent")}</p>
            <ForgotPasswordCodeStep
              initialEmail={login.includes("@") ? login : ""}
              onVerified={(token: string) => {
                setResetToken(token);
                setStep("newPassword");
              }}
            />
          </>
        )}

        {step === "newPassword" && <ForgotPasswordNewPasswordStep resetToken={resetToken} />}

        <Link to="/login" className={backLinkClass}>{t("auth:forgot.backToLogin")}</Link>
      </div>
    </AuthFrame>
  );
}
