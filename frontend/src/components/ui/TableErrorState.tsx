import { AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "./Button";

interface TableErrorStateProps {
  columns: number;
  message?: string;
  onRetry: () => void;
}

export function TableErrorState({ columns, message, onRetry }: TableErrorStateProps) {
  const { t } = useTranslation("common");
  return (
    <tr>
      <td colSpan={columns} className="px-5 py-10">
        <div className="flex flex-col items-center gap-3 text-center">
          <AlertCircle size={22} className="text-red-600" />
          <p className="text-sm text-muted">{message ?? t("noData", "Не удалось загрузить данные")}</p>
          <Button type="button" variant="secondary" onClick={onRetry}>
            {t("retry", "Повторить")}
          </Button>
        </div>
      </td>
    </tr>
  );
}
