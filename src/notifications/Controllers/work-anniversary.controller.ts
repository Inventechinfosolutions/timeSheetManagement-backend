import { Controller, Get, Post, Param, Query, Logger, Header } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiParam } from '@nestjs/swagger';
import dayjs from 'dayjs';
import { WorkAnniversaryService } from '../Services/work-anniversary.service';
import {
  ANNIVERSARY_THEMES,
  getAnniversaryTheme,
  getWorkAnniversaryTemplateMjml,
  getThemeBgImagePath,
} from '../../common/mail/templates';
import { generateAnniversaryBannerGif } from '../../common/mail/services/anniversary-gif-generator.service';

const THEME_ID_QUERY_DESC =
  'Optional template theme ID (1-15) or slug name to select background design';

const DEFAULT_PREVIEW_CONTEXT = {
  employeeId: 'demo',
  employeeName: 'Sample Employee',
  designation: 'Team Member',
  department: 'General',
  years: 1,
} as const;

const parseForceFlag = (forceParam?: string): boolean =>
  !['false', '0', 'no'].includes((forceParam ?? '').trim().toLowerCase());

@ApiTags('Work Anniversary')
@Controller('work-anniversary')
export class WorkAnniversaryController {
  private readonly logger = new Logger(WorkAnniversaryController.name);

  constructor(private readonly workAnniversaryService: WorkAnniversaryService) {}

  @Get('themes')
  @ApiOperation({
    summary: 'List all 15 distinct luxury background design templates for work anniversary emails',
  })
  getThemes() {
    this.logger.log(`Listing all ${ANNIVERSARY_THEMES.length} available work anniversary themes`);
    return {
      message: 'Available work anniversary background themes',
      total: ANNIVERSARY_THEMES.length,
      themes: ANNIVERSARY_THEMES.map((t) => ({
        id: t.id,
        slug: t.slug,
        name: t.name,
        description: t.description,
        cardBg: t.cardBg,
        outerBg: t.outerBg,
        footerBg: t.footerBg,
        goldAccent: t.goldAccent,
        yearColor: t.yearColor,
        nameColor: t.nameColor,
      })),
    };
  }

  @Get('preview')
  @Header('Content-Type', 'text/html')
  @ApiOperation({
    summary: 'Preview live floating work anniversary email template directly in browser',
  })
  @ApiQuery({
    name: 'themeId',
    required: false,
    type: String,
    description: THEME_ID_QUERY_DESC,
  })
  @ApiQuery({
    name: 'employeeId',
    required: false,
    type: String,
    description: 'Optional employee ID to preview with real employee details & photo',
  })
  async preview(
    @Query('themeId') themeIdParam?: string,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.renderPreview(themeIdParam, employeeId);
  }

  private async renderPreview(themeIdParam?: string, employeeId?: string) {
    const themeId = getAnniversaryTheme(themeIdParam || 1).id;
    let resolvedEmployeeId: string = DEFAULT_PREVIEW_CONTEXT.employeeId;
    let employeeName: string = DEFAULT_PREVIEW_CONTEXT.employeeName;
    let designation: string = DEFAULT_PREVIEW_CONTEXT.designation;
    let department: string = DEFAULT_PREVIEW_CONTEXT.department;
    let years: number = DEFAULT_PREVIEW_CONTEXT.years;

    let photoBuffer: Buffer | undefined;
    if (employeeId) {
      try {
        const emp = await this.workAnniversaryService.findEmployeeByIdentifier(employeeId);
        if (emp) {
          resolvedEmployeeId = emp.employeeId || employeeId;
          employeeName = emp.fullName || employeeName;
          designation = emp.designation || designation;
          department = emp.department || department;

          if (emp.joiningDate) {
            const joining = dayjs(emp.joiningDate).startOf('day');
            if (joining.isValid()) {
              years = Math.max(1, dayjs().startOf('day').diff(joining, 'year'));
            }
          }

          const photoResult = await this.workAnniversaryService.extractProfilePhoto(emp);
          if (photoResult?.hasPhoto && photoResult.photoBuffer) {
            photoBuffer = photoResult.photoBuffer;
          }
        }
      } catch {
        // Fallback to sample preview data when employee lookup fails
      }
    }

    const bgImgPath = getThemeBgImagePath(themeId);
    let bannerDataUri = 'cid:anniversary-banner';
    try {
      const bannerResult = await generateAnniversaryBannerGif({
        name: employeeName,
        years,
        designation,
        employeeId: resolvedEmployeeId,
        gifSourcePath: bgImgPath,
        photoBuffer,
      });
      if (bannerResult?.base64) {
        bannerDataUri = `data:image/gif;base64,${bannerResult.base64}`;
      }
    } catch (err) {
      this.logger.warn(`Preview banner generation failed: ${err?.message}`);
    }

    return await getWorkAnniversaryTemplateMjml({
      employeeName,
      employeeId: resolvedEmployeeId,
      designation,
      department,
      years,
      themeId,
      bgUrl: bannerDataUri,
    });
  }

  @Get('today')
  @ApiOperation({ summary: 'Get all active employees celebrating their work anniversary today' })
  @ApiQuery({
    name: 'themeId',
    required: false,
    type: String,
    description: THEME_ID_QUERY_DESC,
  })
  async getTodayAnniversaries(@Query('themeId') themeId?: string) {
    this.logger.log('Fetching active employees celebrating work anniversary today');
    const list = await this.workAnniversaryService.getTodayAnniversaries(themeId);
    return {
      message: 'Today work anniversaries retrieved successfully',
      date: dayjs().format('YYYY-MM-DD'),
      total: list.length,
      employees: list.map((item) => ({
        employeeId: item.employee.employeeId,
        fullName: item.employee.fullName,
        email: item.employee.email,
        designation: item.employee.designation,
        department: item.employee.department,
        joiningDate: item.employee.joiningDate,
        years: item.years,
        milestone: `${item.ordinal} Work Anniversary`,
        alreadySentToday: item.alreadySentToday,
        emailSubject: item.subject,
        theme: {
          id: item.theme.id,
          name: item.theme.name,
          slug: item.theme.slug,
        },
      })),
    };
  }

  @Get('details/:employeeId')
  @ApiOperation({ summary: 'Inspect anniversary details & message preview for any employee' })
  @ApiParam({ name: 'employeeId', description: 'Employee ID or numeric ID' })
  @ApiQuery({
    name: 'themeId',
    required: false,
    type: String,
    description: THEME_ID_QUERY_DESC,
  })
  async getEmployeeDetails(
    @Param('employeeId') employeeId: string,
    @Query('themeId') themeId?: string,
  ) {
    this.logger.log(`Fetching anniversary details for employee: ${employeeId} (themeId=${themeId || 'auto'})`);
    return await this.workAnniversaryService.getEmployeeAnniversaryDetails(employeeId, themeId);
  }

  @Post('trigger')
  @ApiOperation({
    summary: 'Manually trigger anniversary email & notification dispatch for today celebrating employees',
  })
  @ApiQuery({
    name: 'force',
    required: false,
    type: Boolean,
    description: 'If true, bypasses duplicate check for today',
  })
  @ApiQuery({
    name: 'themeId',
    required: false,
    type: String,
    description: THEME_ID_QUERY_DESC,
  })
  async triggerDailyAnniversaries(
    @Query('force') forceParam?: string,
    @Query('themeId') themeId?: string,
  ) {
    // Default to true for manual POST triggers so testing in Postman always dispatches
    const force = parseForceFlag(forceParam);
    this.logger.log(`Triggering daily work anniversary check (force=${force}, themeId=${themeId || 'auto'})`);
    const result = await this.workAnniversaryService.sendDailyWorkAnniversaryWishes(force, themeId);
    return {
      message: 'Work anniversary check completed',
      ...result,
    };
  }
 
  @Post('send/:employeeId')
  @ApiOperation({
    summary: 'Send work anniversary celebration email and in-app notification to a specific employee',
  })
  @ApiParam({ name: 'employeeId', description: 'Employee ID or numeric ID' })
  @ApiQuery({
    name: 'force',
    required: false,
    type: Boolean,
    description: 'If true, bypasses duplicate check for today (defaults to true for manual individual sends)',
  })
  @ApiQuery({
    name: 'themeId',
    required: false,
    type: String,
    description: THEME_ID_QUERY_DESC,
  })
  async sendAnniversaryToEmployee(
    @Param('employeeId') employeeId: string,
    @Query('force') forceParam?: string,
    @Query('themeId') themeId?: string,
  ) {
    // Default to true for manual individual sends so testing in Postman always dispatches
    const force = parseForceFlag(forceParam);
    this.logger.log(`Sending work anniversary wish to employee ${employeeId} (force=${force}, themeId=${themeId || 'auto'})`);
    return await this.workAnniversaryService.sendWorkAnniversaryWish(
      employeeId,
      force,
      undefined,
      themeId,
    );
  }
}
