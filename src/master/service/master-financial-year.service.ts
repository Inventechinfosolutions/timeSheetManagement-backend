import { Injectable, Logger } from '@nestjs/common';

export interface FinancialYearMasterItem {
  id: string;
  label: string;
  code: string;
  financialYear: string;
  startYear: number;
  endYear: number;
  isCurrent: boolean;
}

export function getDynamicCurrentFinancialYear(now: Date = new Date()): {
  financialYear: string;
  code: string;
  startYear: number;
  endYear: number;
  label: string;
} {
  const month = now.getMonth(); // 0 = Jan, 3 = Apr
  const calendarYear = now.getFullYear();

  const startYear = month >= 3 ? calendarYear : calendarYear - 1;
  const endYear = startYear + 1;
  const code = `${startYear}-${String(endYear).slice(2)}`;
  const financialYear = `FY ${code}`;

  return {
    financialYear,
    code,
    startYear,
    endYear,
    label: financialYear,
  };
}

@Injectable()
export class MasterFinancialYearService {
  private readonly logger = new Logger(MasterFinancialYearService.name);

  /**
   * Determine the current financial year based on India's fiscal calendar (April 1 – March 31).
   */
  public getCurrentFinancialYear(): {
    financialYear: string;
    code: string;
    startYear: number;
    endYear: number;
    label: string;
  } {
    return getDynamicCurrentFinancialYear();
  }

  /**
   * Returns the master list of financial years around the current fiscal year.
   * Default span: 2 years future, 5 years past (e.g. FY 2028-29 down to FY 2022-23).
   */
  public getFinancialYears(
    yearsBefore: number = 5,
    yearsAfter: number = 2,
  ): {
    financialYears: FinancialYearMasterItem[];
    currentAcademicYear: string;
    currentFinancialYear: string;
    currentAcademicYearCode: string;
  } {
    const current = this.getCurrentFinancialYear();
    const items: FinancialYearMasterItem[] = [];

    const maxStartYear = current.startYear + yearsAfter;
    const minStartYear = current.startYear - yearsBefore;

    for (let yr = maxStartYear; yr >= minStartYear; yr--) {
      const nextYr = yr + 1;
      const code = `${yr}-${String(nextYr).slice(2)}`;
      const fyLabel = `FY ${code}`;
      items.push({
        id: fyLabel,
        label: fyLabel,
        code,
        financialYear: fyLabel,
        startYear: yr,
        endYear: nextYr,
        isCurrent: yr === current.startYear,
      });
    }

    return {
      financialYears: items,
      currentAcademicYear: current.financialYear,
      currentFinancialYear: current.financialYear,
      currentAcademicYearCode: current.code,
    };
  }
}
