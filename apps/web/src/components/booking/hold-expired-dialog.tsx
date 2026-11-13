"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/** Hết 10 phút giữ ghế (R-63): báo và đưa khách về sơ đồ ghế của suất. */
export function HoldExpiredDialog({
  open,
  onBackToSeatMap,
}: Readonly<{ open: boolean; onBackToSeatMap: () => void }>) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Hết thời gian giữ ghế</AlertDialogTitle>
          <AlertDialogDescription>
            Ghế bạn chọn đã được nhả cho người khác. Vui lòng chọn lại ghế để tiếp tục đặt vé.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={onBackToSeatMap}>Chọn lại ghế</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
