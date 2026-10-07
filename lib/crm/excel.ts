import ExcelJS from "exceljs";
import { NextResponse } from "next/server";

/** Bold, filled header row - the only styling an ops sheet needs. */
export function styleHeaderRow(row: ExcelJS.Row): void {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1F2937" },
  };
  row.alignment = { vertical: "middle" };
}

/** Free ₹ column, aligned right - numbers a manager can total at a glance. */
export function rupeeColumn(column: ExcelJS.Column): void {
  column.numFmt = '₹#,##0';
  column.alignment = { horizontal: "right" };
}

/** URL/filename-safe slug of a person's name, e.g. "Ujwala Chaudhari". */
export function fileSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "user"
  );
}

/** Stream a workbook straight back as a downloadable .xlsx. */
export async function xlsxDownload(
  filename: string,
  workbook: ExcelJS.Workbook
): Promise<NextResponse> {
  const data = await workbook.xlsx.writeBuffer();
  return new NextResponse(Buffer.from(data as unknown as ArrayBuffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
