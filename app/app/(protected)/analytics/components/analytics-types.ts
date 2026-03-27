export interface AnalyticsData {
  summary: {
    totalPAs: number;
    approvalRate: number;
    denialRate: number;
    totalAppeals: number;
    overallAppealSuccessRate: number;
  };
  approvalRateOverTime: { week: string; approvalRate: number; total: number }[];
  volumeByType: { type: string; rawType: string; count: number }[];
  volumeByPayer: { payer: string; payerId: string; count: number }[];
  avgTurnaroundByPayer: { payer: string; avgDays: number; count: number }[];
  denialReasonsBreakdown: { category: string; rawCategory: string; count: number }[];
  appealSuccessRate: {
    level: string;
    rawLevel: string;
    won: number;
    lost: number;
    total: number;
    successRate: number;
  }[];
}

export interface SummaryRow {
  referenceNumber: string;
  status: string;
  serviceType: string;
  patientName: string;
  payer: string;
  createdDate: string;
  decidedDate: string;
}

export const CHART_COLORS = [
  "#10B981", "#0EA5E9", "#F59E0B", "#F43F5E", "#8B5CF6",
  "#EC4899", "#14B8A6", "#F97316", "#06B6D4", "#84CC16",
];

export const DENIAL_COLORS: Record<string, string> = {
  medical_necessity: "#F43F5E",
  incomplete_documentation: "#F59E0B",
  out_of_network: "#8B5CF6",
  service_not_covered: "#EC4899",
  missing_precert: "#0EA5E9",
  coding_error: "#F97316",
  other: "#64748B",
};
