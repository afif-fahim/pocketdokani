const currency = new Intl.NumberFormat("en-BD", {
  style: "currency",
  currency: "BDT",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function money(value: string | number | null): string {
  if (value === null || (typeof value === "string" && !value.trim()))
    return "Not recorded";
  const amount =
    typeof value === "number"
      ? value
      : Number(
          value.replace(/[০-৯]/g, (digit) =>
            String("০১২৩৪৫৬৭৮৯".indexOf(digit)),
          ),
        );
  return Number.isFinite(amount) ? currency.format(amount) : "Not recorded";
}
