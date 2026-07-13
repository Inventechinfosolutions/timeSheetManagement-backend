-- Attendance correction requests (optional if synchronize=false)
CREATE TABLE IF NOT EXISTS attendance_correction_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id VARCHAR(255) NOT NULL,
  working_date DATE NOT NULL,
  requested_check_in_time TIME NOT NULL,
  requested_check_out_time TIME NOT NULL,
  reason TEXT NOT NULL,
  status ENUM('Pending', 'Approved', 'Rejected') NOT NULL DEFAULT 'Pending',
  reviewed_by VARCHAR(255) NULL,
  reviewed_at TIMESTAMP NULL,
  rejection_reason TEXT NULL,
  attendance_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
