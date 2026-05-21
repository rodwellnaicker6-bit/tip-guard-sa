/** Profile fields used for onboarding completion (profiles table). */
export type ProfileCompletionFields = {
  full_name: string | null;
  phone: string | null;
};

export type ProfileChecklistItem = {
  id: "name" | "phone";
  label: string;
  done: boolean;
  optional?: boolean;
};

export function profileChecklist(fields: ProfileCompletionFields): ProfileChecklistItem[] {
  const name = fields.full_name?.trim() ?? "";
  const phone = fields.phone?.trim() ?? "";
  return [
    { id: "name", label: "Display name", done: name.length >= 2 },
    { id: "phone", label: "Mobile number (optional)", done: phone.length >= 9, optional: true },
  ];
}

/** Required items only (name); phone is optional and does not block completion. */
export function profileCompletionPercent(fields: ProfileCompletionFields): number {
  const required = profileChecklist(fields).filter((i) => !i.optional);
  if (required.length === 0) return 100;
  const done = required.filter((i) => i.done).length;
  return Math.round((done / required.length) * 100);
}

export function isProfileComplete(fields: ProfileCompletionFields): boolean {
  return profileCompletionPercent(fields) >= 100;
}
