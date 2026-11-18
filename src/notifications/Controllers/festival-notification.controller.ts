import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Res,
  HttpStatus,
  HttpCode,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBody } from '@nestjs/swagger';
import { Response } from 'express';

import { FestivalNotificationService } from '../Services/festival-notification.service';
import {
  renderFestivalEmail,
  getFestivalTemplateFiles,
  FESTIVAL_TEMPLATES_MAP,
} from '../../common/mail/templates/festival/festival.template';

@ApiTags('Festival Notifications')
@Controller('festival-notifications')
export class FestivalNotificationController {
  private readonly logger = new Logger(FestivalNotificationController.name);

  constructor(private readonly festivalService: FestivalNotificationService) {}

  @Get('list')
  @ApiOperation({ summary: 'Get all festivals (master_holidays + dynamic festivals merged with spread operator)' })
  @ApiResponse({ status: 200, description: 'List of all combined festivals and their template mappings.' })
  async getAllFestivals() {
    const list = await this.festivalService.getAllFestivals();
    return {
      success: true,
      count: list.length,
      festivals: list,
    };
  }

  @Get('today')
  @ApiOperation({ summary: 'Check if today is a festival holiday' })
  @ApiResponse({ status: 200, description: 'Today festival match details.' })
  async checkTodayFestival() {
    const matches = await this.festivalService.findAllFestivalsForDate(new Date());
    return {
      success: true,
      isFestivalToday: matches.length > 0,
      count: matches.length,
      festivals: matches,
      festival: matches[0] || null,
    };
  }

  @Get('preview/:festivalName')
  @ApiOperation({ summary: 'Preview festival GIF template rendered via MJML' })
  @ApiParam({ name: 'festivalName', description: 'Festival name (e.g. christmas, deepavali, ugadi, new year)' })
  @ApiQuery({ name: 'templateNumber', required: false, enum: [1, 2], description: 'Template 1 or 2' })
  async previewFestival(
    @Param('festivalName') festivalName: string,
    @Query('templateNumber') templateNumber: string,
    @Res() res: Response,
  ) {
    const templates = getFestivalTemplateFiles(festivalName);
    if (!templates || templates.length === 0) {
      return res
        .status(HttpStatus.NOT_FOUND)
        .send(
          `No template found for "${festivalName}". Available festivals: ${Object.keys(
            FESTIVAL_TEMPLATES_MAP,
          ).join(', ')}`,
        );
    }

    const tIdx = templateNumber === '2' ? 1 : 0;
    const templateFilename = templates[tIdx] || templates[0];

    const isNewYear = festivalName.toLowerCase().includes('new year');
    const dbYear = isNewYear ? await this.festivalService.getFestivalYear() : undefined;

    const html = await renderFestivalEmail({
      festivalName,
      gifSrc: `/assets/festival/${encodeURIComponent(templateFilename)}`,
      year: dbYear,
      templateFilename,
    });

    res.setHeader('Content-Type', 'text/html');
    return res.send(html);
  }

  @Post('send-today')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send festival GIF template to all members if today is a festival holiday' })
  @ApiResponse({ status: 200, description: 'Delivery result for today.' })
  async sendTodayFestivalWishes(@Body() body?: { testEmail?: string }) {
    this.logger.log('Manual trigger: Checking and sending festival templates to all members...');
    return await this.festivalService.checkAndSendDailyFestivalWishes({
      testEmail: body?.testEmail,
    });
  }

  @Post('send-to-everyone')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send festival templates to all active members in the company' })
  async sendToEveryone(@Body() body?: { festivalName?: string }) {
    if (body?.festivalName) {
      this.logger.log(`Manual trigger: Broadcasting "${body.festivalName}" to everyone in the company...`);
      return await this.festivalService.sendFestivalWishesToAll(body.festivalName);
    }
    this.logger.log('Manual trigger: Checking today festival and sending to everyone...');
    return await this.festivalService.checkAndSendDailyFestivalWishes();
  }

  @Post('send/:festivalName')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send festival GIF templates to all members (alternates template 1 and template 2 across members)' })
  @ApiParam({ name: 'festivalName', description: 'Festival name (e.g. christmas, deepavali, ugadi, new year)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        testEmail: { type: 'string', description: 'Optional email to send a test copy only' },
      },
    },
    required: false,
  })
  async sendSpecificFestivalWishes(
    @Param('festivalName') festivalName: string,
    @Body() body: { testEmail?: string },
  ) {
    this.logger.log(`Manual trigger: Sending festival templates for "${festivalName}"...`);
    return await this.festivalService.sendFestivalWishesToAll(festivalName, {
      testEmail: body?.testEmail,
    });
  }
}
