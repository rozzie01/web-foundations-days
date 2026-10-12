-- School database
PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS enrolments;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS students;

-- ---------- Tables ----------
CREATE TABLE students (
  id     INTEGER PRIMARY KEY,
  name   TEXT NOT NULL,
  email  TEXT NOT NULL UNIQUE
);

CREATE TABLE courses (
  id     INTEGER PRIMARY KEY,
  code   TEXT NOT NULL UNIQUE,
  title  TEXT NOT NULL
);

CREATE TABLE enrolments (
  id          INTEGER PRIMARY KEY,
  student_id  INTEGER NOT NULL,
  course_id   INTEGER NOT NULL,
  grade       INTEGER CHECK (grade BETWEEN 0 AND 100),
  UNIQUE (student_id, course_id),
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (course_id)  REFERENCES courses(id)  ON DELETE CASCADE
);

CREATE INDEX idx_enrolments_course_id ON enrolments(course_id);

-- ---------- Sample data ----------
INSERT INTO students (id, name, email) VALUES
  (1, 'Amina Otieno',  'amina@example.com'),
  (2, 'Brian Kamau',   'brian@example.com'),
  (3, 'Grace Wanjiku', 'grace@example.com'),
  (4, 'David Mutua',   'david@example.com');

INSERT INTO courses (id, code, title) VALUES
  (1, 'WEB101', 'Web Development'),
  (2, 'DB101',  'Databases'),
  (3, 'PY101',  'Python Programming');

INSERT INTO enrolments (student_id, course_id, grade) VALUES
  (1, 1, 85),
  (1, 2, 78),
  (1, 3, 90),
  (2, 1, 92),
  (3, 1, 70),
  (3, 2, 66);

  -- ---------- Queries ----------

-- 1. All courses for one student (by name)
SELECT courses.title, enrolments.grade
FROM enrolments
JOIN students ON enrolments.student_id = students.id
JOIN courses  ON enrolments.course_id  = courses.id
WHERE students.name = 'Amina Otieno';

-- 2. All students on one course
SELECT students.name, students.email
FROM enrolments
JOIN students ON enrolments.student_id = students.id
JOIN courses  ON enrolments.course_id  = courses.id
WHERE courses.title = 'Web Development';

-- 3. Number of students per course
SELECT courses.title, COUNT(enrolments.id) AS student_count
FROM courses
LEFT JOIN enrolments ON enrolments.course_id = courses.id
GROUP BY courses.id;

-- 4. Students who have no enrolments
SELECT students.name
FROM students
LEFT JOIN enrolments ON enrolments.student_id = students.id
WHERE enrolments.id IS NULL;

-- 5. Update one enrolment's grade (Amina's grade in Databases)
UPDATE enrolments
SET grade = 88
WHERE student_id = 1 AND course_id = 2;

-- Check the update worked
SELECT students.name, courses.title, enrolments.grade
FROM enrolments
JOIN students ON enrolments.student_id = students.id
JOIN courses  ON enrolments.course_id  = courses.id
WHERE students.id = 1 AND courses.id = 2;

