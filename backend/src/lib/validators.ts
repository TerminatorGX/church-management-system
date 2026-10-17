import { z } from "zod";

/**
 * Shared field-level safeguards, reused across every module's zod schema so
 * "what counts as a valid email/phone/name" is defined once. These normalise
 * on write (trim, case) — existing rows are untouched, so adding or changing
 * one of these never requires a migration or a reseed.
 */

/** "JOHN" / "john" / "jOHN banda" -> "John Banda". Capitalises after spaces,
 *  hyphens and apostrophes so "o'brien" -> "O'Brien" and "mary-jane" works too.
 *  Deliberately simple — unusual conventions (van, de, Mc-) aren't special-cased;
 *  it's a sane default the admin can still hand-edit, not a hard lock. */
export const toTitleCase = (s: string) =>
  s
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/(^|[\s'-])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());

/** A required person/entity name: trimmed and title-cased. */
export const nameField = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .transform(toTitleCase);

/** An optional person/entity name — same normalisation, but "" / absent is fine. */
export const optionalNameField = z
  .string()
  .trim()
  .transform(toTitleCase)
  .nullish()
  .or(z.literal(""));

/** Trimmed + lowercased before the format check, so "  John@Church.LOCAL " passes. */
export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address");

export const optionalEmailField = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address")
  .nullish()
  .or(z.literal(""));

/**
 * Zambian mobile numbers: 10 digits starting 07 or 09 (e.g. 0971234567), or
 * the same written with a +260/260 country code instead of the leading 0.
 * Normalises every accepted shape to +260XXXXXXXXX.
 */
const ZM_PHONE_RE = /^(?:\+?260|0)(7|9)(\d{8})$/;

/**
 * Plain (non-zod) normaliser, shared by the schemas below and by anything
 * else that needs to compare a user-typed phone number against what's
 * actually stored (e.g. the duplicate-member lookup) — stored numbers are
 * always in +260XXXXXXXXX form, but what a caller types rarely is.
 * Returns null for anything that isn't a recognisable Zambian mobile number.
 */
export const normalizeZambianPhone = (v: string): string | null => {
  const digits = v.replace(/[\s-]/g, "");
  const m = ZM_PHONE_RE.exec(digits);
  return m ? `+260${m[1]}${m[2]}` : null;
};

export const zambianPhone = z
  .string()
  .trim()
  .refine((v) => normalizeZambianPhone(v) !== null, "Enter a valid Zambian phone number, e.g. 0971234567")
  .transform((v) => normalizeZambianPhone(v)!);

export const optionalZambianPhone = z
  .string()
  .trim()
  .refine((v) => v === "" || normalizeZambianPhone(v) !== null, "Enter a valid Zambian phone number, e.g. 0971234567")
  .transform((v) => (v === "" ? "" : normalizeZambianPhone(v)!))
  .nullish();

/** A date that can't be in the future — for things that have already happened. */
export const pastOrPresentDate = (label: string) =>
  z.coerce.date().refine((d) => d.getTime() <= Date.now(), `${label} can't be in the future`);
