import React from "react";
import { motion } from "motion/react";
import { ArrowLeft } from "lucide-react";
import imgAssessmentIntegrityLogo from "../../imports/LoginPortalIntegrityOs/assessment_integrity_logo.png";

interface PrivacyPolicyViewProps {
  handleBackToLogin: () => void;
}

export function PrivacyPolicyView({ handleBackToLogin }: PrivacyPolicyViewProps) {
  return (
    <motion.div
      key="privacy"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="min-h-screen w-full bg-[#f7f4ef] flex flex-col"
      style={{ position: "fixed", inset: 0, overflowY: "auto", zIndex: 50 }}
    >
      {/* Sticky top nav */}
      <header className="sticky top-0 z-20 bg-[#f7f4ef]/95 backdrop-blur-md border-b border-[#e2dbd0]">
        <div className="w-full max-w-[1400px] mx-auto px-5 sm:px-10 lg:px-20 h-[60px] flex items-center gap-3">
          <img
            src={imgAssessmentIntegrityLogo}
            alt="IntegrityOS Logo"
            className="h-8 w-auto object-contain flex-shrink-0"
          />
          <span className="text-[18px] font-bold tracking-[-0.5px] text-[#1a1917]">IntegrityOS</span>
          <span className="mx-2 text-[#c4bdb3]">/</span>
          <span className="text-[14px] font-medium text-[#6b6861]">Privacy Policy</span>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 w-full max-w-[1400px] mx-auto px-5 sm:px-10 lg:px-20 py-12 sm:py-16 lg:py-24">

        {/* Hero */}
        <div className="mb-12 sm:mb-16 lg:mb-20">
          <span className="inline-flex items-center rounded-full border border-[#e2dbd0] bg-[#ece7de] px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-[#9a8f80] mb-6">
            Legal
          </span>
          <h1 className="text-[40px] sm:text-[56px] lg:text-[72px] font-extrabold tracking-[-3px] leading-[1.05] text-[#1a1917] mb-5">
            Privacy Policy
          </h1>
          <p className="text-[15px] sm:text-[16px] text-[#6b6861]">
            Last Updated:{" "}
            <span className="font-semibold text-[#1a1917]">June 2026</span>
          </p>
          <p className="mt-5 text-[16px] sm:text-[18px] text-[#5e5a52] leading-[1.8] max-w-3xl">
            Assessment Integrity Agent is committed to protecting your privacy and maintaining the security of your personal information. This policy explains how we collect, use, and protect your data.
          </p>
        </div>

        <div className="border-t border-[#e2dbd0] mb-12 sm:mb-16" />

        {/* Document */}
        <div className="select-text max-w-[900px]">

          <Section number="1" title="Introduction">
            <p>Assessment Integrity Agent is committed to protecting user privacy and maintaining the security of personal information.</p>
            <p>This Privacy Policy explains how we collect, use, process, store, and protect user data.</p>
          </Section>

          <Section number="2" title="Information We Collect">
            <SubHeading>Personal Information</SubHeading>
            <ul>
              <li>Full Name</li>
              <li>Email Address</li>
              <li>Institution Name</li>
              <li>User Role (Student, Teacher, Administrator)</li>
              <li>Profile Information</li>
            </ul>
            <SubHeading>Authentication Information</SubHeading>
            <ul>
              <li>Google Account Information</li>
              <li>OAuth Profile Data</li>
              <li>Authentication Tokens</li>
            </ul>
            <SubHeading>Assessment Information</SubHeading>
            <ul>
              <li>Assessment Submissions</li>
              <li>Assignment Files</li>
              <li>Exam Responses</li>
              <li>Uploaded Documents</li>
              <li>Similarity Reports</li>
              <li>AI Detection Reports</li>
            </ul>
            <SubHeading>Technical Information</SubHeading>
            <ul>
              <li>IP Address</li>
              <li>Browser Information</li>
              <li>Device Information</li>
              <li>Operating System</li>
              <li>Access Logs</li>
              <li>Usage Analytics</li>
            </ul>
          </Section>

          <Section number="3" title="How We Use Information">
            <p>We use collected information to:</p>
            <ul>
              <li>Authenticate users.</li>
              <li>Provide platform functionality.</li>
              <li>Detect plagiarism and academic misconduct.</li>
              <li>Generate assessment reports.</li>
              <li>Improve AI models and platform performance.</li>
              <li>Monitor security threats.</li>
              <li>Provide support services.</li>
              <li>Meet legal and regulatory requirements.</li>
            </ul>
          </Section>

          <Section number="4" title="AI Processing">
            <p>Assessment submissions may be processed using:</p>
            <ul>
              <li>Large Language Models (LLMs)</li>
              <li>Machine Learning Models</li>
              <li>Similarity Detection Systems</li>
              <li>Content Analysis Engines</li>
            </ul>
            <p>Processing is performed solely for educational integrity, assessment validation, and reporting purposes.</p>
          </Section>

          <Section number="5" title="Data Sharing">
            <p>We do not sell personal information.</p>
            <p>Information may be shared with:</p>
            <ul>
              <li>Educational Institutions</li>
              <li>Authorized Administrators</li>
              <li>Cloud Infrastructure Providers</li>
              <li>AI Service Providers</li>
              <li>Legal Authorities when required by law</li>
            </ul>
            <p>Only the minimum necessary information will be shared.</p>
          </Section>

          <Section number="6" title="Data Security">
            <p>We implement industry-standard security measures including:</p>
            <ul>
              <li>HTTPS/TLS Encryption</li>
              <li>Secure Authentication</li>
              <li>Access Controls</li>
              <li>Role-Based Permissions</li>
              <li>Audit Logging</li>
              <li>Security Monitoring</li>
            </ul>
            <p>While we strive to protect data, no system can guarantee absolute security.</p>
          </Section>

          <Section number="7" title="Data Retention">
            <p>Information is retained only for as long as necessary to:</p>
            <ul>
              <li>Verify academic integrity.</li>
              <li>Generate reports.</li>
              <li>Meet institutional requirements.</li>
              <li>Comply with legal obligations.</li>
            </ul>
            <p>Data may be deleted or anonymized after retention requirements expire.</p>
          </Section>

          <Section number="8" title="User Rights">
            <p>Users may have the right to:</p>
            <ul>
              <li>Access Personal Data</li>
              <li>Correct Inaccurate Information</li>
              <li>Request Data Deletion</li>
              <li>Restrict Processing</li>
              <li>Export Data</li>
              <li>Withdraw Consent where applicable</li>
            </ul>
            <p>Requests may be submitted through platform support channels.</p>
          </Section>

          <Section number="9" title="Cookies and Tracking">
            <p>The platform may use:</p>
            <ul>
              <li>Essential Cookies</li>
              <li>Authentication Cookies</li>
              <li>Session Storage</li>
              <li>Analytics Technologies</li>
            </ul>
            <p>These technologies help improve platform functionality and user experience.</p>
          </Section>

          <Section number="10" title="Children's Privacy">
            <p>The platform is not intended for children below the minimum legal age unless authorized through an educational institution and applicable regulations.</p>
          </Section>

          <Section number="11" title="International Data Transfers">
            <p>Data may be processed and stored in different regions depending on infrastructure providers. Appropriate safeguards are implemented to protect transferred information.</p>
          </Section>

          <Section number="12" title="Third-Party Services">
            <p>The platform may integrate with:</p>
            <ul>
              <li>Authentication Providers</li>
              <li>Cloud Hosting Providers</li>
              <li>AI Model Providers</li>
              <li>Database Providers</li>
              <li>Analytics Services</li>
            </ul>
            <p>Users should review the privacy policies of integrated third-party services.</p>
          </Section>

          <Section number="13" title="Incident Response">
            <p>In the event of a security incident, we will:</p>
            <ul>
              <li>Investigate the incident.</li>
              <li>Mitigate risks.</li>
              <li>Notify affected parties where legally required.</li>
              <li>Cooperate with relevant authorities.</li>
            </ul>
          </Section>

          <Section number="14" title="Changes to This Policy">
            <p>We may update this Privacy Policy periodically. Updates become effective upon publication on the platform.</p>
          </Section>

          <Section number="15" title="Contact Information">
            <p>For privacy-related inquiries:</p>
            <p>
              Email:{" "}
              <a
                href="mailto:privacy@assessmentintegrity.ai"
                className="text-[#1a1917] font-semibold underline underline-offset-4 hover:text-[#4a4540] transition-colors"
              >
                privacy@assessmentintegrity.ai
              </a>
            </p>
          </Section>

          {/* Disclaimer */}
          <div className="mt-12 rounded-2xl border border-[#e2dbd0] bg-[#ece7de] p-6 sm:p-8 lg:p-10">
            <p className="text-[11px] font-bold uppercase tracking-widest text-[#9a8f80] mb-3">Disclaimer</p>
            <p className="text-[15px] sm:text-[16px] text-[#6b6861] leading-[1.8] italic">
              Assessment Integrity Agent provides AI-assisted analysis to support academic integrity efforts. AI-generated results should not be the sole basis for disciplinary or academic decisions. Human review and institutional oversight are strongly recommended before taking action based on system-generated findings.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-16 sm:mt-20 pt-10 border-t border-[#e2dbd0] max-w-[900px]">
          <motion.button
            type="button"
            onClick={handleBackToLogin}
            whileHover={{ scale: 1.015 }}
            whileTap={{ scale: 0.975 }}
            className="inline-flex items-center gap-2.5 rounded-xl bg-[#1a1917] px-7 py-4 text-[15px] font-semibold text-white shadow-md hover:bg-[#2d2b27] transition-all duration-200 cursor-pointer outline-none"
          >
            <ArrowLeft className="size-4" />
            Back to Login
          </motion.button>
          <p className="mt-5 text-[13px] text-[#9a8f80]">
            © 2026 Assessment Integrity Agent. All rights reserved.
          </p>
        </div>
      </main>
    </motion.div>
  );
}

function Section({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-10 sm:mb-14">
      <div className="flex items-baseline gap-4 mb-4 sm:mb-5">
        <span className="flex-shrink-0 text-[13px] font-bold tabular-nums text-[#b5ada4] w-7">{number}.</span>
        <h2 className="text-[22px] sm:text-[26px] lg:text-[28px] font-bold tracking-[-0.8px] text-[#1a1917]">
          {title}
        </h2>
      </div>
      <div className="ml-11 flex flex-col gap-3 text-[15px] sm:text-[16px] leading-[1.8] text-[#5e5a52] [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-2">
        {children}
      </div>
    </div>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-bold text-[#1a1917] text-[13px] uppercase tracking-widest mt-5 mb-2">
      {children}
    </p>
  );
}
