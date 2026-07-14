import { z } from "zod";

/** Règles produit : email valide ; mot de passe ≥ 8 caractères dont ≥ 1 chiffre. */
// trim/lowercase AVANT la validation de format (espace parasite du clavier mobile).
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Adresse email invalide."));

export const passwordSchema = z
  .string()
  .min(8, "8 caractères minimum.")
  .regex(/\d/, "Au moins 1 chiffre.");

export const signupSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((data) => data.password === data.confirm, {
    message: "Les mots de passe ne correspondent pas.",
    path: ["confirm"],
  });

export const loginSchema = z.object({
  email: emailSchema,
  // Pas de règles de force à la connexion : on ne révèle rien sur le format attendu.
  password: z.string().min(1, "Mot de passe requis."),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((data) => data.password === data.confirm, {
    message: "Les mots de passe ne correspondent pas.",
    path: ["confirm"],
  });

/** État renvoyé par les Server Actions aux formulaires (useFormState). */
export type FormState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  success?: string;
};

export const initialFormState: FormState = {};
