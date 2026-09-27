import React from "react";
import { motion } from "motion/react";
import { ArrowLeft } from "lucide-react";
import imgAssessmentIntegrityLogo from "../../imports/LoginPortalIntegrityOs/assessment_integrity_logo.png";

interface TermsAndConditionsViewProps {
  handleBackToLogin: () => void;
}

export function TermsAndConditionsView({ handleBackToLogin }: TermsAndConditionsViewProps) {
  return (
    <motion.div
      key="terms"
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
          <span className="text-[14px] font-medium text-[#6b6861]">Terms &amp; Conditions</span>
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
            Terms &amp; Conditions
          </h1>
          <p className="text-[15px] sm:text-[16px] text-[#6b6861]">
            Last Updated:{" "}
            <span className="font-semibold text-[#1a1917]">June 2026</span>
          </p>
          <p className="mt-5 text-[16px] sm:text-[18px] text-[#5e5a52] leading-[1.8] max-w-3xl">
            By accessing or using Assessment Integrity Agent, you agree to comply with and be bound by these Terms and Conditions. Please read them carefully before proceeding.
          </p>
        </div>

        <div className="border-t border-[#e2dbd0] mb-12 sm:mb-16" />

        {/* Document */}
        <div className="select-text max-w-[900px]">

          <Section number="1" title="Introduction">
            <p>Welcome to Assessment Integrity Agent ("Platform", "Service", "We", "Us", or "Our"). By accessing or using the platform, you agree to comply with and be bound by these Terms and Conditions.</p>
            <p>Assessment Integrity Agent provides AI-powered assessment integrity services, including plagiarism detection, AI-generated content analysis, similarity checking, assessment monitoring, violation detection, reporting, and analytics.</p>
            <p>If you do not agree with these Terms and Conditions, you must discontinue use of the platform immediately.</p>
          </Section>

          <Section number="2" title="Eligibility">
            <p>You must be at least 13 years old or meet the minimum legal age requirement in your jurisdiction. If you are using the platform on behalf of an educational institution or organization, you represent that you are authorized to do so.</p>
          </Section>

          <Section number="3" title="Services">
            <p>The platform may provide:</p>
            <ul>
              <li>Plagiarism Detection</li>
              <li>AI Content Detection</li>
              <li>Similarity Analysis</li>
              <li>Assessment Monitoring</li>
              <li>Academic Integrity Reporting</li>
              <li>Student and Assessment Management</li>
              <li>Administrative Dashboards</li>
              <li>Analytics and Insights</li>
              <li>API Integrations</li>
            </ul>
            <p>We reserve the right to modify, suspend, or discontinue any service at any time.</p>
          </Section>

          <Section number="4" title="User Responsibilities">
            <p>Users agree to:</p>
            <ul>
              <li>Provide accurate and complete information.</li>
              <li>Maintain the confidentiality of account credentials.</li>
              <li>Use the platform only for lawful educational purposes.</li>
              <li>Respect intellectual property rights.</li>
              <li>Avoid uploading malicious or harmful content.</li>
              <li>Comply with institutional policies and academic regulations.</li>
            </ul>
          </Section>

          <Section number="5" title="Academic Integrity">
            <p>Users shall not:</p>
            <ul>
              <li>Submit plagiarized content intentionally.</li>
              <li>Use unauthorized AI tools during assessments where prohibited.</li>
              <li>Manipulate assessment results.</li>
              <li>Attempt to bypass monitoring or detection systems.</li>
              <li>Impersonate another individual.</li>
            </ul>
            <p>Violations may be reported to authorized administrators or institutions.</p>
          </Section>

          <Section number="6" title="AI Analysis Disclaimer">
            <p>Assessment Integrity Agent uses Artificial Intelligence, Machine Learning models, and similarity detection systems.</p>
            <p>AI-generated results are probabilistic and may contain inaccuracies. The platform does not guarantee 100% accuracy in detecting plagiarism, AI-generated content, or academic misconduct.</p>
            <p>All disciplinary and academic decisions should be reviewed and validated by qualified educators or administrators.</p>
          </Section>

          <Section number="7" title="User Content">
            <p>Users retain ownership of content uploaded to the platform.</p>
            <p>By uploading content, users grant Assessment Integrity Agent a limited license to process, analyze, store, and generate reports for integrity verification and platform functionality.</p>
          </Section>

          <Section number="8" title="Intellectual Property">
            <p>All software, designs, logos, branding, documentation, algorithms, dashboards, reports, and platform content remain the property of Assessment Integrity Agent unless otherwise stated.</p>
            <p>Unauthorized reproduction, distribution, or modification is prohibited.</p>
          </Section>

          <Section number="9" title="Account Security">
            <p>Users are responsible for protecting their accounts and passwords. Any unauthorized access or suspicious activity must be reported immediately.</p>
          </Section>

          <Section number="10" title="Prohibited Activities">
            <p>Users may not:</p>
            <ul>
              <li>Attempt unauthorized access to systems.</li>
              <li>Exploit vulnerabilities.</li>
              <li>Upload malware or malicious code.</li>
              <li>Reverse engineer the platform.</li>
              <li>Interfere with platform operations.</li>
              <li>Collect information from other users without authorization.</li>
            </ul>
          </Section>

          <Section number="11" title="Data Retention">
            <p>Data may be retained for assessment verification, auditing, compliance requirements, institutional policies, and service improvement purposes.</p>
          </Section>

          <Section number="12" title="Third-Party Services">
            <p>The platform may integrate with third-party providers including authentication services, cloud hosting providers, analytics tools, and AI service providers. Use of such services is subject to their respective terms and policies.</p>
          </Section>

          <Section number="13" title="Limitation of Liability">
            <p>Assessment Integrity Agent shall not be liable for:</p>
            <ul>
              <li>Indirect or consequential damages.</li>
              <li>Academic decisions made by institutions.</li>
              <li>False positives or false negatives generated by AI systems.</li>
              <li>Service interruptions beyond reasonable control.</li>
              <li>Data loss caused by third-party providers.</li>
            </ul>
          </Section>

          <Section number="14" title="Termination">
            <p>We reserve the right to suspend or terminate access if users violate these Terms, engage in fraudulent activity, or pose security risks.</p>
          </Section>

          <Section number="15" title="Changes to Terms">
            <p>These Terms may be updated periodically. Continued use of the platform after updates constitutes acceptance of the revised Terms.</p>
          </Section>

          <Section number="16" title="Governing Law">
            <p>These Terms shall be governed by applicable laws and regulations in the jurisdiction where the platform operates.</p>
          </Section>

          <Section number="17" title="Contact">
            <p>For questions regarding these Terms and Conditions:</p>
            <p>
              Email:{" "}
              <a
                href="mailto:support@assessmentintegrity.ai"
                className="text-[#1a1917] font-semibold underline underline-offset-4 hover:text-[#4a4540] transition-colors"
              >
                support@assessmentintegrity.ai
              </a>
            </p>
          </Section>
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
        <h2 className="text-[18px] sm:text-[20px] lg:text-[22px] font-bold tracking-[-0.8px] text-[#1a1917]">
          {title}
        </h2>
      </div>
      <div className="ml-11 flex flex-col gap-3 text-[15px] sm:text-[16px] leading-[1.8] text-[#5e5a52] [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-2">
        {children}
      </div>
    </div>
  );
}
