import { useState } from "react";
import { Search } from "lucide-react";
import { Modal } from "../ui/Modal";
import { PersonAvatar } from "../ui/PersonAvatar";
import { useStudents } from "../../lib/users/hooks";
import { useDebouncedValue } from "../../lib/useDebouncedValue";
import { resolveMediaUrl } from "../../lib/users/media";
import type { User } from "../../lib/users/types";

interface EnrollStudentModalProps {
  open: boolean;
  excludeIds: Set<number>;
  pending: boolean;
  onClose: () => void;
  onSelect: (student: User) => void;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2";

export function EnrollStudentModal({
  open,
  excludeIds,
  pending,
  onClose,
  onSelect,
}: EnrollStudentModalProps) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 350);

  const { data, isLoading } = useStudents({
    search: debouncedSearch || undefined,
    page_size: 20,
  });

  const candidates = (data?.items ?? []).filter((student) => !excludeIds.has(student.id));

  return (
    <Modal open={open} onClose={onClose} title="Записать студента на курс">
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            autoFocus
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Поиск по имени или email…"
            className={`w-full rounded-full border border-border-warm bg-card py-2 pl-9 pr-4 text-sm text-ink placeholder:text-muted ${FOCUS_RING}`}
          />
        </div>

        <div className="max-h-72 overflow-y-auto rounded-lg border border-border-warm">
          {isLoading ? (
            <p className="px-3 py-6 text-center text-sm text-muted">Загрузка…</p>
          ) : candidates.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted">Студенты не найдены</p>
          ) : (
            <ul className="divide-y divide-beige">
              {candidates.map((student) => (
                <li key={student.id}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => onSelect(student)}
                    className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors duration-150 hover:bg-row-hover disabled:pointer-events-none disabled:opacity-60 ${FOCUS_RING}`}
                  >
                    <PersonAvatar
                      firstName={student.first_name}
                      lastName={student.last_name}
                      photoUrl={resolveMediaUrl(student.thumbnail_path) ?? undefined}
                      size={28}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">
                        {student.first_name} {student.last_name}
                      </p>
                      <p className="truncate text-xs text-muted">{student.email}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
