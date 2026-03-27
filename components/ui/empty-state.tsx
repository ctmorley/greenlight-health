interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  children?: React.ReactNode;
}

export function EmptyState({ icon = "📭", title, description, children }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <span className="text-4xl mb-4">{icon}</span>
      <h3 className="text-lg font-semibold font-display text-text-primary mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-text-secondary text-center max-w-sm">{description}</p>
      )}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
