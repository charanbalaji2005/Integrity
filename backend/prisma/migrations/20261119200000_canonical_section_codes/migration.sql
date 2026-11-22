-- Section codes are matched as DEPT-LETTER ("CSE-A") by faculty scoping, study
-- materials, chat rooms and announcements. Older profiles stored just the
-- letter ("A"); resolve those from the user's department. Rows whose
-- department is unknown are left untouched (the app resolves them on save).
UPDATE "users"
SET "section" = (
    CASE upper(trim("department"))
        WHEN 'CSE' THEN 'CSE'
        WHEN 'COMPUTER SCIENCE & ENGINEERING' THEN 'CSE'
        WHEN 'ECE' THEN 'ECE'
        WHEN 'ELECTRONICS & COMMUNICATIONS' THEN 'ECE'
        WHEN 'EEE' THEN 'EEE'
        WHEN 'ELECTRICAL & ELECTRONICS ENGINEERING' THEN 'EEE'
        WHEN 'MEC' THEN 'MEC'
        WHEN 'MECHANICAL ENGINEERING' THEN 'MEC'
    END
) || '-' || upper(trim("section"))
WHERE trim("section") ~ '^[A-Za-z]$'
  AND upper(trim("department")) IN (
    'CSE', 'COMPUTER SCIENCE & ENGINEERING',
    'ECE', 'ELECTRONICS & COMMUNICATIONS',
    'EEE', 'ELECTRICAL & ELECTRONICS ENGINEERING',
    'MEC', 'MECHANICAL ENGINEERING'
  );
