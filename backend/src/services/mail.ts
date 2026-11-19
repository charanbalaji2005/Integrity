import nodemailer from "nodemailer";
import { env } from "../config/env";

const transporter = nodemailer.createTransport({
	service: "gmail",
	auth: {
		user: env.SMTP_USER,
		pass: env.SMTP_PASS,
	},
});

 

export interface EmailAttachment {
	filename: string;
	content: string | Buffer;
	contentType?: string;
}

/** True when real SMTP credentials are configured (the defaults are placeholders). */
export function mailConfigured(): boolean {
	return Boolean(env.SMTP_USER && env.SMTP_PASS && env.SMTP_PASS !== "disabled" && env.SMTP_USER.includes("@") && !env.SMTP_USER.endsWith(".local"));
}

export async function sendEmail({
	to,
	subject,
	html,
	text,
	attachments,
}: {
	to: string;
	subject: string;
	html: string;
	text?: string;
	attachments?: EmailAttachment[];
}) {
	try {
		const info = await transporter.sendMail({
			from: `"IntegrityOS Support" <${env.SMTP_USER}>`,
			to,
			subject,
			html,
			...(text ? { text } : {}),
			...(attachments?.length ? { attachments } : {}),
		});
		console.log(`[Email] Sent email to ${to}: messageId=${info.messageId}`);
		return info;
	} catch (error) {
		console.error("[Email] Failed to send email via mail.ts:", error);
		throw error;
	}
}
