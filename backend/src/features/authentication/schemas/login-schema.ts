import { z } from "zod";

export const loginSchema = z.object({
	email: z
		.string()
		.min(1, "University email is required")
		.email("Invalid email address")
		.toLowerCase()
		.trim(),

	password: z
		.string()
		.min(1, "Password is required")
		.min(8, "Password must be at least 8 characters"),
});

export const forgotPasswordSchema = z.object({
	email: z
		.string()
		.min(1, "University email is required")
		.email("Invalid email address")
		.toLowerCase()
		.trim(),
});

export const magicLinkSchema = z.object({
	email: z
		.string()
		.min(1, "University email is required")
		.email("Invalid email address")
		.toLowerCase()
		.trim(),
});

export const sendRegisterOtpSchema = z.object({
	email: z
		.string()
		.min(1, "University email is required")
		.email("Invalid email address")
		.toLowerCase()
		.trim(),
});

export const verifyRegisterOtpSchema = z.object({
	email: z
		.string()
		.min(1, "University email is required")
		.email("Invalid email address")
		.toLowerCase()
		.trim(),
	otp: z
		.string()
		.length(6, "Verification code must be 6 digits")
		.trim(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type MagicLinkInput = z.infer<typeof magicLinkSchema>;
export type SendRegisterOtpInput = z.infer<typeof sendRegisterOtpSchema>;
export type VerifyRegisterOtpInput = z.infer<typeof verifyRegisterOtpSchema>;
