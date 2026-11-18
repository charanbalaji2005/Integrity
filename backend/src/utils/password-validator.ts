export interface UserValidationDetails {
	name?: string | null;
	email?: string | null;
	rollNumber?: string | null;
	academicId?: string | null;
}

export function validatePasswordStrength(
	password: string,
	userDetails: UserValidationDetails = {},
) {
	const checks = {
		length: password.length >= 12 && password.length <= 64,
		uppercase: /[A-Z]/.test(password),
		lowercase: /[a-z]/.test(password),
		number: /[0-9]/.test(password),
		specialChar: /[^A-Za-z0-9]/.test(password),
		noSpaces: !/\s/.test(password),
		noPersonalInfo: true,
		noCommon: true,
		noRepeated: true,
		noSequential: true,
	};

	const pLower = password.toLowerCase();

	// 1. Personal Info Validation
	if (userDetails.name) {
		const nameParts = userDetails.name
			.toLowerCase()
			.split(/\s+/)
			.filter((part) => part.length > 2);
		for (const part of nameParts) {
			if (pLower.includes(part)) {
				checks.noPersonalInfo = false;
			}
		}
	}

	if (userDetails.email) {
		const emailLower = userDetails.email.toLowerCase();
		const username = emailLower.split("@")[0];
		if (pLower.includes(emailLower) || (username && pLower.includes(username))) {
			checks.noPersonalInfo = false;
		}
	}

	if (userDetails.rollNumber) {
		const rollLower = userDetails.rollNumber.toLowerCase();
		if (rollLower.length > 2 && pLower.includes(rollLower)) {
			checks.noPersonalInfo = false;
		}
	}

	if (userDetails.academicId) {
		const acadLower = userDetails.academicId.toLowerCase();
		if (acadLower.length > 2 && pLower.includes(acadLower)) {
			checks.noPersonalInfo = false;
		}
	}

	// 2. Common Passwords Checks
	const commonPasswords = [
		"password",
		"123456",
		"12345678",
		"qwerty",
		"asdfgh",
		"admin123",
		"welcome",
		"letmein",
	];
	for (const common of commonPasswords) {
		if (pLower.includes(common)) {
			checks.noCommon = false;
		}
	}

	// 3. Repeated Characters (aaaaaa, 111111)
	if (/(.)\1{5,}/.test(password)) {
		checks.noRepeated = false;
	}

	// 4. Sequential Characters (123456, abcdef)
	for (let i = 0; i <= password.length - 6; i++) {
		const slice = pLower.slice(i, i + 6);
		const codes = Array.from(slice).map((c) => c.charCodeAt(0));
		let ascending = true;
		let descending = true;

		for (let j = 0; j < 5; j++) {
			if (codes[j + 1] !== codes[j] + 1) {
				ascending = false;
			}
			if (codes[j + 1] !== codes[j] - 1) {
				descending = false;
			}
		}
		if (ascending || descending) {
			checks.noSequential = false;
		}
	}

	// Keyboard patterns (qwerty, asdfgh)
	const keyboardPatterns = ["qwerty", "asdfgh", "zxcvbn", "yuiop", "hjkl", "bnm"];
	for (const pattern of keyboardPatterns) {
		if (pLower.includes(pattern)) {
			checks.noCommon = false;
		}
	}

	const isValid = Object.values(checks).every((v) => v === true);

	// Suggestions provider
	const suggestions: string[] = [];
	if (!checks.length) suggestions.push("Increase password length to at least 12 characters.");
	if (!checks.uppercase) suggestions.push("Add at least one uppercase letter.");
	if (!checks.lowercase) suggestions.push("Add at least one lowercase letter.");
	if (!checks.number) suggestions.push("Include at least one numeric digit.");
	if (!checks.specialChar) suggestions.push("Include at least one special character symbol.");
	if (!checks.noSpaces) suggestions.push("Remove spaces from the password.");
	if (!checks.noPersonalInfo)
		suggestions.push("Avoid using your name, email, roll number, or employee ID.");
	if (!checks.noCommon)
		suggestions.push("Avoid using common phrases, qwerty sequences, or simple words.");
	if (!checks.noRepeated) suggestions.push("Do not use repeated characters (e.g. 'aaaaaa').");
	if (!checks.noSequential)
		suggestions.push("Avoid consecutive numbers or letters (e.g. '123456').");

	// Calculate Strength score out of 5 based on passed categories
	let score = 0;
	if (checks.length) score++;
	if (checks.uppercase && checks.lowercase) score++;
	if (checks.number && checks.specialChar) score++;
	if (checks.noPersonalInfo && checks.noCommon) score++;
	if (checks.noRepeated && checks.noSequential) score++;

	let strengthLabel = "Very Weak";
	if (score === 1) strengthLabel = "Weak";
	else if (score === 2) strengthLabel = "Fair";
	else if (score === 3) strengthLabel = "Strong";
	else if (score >= 4) strengthLabel = "Very Strong";

	return {
		isValid,
		checks,
		score,
		strengthLabel,
		suggestions,
	};
}
