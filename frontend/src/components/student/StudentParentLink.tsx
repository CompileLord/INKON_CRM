import { Popover } from "@base-ui/react/popover";
import { useTranslation } from "react-i18next";
import { Badge } from "../ui/Badge";
import { TelegramLinkCodeAction } from "./TelegramLinkCodeAction";
import type { User } from "../../lib/users/types";

interface StudentParentLinkProps {
  user: User;
  canManage: boolean;
  initialLinkCode: string | null;
}

export function StudentParentLink({ user, canManage, initialLinkCode }: StudentParentLinkProps) {
  const { t } = useTranslation("studentProfile");
  const isLinked: boolean = user.parent_linked === true;
  const content = (
    <>
      <span className="text-xs text-muted">{t("parentLink.label")}</span>
      <Badge status={isLinked ? "linked" : "notLinked"} />
    </>
  );

  if (!canManage) {
    return <span data-parent-link className="inline-flex items-center gap-2">{content}</span>;
  }

  return (
    <Popover.Root defaultOpen={initialLinkCode !== null}>
      <Popover.Trigger
        data-parent-link
        className="inline-flex min-h-11 items-center gap-2 rounded-[10px] px-1 hover:bg-strip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-[background-color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96]"
      >
        {content}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={6} collisionPadding={16} className="z-70">
          <Popover.Popup className="w-[min(24rem,calc(100vw-32px))] origin-[var(--transform-origin)] rounded-2xl border border-border-warm bg-card p-4 text-sm shadow-lg focus-visible:outline-none motion-safe:transition-[opacity,transform] motion-safe:duration-150 motion-safe:ease-[cubic-bezier(0.16,1,0.3,1)] data-[starting-style]:opacity-0 motion-safe:data-[starting-style]:scale-[0.96] data-[ending-style]:opacity-0">
            <Popover.Title className="text-sm font-semibold text-ink">{t("parentLink.title")}</Popover.Title>
            <p className="mt-1 text-xs text-muted">{isLinked ? t("parentLink.linkedHelp") : t("parentLink.notLinkedHelp")}</p>
            <div className="mt-3">
              <TelegramLinkCodeAction studentId={user.id} activeCodeExpiresAt={user.parent_link_code_expires_at ?? null} initialCode={initialLinkCode} />
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
