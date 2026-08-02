interface TableSkeletonRowsProps {
  rows?: number;
  columns: number;
}

export function TableSkeletonRows({ rows = 5, columns }: TableSkeletonRowsProps) {
  return (
    <>
      {Array.from({ length: rows }, (_, rowIndex) => (
        <tr key={rowIndex} className="border-b border-beige last:border-b-0">
          {Array.from({ length: columns }, (_, colIndex) => (
            <td key={colIndex} className="px-5 py-3">
              <div className="h-4 w-full max-w-[160px] animate-pulse rounded bg-beige" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
