export const formatEuro = (amount: number | null | undefined): string => {
  if (amount == null) return "—";
  return `€${amount.toLocaleString("el-GR", { maximumFractionDigits: 0 })}`;
};

export const formatDateTime = (value: string | null | undefined): string => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("el-GR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const formatTime = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString("el-GR", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const statusClass = (status: string): string =>
  `badge ${status.toLowerCase()}`;
