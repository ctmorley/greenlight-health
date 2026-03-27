"use client";

interface Step {
  number: number;
  title: string;
  description: string;
}

interface StepIndicatorProps {
  steps: Step[];
  currentStep: number;
  onStepClick?: (step: number) => void;
  completedSteps?: number[];
}

export function StepIndicator({ steps, currentStep, onStepClick, completedSteps = [] }: StepIndicatorProps) {
  return (
    <nav aria-label="Progress" className="w-full">
      <ol className="flex items-center gap-2 lg:gap-0 overflow-x-auto pb-2 lg:pb-0">
        {steps.map((step, index) => {
          const isActive = step.number === currentStep;
          const isCompleted = completedSteps.includes(step.number);
          const isPast = step.number < currentStep;
          const isClickable = onStepClick && (isCompleted || isPast || step.number <= currentStep);

          return (
            <li key={step.number} className="flex items-center flex-1 min-w-0">
              {index > 0 && (
                <div
                  className={`hidden lg:block h-0.5 w-full mx-2 transition-colors duration-300 ${
                    isPast || isCompleted ? "bg-emerald-500" : "bg-white/10"
                  }`}
                />
              )}
              <button
                type="button"
                onClick={() => isClickable && onStepClick?.(step.number)}
                disabled={!isClickable}
                className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-200 min-w-fit ${
                  isActive
                    ? "bg-emerald-500/10 border border-emerald-500/30"
                    : isClickable
                    ? "hover:bg-white/5 cursor-pointer"
                    : "opacity-50 cursor-not-allowed"
                }`}
              >
                <div
                  className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${
                    isActive
                      ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"
                      : isPast || isCompleted
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-white/10 text-text-muted"
                  }`}
                >
                  {isPast || isCompleted ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  ) : (
                    step.number
                  )}
                </div>
                <div className="hidden sm:block text-left min-w-0">
                  <p
                    className={`text-xs font-semibold truncate ${
                      isActive ? "text-emerald-400" : isPast || isCompleted ? "text-text-secondary" : "text-text-muted"
                    }`}
                  >
                    {step.title}
                  </p>
                  <p className="text-[10px] text-text-muted truncate">{step.description}</p>
                </div>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
