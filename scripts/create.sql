-- -- --------------------------
-- 1.academic_year_ratings
-- ----------------------------------

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
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `created_by` varchar(255) DEFAULT NULL,
  `updated_by` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_academic_year_ratings_employee_year` (`employee_id`,`academic_year`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci

-- -- --------------------------
-- 2.employee_attendance
-- ----------------------------------

CREATE TABLE `employee_attendance` (
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_id` varchar(255) NOT NULL,
  `working_date` date NOT NULL,
  `total_hours` decimal(10,2) DEFAULT NULL,
  `work_location` varchar(255) DEFAULT NULL,
  `status` enum('Full Day','Half Day','Leave','Pending','Not Updated','Weekend','Holiday','Absent','UPCOMING') DEFAULT NULL,
  `first_half` varchar(255) DEFAULT NULL,
  `second_half` varchar(255) DEFAULT NULL,
  `source_request_id` int DEFAULT NULL,
  `createdBy` varchar(255) DEFAULT NULL,
  `updatedBy` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=7478 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci

-- -- --------------------------
-- 3.employee_details
-- ----------------------------------

CREATE TABLE `employee_details` (
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `createdBy` varchar(255) DEFAULT NULL,
  `updatedBy` varchar(255) DEFAULT NULL,
  `id` int NOT NULL AUTO_INCREMENT,
  `full_name` varchar(255) NOT NULL,
  `employee_id` varchar(100) NOT NULL,
  `designation` varchar(200) NOT NULL,
  `email` varchar(255) NOT NULL,
  `password` varchar(255) DEFAULT NULL,
  `user_status` varchar(50) NOT NULL DEFAULT 'ACTIVE',
  `inactive_date` date DEFAULT NULL,
  `department` enum('IT','FIN','Information Technology','Recruitment / Talent Acquisition','HR Operations','Finance & Accounts','Account Management / Client Relations','IT / Systems Support') DEFAULT NULL,
  `employment_type` enum('FULL_TIMER','INTERN') DEFAULT NULL,
  `joining_date` date DEFAULT NULL,
  `role` enum('admin','employee','manager','team_lead','team lead','receptionist','ceo') DEFAULT NULL,
  `conversion_date` date DEFAULT NULL,
  `gender` enum('MALE','FEMALE') DEFAULT NULL,
  `month_status` enum('Pending','Submitted') NOT NULL DEFAULT 'Pending',
  `last_link_sent_at` timestamp NULL DEFAULT NULL,
  `intern_id` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_cad5572e380105cecf39a8193f` (`employee_id`),
  UNIQUE KEY `IDX_0856a80e7c23858ecad0b967e8` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=86 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci

-- -- --------------------------
-- 4.employee_notes
-- ----------------------------------

CREATE TABLE `employee_notes` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `employee_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `parent_note_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `projectName` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT '',
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `category` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Personal Note',
  `folder` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'General',
  `content` longtext COLLATE utf8mb4_unicode_ci,
  `rows` longtext COLLATE utf8mb4_unicode_ci,
  `files` longtext COLLATE utf8mb4_unicode_ci,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `createdBy` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updatedBy` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci

-- -- --------------------------
-- 5.intern_details
-- ----------------------------------

CREATE TABLE `intern_details` (
  `id` int NOT NULL AUTO_INCREMENT,
  `full_name` varchar(255) NOT NULL,
  `intern_id` varchar(100) NOT NULL,
  `department` enum('Information Technology','Recruitment / Talent Acquisition','HR Operations','Finance & Accounts','Account Management / Client Relations','IT / Systems Support') DEFAULT NULL,
  `designation` varchar(200) NOT NULL,
  `email` varchar(255) DEFAULT NULL,
  `joining_date` date DEFAULT NULL,
  `conversion_date` date DEFAULT NULL,
  `gender` enum('MALE','FEMALE') DEFAULT NULL,
  `role` enum('ADMIN','EMPLOYEE','MANAGER','TEAM LEAD','RECEPTIONIST') DEFAULT NULL,
  `user_status` enum('DRAFT','ACTIVE','RESET_REQUIRED','INACTIVE') DEFAULT 'ACTIVE',
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `createdBy` varchar(255) DEFAULT NULL,
  `updatedBy` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_UNIQUE_INTERN_ID` (`intern_id`),
  UNIQUE KEY `IDX_UNIQUE_INTERN_EMAIL` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=38 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci

-- -- --------------------------
-- 6.leave_notifications
-- ----------------------------------

CREATE TABLE `leave_notifications` (
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `createdBy` varchar(255) DEFAULT NULL,
  `updatedBy` varchar(255) DEFAULT NULL,
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_id` varchar(255) NOT NULL,
  `employee_name` varchar(255) NOT NULL,
  `request_type` varchar(255) NOT NULL,
  `from_date` date NOT NULL,
  `to_date` date NOT NULL,
  `is_read` tinyint DEFAULT NULL,
  `status` enum('Pending','Approved','Rejected','Requesting for Cancellation','Cancellation Approved','Cancellation Rejected','Requesting for Modification','Request Modified','Modification Approved','Modification Cancelled','Modification Rejected','Cancellation Reverted','Cancelled') NOT NULL DEFAULT 'Pending',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci

-- -- --------------------------
-- 7.leave_requests
-- ----------------------------------

CREATE TABLE `leave_requests` (
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `createdBy` varchar(255) DEFAULT NULL,
  `updatedBy` varchar(255) DEFAULT NULL,
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_id` varchar(255) NOT NULL,
  `request_type` varchar(255) NOT NULL,
  `from_date` date NOT NULL,
  `to_date` date NOT NULL,
  `title` varchar(255) NOT NULL,
  `description` text,
  `status` enum('Pending','Approved','Rejected','Cancellation Requested','Cancellation Approved','Cancellation Rejected','Cancellation Reverted','Modification Requested','Request Modified','Modification Approved','Modification Cancelled','Modification Rejected','Cancelled') NOT NULL DEFAULT 'Pending',
  `submitted_date` date DEFAULT NULL,
  `duration` int NOT NULL DEFAULT '0',
  `is_read` tinyint NOT NULL DEFAULT '0',
  `is_read_employee` tinyint NOT NULL DEFAULT '1',
  `request_modified_from` varchar(255) DEFAULT NULL,
  `reviewed_by` varchar(255) DEFAULT NULL,
  `is_half_day` tinyint(1) DEFAULT '0',
  `first_half` varchar(50) DEFAULT NULL,
  `second_half` varchar(50) DEFAULT NULL,
  `is_modified` tinyint(1) DEFAULT '0',
  `modification_count` int DEFAULT '0',
  `last_modified_date` timestamp NULL DEFAULT NULL,
  `cc_emails` text,
  `available_dates` text,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=335 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci

-- -- --------------------------
-- 8.manager_mapping
-- ----------------------------------

CREATE TABLE `manager_mapping` (
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `createdBy` varchar(255) DEFAULT NULL,
  `updatedBy` varchar(255) DEFAULT NULL,
  `id` int NOT NULL AUTO_INCREMENT,
  `manager_name` varchar(255) NOT NULL,
  `employee_id` varchar(255) NOT NULL,
  `employee_name` varchar(255) NOT NULL,
  `status` enum('ACTIVE','INACTIVE') NOT NULL,
  `department` varchar(255) DEFAULT NULL,
  `manager_id` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=79 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci

-- -- --------------------------
-- 9.master_department
-- ----------------------------------

CREATE TABLE `master_department` (
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `createdBy` varchar(255) DEFAULT NULL,
  `updatedBy` varchar(255) DEFAULT NULL,
  `id` int NOT NULL AUTO_INCREMENT,
  `departmentName` varchar(100) NOT NULL,
  `departmentCode` varchar(50) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_4555c40a07f75956f0f97392ba` (`departmentCode`)
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci

-- -- --------------------------
-- 10.master_holidays
-- ----------------------------------

CREATE TABLE `master_holidays` (
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `createdBy` varchar(255) DEFAULT NULL,
  `updatedBy` varchar(255) DEFAULT NULL,
  `id` int NOT NULL AUTO_INCREMENT,
  `date` date NOT NULL,
  `name` varchar(100) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci

-- -- --------------------------
-- 11.notifications
-- ----------------------------------

CREATE TABLE `notifications` (
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `createdBy` varchar(255) DEFAULT NULL,
  `updatedBy` varchar(255) DEFAULT NULL,
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_id` varchar(255) NOT NULL,
  `title` varchar(255) NOT NULL,
  `message` text NOT NULL,
  `type` varchar(255) NOT NULL DEFAULT 'general',
  `is_read` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2502 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci

-- -- --------------------------
-- 12.object_store
-- ----------------------------------

CREATE TABLE `object_store` (
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `createdBy` varchar(255) DEFAULT NULL,
  `updatedBy` varchar(255) DEFAULT NULL,
  `id` varchar(36) NOT NULL,
  `refId` int NOT NULL,
  `refType` varchar(255) NOT NULL,
  `entityId` int NOT NULL,
  `entityType` varchar(255) NOT NULL,
  `s3Key` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci

-- -- --------------------------
-- 13.password_reset_tokens
-- ----------------------------------

CREATE TABLE `password_reset_tokens` (
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `id` int NOT NULL AUTO_INCREMENT,
  `loginId` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `token` varchar(255) NOT NULL,
  `verified` tinyint(1) NOT NULL DEFAULT '0',
  `expiresAt` datetime(6) NOT NULL,
  `createdBy` varchar(255) DEFAULT NULL,
  `updatedBy` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci

-- -- --------------------------
-- 14.project_attachments
-- ----------------------------------

CREATE TABLE `project_attachments` (
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `createdBy` varchar(255) DEFAULT NULL,
  `updatedBy` varchar(255) DEFAULT NULL,
  `id` int NOT NULL AUTO_INCREMENT,
  `fileUrl` varchar(500) NOT NULL,
  `fileKey` varchar(500) NOT NULL,
  `fileName` varchar(255) DEFAULT NULL,
  `projectId` int NOT NULL,
  `modelId` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `FK_e55cc4bc84ecd45b89a33d7db26` (`projectId`),
  KEY `FK_60a15b41c24dea3eee97d903d84` (`modelId`),
  CONSTRAINT `FK_60a15b41c24dea3eee97d903d84` FOREIGN KEY (`modelId`) REFERENCES `project_models` (`id`) ON DELETE CASCADE,
  CONSTRAINT `FK_e55cc4bc84ecd45b89a33d7db26` FOREIGN KEY (`projectId`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci

-- -- --------------------------
-- 15.project_documents
-- ----------------------------------

CREATE TABLE `project_documents` (
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `createdBy` varchar(255) DEFAULT NULL,
  `updatedBy` varchar(255) DEFAULT NULL,
  `id` int NOT NULL AUTO_INCREMENT,
  `projectName` varchar(255) NOT NULL,
  `description` text,
  `department` enum('HR','IT','Finance','Designer','Business Analyst') NOT NULL,
  `projectPhotoUrl` varchar(500) DEFAULT NULL,
  `projectPhotoKey` varchar(500) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci

-- -- --------------------------
-- 16.project_models
-- ----------------------------------

CREATE TABLE `project_models` (
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `createdBy` varchar(255) DEFAULT NULL,
  `updatedBy` varchar(255) DEFAULT NULL,
  `id` int NOT NULL AUTO_INCREMENT,
  `modelName` varchar(255) NOT NULL,
  `projectId` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `FK_2747c9b1771d0a6d7312bb585b1` (`projectId`),
  CONSTRAINT `FK_2747c9b1771d0a6d7312bb585b1` FOREIGN KEY (`projectId`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci

-- -- --------------------------
-- 17.projects
-- ----------------------------------

CREATE TABLE `projects` (
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `createdBy` varchar(255) DEFAULT NULL,
  `updatedBy` varchar(255) DEFAULT NULL,
  `id` int NOT NULL AUTO_INCREMENT,
  `projectName` varchar(255) NOT NULL,
  `department` enum('HR','IT','Finance','Designer','Business Analyst') NOT NULL,
  `description` text,
  `photoUrl` varchar(500) DEFAULT NULL,
  `photoKey` varchar(500) DEFAULT NULL,
  `hasModels` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci

-- -- --------------------------
-- 18.quarterly_review_access_requests
-- ----------------------------------

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

-- -- --------------------------
-- 19.quarterly_review_ratings
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
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci

-- -- --------------------------
-- 20.review_assignments
-- ----------------------------------

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
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci

-- -- --------------------------
-- 21.role_permission
-- ----------------------------------

CREATE TABLE `role_permission` (
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `createdBy` varchar(255) DEFAULT NULL,
  `updatedBy` varchar(255) DEFAULT NULL,
  `id` int NOT NULL AUTO_INCREMENT,
  `role_id` int NOT NULL,
  `permission_id` varchar(255) NOT NULL,
  `value_yn` tinyint NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci

-- -- --------------------------
-- 22.timesheet_blocker
-- ----------------------------------

CREATE TABLE `timesheet_blocker` (
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `createdBy` varchar(255) DEFAULT NULL,
  `updatedBy` varchar(255) DEFAULT NULL,
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_id` varchar(255) NOT NULL,
  `blocked_from` date NOT NULL,
  `blocked_to` date NOT NULL,
  `reason` text,
  `blocked_by` varchar(255) NOT NULL,
  `blocked_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci

-- -- --------------------------
-- 23.users
-- ----------------------------------

CREATE TABLE `users` (
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `id` varchar(36) NOT NULL,
  `password` varchar(255) NOT NULL,
  `createdBy` varchar(255) DEFAULT NULL,
  `updatedBy` varchar(255) DEFAULT NULL,
  `loginId` varchar(255) DEFAULT NULL,
  `aliasLoginName` varchar(255) DEFAULT NULL,
  `userType` enum('ADMIN','EMPLOYEE','MANAGER','TEAM LEAD','RECEPTIONIST','CEO') NOT NULL,
  `status` enum('DRAFT','ACTIVE','RESET_REQUIRED','INACTIVE') NOT NULL DEFAULT 'DRAFT',
  `lastLoggedIn` datetime DEFAULT NULL,
  `changePasswordRequired` tinyint NOT NULL DEFAULT '0',
  `lastPasswordChanged` datetime DEFAULT NULL,
  `resetRequired` tinyint DEFAULT '1',
  `mobileVerification` tinyint DEFAULT NULL,
  `role` enum('admin','employee','manager','team_lead','team lead','receptionist','ceo') DEFAULT NULL,
  `intern_id` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_83a28d5385ec846e0c58c84961` (`loginId`),
  UNIQUE KEY `IDX_UNIQUE_LOGIN_ID` (`loginId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci