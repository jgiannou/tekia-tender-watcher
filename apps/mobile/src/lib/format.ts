export const formatRelative = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const deltaMs = Date.now() - date.getTime();
  const minutes = Math.round(deltaMs / 60000);
  if (minutes < 1) return "μόλις τώρα";
  if (minutes === 1) return "1 λεπτό πριν";
  if (minutes < 60) return `${minutes} λεπτά πριν`;
  const hours = Math.round(minutes / 60);
  if (hours === 1) return "1 ώρα πριν";
  if (hours < 48) return `${hours} ώρες πριν`;
  return date.toLocaleString("el-GR");
};

export const formatDay = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("el-GR");
};

export const formatMoney = (value: number | null | undefined) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("el-GR", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
      }).format(value);

export const tenderHref = (
  recordType: string | undefined,
  referenceNumber: string,
) => {
  const type =
    recordType === "PROC" || recordType === "REQ" ? recordType : "REQ";
  return {
    pathname:
      "/(app)/(tabs)/tenders/[recordType]/[adam]" as const,
    params: { recordType: type, adam: referenceNumber },
  };
};
