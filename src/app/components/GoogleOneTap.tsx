import { useEffect, useRef } from "react";

declare global {
	interface Window {
		google?: any;
	}
}

interface GoogleOneTapProps {
	onSignInSuccess: (idToken: string) => void;
}

export function GoogleOneTap({ onSignInSuccess }: GoogleOneTapProps) {
	const onSignInSuccessRef = useRef(onSignInSuccess);
	onSignInSuccessRef.current = onSignInSuccess;

	useEffect(() => {
		// Do not show if dismissed in this session
		const isDismissed = sessionStorage.getItem("google_one_tap_dismissed");
		if (isDismissed) {
			return;
		}

		const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
		if (!clientId) {
			console.warn("VITE_GOOGLE_CLIENT_ID is not configured");
			return;
		}

		let promptTriggered = false;

		const initializeOneTap = () => {
			if (!window.google?.accounts?.id || promptTriggered) {
				return;
			}

			try {
				window.google.accounts.id.initialize({
					client_id: clientId,
					callback: (response: any) => {
						if (response.credential) {
							onSignInSuccessRef.current(response.credential);
						} else {
							console.error("No credential returned from Google One Tap");
						}
					},
					auto_select: false, // Avoid auto logging in without user interaction
					itp_support: true,
				});

				promptTriggered = true;
				window.google.accounts.id.prompt((notification: any) => {
					if (notification.isDismissedMoment()) {
						sessionStorage.setItem("google_one_tap_dismissed", "true");
					}
				});
			} catch (err) {
				console.error("Google One Tap initialization error:", err);
			}
		};

		// If Google client script is loaded, initialize, otherwise wait for it
		if (window.google?.accounts?.id) {
			initializeOneTap();
		} else {
			const interval = setInterval(() => {
				if (window.google?.accounts?.id) {
					initializeOneTap();
					clearInterval(interval);
				}
			}, 500);
			return () => clearInterval(interval);
		}
	}, []); // Empty dependency array to run only once on mount

	return null;
}
