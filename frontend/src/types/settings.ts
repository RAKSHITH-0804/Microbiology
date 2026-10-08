export interface PrintOptions {
  auto_print_after_save: boolean;
  show_end_of_report: boolean;
}

export interface SystemSettings {
  letterhead_line1: string;
  letterhead_line2: string;
  letterhead_line3: string;
  /** "YYYY" is replaced by the current year, e.g. "LAB-YYYY-" -> "LAB-2026-". */
  lab_no_prefix: string;
  /** Department defaults; each user can override them on this browser. */
  print_defaults: PrintOptions;
  last_updated: { at: string; by: string | null } | null;
}

export interface SessionInfo {
  currentLoginAt: string | null;
  previousLoginAt: string | null;
  passwordChangedAt: string | null;
}
