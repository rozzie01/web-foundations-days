# School Database Design

## Tables

### students
Stores one row per student: an `id` (primary key), the student's `name` and
a unique `email`. The unique email stops the same address being registered
twice.

### courses
Stores one row per course: an `id` (primary key), a unique course `code`
(such as WEB101) and a `title`.

### enrolments
Records the fact that a student is taking a course. Each row has its own `id`,
a `student_id` and a `course_id` (both foreign keys), and the student's
`grade` for that course. A unique rule on (`student_id`, `course_id`) stops
the same student enrolling on the same course twice.

## Relationships

- **One student has many enrolments** (one-to-many). Each enrolment belongs
  to exactly one student, so `enrolments.student_id` points to `students.id`.
- **One course has many enrolments** (one-to-many). Each enrolment belongs to
  exactly one course, so `enrolments.course_id` points to `courses.id`.
- **Students and courses are many-to-many.** A student can take many courses,
  and a course can have many students.

### Why a join table is needed
A foreign key can only point to one row. A single `course_id` column on
`students` would limit each student to one course, and a `student_id` column
on `courses` would limit each course to one student. Putting lists of ids in a
single column breaks the rule that each column holds one value and makes
searching and updating hard. The `enrolments` table solves this by storing
one row per student-and-course pair. It is also the natural place for the
grade, because a grade belongs to the pair and not to the student or the
course alone.

## Index

I would add an index on `enrolments(course_id)`. The most common question
about a course is "which students are on it?", and the queries for the
class list and for the number of students per course both search by
`course_id`. Without an index the database would read every enrolment row.
With one it can jump straight to the matching rows. The cost is slightly
slower writes and a little extra storage, which is a good trade for a column
that is searched often. (The unique rule on `student_id` and `course_id`
already gives a fast lookup starting from the student.)

## SQL or NoSQL?

I would choose SQL, for example SQLite or PostgreSQL. School data is clearly
structured and full of relationships: students, courses and the enrolments
between them. SQL handles relationships well with foreign keys and JOINs, and
it can enforce rules inside the database itself, such as unique emails, grades
between 0 and 100 and no duplicate enrolments. Correctness matters for
records like grades, so the guarantees of a relational database are valuable.
A NoSQL document database could work if the data became very flexible or had
to scale across many servers, but it would make questions such as "which
students are on this course?" harder, and the rules would have to be
enforced in application code instead.