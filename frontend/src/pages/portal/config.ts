import type { DataPageConfig } from './DataPage'

export const adminPages: Record<string, DataPageConfig> = {
  'face-enrolments': { title: 'Face Enrolments', description: 'Monitor enrolment readiness without exposing biometric data.', endpoint: '/admin/face-enrollments', columns: [{ key: 'studentName', label: 'Student' }, { key: 'registrationNumber', label: 'Registration' }, { key: 'sampleCount', label: 'Samples' }, { key: 'isActive', label: 'Status' }, { key: 'createdAt', label: 'Enrolled' }] },
  'users-and-roles': { title: 'Users and Roles', description: 'Audit account access, assigned roles, and activation state.', endpoint: '/admin/users', columns: [{ key: 'fullName', label: 'User' }, { key: 'email', label: 'Email' }, { key: 'role', label: 'Role' }, { key: 'isActive', label: 'Status' }] },
  'audit-logs': { title: 'Audit Logs', description: 'Trace security-sensitive actions across the platform.', endpoint: '/admin/audit-logs', columns: [{ key: 'action', label: 'Action' }, { key: 'actorUserId', label: 'Actor ID' }, { key: 'entityType', label: 'Entity' }, { key: 'ipAddress', label: 'IP address' }, { key: 'createdAt', label: 'Time' }] },
}

export const instructorPages: Record<string, DataPageConfig> = {
  'my-courses': { title: 'My Courses', description: 'View the courses assigned to your instructor account.', endpoint: '/instructor/courses', columns: [{ key: 'title', label: 'Course' }, { key: 'code', label: 'Code' }] },
  'live-attendance': { title: 'Live Attendance', description: 'Follow verified arrivals and departures as they happen.', endpoint: '/instructor/attendance', eyebrow: 'LIVE MONITOR', columns: [{ key: 'studentName', label: 'Student' }, { key: 'registrationNumber', label: 'Registration' }, { key: 'sessionTitle', label: 'Session' }, { key: 'status', label: 'Status' }, { key: 'checkInAt', label: 'Check-in' }] },
  'student-attendance': { title: 'Student Attendance', description: 'Review individual attendance outcomes across your courses.', endpoint: '/instructor/attendance', columns: [{ key: 'studentName', label: 'Student' }, { key: 'registrationNumber', label: 'Registration' }, { key: 'courseCode', label: 'Course' }, { key: 'minutesLate', label: 'Minutes late' }, { key: 'status', label: 'Status' }] },
  reports: { title: 'Reports', description: 'Access attendance summaries for your courses and sessions.', endpoint: '/instructor/reports/attendance', columns: [{ key: 'totalAttendanceRecords', label: 'Attendance records' }, { key: 'byStatus', label: 'Status breakdown' }] },
}
