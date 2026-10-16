type ToastVariant = "default" | "success" | "error";

interface ToastProps {
  message: string;
  show: boolean;
  variant?: ToastVariant;
}

const variantClasses: Record<ToastVariant, string> = {
  default: "bg-maroon text-white dark:bg-accent dark:text-white shadow-md",
  success: "bg-green-600 text-white shadow-md",
  error: "bg-red-600 text-white shadow-md",
};

export function Toast({ message, show, variant = "default" }: ToastProps) {
  return (
    <div
      role="status"
      className={[
        "fixed bottom-[calc(var(--bottom-navigation-height,64px)+16px)] right-4 z-60 lg:bottom-6 lg:right-6 rounded-lg px-4 py-3 text-sm font-medium shadow-lg transition-all duration-200",
        variantClasses[variant],
        show ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0",
      ].join(" ")}
    >
      {message}
    </div>
  );
}
