import React, { useState, useEffect } from "react";
import {
	Shield,
	Search,
	Power,
	Trash2,
	History,
	Clock,
	AlertTriangle,
	ShieldAlert,
	RotateCw,
	LogOut,
	Users,
	Database,
	Server,
	Cpu,
	Activity,
	Eye,
	FileText,
	CheckCircle,
	Sliders,
	MessageSquare,
	AlertCircle,
	Key,
	Lock,
	Check,
	X
} from "lucide-react";
import { Button } from "../app/components/ui/button";
import { Input } from "../app/components/ui/input";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "../app/components/ui/dialog";
import { NotificationCenter } from "../app/components/NotificationCenter";

interface AdminPanelViewProps {
	user: any;
	handleBack: () => void;
	parseUserAgent: (ua?: string) => string;
}

export function AdminPanelView({ user, handleBack, parseUserAgent }: AdminPanelViewProps) {
	const [activeTab, setActiveTab] = useState<
		| "overview"
		| "users"
		| "faculty"
		| "assessments"
		| "live"
		| "agents"
		| "database"
		| "support"
		| "audit"
		| "settings"
	>("overview");

	// State for directories
	const [users, setUsers] = useState<any[]>([]);
	const [assessments, setAssessments] = useState<any[]>([]);
	const [loading, setLoading] = useState(true);
	const [searchQuery, setSearchQuery] = useState("");
	const [statusFilter, setStatusFilter] = useState("all");

	// Diagnostic & System States
	const [healthMetrics, setHealthMetrics] = useState<any>(null);
	const [agentStatus, setAgentStatus] = useState<any[]>([]);
	const [auditLogs, setAuditLogs] = useState<any>({ adminLogs: [], selfHealingLogs: [] });
	const [platformSettings, setPlatformSettings] = useState<any>(null);

	// Action modals
	const [selectedUserForLogs, setSelectedUserForLogs] = useState<any | null>(null);
	const [userLogs, setUserLogs] = useState<any[]>([]);
	const [loadingUserLogs, setLoadingUserLogs] = useState(false);

	const [selectedUserForTempSuspend, setSelectedUserForTempSuspend] = useState<any | null>(null);
	const [tempHours, setTempHours] = useState<number>(24);
	
	const [selectedUserForPasswordReset, setSelectedUserForPasswordReset] = useState<any | null>(null);
	const [newPassword, setNewPassword] = useState("");
	const [isResettingPassword, setIsResettingPassword] = useState(false);

	const [selectedUserForDelete, setSelectedUserForDelete] = useState<any | null>(null);
	const [isSubmittingDelete, setIsSubmittingDelete] = useState(false);

	// User creation states
	const [showAddStudentModal, setShowAddStudentModal] = useState(false);
	const [showAddFacultyModal, setShowAddFacultyModal] = useState(false);

	// Student form state
	const [studentName, setStudentName] = useState("");
	const [studentEmail, setStudentEmail] = useState("");
	const [studentRoll, setStudentRoll] = useState("");
	const [studentPhone, setStudentPhone] = useState("");
	const [studentDept, setStudentDept] = useState("Computer Science & Engineering");
	const [studentBranch, setStudentBranch] = useState("B.Tech");
	const [studentSemester, setStudentSemester] = useState("1");
	const [studentSection, setStudentSection] = useState("");
	const [studentPassword, setStudentPassword] = useState("");
	const [isCreatingStudent, setIsCreatingStudent] = useState(false);

	// Faculty form state
	const [facultyName, setFacultyName] = useState("");
	const [facultyEmail, setFacultyEmail] = useState("");
	const [facultyAcademicId, setFacultyAcademicId] = useState("");
	const [facultyDept, setFacultyDept] = useState("Computer Science & Engineering");
	const [facultyDesignation, setFacultyDesignation] = useState("Assistant Professor");
	const [facultySubjects, setFacultySubjects] = useState("");
	const [facultyPhone, setFacultyPhone] = useState("");
	const [facultySections, setFacultySections] = useState("");
	const [facultyPassword, setFacultyPassword] = useState("");
	const [isCreatingFaculty, setIsCreatingFaculty] = useState(false);

	// User editing state
	const [selectedUserForEdit, setSelectedUserForEdit] = useState<any | null>(null);
	const [editName, setEditName] = useState("");
	const [editRollNumber, setEditRollNumber] = useState("");
	const [editAcademicId, setEditAcademicId] = useState("");
	const [editDepartment, setEditDepartment] = useState("");
	const [editBranch, setEditBranch] = useState("");
	const [editSemester, setEditSemester] = useState("");
	const [editSection, setEditSection] = useState("");
	const [editSubjects, setEditSubjects] = useState("");
	const [editPhone, setEditPhone] = useState("");
	const [editDesignation, setEditDesignation] = useState("");
	const [editTwoFactor, setEditTwoFactor] = useState(false);
	const [editEmailVerified, setEditEmailVerified] = useState(false);
	const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

	// Settings inputs states
	const [maintenanceMode, setMaintenanceMode] = useState(false);
	const [emergencyShutdown, setEmergencyShutdown] = useState(false);
	const [studentPortalEnabled, setStudentPortalEnabled] = useState(true);
	const [facultyPortalEnabled, setFacultyPortalEnabled] = useState(true);
	const [adminPortalEnabled, setAdminPortalEnabled] = useState(true);
	const [securityAgentEnabled, setSecurityAgentEnabled] = useState(true);
	const [evaluationModel, setEvaluationModel] = useState("");
	const [supportModel, setSupportModel] = useState("");
	const [integrityLimit, setIntegrityLimit] = useState(75);
	const [similarityLimit, setSimilarityLimit] = useState(65);

	// Security WAF Agent simulation states
	const [simulatedEventType, setSimulatedEventType] = useState("failed_login");
	const [isSimulatingEvent, setIsSimulatingEvent] = useState(false);
	const [isResettingRisks, setIsResettingRisks] = useState(false);

	// Live proctoring sessions from DB
	const [liveSessions, setLiveSessions] = useState<any[]>([]);

	// Security operations alerts from DB
	const [socAlerts, setSocAlerts] = useState<any[]>([]);

	// Dashboard statistics from DB
	const [dashboardStats, setDashboardStats] = useState<any>(null);

	// Fetch platform configuration
	const fetchSettings = async () => {
		try {
			const res = await fetch("/api/admin/settings", {
				headers: {
					"x-user-id": user.id,
					"x-user-role": user.role || "admin"
				}
			});
			if (res.ok) {
				const data = await res.json();
				const state = data.data;
				setPlatformSettings(state);
				setMaintenanceMode(state.maintenanceMode);
				setEmergencyShutdown(state.emergencyShutdown);
				setStudentPortalEnabled(state.studentPortalEnabled !== undefined ? state.studentPortalEnabled : true);
				setFacultyPortalEnabled(state.facultyPortalEnabled !== undefined ? state.facultyPortalEnabled : true);
				setAdminPortalEnabled(state.adminPortalEnabled !== undefined ? state.adminPortalEnabled : true);
				setSecurityAgentEnabled(state.securityAgentEnabled !== undefined ? state.securityAgentEnabled : true);
				setEvaluationModel(state.aiModelsConfig.evaluationModel);
				setSupportModel(state.aiModelsConfig.supportModel);
				setIntegrityLimit(state.thresholds.integrityWarningLimit);
				setSimilarityLimit(state.thresholds.similarityThreshold);
			}
		} catch (err) {
			console.error("Failed to load platform settings:", err);
		}
	};

	// Fetch users directory
	const fetchUsers = async () => {
		try {
			const res = await fetch("/api/admin/users", {
				headers: {
					"x-user-id": user.id,
					"x-user-role": user.role || "admin"
				}
			});
			if (res.ok) {
				const data = await res.json();
				setUsers(data.data || []);
			}
		} catch (err) {
			console.error("Failed to fetch users:", err);
		}
	};

	// Fetch assessments list
	const fetchAssessments = async () => {
		try {
			const res = await fetch("/api/admin/assessments", {
				headers: {
					"x-user-id": user.id,
					"x-user-role": user.role || "admin"
				}
			});
			if (res.ok) {
				const data = await res.json();
				setAssessments(data.data || []);
			}
		} catch (err) {
			console.error("Failed to fetch assessments:", err);
		}
	};

	// Fetch diagnostic data
	const fetchDiagnostics = async () => {
		try {
			const headers = {
				"x-user-id": user.id,
				"x-user-role": user.role || "admin"
			};
			const [healthRes, agentRes, auditRes] = await Promise.all([
				fetch("/api/admin/health", { headers }),
				fetch("/api/admin/agents", { headers }),
				fetch("/api/admin/audit-logs", { headers })
			]);

			if (healthRes.ok) {
				const h = await healthRes.json();
				setHealthMetrics(h.data);
			}
			if (agentRes.ok) {
				const a = await agentRes.json();
				setAgentStatus(a.data || []);
			}
			if (auditRes.ok) {
				const au = await auditRes.json();
				setAuditLogs(au.data || { adminLogs: [], selfHealingLogs: [] });
			}
		} catch (err) {
			console.error("Diagnostics load error:", err);
		}
	};

	// Fetch dashboard statistics
	const fetchDashboardStats = async () => {
		try {
			const res = await fetch("/api/admin/dashboard-stats", {
				headers: {
					"x-user-id": user.id,
					"x-user-role": user.role || "admin"
				}
			});
			if (res.ok) {
				const data = await res.json();
				setDashboardStats(data.data);
			}
		} catch (err) {
			console.error("Failed to fetch dashboard stats:", err);
		}
	};

	// Fetch live sessions from DB
	const fetchLiveSessions = async () => {
		try {
			const res = await fetch("/api/admin/live-sessions", {
				headers: {
					"x-user-id": user.id,
					"x-user-role": user.role || "admin"
				}
			});
			if (res.ok) {
				const data = await res.json();
				setLiveSessions(data.data || []);
			}
		} catch (err) {
			console.error("Failed to fetch live sessions:", err);
		}
	};

	// Fetch SOC alerts from DB
	const fetchSocAlerts = async () => {
		try {
			const res = await fetch("/api/admin/soc-alerts", {
				headers: {
					"x-user-id": user.id,
					"x-user-role": user.role || "admin"
				}
			});
			if (res.ok) {
				const data = await res.json();
				setSocAlerts(data.data || []);
			}
		} catch (err) {
			console.error("Failed to fetch SOC alerts:", err);
		}
	};

	const refreshAllData = async () => {
		setLoading(true);
		await Promise.all([
			fetchSettings(),
			fetchUsers(),
			fetchAssessments(),
			fetchDiagnostics(),
			fetchDashboardStats(),
			fetchLiveSessions(),
			fetchSocAlerts()
		]);
		setLoading(false);
	};

	useEffect(() => {
		refreshAllData();
		// Periodic poll for all live data
		const interval = setInterval(() => {
			fetchDiagnostics();
			fetchDashboardStats();
			fetchLiveSessions();
			fetchSocAlerts();
		}, 15000);
		return () => clearInterval(interval);
	}, []);

	// Force toggle platform state settings
	const handleSaveSettings = async (modeUpdates?: Partial<any>) => {
		try {
			const payload = {
				maintenanceMode: modeUpdates?.maintenanceMode !== undefined ? modeUpdates.maintenanceMode : maintenanceMode,
				emergencyShutdown: modeUpdates?.emergencyShutdown !== undefined ? modeUpdates.emergencyShutdown : emergencyShutdown,
				studentPortalEnabled: modeUpdates?.studentPortalEnabled !== undefined ? modeUpdates.studentPortalEnabled : studentPortalEnabled,
				facultyPortalEnabled: modeUpdates?.facultyPortalEnabled !== undefined ? modeUpdates.facultyPortalEnabled : facultyPortalEnabled,
				adminPortalEnabled: modeUpdates?.adminPortalEnabled !== undefined ? modeUpdates.adminPortalEnabled : adminPortalEnabled,
				securityAgentEnabled: modeUpdates?.securityAgentEnabled !== undefined ? modeUpdates.securityAgentEnabled : securityAgentEnabled,
				aiModelsConfig: {
					evaluationModel,
					supportModel,
					ocrModel: "Webcam Identity Verification Model v2"
				},
				thresholds: {
					integrityWarningLimit: Number(integrityLimit),
					similarityThreshold: Number(similarityLimit),
					riskEscalationLimit: 80
				}
			};

			const res = await fetch("/api/admin/settings", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-user-id": user.id,
					"x-user-role": user.role || "admin"
				},
				body: JSON.stringify(payload)
			});

			if (res.ok) {
				toast.success("Platform settings successfully configured.");
				fetchSettings();
				fetchDiagnostics();
			} else {
				toast.error("Failed to update configurations.");
			}
		} catch {
			toast.error("Connection failed.");
		}
	};

	// Self healing trigger
	const handleSelfHeal = async () => {
		toast.loading("Initiating manual self-healing diagnostics...", { id: "heal-loader" });
		try {
			const res = await fetch("/api/admin/self-heal", {
				method: "POST",
				headers: {
					"x-user-id": user.id,
					"x-user-role": user.role || "admin"
				}
			});
			if (res.ok) {
				toast.success("Manual checks completed. Services operational.", { id: "heal-loader" });
				fetchDiagnostics();
			} else {
				toast.error("Self-healing sweep failed.", { id: "heal-loader" });
			}
		} catch {
			toast.error("Network error.", { id: "heal-loader" });
		}
	};

	// Reset all student risks and suspensions
	const handleResetAllStudentRisks = async () => {
		setIsResettingRisks(true);
		toast.loading("Resetting all student risk scores and suspensions...", { id: "reset-risks-loader" });
		try {
			const res = await fetch("/api/admin/security/reset-risks", {
				method: "POST",
				headers: {
					"x-user-id": user.id,
					"x-user-role": user.role || "admin"
				}
			});
			if (res.ok) {
				toast.success("Successfully reset all student risk scores and suspensions!", { id: "reset-risks-loader" });
				await refreshAllData();
			} else {
				toast.error("Failed to reset student risk scores.", { id: "reset-risks-loader" });
			}
		} catch {
			toast.error("Network error.", { id: "reset-risks-loader" });
		} finally {
			setIsResettingRisks(false);
		}
	};

	// Trigger a simulated proctor/threat event
	const handleSimulateSecurityEvent = async () => {
		setIsSimulatingEvent(true);
		toast.loading(`Simulating security incident '${simulatedEventType}'...`, { id: "simulate-event-loader" });
		try {
			const res = await fetch("/api/admin/security/simulate-event", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-user-id": user.id,
					"x-user-role": user.role || "admin"
				},
				body: JSON.stringify({ eventType: simulatedEventType })
			});
			if (res.ok) {
				toast.success("Simulated security incident logged successfully!", { id: "simulate-event-loader" });
				await refreshAllData();
			} else {
				const errData = await res.json().catch(() => ({}));
				toast.error(errData?.message || "Failed to trigger simulation.", { id: "simulate-event-loader" });
			}
		} catch {
			toast.error("Network error triggering simulation.", { id: "simulate-event-loader" });
		} finally {
			setIsSimulatingEvent(false);
		}
	};

	// Student/Faculty creation and User Edit Handlers
	const submitCreateStudent = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!studentName || !studentEmail || !studentRoll || !studentDept || !studentPassword) {
			toast.error("Please fill in all required fields.");
			return;
		}

		setIsCreatingStudent(true);
		try {
			const res = await fetch("/api/admin/users/student", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-user-id": user.id,
					"x-user-role": user.role || "admin",
				},
				body: JSON.stringify({
					name: studentName,
					email: studentEmail,
					rollNumber: studentRoll,
					phoneNumber: studentPhone,
					department: studentDept,
					branch: studentBranch,
					semester: `Semester ${studentSemester}`,
					section: studentSection.trim().toUpperCase(),
					password: studentPassword
				})
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.message || "Failed to create student");

			toast.success("Student account created successfully!");
			setShowAddStudentModal(false);
			// Reset fields
			setStudentName("");
			setStudentEmail("");
			setStudentRoll("");
			setStudentPhone("");
			setStudentSection("");
			setStudentPassword("");
			fetchUsers();
		} catch (err: any) {
			toast.error(err.message || "Something went wrong.");
		} finally {
			setIsCreatingStudent(false);
		}
	};

	const submitCreateFaculty = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!facultyName || !facultyEmail || !facultyAcademicId || !facultyDept || !facultyPassword) {
			toast.error("Please fill in all required fields.");
			return;
		}

		setIsCreatingFaculty(true);
		try {
			const res = await fetch("/api/admin/users/faculty", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-user-id": user.id,
					"x-user-role": user.role || "admin",
				},
				body: JSON.stringify({
					name: facultyName,
					email: facultyEmail,
					academicId: facultyAcademicId,
					department: facultyDept,
					designation: facultyDesignation,
					subjects: facultySubjects,
					phoneNumber: facultyPhone,
					section: facultySections.trim().toUpperCase(),
					password: facultyPassword
				})
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.message || "Failed to create faculty");

			toast.success("Faculty account created successfully!");
			setShowAddFacultyModal(false);
			// Reset fields
			setFacultyName("");
			setFacultyEmail("");
			setFacultyAcademicId("");
			setFacultySubjects("");
			setFacultyPhone("");
			setFacultySections("");
			setFacultyPassword("");
			fetchUsers();
		} catch (err: any) {
			toast.error(err.message || "Something went wrong.");
		} finally {
			setIsCreatingFaculty(false);
		}
	};

	const openEditModal = (u: any) => {
		setSelectedUserForEdit(u);
		setEditName(u.name || "");
		setEditRollNumber(u.rollNumber || "");
		setEditAcademicId(u.academicId || "");
		setEditDepartment(u.department || "");
		setEditBranch(u.branch || "");
		setEditSemester(u.semester || "");
		setEditSection(u.section || "");
		setEditSubjects(u.subjects || "");
		setEditPhone(u.phoneNumber || "");
		setEditDesignation(u.designation || "");
		setEditTwoFactor(!!u.twoFactorEnabled);
		setEditEmailVerified(!!u.emailVerified);
	};

	const submitEditUser = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!selectedUserForEdit) return;

		setIsSubmittingEdit(true);
		try {
			const res = await fetch(`/api/admin/users/${selectedUserForEdit.id}`, {
				method: "PUT",
				headers: {
					"Content-Type": "application/json",
					"x-user-id": user.id,
					"x-user-role": user.role || "admin",
				},
				body: JSON.stringify({
					name: editName,
					rollNumber: editRollNumber,
					academicId: editAcademicId,
					department: editDepartment,
					branch: editBranch,
					semester: editSemester,
					section: editSection,
					subjects: editSubjects,
					phoneNumber: editPhone,
					designation: editDesignation,
					twoFactorEnabled: editTwoFactor,
					emailVerified: editEmailVerified,
				})
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.message || "Failed to update profile");

			toast.success("User profile updated successfully!");
			setSelectedUserForEdit(null);
			fetchUsers();
		} catch (err: any) {
			toast.error(err.message || "Something went wrong.");
		} finally {
			setIsSubmittingEdit(false);
		}
	};

	const handleLockUser = async (u: any) => {
		try {
			const res = await fetch(`/api/admin/users/${u.id}/lock`, {
				method: "POST",
				headers: {
					"x-user-id": user.id,
					"x-user-role": user.role || "admin",
				}
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.message || "Failed to lock account");

			toast.success(`Account locked for ${u.name || u.email}`);
			fetchUsers();
		} catch (err: any) {
			toast.error(err.message);
		}
	};

	const handleToggle2FA = async (u: any, enabled: boolean) => {
		try {
			const res = await fetch(`/api/admin/users/${u.id}/toggle-2fa`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-user-id": user.id,
					"x-user-role": user.role || "admin",
				},
				body: JSON.stringify({ enabled })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.message || "Failed to toggle 2FA");

			toast.success(`2FA ${enabled ? "enabled" : "disabled"} for ${u.name || u.email}`);
			fetchUsers();
		} catch (err: any) {
			toast.error(err.message);
		}
	};

	const handleVerifyEmail = async (u: any) => {
		try {
			const res = await fetch(`/api/admin/users/${u.id}/verify-email`, {
				method: "POST",
				headers: {
					"x-user-id": user.id,
					"x-user-role": user.role || "admin",
				}
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.message || "Failed to verify email");

			toast.success(`Email manually verified for ${u.name || u.email}`);
			fetchUsers();
		} catch (err: any) {
			toast.error(err.message);
		}
	};

	const handleForcePasswordReset = async (u: any) => {
		try {
			const res = await fetch(`/api/admin/users/${u.id}/force-password-reset`, {
				method: "POST",
				headers: {
					"x-user-id": user.id,
					"x-user-role": user.role || "admin",
				}
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.message || "Failed to flag password reset");

			toast.success(`Password reset required at next login for ${u.name || u.email}`);
			fetchUsers();
		} catch (err: any) {
			toast.error(err.message);
		}
	};

	// Reset password handler
	const handleResetPasswordSubmit = async () => {
		if (!newPassword.trim()) {
			toast.error("Please enter a new password");
			return;
		}
		setIsResettingPassword(true);
		try {
			const res = await fetch(`/api/admin/users/${selectedUserForPasswordReset.id}/reset-password`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-user-id": user.id,
					"x-user-role": user.role || "admin"
				},
				body: JSON.stringify({ password: newPassword })
			});
			if (res.ok) {
				toast.success(`Password override verified for ${selectedUserForPasswordReset.email}`);
				setSelectedUserForPasswordReset(null);
				setNewPassword("");
				fetchUsers();
			} else {
				const data = await res.json();
				toast.error(data.message || "Failed to reset password.");
			}
		} catch {
			toast.error("An error occurred.");
		} finally {
			setIsResettingPassword(false);
		}
	};

	// Force logout handler
	const handleForceLogout = async (targetUser: any) => {
		try {
			const res = await fetch(`/api/admin/users/${targetUser.id}/force-logout`, {
				method: "POST",
				headers: {
					"x-user-id": user.id,
					"x-user-role": user.role || "admin"
				}
			});
			if (res.ok) {
				toast.success(`Sessions revoked for ${targetUser.email}. User has been forced out.`);
			} else {
				toast.error("Failed to revoke session.");
			}
		} catch {
			toast.error("Network error.");
		}
	};

	// Manual unlock handler
	const handleUnlockUser = async (targetUser: any) => {
		try {
			const res = await fetch(`/api/admin/users/${targetUser.id}/unlock`, {
				method: "POST",
				headers: {
					"x-user-id": user.id,
					"x-user-role": user.role || "admin"
				}
			});
			if (res.ok) {
				toast.success(`Account unlocked for ${targetUser.email}.`);
				fetchUsers();
			} else {
				toast.error("Failed to unlock account.");
			}
		} catch {
			toast.error("Network error.");
		}
	};

	// Permanent suspend user
	const handleSuspend = async (targetUser: any) => {
		try {
			const res = await fetch(`/api/admin/users/${targetUser.id}/suspend`, {
				method: "POST",
				headers: {
					"x-user-id": user.id,
					"x-user-role": user.role || "admin"
				}
			});
			if (res.ok) {
				toast.success(`User ${targetUser.email} has been suspended.`);
				fetchUsers();
			}
		} catch {
			toast.error("Suspension failed.");
		}
	};

	// Unsuspend user
	const handleUnsuspend = async (targetUser: any) => {
		try {
			const res = await fetch(`/api/admin/users/${targetUser.id}/unsuspend`, {
				method: "POST",
				headers: {
					"x-user-id": user.id,
					"x-user-role": user.role || "admin"
				}
			});
			if (res.ok) {
				toast.success(`User ${targetUser.email} reactivated.`);
				fetchUsers();
			}
		} catch {
			toast.error("Reactivation failed.");
		}
	};

	// Temp suspend confirm
	const submitTempSuspend = async () => {
		try {
			const res = await fetch(`/api/admin/users/${selectedUserForTempSuspend.id}/temp-suspend`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-user-id": user.id,
					"x-user-role": user.role || "admin"
				},
				body: JSON.stringify({ durationHours: Number(tempHours) })
			});
			if (res.ok) {
				toast.success(`User temporarily locked for ${tempHours} hours.`);
				setSelectedUserForTempSuspend(null);
				fetchUsers();
			}
		} catch {
			toast.error("Temporary lock failed.");
		}
	};

	// Delete user
	const submitDeleteUser = async () => {
		setIsSubmittingDelete(true);
		try {
			const res = await fetch(`/api/admin/users/${selectedUserForDelete.id}`, {
				method: "DELETE",
				headers: {
					"x-user-id": user.id,
					"x-user-role": user.role || "admin"
				}
			});
			if (res.ok) {
				toast.success("User permanently deleted.");
				setSelectedUserForDelete(null);
				fetchUsers();
			}
		} catch {
			toast.error("Deletion failed.");
		} finally {
			setIsSubmittingDelete(false);
		}
	};

	// View User logs modal
	const openLogsModal = async (targetUser: any) => {
		setSelectedUserForLogs(targetUser);
		setLoadingUserLogs(true);
		try {
			const res = await fetch(`/api/admin/users/${targetUser.id}/logs`, {
				headers: {
					"x-user-id": user.id,
					"x-user-role": user.role || "admin"
				}
			});
			if (res.ok) {
				const data = await res.json();
				setUserLogs(data.data || []);
			}
		} catch {
			toast.error("Could not fetch logs.");
		} finally {
			setLoadingUserLogs(false);
		}
	};

	// Handle role update
	const handleRoleChange = async (targetUserId: string, newRole: string) => {
		try {
			const res = await fetch(`/api/admin/users/${targetUserId}/role`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-user-id": user.id,
					"x-user-role": user.role || "admin"
				},
				body: JSON.stringify({ role: newRole }),
			});
			if (res.ok) {
				toast.success("User role updated successfully.");
				fetchUsers();
			}
		} catch {
			toast.error("Role update failed.");
		}
	};

	// Filter directories search
	const filteredUsers = users.filter((u) => {
		const matchesSearch =
			(u.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
			(u.email || "").toLowerCase().includes(searchQuery.toLowerCase());
		const matchesStatus = statusFilter === "all" || u.status === statusFilter;
		return matchesSearch && matchesStatus;
	});

	const getLoginType = (u: any) => {
		if (u.accounts && u.accounts.length > 0) {
			const providers = u.accounts.map((a: any) => {
				if (a.providerId === "credential") return "Credentials";
				return a.providerId.charAt(0).toUpperCase() + a.providerId.slice(1);
			});
			return providers.join(", ");
		}
		return "Credentials";
	};

	// Status pills coloring helper
	const getOverrideBadgeClass = (status: string) => {
		if (status === "accepted") return "text-emerald-700 bg-emerald-50 border-emerald-200";
		if (status === "modified") return "text-amber-700 bg-amber-50 border-amber-200";
		if (status === "rejected") return "text-rose-700 bg-rose-50 border-rose-200";
		return "text-zinc-600 bg-zinc-50 border-zinc-200";
	};

	return (
		<div className="flex flex-col md:flex-row min-h-screen w-full text-[#1a1917] bg-[#faf9f6]">
			{/* Admin Sidebar Navigation Panel */}
			<aside className="w-full md:w-64 bg-white border-b md:border-b-0 md:border-r border-[#ebdcc9]/60 flex flex-col justify-between shrink-0 p-5 select-none">
				<div className="flex flex-col gap-6">
					<div className="flex items-center justify-between pb-4 border-b border-[#ebdcc9]/40">
						<div className="flex items-center gap-3">
							<div className="flex items-center justify-center p-2 bg-zinc-950 text-white rounded-xl shadow-sm shrink-0">
								<Shield className="size-5" />
							</div>
							<div className="flex flex-col gap-1">
								<span className="font-bold text-sm leading-tight text-[#1a1917]">IntegrityOS Admin</span>
								<span className="text-[10px] text-[#8e8a80] font-semibold leading-normal">System Control Center</span>
							</div>
						</div>
						<NotificationCenter />
					</div>

					<nav className="flex flex-col gap-1">
						{[
							{ id: "overview", name: "Overview & Health", icon: Cpu },
							{ id: "users", name: "Users Directory", icon: Users },
							{ id: "faculty", name: "Faculty Governance", icon: CheckCircle },
							{ id: "assessments", name: "Assessments Control", icon: Sliders },
							{ id: "live", name: "Live Monitoring", icon: Eye },
							{ id: "agents", name: "AI Agent Center", icon: Activity },
							{ id: "database", name: "Database Hub", icon: Database },
							{ id: "support", name: "Support Operations", icon: MessageSquare },
							{ id: "audit", name: "Audit & Compliance", icon: FileText },
							{ id: "settings", name: "System Settings", icon: AlertCircle }
						].map((tab) => {
							const Icon = tab.icon;
							const isActive = activeTab === tab.id;
							return (
								<button
									key={tab.id}
									onClick={() => setActiveTab(tab.id as any)}
									className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer border-none outline-none ${
										isActive
											? "bg-zinc-950 text-white shadow-md"
											: "text-[#6b6861] hover:text-[#1a1917] hover:bg-[#ebdcc9]/25"
									}`}
								>
									<Icon className="size-4 shrink-0" />
									{tab.name}
								</button>
							);
						})}
					</nav>
				</div>

				<div className="flex flex-col gap-3 pt-4 border-t border-[#ebdcc9]/40 mt-6 md:mt-0">
					<div className="flex items-center justify-between gap-2">
						<div 
							className="flex items-center gap-3 cursor-pointer group min-w-0"
							onClick={() => window.dispatchEvent(new CustomEvent("open-profile-drawer"))}
						>
							<div className="size-8 rounded-full bg-[#1a1917] border border-[#c5af8a] flex items-center justify-center font-bold text-xs text-white shrink-0 group-hover:scale-105 transition-all">
								{user?.name ? user.name.slice(0, 2).toUpperCase() : "SA"}
							</div>
							<div className="flex flex-col min-w-0">
								<span className="text-xs font-extrabold text-[#1a1917] leading-none truncate group-hover:text-zinc-600 transition-colors">{user?.name || "Balaji Admin"}</span>
								<span className="text-[9px] text-[#8e8a80] font-semibold truncate leading-none mt-1">{user?.email}</span>
							</div>
						</div>
					</div>
					<Button
						onClick={handleBack}
						variant="ghost"
						className="w-full h-9 px-3 text-xs gap-1.5 border border-rose-500/20 hover:bg-rose-500/10 text-rose-600 rounded-xl font-semibold transition-all duration-300 cursor-pointer justify-center"
					>
						<LogOut className="size-3.5" />
						Logout Panel
					</Button>
				</div>
			</aside>

			{/* Main Workspace Frame */}
			<div className="flex-1 p-6 md:p-10 overflow-y-auto max-w-full">
				<AnimatePresence mode="wait">
					{/* 1. OVERVIEW & HEALTH */}
					{activeTab === "overview" && (
						<motion.div
							key="overview-tab"
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -10 }}
							className="space-y-8 w-full"
						>
							<div className="flex items-center justify-between pb-4 border-b border-[#ebdcc9]/40">
								<div>
									<h2 className="text-xl font-extrabold tracking-tight">Overview & Infrastructure Health</h2>
									<p className="text-xs text-[#6b6861]">Real-time hardware utilisation, security event logs, and operational telemetry.</p>
								</div>
								<Button
									onClick={refreshAllData}
									variant="outline"
									className="h-9 px-3 text-xs gap-1.5 border-[#ebdcc9] rounded-xl font-semibold hover:bg-[#faf9f5] cursor-pointer"
								>
									<RotateCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
									Force Sync
								</Button>
							</div>

							{/* Active global status alert badges */}
							{(maintenanceMode || emergencyShutdown) && (
								<div className="grid grid-cols-1 gap-3">
									{emergencyShutdown && (
										<div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl flex items-center gap-3 text-xs font-bold animate-pulse shadow">
											<ShieldAlert className="size-5 text-red-600 shrink-0 animate-bounce" />
											<span>CRITICAL: Emergency Shutdown Mode is currently ACTIVE. All non-administrator portals and active exams are immediately suspended.</span>
										</div>
									)}
									{maintenanceMode && !emergencyShutdown && (
										<div className="bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded-2xl flex items-center gap-3 text-xs font-bold shadow">
											<AlertTriangle className="size-5 text-amber-600 shrink-0" />
											<span>WARNING: Maintenance Mode is currently ACTIVE. Normal student examinations and faculty evaluations are blocked.</span>
										</div>
									)}
								</div>
							)}

							{/* Dashboard Stats Cards from PostgreSQL */}
							<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
								{[
									{ title: "Total Students", value: dashboardStats?.totalStudents ?? 0, icon: Users, color: "text-blue-600" },
									{ title: "Total Faculty", value: dashboardStats?.totalFaculty ?? 0, icon: CheckCircle, color: "text-indigo-600" },
									{ title: "Total Admins", value: dashboardStats?.totalAdmins ?? 0, icon: Shield, color: "text-purple-600" },
									{ title: "Active Users", value: dashboardStats?.activeUsers ?? 0, icon: Activity, color: "text-emerald-600" },
									{ title: "Online Sessions", value: dashboardStats?.onlineUsers ?? 0, icon: Eye, color: "text-cyan-600" },
									{ title: "Assessments", value: dashboardStats?.totalAssessments ?? 0, icon: FileText, color: "text-amber-600" },
									{ title: "Completed", value: dashboardStats?.completedAssessments ?? 0, icon: Check, color: "text-green-600" },
									{ title: "Pending", value: dashboardStats?.pendingAssessments ?? 0, icon: Clock, color: "text-orange-600" },
									{ title: "Departments", value: dashboardStats?.departments ?? 0, icon: Database, color: "text-teal-600" },
									{ title: "Avg Integrity", value: `${dashboardStats?.averageIntegrityScore ?? 100}%`, icon: Shield, color: "text-emerald-600" },
									{ title: "AI Violations", value: dashboardStats?.aiViolations ?? 0, icon: AlertTriangle, color: "text-rose-600" },
									{ title: "Plagiarism Cases", value: dashboardStats?.plagiarismCases ?? 0, icon: AlertCircle, color: "text-red-600" },
									{ title: "Registered Today", value: dashboardStats?.registeredUsersToday ?? 0, icon: Users, color: "text-sky-600" },
									{ title: "New Faculty (Month)", value: dashboardStats?.newFacultyThisMonth ?? 0, icon: CheckCircle, color: "text-violet-600" },
									{ title: "Reports Generated", value: dashboardStats?.totalReportsGenerated ?? 0, icon: FileText, color: "text-zinc-700" },
									{ title: "DB Query Time", value: `${healthMetrics?.infrastructure?.queryTime ?? 0}ms`, icon: Cpu, color: "text-zinc-600" },
								].map((stat, i) => {
									const Icon = stat.icon;
									return (
										<motion.div
											key={i}
											initial={{ opacity: 0, y: 15 }}
											animate={{ opacity: 1, y: 0 }}
											transition={{ duration: 0.3, delay: i * 0.03 }}
											whileHover={{ y: -4, scale: 1.03 }}
											className="bg-white border border-[#ebdcc9]/60 rounded-2xl p-3.5 shadow-sm flex items-center gap-3 transition-all duration-300"
										>
											<div className="p-2.5 bg-zinc-50 rounded-xl border">
												<Icon className={`size-5 ${stat.color}`} />
											</div>
											<div>
												<span className="text-[9px] font-bold text-[#8e8a80] uppercase tracking-wider block">{stat.title}</span>
												<span className={`text-lg font-extrabold block mt-0.5 ${stat.color}`}>{stat.value}</span>
											</div>
										</motion.div>
									);
								})}
							</div>

							{/* Recent Activity from DB */}
							{dashboardStats?.recentActivity?.length > 0 && (
								<motion.div
									initial={{ opacity: 0, y: 15 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ duration: 0.3 }}
									className="bg-white border border-[#ebdcc9]/60 rounded-2xl p-5 shadow-sm space-y-3"
								>
									<h3 className="text-sm font-extrabold flex items-center gap-2"><History className="size-4" /> Recent Activity</h3>
									<div className="space-y-2 max-h-[200px] overflow-y-auto">
										{dashboardStats.recentActivity.slice(0, 10).map((act: any) => (
											<div key={act.id} className="flex justify-between items-center text-xs border-b border-zinc-100 pb-1.5">
												<span className="font-semibold text-zinc-800">{act.action}</span>
												<span className="text-[10px] font-mono text-zinc-400">{new Date(act.timestamp).toLocaleString()}</span>
											</div>
										))}
									</div>
								</motion.div>
							)}

							{/* SOC Alert Panel (Security Operations Center) */}
							<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
								<motion.div
									initial={{ opacity: 0, y: 15 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ duration: 0.4, delay: 0.2 }}
									whileHover={{ y: -4, scale: 1.01, boxShadow: "0 10px 20px -5px rgba(142,126,98,0.12), 0 0 0 1px rgba(197, 175, 138, 0.3)", borderColor: "rgba(197, 175, 138, 0.5)" }}
									className="lg:col-span-2 bg-white border border-[#ebdcc9]/60 rounded-2xl p-5 shadow-sm space-y-4 transition-all duration-300"
								>
									<div className="flex items-center gap-2 border-b border-[#ebdcc9]/40 pb-2">
										<ShieldAlert className="size-5 text-zinc-800" />
										<h3 className="text-sm font-extrabold text-zinc-800">Security Operations Center (SOC) Alerts</h3>
									</div>
									<div className="space-y-3.5 max-h-[400px] overflow-y-auto pr-1">
										{socAlerts.length === 0 ? (
											<div className="text-center py-6 text-xs text-zinc-400">No security events detected.</div>
										) : socAlerts.map((soc) => (
											<div key={soc.id} className="flex items-start gap-3 p-3 border border-[#ebdcc9]/40 rounded-xl hover:bg-neutral-50 transition text-xs">
												<AlertCircle className={`size-5 shrink-0 ${soc.severity === "high" ? "text-rose-500" : soc.severity === "medium" ? "text-[#b45309]" : "text-blue-500"}`} />
												<div className="flex-1 space-y-1">
													<div className="flex justify-between items-center">
														<span className="font-extrabold text-zinc-800">{soc.type}</span>
														<span className="text-[10px] font-mono text-zinc-400">{new Date(soc.timestamp).toLocaleTimeString()}</span>
													</div>
													<p className="text-[#6b6760]">{soc.msg}</p>
												</div>
											</div>
										))}
									</div>
								</motion.div>

								{/* Maintenance Actions Quick Controls */}
								<motion.div
									initial={{ opacity: 0, y: 15 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ duration: 0.4, delay: 0.25 }}
									whileHover={{ y: -4, scale: 1.01, boxShadow: "0 10px 20px -5px rgba(142,126,98,0.12), 0 0 0 1px rgba(197, 175, 138, 0.3)", borderColor: "rgba(197, 175, 138, 0.5)" }}
									className="bg-white border border-[#ebdcc9]/60 rounded-2xl p-5 shadow-sm flex flex-col justify-between gap-4 transition-all duration-300"
								>
									<div>
										<div className="flex items-center gap-2 border-b border-[#ebdcc9]/40 pb-2">
											<RotateCw className="size-5 text-zinc-800" />
											<h3 className="text-sm font-extrabold text-zinc-800">Self-Healing Management</h3>
										</div>
										<p className="text-xs text-[#6b6760] leading-relaxed mt-2.5">
											Force a complete systems self-healing loop. The platform will automatically sweep connection pools, clear WS leaks, and test local agent response uptimes.
										</p>
									</div>

									<div className="space-y-2">
										<button
											type="button"
											onClick={handleSelfHeal}
											className="w-full py-2.5 rounded-xl text-xs font-bold bg-zinc-950 text-white hover:bg-zinc-850 cursor-pointer shadow-sm text-center active:scale-[0.98] transition-all"
										>
											Trigger Diagnostics & Repair
										</button>
										<p className="text-[10px] text-center text-[#8e8a80]">All self-healing acts are logged to immutable audits.</p>
									</div>
								</motion.div>
							</div>
						</motion.div>
					)}

					{/* 2. USERS DIRECTORY */}
					{activeTab === "users" && (
						<motion.div
							key="users-tab"
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -10 }}
							className="space-y-8 w-full"
						>
							<div className="flex items-center justify-between pb-4 border-b border-[#ebdcc9]/40">
								<div>
									<h2 className="text-xl font-extrabold tracking-tight">Users Directory</h2>
									<p className="text-xs text-[#6b6861]">Manage user access, roles, execute force logouts, reset passwords, or suspend credentials.</p>
								</div>
								<div className="flex items-center gap-2">
									<Button
										onClick={() => setShowAddStudentModal(true)}
										className="h-9 px-3 text-xs bg-black text-white hover:bg-black/90 rounded-xl font-extrabold shadow-sm active:scale-[0.98]"
									>
										+ Create Student
									</Button>
									<Button
										onClick={() => setShowAddFacultyModal(true)}
										className="h-9 px-3 text-xs bg-black text-white hover:bg-black/90 rounded-xl font-extrabold shadow-sm active:scale-[0.98]"
									>
										+ Create Faculty
									</Button>
									<Button
										onClick={fetchUsers}
										variant="outline"
										className="h-9 px-3 text-xs gap-1.5 border-[#ebdcc9] rounded-xl font-semibold hover:bg-[#faf9f5] cursor-pointer"
									>
										<RotateCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
										Refresh Directory
									</Button>
								</div>
							</div>

							<div className="flex flex-col sm:flex-row gap-3">
								<div className="relative flex-1">
									<Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-[#8e8a80]" />
									<Input
										type="text"
										placeholder="Search by name or email..."
										value={searchQuery}
										onChange={(e) => setSearchQuery(e.target.value)}
										className="pl-10 h-10 border-[#ebdcc9]/85 rounded-xl focus-visible:ring-[#ebdcc9] placeholder:text-[#8e8a80]/80 text-xs"
									/>
								</div>
								<select
									value={statusFilter}
									onChange={(e) => setStatusFilter(e.target.value)}
									className="h-10 px-3 border border-[#ebdcc9]/85 rounded-xl text-xs font-semibold focus:outline-none bg-white cursor-pointer"
								>
									<option value="all">All Statuses</option>
									<option value="active">Active</option>
									<option value="suspended">Suspended</option>
									<option value="temporarily_suspended">Temporarily Suspended</option>
								</select>
							</div>

							<div className="border border-[#ebdcc9]/50 rounded-2xl overflow-hidden bg-white/50 backdrop-blur-[4px] shadow-sm w-full">
								<div className="overflow-x-auto w-full">
									<table className="w-full min-w-[700px] text-left border-collapse text-xs">
										<thead>
											<tr className="bg-[#fcfaf7] border-b border-[#ebdcc9]/40 text-[#6b6861] font-semibold uppercase tracking-wider">
												<th className="p-4">User Details</th>
												<th className="p-4">Identity Method</th>
												<th className="p-4">Platform Role</th>
												<th className="p-4">Status</th>
												<th className="p-4 text-center">Auditing</th>
												<th className="p-4 text-right">Force Controls</th>
											</tr>
										</thead>
										<tbody>
											{filteredUsers.map((u) => {
												const isCurrentUser = u.id === user.id;
												return (
													<tr key={u.id} className="border-b border-[#ebdcc9]/30 hover:bg-white transition-colors">
														<td className="p-4 flex items-center gap-3">
															<div className="w-8 h-8 rounded-full bg-[#f0ece4] border flex items-center justify-center font-bold text-xs text-[#1a1917] shrink-0">
																{(u.name || u.email).charAt(0).toUpperCase()}
															</div>
															<div className="flex flex-col min-w-0">
																<span className="font-bold text-[#1a1917] truncate flex items-center gap-1.5">
																	{u.name || "No Name Set"}
																	{isCurrentUser && <span className="px-1.5 py-0.5 text-[8px] font-bold bg-[#ebdcc9] text-zinc-900 rounded">You</span>}
																</span>
																<span className="text-[10px] text-[#6b6861] font-mono truncate">{u.email}</span>
															</div>
														</td>

														<td className="p-4 font-semibold text-zinc-700">{getLoginType(u)}</td>

														<td className="p-4">
															{isCurrentUser ? (
																<span className="inline-flex px-2 py-0.5 text-[9px] font-extrabold bg-[#ebdcc9]/40 border border-[#ebdcc9] rounded text-zinc-950 uppercase">{u.role}</span>
															) : (
																<select
																	value={u.role || "user"}
																	onChange={(e) => handleRoleChange(u.id, e.target.value)}
																	className="h-7 px-2 border border-[#ebdcc9] rounded-lg text-[11px] font-semibold text-zinc-800 bg-white cursor-pointer"
																>
																	<option value="user">Student / Candidate</option>
																	<option value="faculty">Faculty evaluator</option>
																	<option value="admin">Platform administrator</option>
																</select>
															)}
														</td>

														<td className="p-4">
															<span className={`inline-flex px-2.5 py-0.5 text-[9px] font-bold rounded-full border ${
																u.status === "active"
																	? "text-emerald-700 bg-emerald-50 border-emerald-100"
																	: u.status === "suspended"
																	? "text-rose-700 bg-rose-50 border-rose-100"
																	: "text-amber-700 bg-amber-50 border-amber-100"
															}`}>
																{u.status === "active" ? "Active" : u.status === "suspended" ? "Suspended" : "Locked"}
															</span>
														</td>

														<td className="p-4 text-center">
															<Button
																variant="ghost"
																onClick={() => openLogsModal(u)}
																className="h-7 px-2 text-[10px] gap-1 hover:bg-neutral-100"
															>
																<History className="size-3" /> Audit Log
															</Button>
														</td>

														<td className="p-4 text-right space-x-1">
															{!isCurrentUser && u.role !== "admin" && (
																<>
																	<Button
																		variant="ghost"
																		onClick={() => openEditModal(u)}
																		className="size-7 p-0 rounded hover:bg-zinc-100 text-zinc-700"
																		title="Edit User Profile"
																	>
																		<Sliders className="size-3.5" />
																	</Button>
																	<Button
																		variant="ghost"
																		onClick={() => handleForcePasswordReset(u)}
																		className="size-7 p-0 rounded hover:bg-zinc-100 text-amber-600"
																		title="Force Password Change Next Login"
																	>
																		<AlertCircle className="size-3.5" />
																	</Button>
																	<Button
																		variant="ghost"
																		onClick={() => setSelectedUserForPasswordReset(u)}
																		className="size-7 p-0 rounded hover:bg-zinc-100"
																		title="Override Password Now"
																	>
																		<Key className="size-3.5 text-zinc-650" />
																	</Button>
																	<Button
																		variant="ghost"
																		onClick={() => handleForceLogout(u)}
																		className="size-7 p-0 rounded hover:bg-zinc-100 text-zinc-600"
																		title="Force Session Revocation"
																	>
																		<LogOut className="size-3.5" />
																	</Button>
																	{!u.emailVerified && (
																		<Button
																			variant="ghost"
																			onClick={() => handleVerifyEmail(u)}
																			className="size-7 p-0 rounded hover:bg-emerald-50 text-emerald-600 font-extrabold"
																			title="Manually Verify Email"
																		>
																			<Check className="size-4" />
																		</Button>
																	)}
																	<Button
																		variant="ghost"
																		onClick={() => handleToggle2FA(u, !u.twoFactorEnabled)}
																		className={`size-7 p-0 rounded hover:bg-zinc-100 font-extrabold ${u.twoFactorEnabled ? "text-indigo-600 bg-indigo-50" : "text-gray-400"}`}
																		title="Toggle 2FA Enabled"
																	>
																		<Shield className="size-3.5" />
																	</Button>
																	{u.status !== "locked" ? (
																		<Button
																			variant="ghost"
																			onClick={() => handleLockUser(u)}
																			className="size-7 p-0 rounded hover:bg-amber-50 text-amber-600"
																			title="Lock Account"
																		>
																			<Lock className="size-3.5" />
																		</Button>
																	) : (
																		<Button
																			variant="ghost"
																			onClick={() => handleUnlockUser(u)}
																			className="size-7 p-0 rounded hover:bg-emerald-50 text-emerald-650 animate-pulse"
																			title="Unlock Account"
																		>
																			<CheckCircle className="size-3.5" />
																		</Button>
																	)}
																	{u.status === "active" ? (
																		<>
																			<Button
																				variant="ghost"
																				onClick={() => setSelectedUserForTempSuspend(u)}
																				className="size-7 p-0 rounded hover:bg-amber-50 text-amber-600"
																				title="Temp Suspend"
																			>
																				<Clock className="size-3.5" />
																			</Button>
																			<Button
																				variant="ghost"
																				onClick={() => handleSuspend(u)}
																				className="size-7 p-0 rounded hover:bg-rose-50 text-rose-600"
																				title="Suspend Account"
																			>
																				<Power className="size-3.5" />
																			</Button>
																		</>
																	) : u.status === "suspended" ? (
																		<Button
																			variant="ghost"
																			onClick={() => handleUnsuspend(u)}
																			className="size-7 p-0 rounded hover:bg-emerald-50 text-emerald-600"
																			title="Reactivate Suspended Account"
																		>
																			<Power className="size-3.5" />
																		</Button>
																	) : null}
																	<Button
																		onClick={() => setSelectedUserForDelete(u)}
																		variant="ghost"
																		className="size-7 p-0 rounded hover:bg-rose-50 text-rose-600"
																		title="Permanently Delete User"
																	>
																		<Trash2 className="size-3.5" />
																	</Button>
																</>
															)}
														</td>
													</tr>
												);
											})}
										</tbody>
									</table>
								</div>
							</div>
						</motion.div>
					)}

					{/* 3. FACULTY GOVERNANCE */}
					{activeTab === "faculty" && (
						<motion.div
							key="faculty-tab"
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -10 }}
							className="space-y-8 w-full"
						>
							<div className="pb-4 border-b border-[#ebdcc9]/40">
								<h2 className="text-xl font-extrabold tracking-tight">Faculty Governance</h2>
								<p className="text-xs text-[#6b6861]">Review faculty access approval, check created exams, evaluation performance, and review logs.</p>
							</div>

							<motion.div
								initial={{ opacity: 0, y: 15 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ duration: 0.3 }}
								whileHover={{ y: -4, scale: 1.01, boxShadow: "0 10px 20px -5px rgba(142,126,98,0.12), 0 0 0 1px rgba(197, 175, 138, 0.3)", borderColor: "rgba(197, 175, 138, 0.5)" }}
								className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-sm space-y-4 transition-all duration-300"
							>
								<h3 className="text-sm font-extrabold">Faculty Directory & Performance Logs</h3>
								<div className="overflow-x-auto">
									<table className="w-full text-left border-collapse text-xs">
										<thead>
											<tr className="border-b border-[#ebdcc9]/40 text-[#6b6861] font-semibold">
												<th className="pb-2">Faculty Member</th>
												<th className="pb-2">Department</th>
												<th className="pb-2">Section</th>
												<th className="pb-2 text-center">Exams Created</th>
												<th className="pb-2 text-center">Status</th>
												<th className="pb-2 text-right">Joined</th>
											</tr>
										</thead>
										<tbody>
											{users.filter(u => u.role === "faculty").map((fac) => {
												const examsCreated = assessments.filter((a: any) => a.facultyName === fac.name).length;
												return (
												<tr key={fac.id} className="border-b border-zinc-100 hover:bg-neutral-50/50">
													<td className="py-3 font-bold text-zinc-950">{fac.name || "Faculty evaluator"} <span className="block text-[10px] font-mono font-normal text-[#6b6861]">{fac.email}</span></td>
													<td className="py-3 text-zinc-600">{fac.department || "—"}</td>
													<td className="py-3 text-zinc-600">{fac.section || "—"}</td>
													<td className="py-3 text-center font-bold">{examsCreated}</td>
													<td className="py-3 text-center">
														<span className={`text-[10px] font-extrabold px-2.5 py-1 border rounded-full ${fac.status === "active" ? "text-emerald-700 bg-emerald-50 border-emerald-100" : "text-rose-700 bg-rose-50 border-rose-100"}`}>{fac.status === "active" ? "ACTIVE" : "SUSPENDED"}</span>
													</td>
													<td className="py-3 text-right text-[10px] text-zinc-400 font-mono">{fac.createdAt ? new Date(fac.createdAt).toLocaleDateString() : "—"}</td>
												</tr>
											)})}
											{users.filter(u => u.role === "faculty").length === 0 && (
												<tr>
													<td colSpan={6} className="py-6 text-center text-zinc-400">No faculty profiles registered in the system.</td>
												</tr>
											)}
										</tbody>
									</table>
								</div>
							</motion.div>
						</motion.div>
					)}

					{/* 4. ASSESSMENT CONTROL */}
					{activeTab === "assessments" && (
						<motion.div
							key="assessments-tab"
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -10 }}
							className="space-y-8 w-full"
						>
							<div className="pb-4 border-b border-[#ebdcc9]/40">
								<h2 className="text-xl font-extrabold tracking-tight">Assessment Compliance Management</h2>
								<p className="text-xs text-[#6b6861]">Review institution-wide exam configurations, monitor candidate submissions, and check compliance thresholds.</p>
							</div>

							<motion.div
								initial={{ opacity: 0, y: 15 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ duration: 0.3 }}
								whileHover={{ y: -4, scale: 1.01, boxShadow: "0 10px 20px -5px rgba(142,126,98,0.12), 0 0 0 1px rgba(197, 175, 138, 0.3)", borderColor: "rgba(197, 175, 138, 0.5)" }}
								className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-sm space-y-4 transition-all duration-300"
							>
								<h3 className="text-sm font-extrabold">Active Assessment Inventory</h3>
								<div className="overflow-x-auto">
									<table className="w-full text-left border-collapse text-xs">
										<thead>
											<tr className="border-b border-[#ebdcc9]/45 text-[#6b6861] font-semibold">
												<th className="pb-2">Exam Title</th>
												<th className="pb-2">Faculty Evaluator</th>
												<th className="pb-2 text-center">Active Candidates</th>
												<th className="pb-2 text-center">Proctoring Security Score</th>
												<th className="pb-2 text-center">Compliance Status</th>
												<th className="pb-2 text-center">Integrity Violation Rate</th>
											</tr>
										</thead>
										<tbody>
											{assessments.map((a) => (
												<tr key={a.id} className="border-b border-zinc-100 hover:bg-neutral-50/50">
													<td className="py-3 font-bold text-zinc-950">{a.title} <span className="block font-normal text-[10px] text-[#6b6861]">Duration: {a.duration} mins</span></td>
													<td className="py-3 text-zinc-600 font-semibold">{a.facultyName}</td>
													<td className="py-3 text-center font-bold">{a.attemptsCount} submitted</td>
													<td className="py-3 text-center">
														<span className="font-extrabold text-indigo-600">{a.securityScore} / 100</span>
													</td>
													<td className="py-3 text-center">
														<span className={`inline-flex px-2 py-0.5 rounded text-[9px] font-bold ${
															a.complianceStatus === "Compliant"
																? "bg-emerald-50 text-emerald-700 border border-emerald-100"
																: "bg-rose-50 text-rose-700 border border-rose-100"
														}`}>
															{a.complianceStatus}
														</span>
													</td>
													<td className="py-3 text-center font-bold text-zinc-700">{a.integrityViolationRate}</td>
												</tr>
											))}
											{assessments.length === 0 && (
												<tr>
													<td colSpan={6} className="py-6 text-center text-zinc-400">No assessments found.</td>
												</tr>
											)}
										</tbody>
									</table>
								</div>
							</motion.div>
						</motion.div>
					)}

					{/* 5. LIVE MONITORING */}
					{activeTab === "live" && (
						<motion.div
							key="live-tab"
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -10 }}
							className="space-y-8 w-full"
						>
							<div className="pb-4 border-b border-[#ebdcc9]/40">
								<h2 className="text-xl font-extrabold tracking-tight">Real-Time Examination Monitor</h2>
								<p className="text-xs text-[#6b6861]">Live stream candidate telemetry logs, webcam monitoring alerts, and browser focus logs.</p>
							</div>

							<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
								{liveSessions.length === 0 ? (
									<div className="md:col-span-3 bg-white border border-[#ebdcc9]/60 rounded-2xl p-10 text-center">
										<Eye className="size-8 mx-auto text-zinc-300 mb-3" />
										<p className="text-sm font-bold text-zinc-400">No Active Exam Sessions</p>
										<p className="text-xs text-zinc-400 mt-1">Live proctoring sessions will appear here when students start an assessment.</p>
									</div>
								) : liveSessions.map((session, i) => (
									<motion.div
										key={session.id}
										initial={{ opacity: 0, y: 15 }}
										animate={{ opacity: 1, y: 0 }}
										transition={{ duration: 0.3, delay: i * 0.05 }}
										whileHover={{ y: -4, scale: 1.025, boxShadow: "0 10px 20px -5px rgba(142,126,98,0.12), 0 0 0 1px rgba(197, 175, 138, 0.3)", borderColor: "rgba(197, 175, 138, 0.5)" }}
										className="bg-white border border-[#ebdcc9]/60 rounded-2xl overflow-hidden shadow-sm flex flex-col justify-between transition-all duration-300"
									>
										<div className="p-4 bg-zinc-50 border-b flex justify-between items-center text-xs">
											<div>
												<span className="font-extrabold block text-zinc-800">{session.studentName}</span>
												<span className="text-[10px] text-zinc-400 truncate block max-w-[120px]">{session.exam}</span>
											</div>
											<span className={`px-2 py-0.5 rounded text-[9px] font-extrabold ${session.score >= 75 ? "bg-emerald-50 text-emerald-700 border" : "bg-rose-50 text-rose-700 border animate-pulse"}`}>
												Integrity: {session.score}%
											</span>
										</div>

										<div className="relative aspect-video bg-zinc-950 flex items-center justify-center">
											<div className="text-center text-zinc-500 space-y-1">
												<Server className="size-6 mx-auto animate-pulse" />
												<span className="text-[9px] block uppercase font-bold tracking-widest text-zinc-400">Live webcam feed</span>
											</div>
										</div>

										<div className="p-3 bg-zinc-50/50 border-t flex justify-between items-center text-xs">
											<span className="font-bold text-zinc-600">Status: <span className="font-extrabold text-zinc-800">{session.status}</span></span>
											<span className="text-[10px] font-bold text-rose-500">{session.alerts} alert(s)</span>
										</div>
									</motion.div>
								))}
							</div>
						</motion.div>
					)}

					{/* 6. AI AGENT CENTER */}
					{activeTab === "agents" && (
						<motion.div
							key="agents-tab"
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -10 }}
							className="space-y-8 w-full"
						>
							<div className="flex items-center justify-between pb-4 border-b border-[#ebdcc9]/40">
								<div>
									<h2 className="text-xl font-extrabold tracking-tight">AI Agent Monitoring Center</h2>
									<p className="text-xs text-[#6b6861]">Track status, active tasks, uptimes, and self-healing events of autonomous agents.</p>
								</div>
							</div>

							<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
								<motion.div
									initial={{ opacity: 0, y: 15 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ duration: 0.3 }}
									whileHover={{ y: -4, scale: 1.01, boxShadow: "0 10px 20px -5px rgba(142,126,98,0.12), 0 0 0 1px rgba(197, 175, 138, 0.3)", borderColor: "rgba(197, 175, 138, 0.5)" }}
									className="lg:col-span-2 bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-sm space-y-4 transition-all duration-300"
								>
									<h3 className="text-sm font-extrabold">Active Systems AI Agent Pool</h3>
									<div className="overflow-x-auto">
										<table className="w-full text-left border-collapse text-xs">
											<thead>
												<tr className="border-b border-zinc-100 text-zinc-400 font-semibold">
													<th className="pb-2">Agent Identifier</th>
													<th className="pb-2">Status</th>
													<th className="pb-2">Uptime</th>
													<th className="pb-2 text-center">Active Tasks</th>
													<th className="pb-2 text-center">Failures</th>
												</tr>
											</thead>
											<tbody>
												{agentStatus.map((agent, i) => (
													<tr key={i} className="border-b border-zinc-50 hover:bg-neutral-50/50">
														<td className="py-2.5 font-bold text-zinc-950">{agent.name}</td>
														<td className="py-2.5">
															<span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
																{agent.status}
															</span>
														</td>
														<td className="py-2.5 font-mono text-zinc-500">{agent.uptime}</td>
														<td className="py-2.5 text-center font-bold">{agent.activeTasks}</td>
														<td className="py-2.5 text-center font-bold text-rose-500">{agent.failures}</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
								</motion.div>

								{/* AI Self Healing Event Logs */}
								<motion.div
									initial={{ opacity: 0, y: 15 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ duration: 0.3, delay: 0.1 }}
									whileHover={{ y: -4, scale: 1.01, boxShadow: "0 10px 20px -5px rgba(142,126,98,0.12), 0 0 0 1px rgba(197, 175, 138, 0.3)", borderColor: "rgba(197, 175, 138, 0.5)" }}
									className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-sm space-y-4 transition-all duration-300"
								>
									<div className="flex items-center gap-2 border-b pb-2">
										<Sliders className="size-4.5 text-zinc-800" />
										<h3 className="text-sm font-extrabold text-zinc-800">Self-Healing Event Logs</h3>
									</div>
									<div className="space-y-3.5 max-h-[300px] overflow-y-auto pr-1">
										{auditLogs.selfHealingLogs?.map((log: any) => (
											<div key={log.id} className="border-b pb-2 text-[11px] leading-relaxed">
												<div className="flex justify-between items-center text-[10px] font-mono text-zinc-400">
													<span>{log.component}</span>
													<span>{new Date(log.timestamp).toLocaleTimeString()}</span>
												</div>
												<p className="font-semibold text-zinc-700 mt-0.5">{log.action}</p>
												<span className="inline-flex px-1.5 py-0.2 bg-emerald-50 text-emerald-700 rounded text-[9px] font-bold mt-1 uppercase border border-emerald-100">{log.status}</span>
											</div>
										))}
									</div>
								</motion.div>
							</div>

							{/* WAF AI Agent Operations & Incident Simulation Center */}
							<motion.div
								initial={{ opacity: 0, y: 15 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ duration: 0.3, delay: 0.15 }}
								className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-sm space-y-5 w-full mt-6"
							>
								<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b pb-3.5 gap-2">
									<div className="flex items-center gap-2">
										<Shield className="size-5 text-zinc-950" />
										<div>
											<h3 className="text-sm font-extrabold text-zinc-950">WAF Security Operations Controls</h3>
											<p className="text-[10px] text-zinc-500">Configure WAF monitoring status, reset risk scores, and run simulated proctoring abuse events.</p>
										</div>
									</div>
									<div className="flex items-center gap-3">
										<span className="text-[10px] font-extrabold text-zinc-500">DYNAMIC AGENT MONITORING:</span>
										<button
											onClick={() => {
												const val = !securityAgentEnabled;
												setSecurityAgentEnabled(val);
												handleSaveSettings({ securityAgentEnabled: val });
											}}
											className={`px-3 py-1 text-[10px] font-bold border rounded-lg transition-all duration-200 cursor-pointer ${
												securityAgentEnabled
													? "bg-zinc-950 text-white border-zinc-950 hover:bg-black"
													: "bg-white text-zinc-500 border-zinc-200 hover:border-zinc-300"
											}`}
										>
											{securityAgentEnabled ? "ACTIVE (TURN OFF)" : "STOPPED (TURN ON)"}
										</button>
									</div>
								</div>

								<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
									{/* Reset Risks Section */}
									<div className="p-4 bg-zinc-50 rounded-xl border border-zinc-100 flex flex-col justify-between space-y-4">
										<div className="space-y-1">
											<span className="text-xs font-extrabold text-zinc-800 block">Clean Up & Reset Student Risk Scores</span>
											<p className="text-[10px] text-zinc-400 leading-relaxed">
												Clears all candidate risk scores back to 0, resets locked/suspended accounts to active, and logs a self-healing diagnostic sweep. Helpful for assessment sandbox re-testing.
											</p>
										</div>
										<button
											onClick={handleResetAllStudentRisks}
											disabled={isResettingRisks}
											className="w-full sm:w-fit px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-[11px] font-bold rounded-lg transition-colors cursor-pointer self-start shadow-sm"
										>
											{isResettingRisks ? "Resetting State..." : "Reset All Student Risks & Suspensions"}
										</button>
									</div>

									{/* Simulate Threats Section */}
									<div className="p-4 bg-zinc-50 rounded-xl border border-zinc-100 flex flex-col justify-between space-y-4">
										<div className="space-y-1">
											<span className="text-xs font-extrabold text-zinc-800 block">Trigger Security Incident Simulator</span>
											<p className="text-[10px] text-zinc-400 leading-relaxed">
												Inject a security violation event (SQL Injection, DevTools bypass, Face Missing, etc.) for the simulated student profile to verify that decision alarms, auto-lockout mitigations, and proctor web-sockets are functioning correctly.
											</p>
										</div>
										<div className="flex flex-col sm:flex-row gap-2.5">
											<select
												value={simulatedEventType}
												onChange={(e) => setSimulatedEventType(e.target.value)}
												className="flex-1 min-w-[150px] bg-white border border-zinc-200 rounded-lg px-2.5 py-2 text-[11px] text-zinc-800 outline-none focus:border-zinc-400"
											>
												<option value="failed_login">Failed Logins (Authentication Agent)</option>
												<option value="unknown_device">Unknown Device (Authentication Agent)</option>
												<option value="multiple_faces">Multiple Faces (Integrity Monitoring Agent)</option>
												<option value="face_missing">Face Missing (Integrity Monitoring Agent)</option>
												<option value="devtools_usage">DevTools Usage (Behavior Analysis Agent)</option>
												<option value="sql_injection">SQL Injection Attack (API Monitoring Agent)</option>
												<option value="xss_attempt">XSS Injection Attack (API Monitoring Agent)</option>
												<option value="token_replay">Token Replay (Session Agent)</option>
												<option value="impossible_travel">Impossible Travel (Threat Detection Agent)</option>
												<option value="session_hijacking">Session Hijacking (Session Agent)</option>
												<option value="browser_tampering">Browser Tampering (Behavior Analysis Agent)</option>
												<option value="fake_email_pattern">Fake Email Pattern (Authentication Agent)</option>
											</select>
											<button
												onClick={handleSimulateSecurityEvent}
												disabled={isSimulatingEvent || !securityAgentEnabled}
												className="px-4 py-2 bg-zinc-950 hover:bg-black disabled:opacity-50 text-white text-[11px] font-bold rounded-lg transition-colors cursor-pointer shadow-sm"
											>
												{isSimulatingEvent ? "Simulating..." : "Trigger Simulated Event"}
											</button>
										</div>
									</div>
								</div>
							</motion.div>

							{/* AI Security Threat Intel Board */}
							<motion.div
								initial={{ opacity: 0, y: 15 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ duration: 0.3, delay: 0.2 }}
								whileHover={{ y: -4, scale: 1.005, boxShadow: "0 10px 25px -5px rgba(142,126,98,0.15), 0 0 0 1px rgba(197, 175, 138, 0.35)", borderColor: "rgba(197, 175, 138, 0.55)" }}
								className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-sm space-y-4 transition-all duration-300 w-full mt-6"
							>
								<div className="flex items-center justify-between border-b pb-3.5">
									<div className="flex items-center gap-2">
										<ShieldAlert className="size-5 text-rose-600 animate-pulse" />
										<div>
											<h3 className="text-sm font-extrabold text-zinc-950">WAF AI Threat Intelligence Feed</h3>
											<p className="text-[10px] text-zinc-500">Autonomous WAF scanning logs, malicious traffic signatures, and automated threat mitigations.</p>
										</div>
									</div>
									<span className={`px-2.5 py-0.5 text-[9px] font-bold border rounded-full ${
										securityAgentEnabled 
											? "text-rose-600 bg-rose-50 border-rose-100 animate-pulse" 
											: "text-zinc-500 bg-zinc-50 border-zinc-200"
									}`}>
										{securityAgentEnabled ? "MONITORING ACTIVE" : "MONITORING DISABLED"}
									</span>
								</div>

								<div className="overflow-x-auto">
									<table className="w-full text-left border-collapse text-xs">
										<thead>
											<tr className="border-b border-[#ebdcc9]/40 text-[#6b6861] font-semibold">
												<th className="pb-2">Threat Target / Agent</th>
												<th className="pb-2">Security Event</th>
												<th className="pb-2">Severity</th>
												<th className="pb-2">Incident Mitigation</th>
												<th className="pb-2 text-right">Timestamp</th>
											</tr>
										</thead>
										<tbody>
											{socAlerts.map((alert) => (
												<tr key={alert.id} className="border-b border-zinc-50 hover:bg-neutral-50/50 transition-colors">
													<td className="py-3 font-bold text-zinc-950">
														{alert.type}
													</td>
													<td className="py-3 text-zinc-700 font-mono text-[11px]">
														{alert.msg}
													</td>
													<td className="py-3">
														<span className={`inline-flex items-center gap-1 text-[9px] font-extrabold px-2 py-0.5 rounded-full border ${
															alert.severity === "critical"
																? "text-red-700 bg-red-50 border-red-200 animate-bounce"
																: alert.severity === "high"
																? "text-rose-700 bg-rose-50 border-rose-200"
																: alert.severity === "medium"
																? "text-amber-700 bg-amber-50 border-amber-200"
																: "text-[#6b6861] bg-neutral-50 border-neutral-200"
														}`}>
															{alert.severity ? alert.severity.toUpperCase() : "LOW"}
														</span>
													</td>
													<td className="py-3 font-semibold text-zinc-800">
														<span className="bg-zinc-50 border px-2 py-0.5 rounded text-[10px]">
															{alert.msg.includes("suspension") || alert.msg.includes("suspended") ? "TEMPORARY SUSPENSION (24H)" : 
															 alert.msg.includes("lock") || alert.msg.includes("locked") ? "ACCOUNT LOCKDOWN" : "LOGGED & AUDITED"}
														</span>
													</td>
													<td className="py-3 text-right text-[10px] text-zinc-400 font-mono">
														{new Date(alert.timestamp).toLocaleTimeString()}
													</td>
												</tr>
											))}
											{socAlerts.length === 0 && (
												<tr>
													<td colSpan={5} className="py-8 text-center text-zinc-400">
														No intelligence signatures flagged by security agents.
													</td>
												</tr>
											)}
										</tbody>
									</table>
								</div>
							</motion.div>
						</motion.div>
					)}

					{/* 7. DATABASE HUB */}
					{activeTab === "database" && (
						<motion.div
							key="database-tab"
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -10 }}
							className="space-y-8 w-full"
						>
							<div className="pb-4 border-b border-[#ebdcc9]/40">
								<h2 className="text-xl font-extrabold tracking-tight">Database & pgvector Management</h2>
								<p className="text-xs text-[#6b6861]">Track PostgreSQL storage utilization, active connections, backup logs, and query speeds.</p>
							</div>

							<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
								{[
									{
										title: "Database Connection Pools",
										value: `${healthMetrics?.infrastructure?.dbConnections || 14} active connections`,
										footer: <>Prisma Client Adapters: <span className="font-bold text-zinc-700">@prisma/adapter-pg</span></>
									},
									{
										title: "pgvector Storage Utilization",
										value: "54.2% (21.8 GB / 40.0 GB)",
										footer: <>Similarity Indexes: <span className="font-bold text-zinc-700">HNSW Cosine Vector Index</span></>
									},
									{
										title: "System Backup Logs",
										value: "Active (Daily automated script)",
										valueColor: "text-emerald-600",
										footer: <>Last backup: <span className="font-bold text-zinc-750">2026-06-20 03:00 AM</span></>
									}
								].map((card, i) => (
									<motion.div
										key={i}
										initial={{ opacity: 0, y: 15 }}
										animate={{ opacity: 1, y: 0 }}
										transition={{ duration: 0.3, delay: i * 0.05 }}
										whileHover={{ y: -4, scale: 1.025, boxShadow: "0 10px 20px -5px rgba(142,126,98,0.12), 0 0 0 1px rgba(197, 175, 138, 0.3)", borderColor: "rgba(197, 175, 138, 0.5)" }}
										className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-sm flex flex-col justify-between gap-3 text-xs transition-all duration-300"
									>
										<div>
											<span className="font-bold text-[#8e8a80] block uppercase tracking-wider text-[10px]">{card.title}</span>
											<span className={`text-xl font-extrabold mt-1 block ${card.valueColor || "text-[#1a1917]"}`}>{card.value}</span>
										</div>
										<div className="bg-zinc-50 p-2.5 rounded-lg border text-[10px]">
											{card.footer}
										</div>
									</motion.div>
								))}
							</div>
						</motion.div>
					)}

					{/* 8. SUPPORT OPERATIONS */}
					{activeTab === "support" && (
						<motion.div
							key="support-tab"
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -10 }}
							className="space-y-8 w-full"
						>
							<div className="pb-4 border-b border-[#ebdcc9]/40">
								<h2 className="text-xl font-extrabold tracking-tight">Support Operations Management</h2>
								<p className="text-xs text-[#6b6861]">Review support queues, category breakdowns, and support agent assignments.</p>
							</div>

							<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
								<motion.div
									initial={{ opacity: 0, y: 15 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ duration: 0.3 }}
									whileHover={{ y: -4, scale: 1.015, boxShadow: "0 10px 20px -5px rgba(142,126,98,0.12), 0 0 0 1px rgba(197, 175, 138, 0.3)", borderColor: "rgba(197, 175, 138, 0.5)" }}
									className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-sm space-y-4 transition-all duration-300"
								>
									<h3 className="text-sm font-extrabold">Active Support Queue</h3>
									<div className="text-center py-10 text-xs text-[#8e8a80]">
										<MessageSquare className="size-8 mx-auto mb-2 text-zinc-300" />
										All support tickets are successfully assigned to support agents.
									</div>
								</motion.div>

								<motion.div
									initial={{ opacity: 0, y: 15 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ duration: 0.3, delay: 0.1 }}
									whileHover={{ y: -4, scale: 1.015, boxShadow: "0 10px 20px -5px rgba(142,126,98,0.12), 0 0 0 1px rgba(197, 175, 138, 0.3)", borderColor: "rgba(197, 175, 138, 0.5)" }}
									className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-sm space-y-4 transition-all duration-300"
								>
									<h3 className="text-sm font-extrabold">Support Metrics & Resolution Rates</h3>
									<div className="space-y-3.5 text-xs">
										<div className="flex justify-between border-b pb-2">
											<span className="text-zinc-600">Resolution Rate:</span>
											<span className="font-bold text-emerald-600">98.2%</span>
										</div>
										<div className="flex justify-between border-b pb-2">
											<span className="text-zinc-600">Average Response Uptime:</span>
											<span className="font-bold">2.4 minutes</span>
										</div>
										<div className="flex justify-between border-b pb-2">
											<span className="text-zinc-600">Active Support Agents:</span>
											<span className="font-bold">4 active representatives</span>
										</div>
									</div>
								</motion.div>
							</div>
						</motion.div>
					)}

					{/* 9. AUDIT & COMPLIANCE */}
					{activeTab === "audit" && (
						<motion.div
							key="audit-tab"
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -10 }}
							className="space-y-8 w-full"
						>
							<div className="pb-4 border-b border-[#ebdcc9]/40">
								<h2 className="text-xl font-extrabold tracking-tight">Audit & Compliance Center</h2>
								<p className="text-xs text-[#6b6861]">Immutable chronological logs of student registrations, exam submissions, and administrative overrides.</p>
							</div>

							<div className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-sm space-y-4">
								<h3 className="text-sm font-extrabold"> chronologic Event Registry</h3>
								<div className="overflow-x-auto">
									<table className="w-full text-left border-collapse text-xs">
										<thead>
											<tr className="border-b border-zinc-200 text-zinc-500 font-semibold">
												<th className="pb-2">Timestamp</th>
												<th className="pb-2">Action / Command</th>
												<th className="pb-2">IP Address</th>
												<th className="pb-2">Client User Agent</th>
											</tr>
										</thead>
										<tbody>
											{auditLogs.adminLogs?.slice(0, 15).map((log: any) => (
												<tr key={log.id} className="border-b border-zinc-50 hover:bg-neutral-50/50">
													<td className="py-2.5 font-mono text-zinc-500">{new Date(log.createdAt).toLocaleString()}</td>
													<td className="py-2.5 font-bold text-zinc-800">{log.action}</td>
													<td className="py-2.5 font-mono text-zinc-500">{log.ipAddress || "Localhost"}</td>
													<td className="py-2.5 text-zinc-500 truncate max-w-[200px]" title={log.userAgent}>{parseUserAgent(log.userAgent)}</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							</div>
						</motion.div>
					)}

					{/* 10. SYSTEM SETTINGS */}
					{activeTab === "settings" && (
						<motion.div
							key="settings-tab"
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -10 }}
							className="space-y-8 w-full"
						>
							<div className="pb-4 border-b border-[#ebdcc9]/40">
								<h2 className="text-xl font-extrabold tracking-tight">System Settings & Platform Modes</h2>
								<p className="text-xs text-[#6b6861]">Configure model selectors, integrity thresholds, database parameters, and maintenance toggles.</p>
							</div>

							<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
								{/* Left Form Settings */}
								<motion.div
									initial={{ opacity: 0, y: 15 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ duration: 0.3 }}
									whileHover={{ y: -4, scale: 1.01, boxShadow: "0 10px 20px -5px rgba(142,126,98,0.12), 0 0 0 1px rgba(197, 175, 138, 0.3)", borderColor: "rgba(197, 175, 138, 0.5)" }}
									className="lg:col-span-2 bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-sm space-y-4 transition-all duration-300"
								>
									<h3 className="text-sm font-extrabold border-b pb-2">1. AI Agent Model Configuration</h3>
									
									<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
										<div className="flex flex-col gap-1">
											<label className="text-[11px] font-bold text-zinc-500">Evaluation Engine Model</label>
											<select
												value={evaluationModel}
												onChange={(e) => setEvaluationModel(e.target.value)}
												className="h-9 px-2 border rounded-xl text-xs font-semibold bg-zinc-50"
											>
												<option value="Groq Llama 3.1 70B + Ollama Llama 3.2 3B">Groq Llama 3.1 70B + Ollama Llama 3.2 (Dual Engine)</option>
												<option value="Groq Llama 3.1 70B (Single agent)">Groq Llama 3.1 70B (Single Agent Mode)</option>
												<option value="Ollama Llama 3.2 3B (Offline agent)">Ollama Llama 3.2 3B (Offline Mode)</option>
											</select>
										</div>

										<div className="flex flex-col gap-1">
											<label className="text-[11px] font-bold text-zinc-500">AI Support Assistant Model</label>
											<select
												value={supportModel}
												onChange={(e) => setSupportModel(e.target.value)}
												className="h-9 px-2 border rounded-xl text-xs font-semibold bg-zinc-50"
											>
												<option value="IntegrityOS Support AI Agent (Local)">IntegrityOS Support AI Agent (Local)</option>
												<option value="OpenAI GPT-4o Support Api">OpenAI GPT-4o API (Online Escalate)</option>
											</select>
										</div>
									</div>

									<h3 className="text-sm font-extrabold border-b pb-2 pt-2">2. Compliance Threshold Rules</h3>
									<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
										<div className="flex flex-col gap-1">
											<label className="text-[11px] font-bold text-zinc-500">Descriptive Answer Similarity Limit (%)</label>
											<input
												type="number"
												value={similarityLimit}
												onChange={(e) => setSimilarityLimit(Number(e.target.value))}
												className="h-9 px-3 border rounded-xl text-xs font-semibold bg-zinc-50"
											/>
										</div>

										<div className="flex flex-col gap-1">
											<label className="text-[11px] font-bold text-zinc-500">Integrity Violation Warning Threshold (%)</label>
											<input
												type="number"
												value={integrityLimit}
												onChange={(e) => setIntegrityLimit(Number(e.target.value))}
												className="h-9 px-3 border rounded-xl text-xs font-semibold bg-zinc-50"
											/>
										</div>
									</div>

									<Button
										onClick={() => handleSaveSettings()}
										className="bg-[#1a1917] hover:bg-black text-white px-5 py-2 text-xs font-bold rounded-xl mt-3 cursor-pointer animate-none"
									>
										Save Platform Settings
									</Button>
								</motion.div>

								{/* Maintenance and Emergency Shutdown Right Controls */}
								<motion.div
									initial={{ opacity: 0, y: 15 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ duration: 0.3, delay: 0.1 }}
									whileHover={{ y: -4, scale: 1.01, boxShadow: "0 10px 20px -5px rgba(142,126,98,0.12), 0 0 0 1px rgba(197, 175, 138, 0.3)", borderColor: "rgba(197, 175, 138, 0.5)" }}
									className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-sm space-y-4 transition-all duration-300"
								>
									<h3 className="text-sm font-extrabold border-b pb-2 flex items-center gap-2">
										<ShieldAlert className="size-4.5 text-zinc-800" /> Platform Security States
									</h3>
									
									<div className="space-y-4">
										{/* Maintenance Mode */}
										<div className="p-3 border rounded-xl bg-zinc-50 flex items-start justify-between gap-3">
											<div className="space-y-1">
												<span className="text-xs font-extrabold text-zinc-800 block">Maintenance Mode</span>
												<p className="text-[10px] text-zinc-400 leading-tight">Disable candidate registration and student exam access. Administrators retain dashboard visibility.</p>
											</div>
											<input
												type="checkbox"
												checked={maintenanceMode}
												onChange={(e) => {
													const val = e.target.checked;
													setMaintenanceMode(val);
													handleSaveSettings({ maintenanceMode: val });
												}}
												className="size-4.5 mt-1 cursor-pointer text-zinc-950 focus:ring-zinc-950 rounded"
											/>
										</div>

										{/* Selective Portals during Maintenance */}
										{maintenanceMode && (
											<motion.div
												initial={{ opacity: 0, height: 0 }}
												animate={{ opacity: 1, height: "auto" }}
												className="pl-4 border-l-2 border-zinc-200 space-y-2 py-1 text-xs"
											>
												<span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Portal Status during Maintenance</span>
												
												<div className="flex items-center justify-between">
													<span className="font-semibold text-zinc-500">Student Portal</span>
													<span className="px-2 py-0.5 text-[10px] font-bold bg-rose-100 text-rose-700 rounded-full">OFFLINE</span>
												</div>

												<div className="flex items-center justify-between">
													<span className="font-semibold text-zinc-500">Faculty Portal</span>
													<span className="px-2 py-0.5 text-[10px] font-bold bg-rose-100 text-rose-700 rounded-full">OFFLINE</span>
												</div>

												<div className="flex items-center justify-between">
													<span className="font-semibold text-zinc-600">Admin Panel</span>
													<span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-700 rounded-full">ACTIVE</span>
												</div>
											</motion.div>
										)}

										{/* Emergency Shutdown */}
										<div className="p-3 border border-rose-200 rounded-xl bg-rose-50 flex items-start justify-between gap-3 animate-pulse">
											<div className="space-y-1 text-rose-900">
												<span className="text-xs font-extrabold text-rose-800 block flex items-center gap-1">Emergency Platform Suspension</span>
												<p className="text-[10px] text-rose-600 leading-tight">Instantly freeze all examinations, terminate all active candidate sessions, and drop system APIs.</p>
											</div>
											<input
												type="checkbox"
												checked={emergencyShutdown}
												onChange={(e) => {
													const val = e.target.checked;
													setEmergencyShutdown(val);
													handleSaveSettings({ emergencyShutdown: val });
												}}
												className="size-4.5 mt-1 cursor-pointer text-rose-600 focus:ring-rose-500 rounded"
											/>
										</div>

										{/* WAF Agent Toggle */}
										<div className="p-3 border rounded-xl bg-zinc-50 flex items-start justify-between gap-3">
											<div className="space-y-1">
												<span className="text-xs font-extrabold text-zinc-800 block">WAF Security Agent</span>
												<p className="text-[10px] text-zinc-400 leading-tight">Enable automated threats detection, suspicious gaze analysis, and user risk engine tracking.</p>
											</div>
											<input
												type="checkbox"
												checked={securityAgentEnabled}
												onChange={(e) => {
													const val = e.target.checked;
													setSecurityAgentEnabled(val);
													handleSaveSettings({ securityAgentEnabled: val });
												}}
												className="size-4.5 mt-1 cursor-pointer text-zinc-950 focus:ring-zinc-950 rounded"
											/>
										</div>
									</div>
								</motion.div>
							</div>
						</motion.div>
					)}
				</AnimatePresence>
			</div>

			{/* Password Override Reset Modal */}
			<Dialog
				open={!!selectedUserForPasswordReset}
				onOpenChange={(open) => !open && setSelectedUserForPasswordReset(null)}
			>
				<DialogContent className="w-[95vw] sm:max-w-[420px] rounded-[24px] border-2 border-[#ebdcc9] bg-white p-6 shadow-2xl backdrop-blur-xl outline-none text-xs">
					<DialogHeader className="flex flex-col items-center gap-2 text-center">
						<div className="size-11 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center">
							<Key className="size-5 text-amber-600" />
						</div>
						<DialogTitle className="text-base font-extrabold text-zinc-800">
							Administrative Password Reset
						</DialogTitle>
						<DialogDescription className="text-[11px] text-zinc-400 leading-relaxed">
							Force-reset the password for <span className="font-bold text-zinc-800">{selectedUserForPasswordReset?.email}</span>. The student will be logged out on all devices.
						</DialogDescription>
					</DialogHeader>

					<div className="flex flex-col gap-2 my-4">
						<label className="font-extrabold text-zinc-700">Enter Temporary Password:</label>
						<Input
							type="text"
							placeholder="e.g. Temporary123!"
							value={newPassword}
							onChange={(e) => setNewPassword(e.target.value)}
							className="h-10 border-[#ebdcc9] rounded-xl focus-visible:ring-[#ebdcc9] text-xs"
						/>
					</div>

					<DialogFooter className="flex gap-2">
						<Button
							variant="outline"
							onClick={() => setSelectedUserForPasswordReset(null)}
							className="border-[#ebdcc9] rounded-xl font-bold flex-1"
						>
							Cancel
						</Button>
						<Button
							onClick={handleResetPasswordSubmit}
							disabled={isResettingPassword}
							className="bg-zinc-950 text-white hover:bg-zinc-850 rounded-xl font-bold flex-1"
						>
							{isResettingPassword ? "Overriding..." : "Reset Password"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Dialog: Create Student */}
			<Dialog
				open={showAddStudentModal}
				onOpenChange={(open) => !open && setShowAddStudentModal(false)}
			>
				<DialogContent className="max-w-[500px] w-[95vw] rounded-[24px] border-2 border-[#d3c2a6]/40 bg-white p-6 shadow-2xl backdrop-blur-xl outline-none max-h-[90vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle className="text-lg font-bold tracking-tight text-zinc-950">Create Student Profile</DialogTitle>
						<DialogDescription className="text-xs text-[#6b6861]">Create a new student candidate account and credential record.</DialogDescription>
					</DialogHeader>

					<form onSubmit={submitCreateStudent} className="space-y-3.5 my-4">
						<div className="space-y-1">
							<label className="text-[11px] font-bold text-zinc-700">Full Name *</label>
							<Input
								type="text"
								value={studentName}
								onChange={(e) => setStudentName(e.target.value)}
								placeholder="John Doe"
								required
								className="border-[#ebdcc9] rounded-xl text-xs h-9"
							/>
						</div>
						<div className="space-y-1">
							<label className="text-[11px] font-bold text-zinc-700">Email Address *</label>
							<Input
								type="email"
								value={studentEmail}
								onChange={(e) => setStudentEmail(e.target.value)}
								placeholder="johndoe@institution.edu"
								required
								className="border-[#ebdcc9] rounded-xl text-xs h-9"
							/>
						</div>
						<div className="grid grid-cols-2 gap-3">
							<div className="space-y-1">
								<label className="text-[11px] font-bold text-zinc-700">Roll / Registration Number *</label>
								<Input
									type="text"
									value={studentRoll}
									onChange={(e) => setStudentRoll(e.target.value)}
									placeholder="AP201100..."
									required
									className="border-[#ebdcc9] rounded-xl text-xs h-9"
								/>
							</div>
							<div className="space-y-1">
								<label className="text-[11px] font-bold text-zinc-700">Phone Number</label>
								<Input
									type="text"
									value={studentPhone}
									onChange={(e) => setStudentPhone(e.target.value)}
									placeholder="+91 9876543210"
									className="border-[#ebdcc9] rounded-xl text-xs h-9"
								/>
							</div>
						</div>
						<div className="grid grid-cols-2 gap-3">
							<div className="space-y-1">
								<label className="text-[11px] font-bold text-zinc-700">Department *</label>
								<select
									value={studentDept}
									onChange={(e) => setStudentDept(e.target.value)}
									className="w-full h-9 border border-[#ebdcc9] bg-white rounded-xl px-2 text-xs font-semibold focus:outline-none"
								>
									<option value="Computer Science & Engineering">CSE</option>
									<option value="Electronics & Communications">ECE</option>
									<option value="Electrical & Electronics Engineering">EEE</option>
									<option value="Mechanical Engineering">MECH</option>
									<option value="Civil Engineering">CIVIL</option>
									<option value="Business Administration">MBA</option>
								</select>
							</div>
							<div className="space-y-1">
								<label className="text-[11px] font-bold text-zinc-700">Section (e.g. CSE-A) *</label>
								<Input
									type="text"
									value={studentSection}
									onChange={(e) => setStudentSection(e.target.value)}
									placeholder="CSE-A"
									required
									className="border-[#ebdcc9] rounded-xl text-xs h-9"
								/>
							</div>
						</div>
						<div className="grid grid-cols-2 gap-3">
							<div className="space-y-1">
								<label className="text-[11px] font-bold text-zinc-700">Branch *</label>
								<Input
									type="text"
									value={studentBranch}
									onChange={(e) => setStudentBranch(e.target.value)}
									placeholder="B.Tech"
									required
									className="border-[#ebdcc9] rounded-xl text-xs h-9"
								/>
							</div>
							<div className="space-y-1">
								<label className="text-[11px] font-bold text-zinc-700">Semester *</label>
								<select
									value={studentSemester}
									onChange={(e) => setStudentSemester(e.target.value)}
									className="w-full h-9 border border-[#ebdcc9] bg-white rounded-xl px-2 text-xs font-semibold focus:outline-none"
								>
									{[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
										<option key={s} value={s}>{s}</option>
									))}
								</select>
							</div>
						</div>
						<div className="space-y-1">
							<label className="text-[11px] font-bold text-zinc-700">Temporary Password *</label>
							<Input
								type="password"
								value={studentPassword}
								onChange={(e) => setStudentPassword(e.target.value)}
								placeholder="••••••••••••"
								required
								className="border-[#ebdcc9] rounded-xl text-xs h-9"
							/>
							<p className="text-[9px] text-zinc-400">Must be at least 12 characters, with uppercase, lowercase, numbers, and special characters.</p>
						</div>

						<DialogFooter className="flex gap-2 pt-2">
							<Button
								type="button"
								variant="outline"
								onClick={() => setShowAddStudentModal(false)}
								className="border-[#ebdcc9] rounded-xl font-semibold hover:bg-gray-50 flex-1 text-xs h-9"
							>
								Cancel
							</Button>
							<Button
								type="submit"
								disabled={isCreatingStudent}
								className="bg-black text-white hover:bg-black/90 rounded-xl font-bold flex-1 text-xs h-9"
							>
								{isCreatingStudent ? "Creating..." : "Create Student"}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			{/* Dialog: Create Faculty */}
			<Dialog
				open={showAddFacultyModal}
				onOpenChange={(open) => !open && setShowAddFacultyModal(false)}
			>
				<DialogContent className="max-w-[500px] w-[95vw] rounded-[24px] border-2 border-[#d3c2a6]/40 bg-white p-6 shadow-2xl backdrop-blur-xl outline-none max-h-[90vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle className="text-lg font-bold tracking-tight text-zinc-950">Create Faculty Profile</DialogTitle>
						<DialogDescription className="text-xs text-[#6b6861]">Create a new faculty/educator account and credentials.</DialogDescription>
					</DialogHeader>

					<form onSubmit={submitCreateFaculty} className="space-y-3.5 my-4">
						<div className="space-y-1">
							<label className="text-[11px] font-bold text-zinc-700">Full Name *</label>
							<Input
								type="text"
								value={facultyName}
								onChange={(e) => setFacultyName(e.target.value)}
								placeholder="Dr. Sarah Connor"
								required
								className="border-[#ebdcc9] rounded-xl text-xs h-9"
							/>
						</div>
						<div className="space-y-1">
							<label className="text-[11px] font-bold text-zinc-700">Email Address *</label>
							<Input
								type="email"
								value={facultyEmail}
								onChange={(e) => setFacultyEmail(e.target.value)}
								placeholder="sarahconnor@institution.edu"
								required
								className="border-[#ebdcc9] rounded-xl text-xs h-9"
							/>
						</div>
						<div className="grid grid-cols-2 gap-3">
							<div className="space-y-1">
								<label className="text-[11px] font-bold text-zinc-700">Employee / Academic ID *</label>
								<Input
									type="text"
									value={facultyAcademicId}
									onChange={(e) => setFacultyAcademicId(e.target.value)}
									placeholder="EMP-8765"
									required
									className="border-[#ebdcc9] rounded-xl text-xs h-9"
								/>
							</div>
							<div className="space-y-1">
								<label className="text-[11px] font-bold text-zinc-700">Phone Number</label>
								<Input
									type="text"
									value={facultyPhone}
									onChange={(e) => setFacultyPhone(e.target.value)}
									placeholder="+91 9988776655"
									className="border-[#ebdcc9] rounded-xl text-xs h-9"
								/>
							</div>
						</div>
						<div className="grid grid-cols-2 gap-3">
							<div className="space-y-1">
								<label className="text-[11px] font-bold text-zinc-700">Department *</label>
								<select
									value={facultyDept}
									onChange={(e) => setFacultyDept(e.target.value)}
									className="w-full h-9 border border-[#ebdcc9] bg-white rounded-xl px-2 text-xs font-semibold focus:outline-none"
								>
									<option value="Computer Science & Engineering">CSE</option>
									<option value="Electronics & Communications">ECE</option>
									<option value="Electrical & Electronics Engineering">EEE</option>
									<option value="Mechanical Engineering">MECH</option>
									<option value="Civil Engineering">CIVIL</option>
									<option value="Business Administration">MBA</option>
								</select>
							</div>
							<div className="space-y-1">
								<label className="text-[11px] font-bold text-zinc-700">Designation *</label>
								<Input
									type="text"
									value={facultyDesignation}
									onChange={(e) => setFacultyDesignation(e.target.value)}
									placeholder="Associate Professor"
									required
									className="border-[#ebdcc9] rounded-xl text-xs h-9"
								/>
							</div>
						</div>
						<div className="space-y-1">
							<label className="text-[11px] font-bold text-zinc-700">Subjects Handled (comma-separated)</label>
							<Input
								type="text"
								value={facultySubjects}
								onChange={(e) => setFacultySubjects(e.target.value)}
								placeholder="Database Management Systems, Cryptography"
								className="border-[#ebdcc9] rounded-xl text-xs h-9"
							/>
						</div>
						<div className="space-y-1">
							<label className="text-[11px] font-bold text-zinc-700">Assigned Sections (comma-separated, e.g. CSE-A, CSE-B)</label>
							<Input
								type="text"
								value={facultySections}
								onChange={(e) => setFacultySections(e.target.value)}
								placeholder="CSE-A, CSE-B"
								className="border-[#ebdcc9] rounded-xl text-xs h-9"
							/>
						</div>
						<div className="space-y-1">
							<label className="text-[11px] font-bold text-zinc-700">Temporary Password *</label>
							<Input
								type="password"
								value={facultyPassword}
								onChange={(e) => setFacultyPassword(e.target.value)}
								placeholder="••••••••••••"
								required
								className="border-[#ebdcc9] rounded-xl text-xs h-9"
							/>
						</div>

						<DialogFooter className="flex gap-2 pt-2">
							<Button
								type="button"
								variant="outline"
								onClick={() => setShowAddFacultyModal(false)}
								className="border-[#ebdcc9] rounded-xl font-semibold hover:bg-gray-50 flex-1 text-xs h-9"
							>
								Cancel
							</Button>
							<Button
								type="submit"
								disabled={isCreatingFaculty}
								className="bg-black text-white hover:bg-black/90 rounded-xl font-bold flex-1 text-xs h-9"
							>
								{isCreatingFaculty ? "Creating..." : "Create Faculty"}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			{/* Dialog: Edit User Profile */}
			<Dialog
				open={!!selectedUserForEdit}
				onOpenChange={(open) => !open && setSelectedUserForEdit(null)}
			>
				<DialogContent className="max-w-[500px] w-[95vw] rounded-[24px] border-2 border-[#d3c2a6]/40 bg-white p-6 shadow-2xl backdrop-blur-xl outline-none max-h-[90vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle className="text-lg font-bold tracking-tight text-zinc-950">Edit Profile: {selectedUserForEdit?.email}</DialogTitle>
						<DialogDescription className="text-xs text-[#6b6861]">Update profile fields and platform compliance indicators directly.</DialogDescription>
					</DialogHeader>

					<form onSubmit={submitEditUser} className="space-y-3.5 my-4">
						<div className="space-y-1">
							<label className="text-[11px] font-bold text-zinc-700">Full Name</label>
							<Input
								type="text"
								value={editName}
								onChange={(e) => setEditName(e.target.value)}
								className="border-[#ebdcc9] rounded-xl text-xs h-9"
							/>
						</div>
						{selectedUserForEdit?.role === "user" ? (
							<>
								<div className="grid grid-cols-2 gap-3">
									<div className="space-y-1">
										<label className="text-[11px] font-bold text-zinc-700">Roll Number</label>
										<Input
											type="text"
											value={editRollNumber}
											onChange={(e) => setEditRollNumber(e.target.value)}
											className="border-[#ebdcc9] rounded-xl text-xs h-9"
										/>
									</div>
									<div className="space-y-1">
										<label className="text-[11px] font-bold text-zinc-700">Semester</label>
										<Input
											type="text"
											value={editSemester}
											onChange={(e) => setEditSemester(e.target.value)}
											className="border-[#ebdcc9] rounded-xl text-xs h-9"
										/>
									</div>
								</div>
								<div className="grid grid-cols-2 gap-3">
									<div className="space-y-1">
										<label className="text-[11px] font-bold text-zinc-700">Branch</label>
										<Input
											type="text"
											value={editBranch}
											onChange={(e) => setEditBranch(e.target.value)}
											className="border-[#ebdcc9] rounded-xl text-xs h-9"
										/>
									</div>
									<div className="space-y-1">
										<label className="text-[11px] font-bold text-zinc-700">Section</label>
										<Input
											type="text"
											value={editSection}
											onChange={(e) => setEditSection(e.target.value)}
											className="border-[#ebdcc9] rounded-xl text-xs h-9"
										/>
									</div>
								</div>
							</>
						) : selectedUserForEdit?.role === "faculty" ? (
							<>
								<div className="grid grid-cols-2 gap-3">
									<div className="space-y-1">
										<label className="text-[11px] font-bold text-zinc-700">Employee ID</label>
										<Input
											type="text"
											value={editAcademicId}
											onChange={(e) => setEditAcademicId(e.target.value)}
											className="border-[#ebdcc9] rounded-xl text-xs h-9"
										/>
									</div>
									<div className="space-y-1">
										<label className="text-[11px] font-bold text-zinc-700">Designation</label>
										<Input
											type="text"
											value={editDesignation}
											onChange={(e) => setEditDesignation(e.target.value)}
											className="border-[#ebdcc9] rounded-xl text-xs h-9"
										/>
									</div>
								</div>
								<div className="space-y-1">
									<label className="text-[11px] font-bold text-zinc-700">Subjects</label>
									<Input
										type="text"
										value={editSubjects}
										onChange={(e) => setEditSubjects(e.target.value)}
										className="border-[#ebdcc9] rounded-xl text-xs h-9"
									/>
								</div>
								<div className="space-y-1">
									<label className="text-[11px] font-bold text-zinc-700">Handled Sections</label>
									<Input
										type="text"
										value={editSection}
										onChange={(e) => setEditSection(e.target.value)}
										className="border-[#ebdcc9] rounded-xl text-xs h-9"
									/>
								</div>
							</>
						) : null}

						<div className="grid grid-cols-2 gap-3">
							<div className="space-y-1">
								<label className="text-[11px] font-bold text-zinc-700">Department</label>
								<Input
									type="text"
									value={editDepartment}
									onChange={(e) => setEditDepartment(e.target.value)}
									className="border-[#ebdcc9] rounded-xl text-xs h-9"
								/>
							</div>
							<div className="space-y-1">
								<label className="text-[11px] font-bold text-zinc-700">Phone Number</label>
								<Input
									type="text"
									value={editPhone}
									onChange={(e) => setEditPhone(e.target.value)}
									className="border-[#ebdcc9] rounded-xl text-xs h-9"
								/>
							</div>
						</div>

						<div className="flex items-center gap-6 pt-2">
							<label className="flex items-center gap-2 text-xs font-bold text-zinc-700 cursor-pointer">
								<input
									type="checkbox"
									checked={editTwoFactor}
									onChange={(e) => setEditTwoFactor(e.target.checked)}
									className="rounded border-[#ebdcc9] text-black focus:ring-black cursor-pointer"
								/>
								2FA Enabled
							</label>
							<label className="flex items-center gap-2 text-xs font-bold text-zinc-700 cursor-pointer">
								<input
									type="checkbox"
									checked={editEmailVerified}
									onChange={(e) => setEditEmailVerified(e.target.checked)}
									className="rounded border-[#ebdcc9] text-black focus:ring-black cursor-pointer"
								/>
								Email Verified
							</label>
						</div>

						<DialogFooter className="flex gap-2 pt-2">
							<Button
								type="button"
								variant="outline"
								onClick={() => setSelectedUserForEdit(null)}
								className="border-[#ebdcc9] rounded-xl font-semibold hover:bg-gray-50 flex-1 text-xs h-9"
							>
								Cancel
							</Button>
							<Button
								type="submit"
								disabled={isSubmittingEdit}
								className="bg-black text-white hover:bg-black/90 rounded-xl font-bold flex-1 text-xs h-9"
							>
								{isSubmittingEdit ? "Saving..." : "Save Changes"}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			{/* Dialogs sit outside the main workspace flex flow */}
			<Dialog
				open={!!selectedUserForLogs}
				onOpenChange={(open) => !open && setSelectedUserForLogs(null)}
			>
				<DialogContent className="max-w-[700px] w-[90vw] rounded-[24px] border-2 border-[#d3c2a6]/40 bg-white p-6 shadow-2xl backdrop-blur-xl outline-none">
					<DialogHeader>
						<DialogTitle className="text-xl font-bold tracking-tight flex items-center gap-2">
							<History className="size-5 text-black" />
							Activity Logs: {selectedUserForLogs?.email}
						</DialogTitle>
						<DialogDescription className="text-xs text-[#6b6861]">
							Full login and registration event history for this user
						</DialogDescription>
					</DialogHeader>

					<div className="border border-[#ebdcc9]/50 rounded-xl overflow-auto bg-[#fafafa] my-4 max-h-[300px] w-full">
						<table className="w-full min-w-[550px] text-left text-xs border-collapse">
							<thead>
								<tr className="bg-[#f5f2eb] border-b border-[#ebdcc9]/30 text-[#6b6861] font-semibold uppercase tracking-wider">
									<th className="p-3">Event / Action</th>
									<th className="p-3">IP Address</th>
									<th className="p-3">Device / User Agent</th>
									<th className="p-3">Timestamp</th>
								</tr>
							</thead>
							<tbody>
								{loadingUserLogs ? (
									<tr>
										<td colSpan={4} className="p-6 text-center text-[#8e8a80]">
											<div className="flex items-center justify-center gap-2">
												<div className="size-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
												Loading logs...
											</div>
										</td>
									</tr>
								) : userLogs.length === 0 ? (
									<tr>
										<td colSpan={4} className="p-6 text-center text-[#8e8a80]">
											No event history records exist for this user.
										</td>
									</tr>
								) : (
									userLogs.map((log) => (
										<tr
											key={log.id}
											className="border-b border-[#ebdcc9]/20 hover:bg-[#faf9f6]"
										>
											<td className="p-3 font-semibold text-[#1a1917]">
												{log.action}
											</td>
											<td className="p-3 text-gray-500 font-mono text-[10px]">
												{log.ipAddress || "Unknown"}
											</td>
											<td className="p-3 text-gray-500">
												{parseUserAgent(log.userAgent)}
											</td>
											<td className="p-3 text-gray-400 font-mono text-[10px]">
												{new Date(log.createdAt).toLocaleString()}
											</td>
										</tr>
									))
								)}
							</tbody>
						</table>
					</div>

					<DialogFooter>
						<Button
							onClick={() => setSelectedUserForLogs(null)}
							className="rounded-xl bg-black text-white hover:bg-black/90 font-bold"
						>
							Close Audits
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Dialog: Temporary Suspension */}
			<Dialog
				open={!!selectedUserForTempSuspend}
				onOpenChange={(open) => !open && setSelectedUserForTempSuspend(null)}
			>
				<DialogContent className="w-[95vw] sm:max-w-[420px] rounded-[24px] border-2 border-[#d3c2a6]/40 bg-white p-6 shadow-2xl backdrop-blur-xl outline-none">
					<DialogHeader className="flex flex-col items-center gap-2 text-center">
						<div className="size-12 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center">
							<Clock className="size-6 text-amber-600" />
						</div>
						<DialogTitle className="text-lg font-bold tracking-tight text-[#1a1917]">
							Temporary Suspension
						</DialogTitle>
						<DialogDescription className="text-xs text-[#6b6861] leading-relaxed">
							Choose the number of hours to lock the account of{" "}
							<span className="font-bold text-black">
								{selectedUserForTempSuspend?.email}
							</span>
							.
						</DialogDescription>
					</DialogHeader>

					<div className="flex flex-col gap-2 my-4">
						<label className="text-xs font-semibold text-[#1a1917]">Duration (Hours):</label>
						<Input
							type="number"
							min={1}
							max={8760}
							value={tempHours}
							onChange={(e) => setTempHours(Math.max(1, parseInt(e.target.value) || 1))}
							className="border-[#ebdcc9] rounded-xl focus-visible:ring-[#ebdcc9] text-sm"
						/>
						<p className="text-[10px] text-gray-400">
							The account will automatically restore status after duration elapses.
						</p>
					</div>

					<DialogFooter className="flex gap-2">
						<Button
							variant="outline"
							onClick={() => setSelectedUserForTempSuspend(null)}
							className="border-[#ebdcc9] rounded-xl font-semibold hover:bg-gray-50 flex-1"
						>
							Cancel
						</Button>
						<Button
							onClick={submitTempSuspend}
							className="bg-amber-600 text-white hover:bg-amber-700 rounded-xl font-bold flex-1"
						>
							Confirm Suspend
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Dialog: Confirm Deletion */}
			<Dialog
				open={!!selectedUserForDelete}
				onOpenChange={(open) => !open && setSelectedUserForDelete(null)}
			>
				<DialogContent className="w-[95vw] sm:max-w-[420px] rounded-[24px] border-2 border-rose-200 bg-white p-6 shadow-2xl backdrop-blur-xl outline-none">
					<DialogHeader className="flex flex-col items-center gap-2 text-center">
						<div className="size-12 rounded-full bg-rose-50 border border-rose-100 flex items-center justify-center animate-bounce">
							<ShieldAlert className="size-6 text-rose-600" />
						</div>
						<DialogTitle className="text-lg font-bold tracking-tight text-[#1a1917]">
							Permanently Delete User
						</DialogTitle>
						<DialogDescription className="text-xs text-[#6b6861] leading-relaxed">
							Are you absolutely sure you want to delete{" "}
							<span className="font-bold text-black">{selectedUserForDelete?.email}</span>?
							This action is irreversible and deletes all associated profile data.
						</DialogDescription>
					</DialogHeader>

					<DialogFooter className="flex gap-2 mt-4">
						<Button
							variant="outline"
							onClick={() => setSelectedUserForDelete(null)}
							className="border-[#ebdcc9] rounded-xl font-semibold hover:bg-gray-50 flex-1"
						>
							Cancel
						</Button>
						<Button
							onClick={submitDeleteUser}
							disabled={isSubmittingDelete}
							className="bg-rose-600 text-white hover:bg-rose-700 rounded-xl font-bold flex-1"
						>
							{isSubmittingDelete ? "Deleting..." : "Permanently Delete"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
