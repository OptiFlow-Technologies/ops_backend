// B5 — named column index constants for every sheet tab
// Verify against CLAUDE.md and actual route files before adding new sheets.

const DELEGATION = {
  TASK_ID:        0,  // A
  NAME:           1,  // B
  TASK_NAME:      2,  // C
  CREATED_DATE:   3,  // D
  DEADLINE:       4,  // E
  REVISION1:      5,  // F
  REVISION2:      6,  // G
  FINAL_DATE:     7,  // H
  REVISION_COUNT: 8,  // I
  PRIORITY:       9,  // J
  STATUS:         10, // K
  ASSIGN_BY:      11, // L
  WEEK_MONDAY:    12, // M
  APPROVAL:       13, // N
};

const CHECKLIST = {
  NAME:        0,  // A
  EMAIL:       1,  // B
  DEPT:        2,  // C
  TASK_ID:     3,  // D
  FREQ:        4,  // E
  TASK:        5,  // F
  PLANNED:     6,  // G
  ACTUAL:      7,  // H
  EMAIL_BUDDY: 8,  // I
  BUDDY_EMAIL: 9,  // J
  ARCHIVE:     10, // K
};

const EMPLOYEE = {
  EMPLOYEE_ID: 0,  // A
  NAME:        1,  // B
  MOBILE:      2,  // C
  PASSWORD:    3,  // D
  DEPARTMENT:  4,  // E
  CREATED:     5,  // F
  COMPANY:     6,  // G
  DOB:         7,  // H
  JOINING:     8,  // I
  PROFILE_PIC: 9,  // J
  DESIGNATION: 10, // K
  DOER_NAME:   11, // L
};

// HelpTicketsMaster and SupportTicketsMaster share the same column layout (A2:H)
const TICKET = {
  TICKET_ID:    0,  // A
  CREATED_BY:   1,  // B (name of creator)
  ASSIGNED_TO:  2,  // C (name of assignee)
  ISSUE:        3,  // D
  STATUS:       4,  // E
  CREATED_DATE: 5,  // F
  DONE_DATE:    6,  // G
  ATTACHMENT:   7,  // H
};

module.exports = { DELEGATION, CHECKLIST, EMPLOYEE, TICKET };
