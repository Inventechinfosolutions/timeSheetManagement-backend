-- ==============================================================================
-- Migration: Meeting Room & Slot Booking Module
--   1. meeting_rooms: Admin-configured meeting rooms (floor, room number, sq ft)
--   2. meeting_room_bookings: Booked slots with organizer, department & state
--   3. meeting_room_booking_members: Invited employees per booking
-- ==============================================================================

CREATE TABLE IF NOT EXISTS `meeting_rooms` (
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `createdBy` varchar(255) DEFAULT NULL,
  `updatedBy` varchar(255) DEFAULT NULL,
  `id` int NOT NULL AUTO_INCREMENT,
  `floor_number` varchar(50) NOT NULL,
  `room_number` varchar(100) NOT NULL,
  `dimension_sq_ft` decimal(10,2) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_meeting_room_floor_number` (`floor_number`, `room_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `meeting_room_bookings` (
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `createdBy` varchar(255) DEFAULT NULL,
  `updatedBy` varchar(255) DEFAULT NULL,
  `id` int NOT NULL AUTO_INCREMENT,
  `room_id` int NOT NULL,
  `booked_by_user_id` varchar(36) NOT NULL,
  `booked_by_login_id` varchar(100) NOT NULL,
  `booked_by_name` varchar(255) NOT NULL,
  `booked_by_email` varchar(255) DEFAULT NULL,
  `department` varchar(100) DEFAULT NULL,
  `booking_date` date NOT NULL,
  `start_time` time NOT NULL,
  `end_time` time NOT NULL,
  `title` varchar(255) DEFAULT NULL,
  `booking_state` ENUM('BOOKED', 'CANCELLED') NOT NULL DEFAULT 'BOOKED',
  `cancelled_by` varchar(100) DEFAULT NULL,
  `cancelled_at` datetime DEFAULT NULL,
  `last_reminder_sent_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `IDX_booking_room_date_state` (`room_id`, `booking_date`, `booking_state`),
  KEY `IDX_booking_user_date` (`booked_by_login_id`, `booking_date`),
  KEY `IDX_booking_dept_date` (`department`, `booking_date`),
  CONSTRAINT `FK_booking_meeting_room` FOREIGN KEY (`room_id`) REFERENCES `meeting_rooms` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `meeting_room_booking_members` (
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `createdBy` varchar(255) DEFAULT NULL,
  `updatedBy` varchar(255) DEFAULT NULL,
  `id` int NOT NULL AUTO_INCREMENT,
  `booking_id` int NOT NULL,
  `employee_id` varchar(100) NOT NULL,
  `full_name` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `department` varchar(100) DEFAULT NULL,
  `designation` varchar(200) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `IDX_booking_member_booking` (`booking_id`),
  CONSTRAINT `FK_booking_member_booking` FOREIGN KEY (`booking_id`) REFERENCES `meeting_room_bookings` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
