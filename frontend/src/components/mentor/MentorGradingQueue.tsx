import { useTranslation } from "react-i18next";
import { useMentorGradingQueue } from "../../lib/journals/hooks";
import { EmptyState } from "../ui/EmptyState";
import { SectionCard } from "../ui/SectionCard";
import { GradingQueueRow, type GradingQueueItem } from "./GradingQueueRow";
import { MentorPane } from "./MentorPaneStates";

export function MentorGradingQueue() {
  const { t } = useTranslation(["dashboard", "journals"]);
  const { data: queue, isLoading, isError, refetch } = useMentorGradingQueue();

  return (
    <SectionCard title={t("dashboard:needsGrading")}>
      <MentorPane
        isLoadingInitial={queue === undefined && isLoading}
        isFailedInitial={queue === undefined && isError}
        isStaleFailure={queue !== undefined && isError}
        isEmpty={queue === undefined || queue.length === 0}
        errorMessage={t("journals:loadFailed")}
        staleMessage={t("dashboard:queueUpdateFailed")}
        emptyContent={<EmptyState title={t("dashboard:everythingGraded")} />}
        onRetry={() => { void refetch(); }}
      >
        <div className="flex flex-col">
          {(queue ?? []).map((item: GradingQueueItem) => (
            <GradingQueueRow key={item.journal_id} item={item} />
          ))}
        </div>
      </MentorPane>
    </SectionCard>
  );
}
