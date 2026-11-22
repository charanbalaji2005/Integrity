export interface LoginPayload {
	email: string;
	password: string;
	portal?: "admin" | "faculty" | "support" | "student";
}

export interface ForgotPasswordPayload {
	email: string;
}

export interface MagicLinkPayload {
	email: string;
}

export interface UserSession {
	id: string;
	name: string;
	email: string;
	emailVerified: boolean;
	image: string | null;
	role?: string;
	status?: string;
	suspendedUntil?: Date | null;
	institutionName?: string | null;
	department?: string | null;
	academicId?: string | null;
	createdAt: Date;
	updatedAt: Date;
}

export interface LoginResult {
	user: UserSession;
	session: {
		token: string;
		expiresAt: Date;
	};
	/**
	 * Present when the account has two-step verification on: the session token
	 * is issued but stays unusable until POST /api/authentication/2fa/verify.
	 */
	twoFactor?: {
		required: true;
		maskedEmail: string;
		expiresInSeconds: number;
		resendInSeconds: number;
	};
}
