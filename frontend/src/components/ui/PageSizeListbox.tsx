import { useTranslation } from "react-i18next";
import { formatNumber } from "../../i18n/formatters";
import { ListboxPicker, type ListboxOption } from "./ListboxPicker";

interface PageSizeListboxProps {
  options: readonly number[];
  value: number;
  onChange: (value: number) => void;
}

export function PageSizeListbox({ options, value, onChange }: PageSizeListboxProps) {
  const { t, i18n } = useTranslation("students");
  const label: string = t("table.rowsPerPage");
  const formatOption = (size: number): string => t("table.perPage", { size: formatNumber(size, i18n.language) });
  const listboxOptions: ListboxOption[] = options.map((size) => ({ value: String(size), label: formatOption(size) }));

  return (
    <ListboxPicker
      layout="quiet"
      label={label}
      ariaLabel={`${label}: ${formatOption(value)}`}
      icon={null}
      options={listboxOptions}
      value={String(value)}
      onChange={(next) => onChange(Number(next))}
      popupSide="top"
      popupAlign="end"
    />
  );
}
