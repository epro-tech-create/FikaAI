-- CCD membership IDs from DIT CCD membership.pdf (CCD-2026-015 … CCD-2026-085).
-- Match students by registration_number, then set students.membership_id
-- (the public student ID). Also strips a CCD prefix from full_name if present.
--
-- Run after migration 0008 (membership_id column) is applied.
-- 1) Paste this file into the production Postgres console.
-- 2) Check the PREVIEW result.
-- 3) Uncomment the UPDATE block and run again.

BEGIN;

CREATE TEMP TABLE ccd_membership (
    membership_id text PRIMARY KEY,
    roster_name text NOT NULL,
    registration_number text NOT NULL
);

INSERT INTO ccd_membership (membership_id, roster_name, registration_number) VALUES
('CCD-2026-015', 'BETTY AFRAEL NGOILALE', '240545445690'),
('CCD-2026-016', 'Halima Shabani Juma', '250242491538'),
('CCD-2026-017', 'Shadrack jackson', '24062381851'),
('CCD-2026-018', 'IDDY BASHIRU RASHIDI', '240242401917'),
('CCD-2026-019', 'JENIFA F. MSABAHA', '240242415198'),
('CCD-2026-020', 'Eliatosha Festo', '240242422525'),
('CCD-2026-021', 'Hamis Nurudini', '240242458313'),
('CCD-2026-022', 'Michael Kambona', '240242459345'),
('CCD-2026-023', 'Daniel Michael', '240242467231'),
('CCD-2026-024', 'DEREK JOHNSON ELVIS', '250242484483'),
('CCD-2026-025', 'Allen Byabato', '23062392791'),
('CCD-2026-026', 'Hanston Constantine Anga', '23062307161'),
('CCD-2026-027', 'NANCY GOSBERT', '240242448264'),
('CCD-2026-028', 'Akram Mussa', '230627451607'),
('CCD-2026-029', 'Mohamed yusufu Mbaga', '230242404655'),
('CCD-2026-030', 'Lilian Focus', '240242414258'),
('CCD-2026-031', 'Makoye kazungu', '250242474591'),
('CCD-2026-032', 'Boniface Sylivester', '240242424497'),
('CCD-2026-033', 'Emmanuel Haule', '24062337739'),
('CCD-2026-034', 'Amani Bashiru Ali', '240242472751'),
('CCD-2026-035', 'DAUD SELEMANI', '250242485225'),
('CCD-2026-036', 'Bakari Juma Abdurabi', '240242477743'),
('CCD-2026-037', 'Ella Essau Ng''umbi', '240242472470'),
('CCD-2026-038', 'Alexander Mwita', '24062313441'),
('CCD-2026-039', 'PETER JACKSON LUCASI', '240242462943'),
('CCD-2026-040', 'Rwechungura Lutta', '250628381281'),
('CCD-2026-041', 'EPHRAHIM LUSENGA DAVID', '240242493807'),
('CCD-2026-042', 'Salimin Buruhani Shechonge', '240242411437'),
('CCD-2026-043', 'Derek Kulet Lemunke', '240242495661'),
('CCD-2026-044', 'Blair Kaboneka', '240242485001'),
('CCD-2026-045', 'Anna Ndemfoo', '250242443836'),
('CCD-2026-046', 'Ramla Ahmad Kilanda', '250242452746'),
('CCD-2026-047', 'Priscus Francis Tesha', '250647472173'),
('CCD-2026-048', 'HADIJA KILANDA', '240242475580'),
('CCD-2026-049', 'Joshua Joseph Lams', '240627449007'),
('CCD-2026-050', 'HAPPY CHINIKO', '240242466332'),
('CCD-2026-051', 'Mwajibu Mohamed Roda', '240242413276'),
('CCD-2026-052', 'Yohana Elias', '24062311445'),
('CCD-2026-053', 'LEONE ALOYCE TESHA', '23062367215'),
('CCD-2026-054', 'GETRUDE DEODATUS', '230242405314'),
('CCD-2026-055', 'ATTIF MBARAK', '240229469443'),
('CCD-2026-056', 'DEBORA DESDEUS SWAI', '240242496248'),
('CCD-2026-057', 'DICKSON CHARLES NGASA', '250242488963'),
('CCD-2026-058', 'MARK GAUDENCE', '240222435493'),
('CCD-2026-059', 'WINNIEFRIDA MICHAEL MASSAWE', '240242435592'),
('CCD-2026-060', 'NARGIS M IBRAHIM', '240242424422'),
('CCD-2026-061', 'SAMWEL M.KITUKA', '250141452191'),
('CCD-2026-062', 'Jowabu Kedmundi Kachakila', '230242497733'),
('CCD-2026-063', 'OSCAR .O. MWAMKAMBA', '230229497493'),
('CCD-2026-064', 'EBENEZER .C. NNKO', '230242471423'),
('CCD-2026-065', 'DEUS EFRAM MASSAWE', '240242404101'),
('CCD-2026-066', 'CLEVER PHILIMONI', '24022379533'),
('CCD-2026-067', 'Gloria jabiri Assenga', '240242466548'),
('CCD-2026-068', 'WAFAA GHALIB SALUM', '240242497238'),
('CCD-2026-069', 'Winfrida Charles Frednand', '230242461200'),
('CCD-2026-070', 'JOYCE PETER MAX', '240242471670'),
('CCD-2026-071', 'DAUDI MUSA MLILA', '240242422800'),
('CCD-2026-072', 'DAUDI SULEIMAN', '250229485357'),
('CCD-2026-073', 'DANIEL WILLIAM SAMWEL', '240222436657'),
('CCD-2026-074', 'RAYMOND FABIAN FANUEL', '240242459857'),
('CCD-2026-075', 'JOSEPHAT RAPHAEL NKUNGUGU', '250242439131'),
('CCD-2026-076', 'Juma Khalid Mpume', '240242423739'),
('CCD-2026-077', 'ISDORY HERMAN MWENGU', '240242413821'),
('CCD-2026-078', 'AUGUSTINE JOHN PAULINE', '240242474799'),
('CCD-2026-079', 'EZEKIEL PROTAS EZEKIEL', '240141472009'),
('CCD-2026-080', 'Bertha mbezi', '230242469344'),
('CCD-2026-081', 'WILSON CHARLES MAZOYA', '240242459253'),
('CCD-2026-082', 'Juma Mohamed Makumbusho', '250242425593'),
('CCD-2026-083', 'YOHANA MARTIN NG''OMA', '240242409571'),
('CCD-2026-084', 'Joshua Moris Sinkala', '240242403731'),
('CCD-2026-085', 'LILIAN GUSTAFU BARTALOME', '250242429314');

-- PREVIEW: matched students and roster rows that are not in the database yet.
SELECT
    m.membership_id,
    m.registration_number,
    m.roster_name,
    u.full_name AS current_name,
    CASE
        WHEN u.id IS NULL THEN 'NOT IN DATABASE'
        WHEN s.membership_id = m.membership_id THEN 'ALREADY UPDATED'
        ELSE 'WILL UPDATE'
    END AS action
FROM ccd_membership m
LEFT JOIN students s ON s.registration_number = m.registration_number
LEFT JOIN users u ON u.id = s.user_id
ORDER BY m.membership_id;

-- Uncomment the block below after the preview looks correct.
--
-- UPDATE students AS s
-- SET membership_id = m.membership_id
-- FROM ccd_membership AS m
-- WHERE s.registration_number = m.registration_number;
--
-- UPDATE users AS u
-- SET full_name = regexp_replace(u.full_name, '^CCD-2026-[0-9]{3}( · )?', '')
-- FROM students AS s
-- WHERE u.id = s.user_id
--   AND u.role = 'student'
--   AND u.full_name ~ '^CCD-2026-[0-9]{3}';

COMMIT;
