-- -- --------------------------
-- -1.quarterly_reviews
-- ----------------------------------
CREATE TABLE `quarterly_reviews` (
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_id` varchar(100) NOT NULL,
  `quarter` varchar(50) NOT NULL,
  `financial_year` varchar(50) DEFAULT NULL,
  `status` varchar(50) NOT NULL DEFAULT 'DRAFT',
  `overview` text,
  `projects` json DEFAULT NULL,
  `learning_goals` json DEFAULT NULL,
  `self_rating` json DEFAULT NULL,
  `average_rating` decimal(3,1) DEFAULT NULL,
  `company_environment` json DEFAULT NULL,
  `submitted_date` timestamp NULL DEFAULT NULL,
  `manager_name` varchar(150) DEFAULT NULL,
  `review_status` varchar(50) DEFAULT NULL,
  `final_rating` varchar(100) DEFAULT NULL,
  `reviewed_on` timestamp NULL DEFAULT NULL,
  `ratings` json DEFAULT NULL,
  `strengths` text,
  `improvements` text,
  `remarks` text,
  `evaluator_name` varchar(150) DEFAULT NULL,
  `evaluator_role` varchar(50) DEFAULT NULL,
  `auto_submitted` tinyint NOT NULL DEFAULT '0',
  `access_until` timestamp NULL DEFAULT NULL,
  `is_reopened` tinyint NOT NULL DEFAULT '0',
  `evaluator_id` varchar(100) DEFAULT NULL,
  `assignment_id` int DEFAULT NULL,
  `submission_type` varchar(50) DEFAULT NULL,
  `deadline_at` timestamp NULL DEFAULT NULL,
  `access_request_eligible_until` timestamp NULL DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `createdBy` varchar(255) DEFAULT NULL,
  `updatedBy` varchar(255) DEFAULT NULL,
  `assigned_at` timestamp NULL DEFAULT NULL,
  `notes` text,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci

-- ---------------------------------------------------
-- -2.review_assignments
-- ---------------------------------------------------

CREATE TABLE `review_assignments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_id` varchar(100) NOT NULL,
  `employee_name` varchar(150) DEFAULT NULL,
  `role` varchar(50) DEFAULT 'EMPLOYEE',
  `quarter` varchar(50) NOT NULL,
  `financial_year` varchar(50) DEFAULT NULL,
  `assigned_by_id` varchar(100) NOT NULL,
  `assigned_by_name` varchar(150) DEFAULT NULL,
  `assigned_by_role` varchar(50) NOT NULL,
  `assigned_at` timestamp NOT NULL,
  `deadline_at` timestamp NOT NULL,
  `status` varchar(50) NOT NULL DEFAULT 'ASSIGNED',
  `is_access_open` tinyint NOT NULL DEFAULT '1',
  `access_request_eligible_until` timestamp NULL DEFAULT NULL,
  `notes` text,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `createdBy` varchar(255) DEFAULT NULL,
  `updatedBy` varchar(255) DEFAULT NULL,
  `assignment_mode` varchar(20) NOT NULL DEFAULT 'INDIVIDUAL',
  `reminder_2d_sent_at` timestamp NULL DEFAULT NULL COMMENT 'Set when the 2-day deadline approaching email + notification was sent',
  `reminder_1d_sent_at` timestamp NULL DEFAULT NULL COMMENT 'Set when the 1-day deadline approaching email + notification was sent',
  `reminder_today_sent_at` timestamp NULL DEFAULT NULL COMMENT 'Set when the same-day deadline approaching email + notification was sent',
  `deadline_expired_notified_at` timestamp NULL DEFAULT NULL COMMENT 'Set when the deadline-completed / request-access-again warning was sent',
  PRIMARY KEY (`id`),
  KEY `idx_review_assignments_deadline_status` (`status`,`is_access_open`,`deadline_at`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci

-- ---------------------------------------------------
-- -3.quarterly_review_access_requests
-- ---------------------------------------------------

CREATE TABLE `quarterly_review_access_requests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_id` varchar(100) NOT NULL,
  `employee_name` varchar(150) DEFAULT NULL,
  `quarter` varchar(50) NOT NULL,
  `user_role` varchar(50) NOT NULL,
  `reason` text,
  `status` varchar(50) NOT NULL DEFAULT 'PENDING',
  `manager_name` varchar(150) DEFAULT NULL,
  `approved_by_id` varchar(100) DEFAULT NULL,
  `approved_by_name` varchar(150) DEFAULT NULL,
  `approved_by_role` varchar(50) DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `access_until` timestamp NULL DEFAULT NULL,
  `rejection_reason` text,
  `rejected_by_id` varchar(100) DEFAULT NULL,
  `rejected_by_name` varchar(150) DEFAULT NULL,
  `rejected_at` timestamp NULL DEFAULT NULL,
  `assignment_id` int DEFAULT NULL,
  `requested_at` timestamp NULL DEFAULT NULL,
  `actioned_by_id` varchar(100) DEFAULT NULL,
  `actioned_by_name` varchar(150) DEFAULT NULL,
  `actioned_at` timestamp NULL DEFAULT NULL,
  `extension_deadline` timestamp NULL DEFAULT NULL,
  `remarks` text,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `createdBy` varchar(255) DEFAULT NULL,
  `updatedBy` varchar(255) DEFAULT NULL,
  `attempt_number` int NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci

-- ---------------------------------------------------
-- 4.academic_year_ratings
-- ---------------------------------------------------

CREATE TABLE `academic_year_ratings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_id` varchar(100) NOT NULL,
  `academic_year` varchar(50) NOT NULL,
  `q1_rating` varchar(50) DEFAULT NULL,
  `q2_rating` varchar(50) DEFAULT NULL,
  `q3_rating` varchar(50) DEFAULT NULL,
  `q4_rating` varchar(50) DEFAULT NULL,
  `overall_rating` decimal(3,1) DEFAULT NULL,
  `evaluated_quarters_count` int NOT NULL DEFAULT '0',
  `total_quarters` int NOT NULL DEFAULT '4',
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_academic_year_employee` (`employee_id`,`academic_year`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci

