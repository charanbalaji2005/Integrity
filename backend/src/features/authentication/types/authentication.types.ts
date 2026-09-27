export interface LoginPayload {
	email: string;
	password: string;
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
}
