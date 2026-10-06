USE timesheet;

CREATE TABLE IF NOT EXISTS `financial_year` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `financialYear` VARCHAR(50) NOT NULL,
  `fromYear` INT NOT NULL,
  `toYear` INT NOT NULL,
  `description` VARCHAR(255) DEFAULT NULL,
  `createdAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `createdBy` VARCHAR(255) DEFAULT NULL,
  `updatedBy` VARCHAR(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_financial_year_label` (`financialYear`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Optional initial seed data for recent and upcoming financial years
INSERT IGNORE INTO `financial_year` (`financialYear`, `fromYear`, `toYear`, `description`)
VALUES
  ('2023-2024', 2023, 2024, 'Financial Year 2023-2024'),
  ('2024-2025', 2024, 2025, 'Financial Year 2024-2025'),
  ('2025-2026', 2025, 2026, 'Financial Year 2025-2026'),
  ('2026-2027', 2026, 2027, 'Financial Year 2026-2027'),
  ('2027-2028', 2027, 2028, 'Financial Year 2027-2028');
