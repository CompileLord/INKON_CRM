import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/Button";
import { Badge, type BadgeStatus } from "../../components/ui/Badge";
import { DataTable } from "../../components/ui/DataTable";
import { DatePicker } from "../../components/ui/DatePicker";
import { EmptyState } from "../../components/ui/EmptyState";
import { EntityHeader } from "../../components/ui/EntityHeader";
import { ErrorState } from "../../components/ui/ErrorState";
import { InitialTile } from "../../components/ui/InitialTile";
import { ListRow } from "../../components/ui/ListRow";
import { Menu, type MenuItem } from "../../components/ui/Menu";
import { PageContainer } from "../../components/ui/PageContainer";
import { PageHeader } from "../../components/ui/PageHeader";
import { usePeriodName } from "../../components/ui/periodName";
import { SectionCard } from "../../components/ui/SectionCard";
import { Select } from "../../components/ui/Select";
import { StatGroup, StatTile } from "../../components/ui/StatGroup";
import { Tabs, tabPanelElementId, tabElementId, useTabParam } from "../../components/ui/Tabs";

const BADGE_STATUSES: readonly BadgeStatus[] = ["active", "archived", "paid", "overdue", "partial", "pending", "linked", "notLinked", "completed", "draft"];
const TAB_IDS: readonly string[] = ["overview", "students", "performance"];
const SELECT_OPTIONS = [
  { value: "a", label: "Algebra" },
  { value: "b", label: "Geometry" },
  { value: "c", label: "Physics" },
] as const;

interface DemoRow {
  id: string;
  name: string;
  score: string;
}

const DEMO_ROWS: readonly DemoRow[] = [
  { id: "1", name: "Aisha Karimova", score: "412" },
  { id: "2", name: "Bobur Rahimov", score: "389" },
];

export function DevUi() {
  const { t } = useTranslation("ui");
  const periodName = usePeriodName();
  const [activeTab, selectTab] = useTabParam(TAB_IDS, "overview");
  const [verticalTab, setVerticalTab] = useState<string>("overview");
  const [selectValue, setSelectValue] = useState<string>("a");
  const [dateValue, setDateValue] = useState<string>("2026-10-19");
  const [emptyDateValue, setEmptyDateValue] = useState<string>("");
  const menuItems: readonly MenuItem[] = [
    { key: "edit", label: "Edit", onSelect: () => undefined },
    { key: "archive", label: "Archive", onSelect: () => undefined, destructive: true },
  ];
  const tabs = TAB_IDS.map((id) => ({ id, label: id.charAt(0).toUpperCase() + id.slice(1), count: id === "students" ? 24 : undefined }));
  const tableColumns = [
    { key: "name", header: "Student", cell: (row: DemoRow) => row.name },
    { key: "score", header: "Score", numeric: true, cell: (row: DemoRow) => row.score },
  ];
  const tableProps = { caption: "Demo", columns: tableColumns, rowKey: (row: DemoRow) => row.id, onRetry: () => undefined, emptyTitle: t("empty.title") };

  return (
    <div className="min-h-dvh bg-cream px-4 py-6 lg:px-8">
      <PageContainer>
        <PageHeader title={t("dev.title")} count="15" actions={<Button type="button">Primary</Button>} backTo="/" backLabel={t("back")} />

        <SectionCard title="Badge, InitialTile, period names">
          <div className="flex flex-wrap gap-2">{BADGE_STATUSES.map((status) => <Badge key={status} status={status} />)}</div>
          <div className="flex flex-wrap items-center gap-3">
            {["Algebra", "Biology", "Chemistry", "Dance", "English", "French", "Geometry", "History"].map((name) => <InitialTile key={name} name={name} />)}
            <InitialTile name="Algebra" size="sm" />
            <InitialTile name="Algebra" size="lg" />
          </div>
          <p className="text-sm text-ink">{periodName("Week 3")} · {periodName("Month 1")}</p>
        </SectionCard>

        <SectionCard title="EntityHeader">
          <EntityHeader avatar={<InitialTile name="Algebra" size="lg" />} name="Algebra 8A" status={<Badge status="active" />} meta={["Mentor Sitora", "Mon, Wed 15:00", "24"]} primaryAction={<Button type="button" variant="secondary">Edit</Button>} menuItems={menuItems} />
        </SectionCard>

        <SectionCard title="Tabs (URL ?tab=) and vertical">
          <Tabs tabs={tabs} value={activeTab} onChange={selectTab} ariaLabel="Demo tabs" idPrefix="demo" />
          <div role="tabpanel" id={tabPanelElementId("demo", activeTab)} aria-labelledby={tabElementId("demo", activeTab)} className="text-sm text-muted">{activeTab}</div>
          <Tabs tabs={tabs} value={verticalTab} onChange={setVerticalTab} ariaLabel="Vertical tabs" orientation="vertical" idPrefix="demo-vertical" />
        </SectionCard>

        <StatGroup>
          <StatTile label="Average score" value="84" hint="of 100" />
          <StatTile label="Attendance" value="92%" />
          <StatTile label="Debt" value={null} missingHint="No payments yet" />
          <StatTile label="Students" value="24" />
        </StatGroup>

        <SectionCard title="Select and DatePicker" info="Dates are shown as dd.MM.yyyy in Dushanbe time.">
          <div className="grid gap-3 md:grid-cols-3">
            <Select label="Course" options={SELECT_OPTIONS} value={selectValue} onChange={setSelectValue} />
            <DatePicker label="Start date" value={dateValue} onChange={setDateValue} />
            <DatePicker label="End date" value={emptyDateValue} onChange={setEmptyDateValue} />
          </div>
        </SectionCard>

        <SectionCard title="ListRow and Menu">
          <ListRow to="/dev/ui" menuItems={menuItems}>
            <span className="flex items-center gap-3"><InitialTile name="Physics" size="sm" /><span>Physics 9B</span></span>
          </ListRow>
          <Menu items={menuItems} />
        </SectionCard>

        <SectionCard title="DataTable: loaded, loading, empty, error">
          <DataTable {...tableProps} rows={DEMO_ROWS} isLoading={false} isError={false} rowHref={(row) => `/students/${row.id}`} rowMenu={() => menuItems} />
          <DataTable {...tableProps} rows={[]} isLoading={true} isError={false} skeletonRowCount={2} />
          <DataTable {...tableProps} rows={[]} isLoading={false} isError={false} />
          <DataTable {...tableProps} rows={[]} isLoading={false} isError={true} />
        </SectionCard>

        <SectionCard title="EmptyState and ErrorState">
          <EmptyState title={t("empty.title")} description="Add a course to get started." action={<Button type="button" variant="secondary">Add</Button>} />
          <ErrorState onRetry={() => undefined} />
        </SectionCard>
      </PageContainer>
    </div>
  );
}
