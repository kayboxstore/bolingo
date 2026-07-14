import { z } from "zod";

export const GENDERS = ["woman", "man", "non_binary", "other"] as const;
export type Gender = (typeof GENDERS)[number];

export const GENDER_LABELS: Record<Gender, string> = {
  woman: "Femme",
  man: "Homme",
  non_binary: "Non-binaire",
  other: "Autre",
};

export const BIO_MAX = 500;
export const PHOTOS_MAX = 6;
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024; // 5 Mo — aligné sur le bucket

/** Âge en années révolues à la date du jour. */
export function ageOf(birthdate: Date): number {
  const today = new Date();
  let age = today.getFullYear() - birthdate.getFullYear();
  const beforeBirthday =
    today.getMonth() < birthdate.getMonth() ||
    (today.getMonth() === birthdate.getMonth() &&
      today.getDate() < birthdate.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

const birthdateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide.")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime());
  }, "Date invalide.")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return ageOf(date) <= 120;
  }, "Date invalide.");

/**
 * Étape Infos de base. La règle d'âge (18 ans révolus) est vérifiée à part
 * (`isUnderage`) pour déclencher le blocage légal, pas un simple message.
 */
export const basicsSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Prénom requis.")
    .max(50, "50 caractères maximum."),
  birthdate: birthdateSchema,
  gender: z.enum(GENDERS, "Sélectionne une option."),
});

export function isUnderage(birthdate: string): boolean {
  return ageOf(new Date(`${birthdate}T00:00:00Z`)) < 18;
}

export const bioSchema = z.object({
  bio: z
    .string()
    .trim()
    .max(BIO_MAX, `${BIO_MAX} caractères maximum.`),
});

export const preferencesSchema = z
  .object({
    interestedIn: z
      .array(z.enum(GENDERS))
      .min(1, "Sélectionne au moins une option."),
    ageMin: z.coerce.number<number>().int().min(18, "Minimum 18 ans.").max(99),
    ageMax: z.coerce.number<number>().int().min(18).max(99),
  })
  .refine((data) => data.ageMax >= data.ageMin, {
    message: "La tranche d'âge est inversée.",
    path: ["ageMax"],
  });

export const locationSchema = z.object({
  city: z
    .string()
    .trim()
    .min(1, "Ville requise.")
    .max(120, "120 caractères maximum."),
});

/** État renvoyé par les Server Actions du wizard. */
export type WizardState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export const initialWizardState: WizardState = {};
