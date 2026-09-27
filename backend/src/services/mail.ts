import nodemailer from "nodemailer";
import { env } from "../config/env";

const transporter = nodemailer.createTransport({
	service: "gmail",
	auth: {
		user: env.SMTP_USER,
		pass: env.SMTP_PASS,
	},
});

 

export async function sendEmail({
	to,
	subject,
	html,
}: {
	to: string;
	subject: string;
	html: string;
}) {
	try {
		const info = await transporter.sendMail({
			from: `"IntegrityOS Support" <${env.SMTP_USER}>`,
			to,
			subject,
			html,
		});
		console.log(`[Email] Sent email to ${to}: messageId=${info.messageId}`);
		return info;
	} catch (error) {
		console.error("[Email] Failed to send email via mail.ts:", error);
		throw error;
	}
}
