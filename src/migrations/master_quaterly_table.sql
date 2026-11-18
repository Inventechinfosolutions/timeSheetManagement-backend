USE timesheet;

-- Create quater table matching BaseEntity structure
CREATE TABLE IF NOT EXISTS `quater` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `quaterLabel` VARCHAR(50) NOT NULL,
  `fromMonth` VARCHAR(50) NOT NULL,
  `toMonth` VARCHAR(50) NOT NULL,
  `description` VARCHAR(150) DEFAULT NULL,
  `createdAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `createdBy` VARCHAR(255) DEFAULT NULL,
  `updatedBy` VARCHAR(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_quater_label` (`quaterLabel`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert initial quarters if not present
INSERT IGNORE INTO `quater` (`quaterLabel`, `fromMonth`, `toMonth`, `description`)
VALUES
  ('Q1', 'April', 'June', 'April to June'),
  ('Q2', 'July', 'September', 'July to September'),
  ('Q3', 'October', 'December', 'October to December'),
  ('Q4', 'January', 'March', 'January to March');
