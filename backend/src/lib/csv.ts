type Column<T> = [header: string, get: (row: T) => unknown];

/**
 * RFC 4180 quoting. Also guards against CSV injection: a value starting with
 * =, +, - or @ is executed as a formula when the export is opened in Excel,
 * so it gets prefixed with a single quote.
 */
const escape = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
};

export const toCsv = <T>(rows: T[], columns: Column<T>[]): string => {
  const head = columns.map(([header]) => escape(header)).join(",");
  const body = rows.map((row) => columns.map(([, get]) => escape(get(row))).join(","));
  // BOM so Excel opens UTF-8 names correctly.
  return "﻿" + [head, ...body].join("\r\n");
};
