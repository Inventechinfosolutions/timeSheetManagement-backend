USE timesheet;

CREATE TABLE IF NOT EXISTS `quaterly_review` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `employeeId` VARCHAR(100) NOT NULL,
  `employeeType` ENUM('EMPLOYEE', 'INTERN', 'MANAGER') NOT NULL,
  `financialYear` VARCHAR(50) NOT NULL,
  `quarter` ENUM('Q1', 'Q2', 'Q3', 'Q4') NOT NULL,
  `assignedDate` DATE NOT NULL,
  `deadlineDate` DATE NOT NULL,
  `description` TEXT DEFAULT NULL,
  `assignedBy` ENUM('MANAGER', 'EMPLOYEE', 'INTERN', 'ADMIN') NOT NULL,
  `assignerId` VARCHAR(100) NOT NULL,
  `status` ENUM('PENDING', 'IN_PROGRESS', 'SUBMITTED', 'COMPLETED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  
  -- Evaluation Metrics (INT, Nullable)
  `productivity` INT DEFAULT NULL,
  `ownershipResponsibility` INT DEFAULT NULL,
  `teamCollaboration` INT DEFAULT NULL,
  `qualityOfWork` INT DEFAULT NULL,
  `communication` INT DEFAULT NULL,
  `innovationProblemSolving` INT DEFAULT NULL,
  `performanceIndex` INT DEFAULT NULL,

  -- Qualitative Feedback Enums (Nullable)
  `performanceStrengths` ENUM(
    'TECHNICAL_EXCELLENCE',
    'CONSISTENT_DELIVERY',
    'LEADERSHIP_INITIATIVE',
    'STRONG_COMMUNICATION',
    'PROBLEM_SOLVING',
    'TEAM_PLAYER',
    'FAST_LEARNER',
    'EXCEPTIONAL',
    'GOOD'
  ) DEFAULT NULL,

  `areasOfImprovement` ENUM(
    'TIME_MANAGEMENT',
    'TECHNICAL_SKILLS',
    'COMMUNICATION',
    'ATTENTION_TO_DETAIL',
    'OWNERSHIP',
    'DOCUMENTATION',
    'NEEDS_IMPROVEMENT',
    'NONE'
  ) DEFAULT NULL,

  `additionalRemarks` ENUM(
    'EXCEEDS_EXPECTATIONS',
    'MEETS_EXPECTATIONS',
    'NEEDS_IMPROVEMENT',
    'OUTSTANDING_PERFORMANCE',
    'SATISFACTORY',
    'UNSATISFACTORY'
  ) DEFAULT NULL,

  -- BaseEntity Audit Columns
  `createdAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `createdBy` VARCHAR(255) DEFAULT NULL,
  `updatedBy` VARCHAR(255) DEFAULT NULL,

  PRIMARY KEY (`id`),
  INDEX `IDX_review_employee` (`employeeId`),
  INDEX `IDX_review_assigner` (`assignerId`),
  INDEX `IDX_review_fy_quarter` (`financialYear`, `quarter`),
  INDEX `IDX_review_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
