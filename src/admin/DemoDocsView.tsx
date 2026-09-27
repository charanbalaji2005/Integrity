import React from "react";
import { Database, Power, Users, BookOpen, Copy, Code, GitBranch } from "lucide-react";
import { toast } from "sonner";

export function DemoDocsView() {
  const handleCopyScript = () => {
    const script =
      "When a user registers, the data is stored in the database with a hashed password. During login, the backend validates the credentials, fetches the user record and role from the database, creates a session, and redirects the user to the dashboard.";
    navigator.clipboard.writeText(script);
    toast.success("Presentation script copied to clipboard!");
  };

  return (
    <div className="flex flex-col gap-6 w-full text-[#1a1917] pb-12 select-text">
      {/* Header */}
      <div className="pb-4 border-b border-[#ebdcc9]/40">
        <h2 className="text-xl font-bold tracking-tight">System Flows & Database Schema</h2>
        <p className="text-xs text-[#6b6861]">
          Interactive database tracking and validation diagrams for mentor demonstration
        </p>
      </div>

      {/* Mentor Demo Script */}
      <div className="bg-[#fdfbf7] border-2 border-[#ebdcc9] rounded-2xl p-6 relative overflow-hidden shadow-sm">
        <div className="absolute top-0 right-0 bg-[#ebdcc9] text-[#1a1917] text-[10px] font-bold px-3 py-1 uppercase rounded-bl-xl tracking-wider">
          Demo Talking Points
        </div>
        <div className="flex gap-4 items-start">
          <div className="p-3 bg-[#ebdcc9]/30 rounded-xl mt-1">
            <BookOpen className="size-5 text-[#1c1b1b]" />
          </div>
          <div className="flex-1 flex flex-col gap-2">
            <h3 className="font-bold text-sm text-[#1c1b1b]">Mentor Presentation Script</h3>
            <p className="text-xs text-[#5e5a52] leading-relaxed italic pr-12">
              "When a user registers, the data is stored in the database with a hashed password. During login, the backend validates the credentials, fetches the user record and role from the database, creates a session, and redirects the user to the dashboard."
            </p>
            <button
              onClick={handleCopyScript}
              className="flex items-center gap-1.5 text-[10px] font-bold text-[#1a1917] hover:underline bg-transparent border-none cursor-pointer outline-none mt-2 w-fit"
            >
              <Copy className="size-3" />
              Copy Script
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Login Flow & Schema Card */}
        <div className="border border-[#ebdcc9]/60 rounded-2xl bg-white p-6 flex flex-col gap-5 shadow-sm">
          <div className="flex items-center gap-3 border-b border-neutral-100 pb-3">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <Power className="size-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm">Login Page Database Fetch</h3>
              <p className="text-[10px] text-gray-400">Verification & Session establishment</p>
            </div>
          </div>

          {/* Data Fetched Badge/List */}
          <div className="flex flex-col gap-2">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#8e8a80]">Verified Fields from DB</h4>
            <div className="flex flex-wrap gap-1.5">
              {["Email", "Password Hash", "Role", "Account Status", "Last Login", "Permissions"].map((field) => (
                <span
                  key={field}
                  className="px-2 py-1 text-[10px] font-semibold bg-[#faf9f6] text-[#403e3a] border border-[#ebdcc9]/40 rounded-lg"
                >
                  {field}
                </span>
              ))}
            </div>
          </div>

          {/* Flowchart Timeline */}
          <div className="flex flex-col gap-3">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#8e8a80]">Login Execution Flow</h4>
            <div className="flex flex-col gap-2 relative pl-4 border-l-2 border-[#ebdcc9]/60">
              {[
                { step: "1", title: "Credentials Entry", desc: "Admin enters Email + Password in frontend" },
                { step: "2", title: "API Dispatch", desc: "POST /api/authentication/login payload transmitted" },
                { step: "3", title: "Prisma Query", desc: "Database lookup by email to retrieve user record" },
                { step: "4", title: "Password Verification", desc: "Argon2 / bcrypt hash match verification" },
                { step: "5", title: "Session Creation", desc: "Session record written, httpOnly cookie returned" },
                { step: "6", title: "Authorized Redirect", desc: "Frontend receives status 200, router pushes to dashboard" },
              ].map((item, idx) => (
                <div key={idx} className="relative flex flex-col gap-0.5 pb-2 last:pb-0">
                  <div className="absolute -left-[23px] top-0.5 size-4 rounded-full bg-[#ebdcc9] text-[#1a1917] font-extrabold text-[8px] flex items-center justify-center border-2 border-white">
                    {item.step}
                  </div>
                  <span className="font-bold text-[11px] text-[#1a1917]">{item.title}</span>
                  <span className="text-[10px] text-gray-500">{item.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* API Code Block */}
          <div className="flex flex-col gap-2">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#8e8a80]">API Endpoint Sample</h4>
            <div className="bg-[#fafafa] rounded-xl p-3 border border-neutral-100 font-mono text-[10px] text-gray-600 flex flex-col gap-1 overflow-x-auto select-text">
              <span className="text-emerald-700 font-bold">POST /api/authentication/login</span>
              <span className="text-gray-400">// Response JSON:</span>
              <pre className="mt-1">
{JSON.stringify(
  {
    id: "user_clx980h",
    name: "System Admin",
    email: "admin@srmap.edu.in",
    role: "admin",
    status: "active",
  },
  null,
  2
)}
              </pre>
            </div>
          </div>
        </div>

        {/* Register Page Schema Card */}
        <div className="border border-[#ebdcc9]/60 rounded-2xl bg-white p-6 flex flex-col gap-5 shadow-sm">
          <div className="flex items-center gap-3 border-b border-neutral-100 pb-3">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <Users className="size-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm">Register Page Database Storage</h3>
              <p className="text-[10px] text-gray-400">Account initialization & hashing</p>
            </div>
          </div>

          {/* Data Stored Badge/List */}
          <div className="flex flex-col gap-2">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#8e8a80]">Persisted Fields in DB</h4>
            <div className="flex flex-wrap gap-1.5">
              {["Full Name", "Email Address", "Password Hash", "Role", "Created At", "Status", "Department (optional)"].map((field) => (
                <span
                  key={field}
                  className="px-2 py-1 text-[10px] font-semibold bg-[#faf9f6] text-[#403e3a] border border-[#ebdcc9]/40 rounded-lg"
                >
                  {field}
                </span>
              ))}
            </div>
          </div>

          {/* Flowchart Timeline */}
          <div className="flex flex-col gap-3">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#8e8a80]">Registration Execution Flow</h4>
            <div className="flex flex-col gap-2 relative pl-4 border-l-2 border-[#ebdcc9]/60">
              {[
                { step: "1", title: "Registration Entry", desc: "User inputs Name, Email, Password & details" },
                { step: "2", title: "Frontend Validation", desc: "Field completeness & @srmap.edu.in domain validation" },
                { step: "3", title: "API Request Dispatch", desc: "POST /api/auth/sign-up/email payload transmitted" },
                { step: "4", title: "Domain & Uniqueness Checks", desc: "Backend checks email availability and domain constraints" },
                { step: "5", title: "Credential Hashing", desc: "Secure password hashing completed via better-auth" },
                { step: "6", title: "Database Commit", desc: "Prisma write operation registers user profile & status" },
              ].map((item, idx) => (
                <div key={idx} className="relative flex flex-col gap-0.5 pb-2 last:pb-0">
                  <div className="absolute -left-[23px] top-0.5 size-4 rounded-full bg-[#ebdcc9] text-[#1a1917] font-extrabold text-[8px] flex items-center justify-center border-2 border-white">
                    {item.step}
                  </div>
                  <span className="font-bold text-[11px] text-[#1a1917]">{item.title}</span>
                  <span className="text-[10px] text-gray-500">{item.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* API Code Block */}
          <div className="flex flex-col gap-2">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#8e8a80]">API Endpoint Sample</h4>
            <div className="bg-[#fafafa] rounded-xl p-3 border border-neutral-100 font-mono text-[10px] text-gray-600 flex flex-col gap-1 overflow-x-auto select-text">
              <span className="text-blue-700 font-bold">POST /api/auth/sign-up/email</span>
              <span className="text-gray-400">// Request Payload JSON:</span>
              <pre className="mt-1">
{JSON.stringify(
  {
    email: "student@srmap.edu.in",
    password: "••••••••",
    name: "John Doe",
  },
  null,
  2
)}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
