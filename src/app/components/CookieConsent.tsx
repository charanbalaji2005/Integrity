import React, { useState, useEffect } from "react";
import { Cookie, ShieldCheck, X } from "lucide-react";
import { Button } from "./ui/button";
import { motion, AnimatePresence } from "motion/react";

export function CookieConsent() {
	const [isVisible, setIsVisible] = useState(false);

	useEffect(() => {
		// Check if the user has already consented or rejected
		const hasConsent = document.cookie
			.split(";")
			.some((item) => item.trim().startsWith("cookie_consent="));

		if (!hasConsent) {
			// Delay display slightly for professional entrance
			const timer = setTimeout(() => {
				setIsVisible(true);
			}, 1500);
			return () => clearTimeout(timer);
		}
	}, []);

	const handleAccept = () => {
		// Set cookie for 1 year
		const expiryDate = new Date();
		expiryDate.setFullYear(expiryDate.getFullYear() + 1);
		document.cookie = `cookie_consent=accepted; expires=${expiryDate.toUTCString()}; path=/; SameSite=Lax`;
		setIsVisible(false);
	};

	const handleReject = () => {
		// Set cookie for 1 year
		const expiryDate = new Date();
		expiryDate.setFullYear(expiryDate.getFullYear() + 1);
		document.cookie = `cookie_consent=rejected; expires=${expiryDate.toUTCString()}; path=/; SameSite=Lax`;
		setIsVisible(false);
	};

	return (
		<AnimatePresence>
			{isVisible && (
				<motion.div
					initial={{ y: 100, opacity: 0 }}
					animate={{ y: 0, opacity: 1 }}
					exit={{ y: 100, opacity: 0 }}
					transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
					className="fixed bottom-6 left-6 right-6 md:left-auto md:max-w-[480px] z-50 rounded-[24px] border-2 border-[#d3c2a6]/80 bg-white/95 p-6 shadow-[0px_24px_48px_-8px_rgba(142,126,98,0.3)] backdrop-blur-[16px]"
				>
					<div className="flex gap-4">
						{/* Icon Column */}
						<div className="flex size-12 items-center justify-center rounded-full bg-[#fcfaf7] border border-[#d3c2a6]/30 text-amber-700 shrink-0">
							<Cookie className="size-6 animate-pulse" />
						</div>

						{/* Content Column */}
						<div className="flex flex-col gap-2.5">
							<div className="flex items-center justify-between">
								<h3 className="text-sm font-bold tracking-tight text-[#1a1917] flex items-center gap-1.5">
									<ShieldCheck className="size-4 text-emerald-600" />
									Cookie Consent Notice
								</h3>
								<button
									onClick={handleReject}
									className="text-[#8e8a80] hover:text-black transition-colors rounded-full p-1 hover:bg-neutral-100"
									title="Dismiss"
								>
								<X className="size-4" />
								</button>
							</div>
							<p className="text-xs text-[#6b6861] leading-relaxed">
								We use cookies to maintain your active authentication sessions, log access audits,
								and improve your experience. Select <strong>Accept</strong> to permit cookies, or{" "}
								<strong>Reject</strong> to restrict them.
							</p>

							{/* Actions Row */}
							<div className="flex gap-2 mt-1 justify-end">
								<Button
									variant="ghost"
									onClick={handleReject}
									className="h-9 px-4 rounded-xl text-xs font-semibold hover:bg-rose-500/10 text-neutral-600 hover:text-rose-600 border border-transparent hover:border-rose-200/40"
								>
									Reject
								</Button>
								<Button
									onClick={handleAccept}
									className="h-9 px-5 rounded-xl bg-black text-white hover:bg-black/90 text-xs font-bold shadow-sm"
								>
									Accept
								</Button>
							</div>
						</div>
					</div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
