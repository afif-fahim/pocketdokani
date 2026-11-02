export default function StatusChangeWarning({
  previousStatus,
  nextStatus,
}: {
  previousStatus: string;
  nextStatus: string;
}) {
  if (
    previousStatus !== "booked" ||
    !["returned", "cancelled"].includes(nextStatus)
  ) {
    return null;
  }

  return (
    <p className="message">
      Confirm only after the parcel is back with you. Its items will return to
      available stock. This does not cancel a courier parcel.
    </p>
  );
}
