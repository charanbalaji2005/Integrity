/**
 * LinkCredentialsPage Component
 * Renders the responsive Link Credentials page frontend including:
 * - Dynamic step progress bar via StepIndicator
 * - Volumetric structural graphics via BuildingIllustration
 * - University autocomplete search (e.g. SRM University AP)
 * - Department selection & academic ID validation forms
 * - Fully accessible form states and micro-interactions
 */
import React, { useState, useEffect, useRef } from "react";
import StepIndicator from "../components/StepIndicator";
import BuildingIllustration from "../components/BuildingIllustration";
import { toast } from "sonner";
import { apiFetch } from "../utils/api-client";
import {
  InstitutionLabelIcon,
  SearchIcon,
  DepartmentIcon,
  IdCardIcon,
  ChevronDownIcon,
  ShieldCheckIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
} from "../components/Icons";

const API_BASE_URL = import.meta.env.VITE_API_URL || "https://assessment-integrity-backend-0w4b.onrender.com";

interface LinkCredentialsPageProps {
  email: string;
  onBack: () => void;
  onNext: () => void;
  initialRole?: "user" | "faculty";
}

const MOCK_UNIVERSITIES = [
  "SRM University AP",
  "SRM Institute of Science and Technology",
  "Stanford University",
  "Massachusetts Institute of Technology (MIT)",
  "Harvard University",
  "University of California, Berkeley",
  "California Institute of Technology (Caltech)",
  "Indian Institute of Technology (IIT) Madras",
  "Indian Institute of Technology (IIT) Bombay",
  "Indian Institute of Technology (IIT) Delhi",
  "University of Oxford",
  "University of Cambridge",
  "University of Toronto",
  "National University of Singapore (NUS)",
];

const DEPARTMENTS = [
  "Computer Science & Engineering",
  "Electronics & Communications",
  "Electrical & Electronics Engineering",
  "Mechanical Engineering",
  "Civil Engineering",
  "Information Technology",
  "Physics & Chemistry",
  "Mathematics & Statistics",
  "Business & Management",
  "Humanities & Social Sciences",
];

export default function LinkCredentialsPage({ email, onBack, onNext, initialRole }: LinkCredentialsPageProps) {
  const [fullName, setFullName] = useState("");
  const [institutionName, setInstitutionName] = useState("");
  const [showUniSuggestions, setShowUniSuggestions] = useState(false);
  const [filteredUnis, setFilteredUnis] = useState<string[]>([]);
  
  const [department, setDepartment] = useState("");
  const [showDeptDropdown, setShowDeptDropdown] = useState(false);
  
  const [degree, setDegree] = useState("B.Tech");
  const [semester, setSemester] = useState("");
  const [section, setSection] = useState("");
  const [academicId, setAcademicId] = useState("");
  const [role, setRole] = useState<"user" | "faculty">(initialRole || "user");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const getDeptPrefix = (deptName: string) => {
    if (deptName === "Computer Science & Engineering") return "CSE";
    if (deptName === "Electronics & Communications") return "ECE";
    if (deptName === "Electrical & Electronics Engineering") return "EEE";
    if (deptName === "Mechanical Engineering") return "MEC";
    return "CSE";
  };

  const uniRef = useRef<HTMLDivElement>(null);
  const deptRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (uniRef.current && !uniRef.current.contains(event.target as Node)) {
        setShowUniSuggestions(false);
      }
      if (deptRef.current && !deptRef.current.contains(event.target as Node)) {
        setShowDeptDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter universities as search input changes
  useEffect(() => {
    if (institutionName.trim() === "") {
      setFilteredUnis(MOCK_UNIVERSITIES.slice(0, 5));
    } else {
      const filtered = MOCK_UNIVERSITIES.filter((uni) =>
        uni.toLowerCase().includes(institutionName.toLowerCase())
      );
      setFilteredUnis(filtered);
    }
  }, [institutionName]);

  const handleNextStep = async () => {
    if (!fullName.trim()) {
      toast.error("Please enter your Full Name.");
      return;
    }
    if (!institutionName.trim()) {
      toast.error("Please specify your Institution Name.");
      return;
    }
    if (!department) {
      toast.error("Please select your Department.");
      return;
    }
    if (!academicId.trim()) {
      toast.error(role === "faculty" ? "Please specify your Faculty ID." : "Please specify your Academic ID.");
      return;
    }

    let formattedSection = "";
    if (role === "user") {
      if (!semester) {
        toast.error("Please select your Semester.");
        return;
      }
      if (!section.trim()) {
        toast.error("Please specify your Section.");
        return;
      }
      formattedSection = section.trim().toUpperCase();
      const prefix = getDeptPrefix(department);
      const regex = new RegExp(`^${prefix}-[A-Z]$`);
      if (!regex.test(formattedSection)) {
        toast.error(`Invalid section format. Section must match format: ${prefix}-A, ${prefix}-B, etc.`);
        return;
      }
    } else {
      if (!section.trim()) {
        toast.error("Please specify the sections you handle (e.g. CSE-A, CSE-B).");
        return;
      }
      formattedSection = section.split(",").map((s) => s.trim().toUpperCase()).join(", ");
      const prefix = getDeptPrefix(department);
      const singleSectionRegex = new RegExp(`^${prefix}-[A-Z]$`);
      const sectionsArray = formattedSection.split(",").map(s => s.trim());
      for (const sec of sectionsArray) {
        if (!singleSectionRegex.test(sec)) {
          toast.error(`Invalid handled section format: ${sec}. Section must match department format, e.g. ${prefix}-A.`);
          return;
        }
      }
    }

    setIsSubmitting(true);
    try {
      const response = await apiFetch("/api/authentication/link-credentials", {
        method: "POST",
        body: JSON.stringify({
          institutionName: institutionName.trim(),
          department,
          academicId: academicId.trim(),
          name: fullName.trim(),
          semester: role === "user" ? semester : null,
          branch: role === "user" ? degree : null,
          section: formattedSection,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Failed to link credentials.");
      }

      toast.success("Academic credentials linked successfully!");
      onNext();
    } catch (err: any) {
      toast.error(err.message || "Something went wrong.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRequestManual = () => {
    toast.success("Verification request submitted! Support will review it within 24 hours.");
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#fff1d3]">
      {/* Background decorative illustration */}
      <BuildingIllustration />

      {/* Page content */}
      <div className="relative z-10 flex min-h-screen flex-col items-center px-4 pt-16 pb-10">
        {/* Header */}
        <div className="mb-8 text-center">
          <p className="text-[13px] font-medium text-[#605e5b]">IntegrityOS</p>
          <p className="mt-1 text-[13px] text-[#75716a]">
            Step 2: Link your academic credentials
          </p>
        </div>

        {/* Card */}
        <div className="w-full max-w-[470px] rounded-[28px] bg-[#fffbf2] px-9 pt-8 pb-7 shadow-[0_20px_50px_-10px_rgba(0,0,0,0.12)]">
          {/* Step indicator */}
          <StepIndicator activeStep={2} />

          {/* Full Name */}
          <div className="mt-5">
            <label className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-[#605e5b]">
              👤 Full Name
            </label>
            <div className="flex h-12 items-center rounded-[12px] border border-[#e4e0d4] bg-[#fafafa] px-4 focus-within:border-[#c5af8a] focus-within:ring-2 focus-within:ring-[#c5af8a]/20 transition-all">
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Enter your full name"
                className="w-full bg-transparent text-[14px] text-[#605e5b] placeholder:text-[#a7a297] focus:outline-none"
              />
            </div>
          </div>

          {/* Institution Name */}
          <div className="mt-5 relative" ref={uniRef}>
            <label className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-[#605e5b]">
              <InstitutionLabelIcon />
              Institution Name
            </label>
            <div className="flex h-12 items-center gap-2.5 rounded-[12px] border border-[#e4e0d4] bg-[#fafafa] px-4 focus-within:border-[#c5af8a] focus-within:ring-2 focus-within:ring-[#c5af8a]/20 transition-all">
              <SearchIcon />
              <input
                type="text"
                value={institutionName}
                onChange={(e) => {
                  setInstitutionName(e.target.value);
                  setShowUniSuggestions(true);
                }}
                onFocus={() => setShowUniSuggestions(true)}
                placeholder="Search university, college, or school..."
                className="w-full bg-transparent text-[14px] text-[#605e5b] placeholder:text-[#a7a297] focus:outline-none"
              />
            </div>
            
            {showUniSuggestions && filteredUnis.length > 0 && (
              <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto rounded-xl border border-[#ebdcc9] bg-[#fffbf2] shadow-lg">
                {filteredUnis.map((uni) => (
                  <button
                    key={uni}
                    type="button"
                    onClick={() => {
                      setInstitutionName(uni);
                      setShowUniSuggestions(false);
                    }}
                    className="w-full px-4 py-2.5 text-left text-[13.5px] text-[#605e5b] hover:bg-[#fff1d3] transition-colors"
                  >
                    {uni}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Role Selection */}
          <div className="mt-5">
            <label className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-[#605e5b]">
              👤 Account Role
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRole("user")}
                className={`flex h-11 items-center justify-center gap-2 rounded-[12px] border text-sm font-semibold transition-all cursor-pointer ${
                  role === "user"
                    ? "border-[#c5af8a] bg-[#fffcf3] text-[#1a1a1a] shadow-[0_0_12px_rgba(197,175,138,0.15)]"
                    : "border-[#e4e0d4] bg-[#fafafa] text-[#605e5b] hover:bg-[#eae7e2]"
                }`}
              >
                <span>Student</span>
              </button>
              <button
                type="button"
                onClick={() => setRole("faculty")}
                className={`flex h-11 items-center justify-center gap-2 rounded-[12px] border text-sm font-semibold transition-all cursor-pointer ${
                  role === "faculty"
                    ? "border-[#c5af8a] bg-[#fffcf3] text-[#1a1a1a] shadow-[0_0_12px_rgba(197,175,138,0.15)]"
                    : "border-[#e4e0d4] bg-[#fafafa] text-[#605e5b] hover:bg-[#eae7e2]"
                }`}
              >
                <span>Faculty</span>
              </button>
            </div>
          </div>

          {/* Department + Academic ID row */}
          <div className="mt-5 grid grid-cols-2 gap-4">
            {/* Department */}
            <div className="relative" ref={deptRef}>
              <label className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-[#605e5b]">
                <DepartmentIcon />
                Department
              </label>
              <button
                type="button"
                onClick={() => setShowDeptDropdown(!showDeptDropdown)}
                className="flex h-12 w-full items-center justify-between rounded-[12px] border border-[#e4e0d4] bg-[#fafafa] px-4 text-left text-[14px] text-[#605e5b] hover:bg-[#eae7e2] transition-colors"
              >
                <span className="truncate">{department || "Select department"}</span>
                <ChevronDownIcon />
              </button>

              {showDeptDropdown && (
                <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto rounded-xl border border-[#ebdcc9] bg-[#fffbf2] shadow-lg">
                  {DEPARTMENTS.map((dept) => (
                    <button
                      key={dept}
                      type="button"
                      onClick={() => {
                        setDepartment(dept);
                        setShowDeptDropdown(false);
                        setSection(""); // Reset section placeholder
                      }}
                      className="w-full px-4 py-2.5 text-left text-[13.5px] text-[#605e5b] hover:bg-[#fff1d3] transition-colors"
                    >
                      {dept}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Academic ID */}
            <div>
              <label className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-[#605e5b]">
                <IdCardIcon />
                {role === "faculty" ? "Faculty ID" : "Academic ID"}
              </label>
              <div className="flex h-12 items-center rounded-[12px] border border-[#e4e0d4] bg-[#fafafa] px-4 focus-within:border-[#c5af8a] focus-within:ring-2 focus-within:ring-[#c5af8a]/20 transition-all">
                <input
                  type="text"
                  value={academicId}
                  onChange={(e) => setAcademicId(e.target.value)}
                  placeholder={role === "faculty" ? "FAC-12345" : "STU-12345"}
                  className="w-full bg-transparent text-[14px] text-[#605e5b] placeholder:text-[#a7a297] focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Student Specific Fields */}
          {role === "user" && (
            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-[#605e5b]">
                  🎓 Program / Course
                </label>
                <select
                  value={degree}
                  onChange={(e) => {
                    setDegree(e.target.value);
                    setSemester("");
                  }}
                  className="flex h-12 w-full rounded-[12px] border border-[#e4e0d4] bg-[#fafafa] px-4 text-[14px] text-[#605e5b] focus:outline-none focus:border-[#c5af8a]"
                >
                  <option value="B.Tech">B.Tech (8 Semesters)</option>
                  <option value="M.Tech">M.Tech (6 Semesters)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-[#605e5b]">
                    📅 Semester
                  </label>
                  <select
                    value={semester}
                    onChange={(e) => setSemester(e.target.value)}
                    className="flex h-12 w-full rounded-[12px] border border-[#e4e0d4] bg-[#fafafa] px-4 text-[14px] text-[#605e5b] focus:outline-none focus:border-[#c5af8a]"
                  >
                    <option value="">Select sem</option>
                    {degree === "B.Tech" ? (
                      [1, 2, 3, 4, 5, 6, 7, 8].map(s => (
                        <option key={s} value={`Semester ${s}`}>{s}</option>
                      ))
                    ) : (
                      [1, 2, 3, 4, 5, 6].map(s => (
                        <option key={s} value={`Semester ${s}`}>{s}</option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-[#605e5b]">
                    🏢 Section (e.g. {getDeptPrefix(department)}-A)
                  </label>
                  <div className="flex h-12 items-center rounded-[12px] border border-[#e4e0d4] bg-[#fafafa] px-4 focus-within:border-[#c5af8a] transition-all">
                    <input
                      type="text"
                      value={section}
                      onChange={(e) => setSection(e.target.value)}
                      placeholder={`${getDeptPrefix(department)}-A`}
                      className="w-full bg-transparent text-[14px] text-[#605e5b] placeholder:text-[#a7a297] focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Faculty Handled Sections Input */}
          {role === "faculty" && (
            <div className="mt-5">
              <label className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-[#605e5b]">
                🏫 Handled Sections (e.g. {getDeptPrefix(department)}-A, {getDeptPrefix(department)}-B)
              </label>
              <div className="flex h-12 items-center rounded-[12px] border border-[#e4e0d4] bg-[#fafafa] px-4 focus-within:border-[#c5af8a] transition-all">
                <input
                  type="text"
                  value={section}
                  onChange={(e) => setSection(e.target.value)}
                  placeholder={`${getDeptPrefix(department)}-A, ${getDeptPrefix(department)}-B`}
                  className="w-full bg-transparent text-[14px] text-[#605e5b] placeholder:text-[#a7a297] focus:outline-none"
                />
              </div>
              <p className="text-[10px] text-[#75716a] mt-1 italic">
                * Specify multiple handled sections separated by commas.
              </p>
            </div>
          )}

          {/* Verification banner */}
          <div className="mt-5 rounded-[14px] bg-[#fafcf3] px-4 py-3.5 border border-[#e6eedc]">
            <div className="flex items-start gap-2.5">
              <span className="mt-[1px]">
                <ShieldCheckIcon />
              </span>
              <div>
                <p className="text-[13.5px] font-semibold text-[#24a37a]">
                  Automatic Verification Enabled
                </p>
                <p className="mt-0.5 text-[12.5px] leading-[1.45] text-[#4c8a68]">
                  Connecting your institution enables automated integrity
                  reports and enterprise-level AI toolsets assigned to your
                  academic plan.
                </p>
              </div>
            </div>
          </div>

          {/* Footer actions */}
          <div className="mt-7 flex items-center justify-between">
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-2 text-[14px] font-medium text-[#1a1a1a] hover:opacity-75 transition-opacity"
            >
              <ArrowLeftIcon />
              Back
            </button>

            <button
              type="button"
              onClick={handleNextStep}
              disabled={isSubmitting}
              className="flex h-11 items-center gap-2 rounded-[12px] bg-[#1a1a1a] px-5 text-[14px] font-medium text-white shadow-[0_4px_10px_rgba(0,0,0,0.18)] hover:bg-[#333] transition-colors disabled:opacity-50"
            >
              {isSubmitting ? "Linking..." : "Next Step"}
              <ArrowRightIcon />
            </button>
          </div>
        </div>

        {/* Below-card footer text */}
        <p className="mt-7 text-center text-[13px] text-[#75716a]">
          Institution not listed?{" "}
          <span 
            onClick={handleRequestManual}
            className="font-medium text-[#1a1a1a] underline underline-offset-2 hover:no-underline cursor-pointer"
          >
            Request manual verification
          </span>
        </p>
      </div>
    </div>
  );
}
