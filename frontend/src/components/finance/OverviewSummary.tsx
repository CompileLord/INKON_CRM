import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Popover } from "@base-ui/react/popover";
import { Banknote, CalendarDays, Users, Wallet } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFinanceAnalytics } from "../../lib/finance/hooks";
import { PeriodLabel } from "../../lib/finance/periodLabel";
import { FinanceUrlState, type CollectionRange, type RangePreset, type RangeProblem } from "../../lib/finance/urlState";
import { formatExactMoney } from "../../lib/money";
import { formatNumber } from "../../i18n/formatters";
import { Button } from "../ui/Button";
import { InfoTooltip } from "../ui/InfoTooltip";

interface OverviewSummaryProps {
  range: CollectionRange | null;
  onApplyRange: (range: CollectionRange) => void;
}

interface MetricProps {
  icon: ReactNode;
  label: string;
  help: string;
  isLoading: boolean;
  isUnavailable: boolean;
  isRefreshFailed: boolean;
  value: string | null;
  large?: boolean;
  action?: ReactNode;
  onRetry: () => void;
}

const inputClasses: string =
  "mt-1 min-h-12 w-full min-w-0 rounded-[10px] border border-control-border bg-card px-3 py-2 text-base text-ink tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const presets: readonly RangePreset[] = ["thisMonth", "lastMonth", "thisYear"];

function Metric({ icon, label, help, isLoading, isUnavailable, isRefreshFailed, value, large = false, action, onRetry }: MetricProps) {
  const { t } = useTranslation(["finance", "common"]);
  const valueSize: string = large ? "text-[1.75rem] leading-9" : "text-xl leading-7";
  return (
    <div className="min-w-0">
      <div className="flex min-h-11 items-center justify-between gap-2">
        <h2 className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-label">
          <span className="shrink-0 text-muted">{icon}</span>
          <span className="min-w-0 [overflow-wrap:normal]">{label}</span>
          <InfoTooltip label={t("finance:overview.aboutMetric", { label })}>{help}</InfoTooltip>
        </h2>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {isLoading ? (
        <div role="status" aria-busy="true" className="mt-1">
          <span className="sr-only">{t("common:loading")}</span>
          <div aria-hidden="true" className="h-9 w-32 max-w-full rounded-lg bg-strip motion-safe:animate-pulse" />
        </div>
      ) : isUnavailable ? (
        <div role="alert" className="mt-1 flex flex-wrap items-center gap-3">
          <p className="text-base font-semibold text-destructive">{t("finance:unavailable")}</p>
          <Button variant="secondary" onClick={onRetry}>
            {t("common:retry")}
          </Button>
        </div>
      ) : (
        <p key={value} className={`mt-1 min-h-9 break-words font-semibold text-ink tabular-nums transition-opacity duration-150 ease-out starting:opacity-0 ${valueSize}`}>{value}</p>
      )}
      {isRefreshFailed && (
        <p role="status" className="mt-1 flex flex-wrap items-center gap-2 text-xs text-warning">
          {t("finance:refreshFailed")}
          <button type="button" onClick={onRetry} className="min-h-11 px-2 font-medium text-info underline">
            {t("common:retry")}
          </button>
        </p>
      )}
    </div>
  );
}

interface CollectionRangePickerProps {
  range: CollectionRange;
  onApply: (range: CollectionRange) => void;
}

function CollectionRangePicker({ range, onApply }: CollectionRangePickerProps) {
  const { t, i18n } = useTranslation("finance");
  const [isOpen, setIsOpen] = useState<boolean>(false);
  return (
    <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger
        aria-label={t("overview.rangeButton", { period: PeriodLabel.compact(range, i18n.language) })}
        className="inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-[10px] border border-control-border bg-card px-2.5 text-sm text-ink tabular-nums hover:bg-strip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-[background-color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96]"
      >
        <CalendarDays size={16} aria-hidden="true" className="hidden @[26rem]:block" />
        {PeriodLabel.compact(range, i18n.language)}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={8} collisionPadding={16} className="z-70">
          <Popover.Popup className="w-[min(22rem,calc(100vw-32px))] origin-[var(--transform-origin)] rounded-2xl border border-border-warm bg-card p-4 shadow-lg transition-opacity duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] focus-visible:outline-none motion-safe:transition-[opacity,transform] data-[starting-style]:opacity-0 motion-safe:data-[starting-style]:scale-[0.96] data-[ending-style]:opacity-0 data-[ending-style]:duration-100 motion-safe:data-[ending-style]:scale-[0.96]">
            <Popover.Title className="text-sm font-semibold text-ink">{t("overview.rangeTitle")}</Popover.Title>
            <CollectionRangeForm
              key={range.from + "|" + range.to}
              initial={range}
              onApply={(next) => {
                onApply(next);
                setIsOpen(false);
              }}
            />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

interface CollectionRangeFormProps {
  initial: CollectionRange;
  onApply: (range: CollectionRange) => void;
}

function CollectionRangeForm({ initial, onApply }: CollectionRangeFormProps) {
  const { t } = useTranslation("finance");
  const rangeId: string = useId();
  const [draftFrom, setDraftFrom] = useState<string>(initial.from);
  const [draftTo, setDraftTo] = useState<string>(initial.to);
  const [problem, setProblem] = useState<RangeProblem | null>(null);
  const problemKey: string | null = problem ? `overview.range${problem[0].toUpperCase()}${problem.slice(1)}` : null;
  const problemId: string = `${rangeId}-problem`;

  const submitRange = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const detected: RangeProblem | null = FinanceUrlState.rangeProblem(draftFrom, draftTo);
    setProblem(detected);
    if (detected === null) onApply({ from: draftFrom, to: draftTo });
  };

  return (
    <>
      <div role="group" aria-label={t("overview.presets")} className="mt-3 flex flex-wrap gap-2">
        {presets.map((preset) => (
          <Button key={preset} variant="secondary" className="min-h-11 px-3" onClick={() => onApply(FinanceUrlState.presetRange(preset))}>
            {t(`overview.preset${preset[0].toUpperCase()}${preset.slice(1)}`)}
          </Button>
        ))}
      </div>
      <form onSubmit={submitRange} noValidate className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${rangeId}-from`} className="text-sm font-medium text-label">
            {t("overview.rangeFrom")}
          </label>
          <input
            id={`${rangeId}-from`}
            type="date"
            value={draftFrom}
            onChange={(event) => setDraftFrom(event.target.value)}
            aria-invalid={problem !== null}
            aria-describedby={problem ? problemId : undefined}
            className={inputClasses}
          />
        </div>
        <div>
          <label htmlFor={`${rangeId}-to`} className="text-sm font-medium text-label">
            {t("overview.rangeTo")}
          </label>
          <input
            id={`${rangeId}-to`}
            type="date"
            value={draftTo}
            onChange={(event) => setDraftTo(event.target.value)}
            aria-invalid={problem !== null}
            aria-describedby={problem ? problemId : undefined}
            className={inputClasses}
          />
        </div>
        {problemKey && (
          <p id={problemId} role="alert" className="col-span-2 text-sm text-destructive">
            {t(problemKey)}
          </p>
        )}
        <Button type="submit" className="col-span-2 min-h-12">
          {t("overview.applyRange")}
        </Button>
      </form>
    </>
  );
}

export function OverviewSummary({ range, onApplyRange }: OverviewSummaryProps) {
  const { t, i18n } = useTranslation(["finance", "common"]);
  const effectiveRange: CollectionRange = FinanceUrlState.resolveRange(range);
  const currentRange: CollectionRange = FinanceUrlState.defaultRange();
  const current = useFinanceAnalytics(currentRange.from, currentRange.to);
  const collection = useFinanceAnalytics(effectiveRange.from, effectiveRange.to);
  const money = (amount: string): string => t("finance:moneyAmount", { amount: formatExactMoney(amount) });

  return (
    <section
      aria-label={t("finance:overview.summaryLabel")}
      className="grid gap-x-6 gap-y-5 rounded-2xl border border-border bg-card p-4 @[52.5rem]:grid-cols-[1.1fr_1fr_1.4fr] @[52.5rem]:p-6"
    >
      <Metric
        icon={<Wallet size={18} aria-hidden="true" />}
        label={t("finance:overview.currentDue")}
        help={t("finance:overview.currentDueHelp")}
        isLoading={current.isPending}
        isUnavailable={!current.data && current.isError}
        isRefreshFailed={Boolean(current.data) && current.isError}
        value={current.data ? money(current.data.net_receivable) : null}
        large
        onRetry={() => void current.refetch()}
      />
      <div className="grid gap-x-3 gap-y-5 @[20rem]:grid-cols-[7rem_minmax(0,1fr)] @[52.5rem]:contents">
        <Metric
          icon={<Users size={18} aria-hidden="true" className="hidden @[26rem]:block" />}
          label={t("finance:overview.currentStudents")}
          help={t("finance:overview.currentStudentsHelp")}
          isLoading={current.isPending}
          isUnavailable={!current.data && current.isError}
          isRefreshFailed={false}
          value={current.data ? formatNumber(current.data.unpaid_students_count, i18n.language) : null}
          onRetry={() => void current.refetch()}
        />
        <div className="min-w-0">
          <Metric
            icon={<Banknote size={18} aria-hidden="true" className="hidden @[26rem]:block" />}
            label={t("finance:overview.netCash")}
            help={t("finance:overview.collectionHelp")}
            isLoading={collection.isPending}
            isUnavailable={!collection.data && collection.isError}
            isRefreshFailed={Boolean(collection.data) && collection.isError}
            value={collection.data ? money(collection.data.collected_in_period) : null}
            action={<CollectionRangePicker range={effectiveRange} onApply={onApplyRange} />}
            onRetry={() => void collection.refetch()}
          />
        </div>
      </div>
    </section>
  );
}
