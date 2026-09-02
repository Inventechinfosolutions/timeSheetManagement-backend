-- -- --------------------------
-- -1.quarterly_reviews
-- ----------------------------------
CREATE TABLE `quarterly_reviews` (
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_id` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `quarter` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('Draft','Submitted') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Draft',
  `overview` text COLLATE utf8mb4_unicode_ci,
  `projects` json DEFAULT NULL,
  `learning_goals` json DEFAULT NULL,
  `self_rating` json DEFAULT NULL,
  `average_rating` decimal(3,1) DEFAULT NULL,
  `company_environment` json DEFAULT NULL,
  `submitted_date` timestamp NULL DEFAULT NULL,
  `createdAt` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `createdBy` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updatedBy` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `manager_name` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------
-- 2.
-- --------------------------------------------------------